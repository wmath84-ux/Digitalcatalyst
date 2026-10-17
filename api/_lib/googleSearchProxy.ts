// api/_lib/googleSearchProxy.ts
//
// THE GOOGLE SEARCH PROXY — why this file exists at all.
//
// The Course Player's Google search used to be a straight browser → Google
// call (`src/course/googleSearch.ts` → `customsearch/v1`). That is the
// cheapest possible design and it stays the FIRST attempt, but it has one
// weakness the owner kept hitting in the field:
//
//   A browser request carries `Origin` / `Referer`. Google's API keys answer
//   to "Application restrictions → HTTP referrers (websites)", and when the
//   page's origin is not on that list Google answers **403**. The app runs
//   from origins that CANNOT all be listed in advance:
//
//     · the website                https://eduvora.shop
//     · a Vercel preview           https://digitalcatalyst-git-….vercel.app
//     · the installed APK          https://localhost   / capacitor://localhost
//     · a PWA installed from Firebase Hosting  https://…web.app
//     · local dev                  http://localhost:5173
//
//   So the learner sets the restriction to "None", Google takes up to five
//   minutes to propagate it, a SECOND key (the school's build-time one) is
//   still restricted, or an older configuration is still sitting in this
//   browser's localStorage — and the same 403 keeps coming back. The page
//   then shows one generic "restriction hatao" message, which is wrong often
//   enough to be useless.
//
// THE FIX: the same query can be sent from OUR OWN server. A serverless
// function sends no `Origin` and no `Referer` at all, so an HTTP-referrer
// restriction has nothing to match against and the request is judged on the
// key alone. That makes the search work from every one of the origins above
// with no Google Cloud change whatsoever — which is what "guaranteed" has to
// mean here.
//
// WHOSE KEY
//   1. THE LEARNER'S OWN key + cx, POSTed in the request BODY (never a query
//      string — a key in a URL ends up in logs, in the browser's history and
//      in the CDN's cache key). It is used for this one request and is never
//      stored, never logged, never echoed back.
//   2. THE SCHOOL'S server-side key: `GOOGLE_SEARCH_API_KEY` +
//      `GOOGLE_SEARCH_CX` in the Vercel environment. These are NOT `VITE_`
//      variables, so they are never baked into the client bundle — the only
//      place they exist is the function's memory.
//
// ABUSE GUARDS (an open proxy to a paid API is a bill waiting to happen)
//   · CORS is applied by the dispatcher (`api/_lib/cors.ts`) — only the app's
//     own origins can read an answer.
//   · Query length, `num` and `start` are clamped to Google's own limits.
//   · Requests that use the SCHOOL's key are rate-limited per caller IP
//     (a small in-process token bucket). Requests that bring their own key
//     are not limited here — that key's quota is Google's business, not ours.
//   · Responses are `no-store`: they belong to one key and one learner.
//
// This is a PRIVATE `_lib` helper. `api/referral-leaderboard.ts` dispatches it
// under `/api/google-search` (see vercel.json) so the project stays inside
// Vercel Hobby's 12-function cap.

export type GoogleProxySearchType = "web" | "image";

export type GoogleProxyRequest = {
  q: string;
  start?: number;
  type?: GoogleProxySearchType;
  /** The learner's own key — used for this request only. */
  apiKey?: string;
  /** The learner's own Programmable Search Engine id. */
  cx?: string;
};

/** Google's own limits, mirrored here so a caller can never exceed them. */
export const GOOGLE_PROXY_PAGE_SIZE = 10;
export const GOOGLE_PROXY_MAX_START = 91;
export const GOOGLE_PROXY_MAX_QUERY_CHARS = 400;

export type GoogleProxyError = {
  ok: false;
  code: string;
  error: string;
  /** Google's own HTTP status, reason and message — passed through verbatim. */
  googleStatus?: number;
  googleReason?: string;
  googleMessage?: string;
};

export type GoogleProxySuccess = {
  ok: true;
  /** Marks the answer as the proxied one, so the page can say where it came from. */
  via: "server";
  /** Whose key answered: the learner's own, or the school's server-side one. */
  keyOwner: "own" | "server";
  payload: Record<string, unknown>;
};

export type GoogleProxyOutcome = GoogleProxySuccess | GoogleProxyError;

/* ── Environment ─────────────────────────────────────────────────────────── */

const readEnv = (name: string): string => {
  try {
    const value = (globalThis.process?.env?.[name] ?? "").toString().trim();
    // Vercel injects nothing when a variable is unset; some shells leave the
    // literal placeholder from a template behind.
    return value && !/^%.*%$/.test(value) ? value : "";
  } catch {
    return "";
  }
};

/** The school's server-side configuration (never exposed to the client). */
export function serverGoogleSearchConfig(): { apiKey: string; cx: string } {
  return {
    apiKey: readEnv("GOOGLE_SEARCH_API_KEY") || readEnv("GOOGLE_CSE_API_KEY"),
    cx: readEnv("GOOGLE_SEARCH_CX") || readEnv("GOOGLE_CSE_CX"),
  };
}

/** True when the deployed function can answer with the school's own key. */
export function serverGoogleSearchAvailable(): boolean {
  const { apiKey, cx } = serverGoogleSearchConfig();
  return Boolean(apiKey && cx);
}

/* ── Input clamping ──────────────────────────────────────────────────────── */

export function clampGoogleProxyInput(input: GoogleProxyRequest): {
  q: string;
  start: number;
  type: GoogleProxySearchType;
} {
  const q = String(input?.q || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GOOGLE_PROXY_MAX_QUERY_CHARS);
  const rawStart = Math.round(Number(input?.start) || 1);
  const start = Math.min(GOOGLE_PROXY_MAX_START, Math.max(1, Number.isFinite(rawStart) ? rawStart : 1));
  return { q, start, type: input?.type === "image" ? "image" : "web" };
}

/* ── Reading Google's own error, honestly ────────────────────────────────── */

/**
 * The same taxonomy the browser client uses, resolved server-side so the page
 * can show one precise sentence — and Google's OWN words beside it, which is
 * what finally ends the "I already removed the restriction" loop.
 */
export function classifyGoogleProxyError(status: number, body: unknown): {
  code: string;
  reason: string;
  message: string;
} {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const error = (record.error && typeof record.error === "object" ? record.error : {}) as Record<string, unknown>;
  const errors = Array.isArray(error.errors) ? (error.errors as Array<Record<string, unknown>>) : [];
  const reason = String(errors[0]?.reason || error.status || "").trim();
  const message = String(error.message || "").trim();
  const haystack = `${reason} ${message}`.toLowerCase();

  if (/keyinvalid|keynotfound/.test(reason.toLowerCase()) || /api key not valid|invalid key|missing a valid api key/i.test(message)) {
    return { code: "invalid-key", reason, message };
  }
  if (reason === "invalid" && /cx|cse|search engine/i.test(message)) return { code: "invalid-cx", reason, message };
  if (/invalid value.*'?cx'?|search engine id/i.test(message) && !/key/i.test(message)) {
    return { code: "invalid-cx", reason, message };
  }
  if (
    /accessnotconfigured|service_disabled/.test(reason.toLowerCase()) ||
    /has not been used in project|is not enabled|access not configured/i.test(message)
  ) {
    return { code: "api-disabled", reason, message };
  }
  if (/quotaexceeded|dailylimitexceeded|ratelimitexceeded/.test(reason.toLowerCase()) || /quota exceeded|daily limit exceeded/i.test(message) || status === 429) {
    return { code: "quota", reason, message };
  }
  // The two flavours of a key restriction — told apart, because the fix is
  // different for each (referrer list vs. IP list). Google uses the SAME
  // reason (`ipRefererBlocked`) for both, so the MESSAGE decides, and the IP
  // case must be tested first.
  if (/requests from ip address/i.test(message)) return { code: "ip-blocked", reason, message };
  if (/iprefererblocked|referernotallowed/.test(reason.toLowerCase()) || /disallowed referrer|requests from referer/i.test(message)) {
    return { code: "referrer", reason, message };
  }
  if (/api restriction|not allowed to access|permission_denied/i.test(haystack) && status === 403) {
    return { code: "permission", reason, message };
  }
  if (status === 403) return { code: "permission", reason, message };
  if (status === 400) return { code: "bad-request", reason, message };
  if (status >= 500) return { code: "network", reason, message };
  return { code: "unknown", reason, message };
}

/* ── Per-IP token bucket (only for the school's key) ─────────────────────── */

type Bucket = { tokens: number; at: number };
const buckets = new Map<string, Bucket>();
const BUCKET_CAPACITY = 12;
const BUCKET_REFILL_PER_MINUTE = 6;
const BUCKET_MAX_ENTRIES = 5_000;

/** A coarse caller id: the forwarded IP, or "shared" when there is none. */
function callerId(headers: Record<string, string | string[] | undefined> | undefined): string {
  const read = (name: string): string => {
    const raw = headers?.[name];
    const value = Array.isArray(raw) ? String(raw[0] || "") : String(raw || "");
    return value.split(",")[0].trim();
  };
  return read("x-vercel-forwarded-for") || read("x-forwarded-for") || read("x-real-ip") || "shared";
}

export function takeServerKeyToken(id: string, now = Date.now()): boolean {
  const key = String(id || "shared").slice(0, 64);
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size > BUCKET_MAX_ENTRIES) buckets.clear();
    bucket = { tokens: BUCKET_CAPACITY, at: now };
    buckets.set(key, bucket);
  }
  const refill = ((now - bucket.at) / 60_000) * BUCKET_REFILL_PER_MINUTE;
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + refill);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

/** Test hook. */
export function resetGoogleProxyLimiter(): void {
  buckets.clear();
}

/* ── The request itself ──────────────────────────────────────────────────── */

const GOOGLE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
const PROXY_TIMEOUT_MS = 12_000;

/**
 * Build the Custom Search URL. Exported because the diagnostic script and the
 * tests both need to see exactly what Google was asked.
 */
export function buildGoogleSearchUrl(
  apiKey: string,
  cx: string,
  q: string,
  start: number,
  type: GoogleProxySearchType,
): string {
  const url = new URL(GOOGLE_ENDPOINT);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", q);
  url.searchParams.set("num", String(GOOGLE_PROXY_PAGE_SIZE));
  if (start > 1) url.searchParams.set("start", String(start));
  if (type === "image") url.searchParams.set("searchType", "image");
  return url.toString();
}

/**
 * Send ONE search to Google from the server. Never throws: a failure is an
 * answer with a code, so the caller can decide what to try next.
 */
export async function runGoogleProxySearch(
  input: GoogleProxyRequest,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<GoogleProxyOutcome> {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const { q, start, type } = clampGoogleProxyInput(input);
  if (!q) return { ok: false, code: "bad-request", error: "Query khali hai." };

  const ownKey = String(input.apiKey || "").trim();
  const ownCx = String(input.cx || "").trim();
  const server = serverGoogleSearchConfig();
  const apiKey = ownKey || server.apiKey;
  const cx = (ownKey ? ownCx : "") || server.cx;
  const keyOwner: "own" | "server" = ownKey && ownCx ? "own" : "server";

  if (!apiKey || !cx) {
    return {
      ok: false,
      code: "no-config",
      error:
        "Server ke paas Google search ki koi configuration nahi hai — apni key bhejo, ya Vercel me GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX set karo.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(buildGoogleSearchUrl(apiKey, cx, q, start, type), {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        // A server request deliberately carries NO Origin/Referer: that is the
        // whole point of this file.
        "user-agent": "DigitalCatalyst-CoursePlayer/1.0 (+server-side custom search proxy)",
      },
      // Never let an intermediary cache a keyed URL.
      cache: "no-store",
    });
  } catch (error) {
    const aborted = (error as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "timeout" : "network",
      error: aborted
        ? "Google ne jawab dene me bahut der laga di."
        : "Server Google tak nahi pahunch paya (network error).",
    };
  } finally {
    clearTimeout(timer);
  }

  let body: unknown = null;
  const raw = await response.text().catch(() => "");
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const classified = classifyGoogleProxyError(response.status, body);
    return {
      ok: false,
      code: classified.code,
      // Google's own sentence, kept verbatim — the page shows it under our
      // short explanation so the real cause is never a guess again.
      error: classified.message || `Google ne ${response.status} bheja.`,
      googleStatus: response.status,
      googleReason: classified.reason,
      googleMessage: classified.message,
    };
  }

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return { ok: true, via: "server", keyOwner, payload };
}

/* ── The serverless handler ──────────────────────────────────────────────── */

export type GoogleProxyRequestLike = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

export type GoogleProxyResponseLike = {
  status: (code: number) => GoogleProxyResponseLike;
  setHeader: (name: string, value: string) => GoogleProxyResponseLike;
  json: (body: unknown) => void;
  end: (body?: string) => void;
};

const firstValue = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? String(value[0] || "") : String(value ?? "");

const HTTP_FOR_CODE: Record<string, number> = {
  "no-config": 501,
  "bad-request": 400,
  "invalid-key": 403,
  "invalid-cx": 400,
  "api-disabled": 403,
  quota: 429,
  referrer: 403,
  "ip-blocked": 403,
  permission: 403,
  timeout: 504,
  network: 502,
  "rate-limited": 429,
};

/**
 * `POST /api/google-search`  { q, start?, type?, key?, cx? }
 * `GET  /api/google-search?q=…&start=…&type=…`   (school key only)
 *
 * Answers Google's own payload (`{ ok: true, via: "server", payload }`) or
 * `{ ok: false, code, error, googleStatus, googleReason, googleMessage }`.
 */
export async function handleGoogleSearch(
  req: GoogleProxyRequestLike,
  res: GoogleProxyResponseLike,
): Promise<void> {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    res.status(405).json({ ok: false, code: "method_not_allowed", error: "GET ya POST use karo." });
    return;
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const query = req.query || {};
  const input: GoogleProxyRequest = {
    q: firstValue(query.q) || String(body.q || body.query || "").trim(),
    start: Number(firstValue(query.start) || body.start || 1) || 1,
    type: (firstValue(query.type) || String(body.type || "")) === "image" ? "image" : "web",
    // POST body only — a key must never travel in a query string.
    apiKey: method === "POST" ? String(body.key || body.apiKey || "").trim() : "",
    cx: method === "POST" ? String(body.cx || body.cxId || "").trim() : "",
  };

  if (!String(input.q || "").trim()) {
    res.status(400).json({ ok: false, code: "bad-request", error: "Query bhejna zaroori hai (?q=… ya body.q)." });
    return;
  }

  const usingServerKey = !(input.apiKey && input.cx);
  if (usingServerKey) {
    if (!serverGoogleSearchAvailable()) {
      res.status(501).json({
        ok: false,
        code: "no-config",
        error:
          "Is deployment me server-side Google search key set nahi hai (GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX). Tab tak browser seedha Google se search karta rahega.",
      });
      return;
    }
    if (!takeServerKeyToken(callerId(req.headers))) {
      res.status(429).json({
        ok: false,
        code: "rate-limited",
        error: "School ki key par bahut zyada request aa gayi — ek minute ruk kar dobara try karo.",
      });
      return;
    }
  }

  const outcome = await runGoogleProxySearch(input);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Keyed answers are personal: no CDN cache, no shared cache, ever.
  res.setHeader("Cache-Control", "no-store");
  if (outcome.ok) {
    res.status(200).json(outcome);
    return;
  }
  res.status(HTTP_FOR_CODE[outcome.code] || 502).json(outcome);
}
