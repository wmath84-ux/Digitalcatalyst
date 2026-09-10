import { adminDb, errorResponse, type VercelRequest, type VercelResponse } from "./_lib/firebaseAdmin.js";
import { referralCodeForUid, runReferralRepairOnce } from "./_lib/referrals.js";
import { handleEmbedProxy } from "./_lib/embedProxy.js";
import { handleRevisionGenerate } from "./_lib/revisionGenerate.js";
import { handleRevisionData } from "./_lib/revisionData.js";
import { handleMyDay } from "./_lib/myDay.js";
import { handleFlowPathControl } from "./_lib/flowpathControl.js";
import { handleManifest } from "./_lib/manifest.js";
import { handleBrandIcon } from "./_lib/brandIcon.js";
import { handleSubscriptionGate } from "./_lib/subscriptionGateServer.js";
import { applyCors } from "./_lib/cors.js";
import { handleCreateQuery, handleListQueries, handleReplyQuery } from "./_lib/userQueries.js";
import { handlePersonalCourse } from "./_lib/personalCourse.js";
import { handlePersonalAi } from "./_lib/personalAi.js";
import { handleStudyPacks } from "./_lib/studyPacks.js";

type SubscriberRow = {
  uid: string;
  name: string;
  photoURL: string | null;
  planId: string;
  referralCode: string;
  usedCount: number;
  available: boolean;
};

type UserRow = {
  uid: string;
  name: string;
  photoURL: string | null;
};

const PUBLIC_COLLECTION = "publicLeaderboard";
const PUBLIC_DOC = "referrals";

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
  }
  return "";
};

const resolvePhotoURL = (data: Record<string, unknown>) =>
  firstNonEmptyString(data.photoURL, data.avatar, data.profilePhoto, data.profileImage) || null;

const resolveName = (data: Record<string, unknown>, fallback = "Learner") =>
  firstNonEmptyString(data.name, data.displayName, data.username) || fallback;

const toSubscriberRow = async (uid: string, data: Record<string, unknown>): Promise<SubscriberRow> => {
  const db = adminDb();
  const code = String(data.referralCode || referralCodeForUid(uid));
  let usedCount = 0;
  let available = true;
  try {
    const coupon = await db.collection("coupons").doc(code).get();
    usedCount = Math.max(0, Number(coupon.data()?.usedCount || 0));
    available = usedCount < 1 && (!coupon.exists || coupon.data()?.status !== "inactive");
  } catch {
    usedCount = Math.max(0, Number(data.referralUsedCount || 0));
  }
  return {
    uid,
    name: resolveName(data, "Subscriber"),
    photoURL: resolvePhotoURL(data),
    planId: String(data.subscriptionPlanId || data.subscriptionTier || "subscription"),
    referralCode: code,
    usedCount,
    available,
  };
};

const toUserRow = (uid: string, data: Record<string, unknown>): UserRow => ({
  uid,
  name: resolveName(data),
  photoURL: resolvePhotoURL(data),
});

const isSubscriber = (data: Record<string, unknown>) =>
  Boolean(data.subscriptionPlanId || (data.subscriptionTier && data.subscriptionTier !== "basic"));

const headerValue = (req: VercelRequest, name: string) => {
  const raw = req.headers?.[name];
  if (Array.isArray(raw)) return String(raw[0] || "");
  return typeof raw === "string" ? raw : "";
};

const incomingUrl = (req: VercelRequest & { url?: string }) =>
  headerValue(req, "x-matched-path")
  || headerValue(req, "x-invoke-path")
  || headerValue(req, "x-vercel-original-path")
  || headerValue(req, "x-forwarded-uri")
  || String(req.url || "");

const incomingPath = (req: VercelRequest & { url?: string }) =>
  incomingUrl(req).split("?")[0].replace(/\/+$/, "") || "/";

const routeQuery = (req: VercelRequest) =>
  String((req.query as { route?: string } | undefined)?.route || "");

/* ── Shared-function routing guard ──────────────────────────────────────────
   `vercel.json` rewrites every one of these paths onto this single deployed
   function (the Hobby plan caps the project at 12 serverless entries), and the
   dispatcher below chooses a feature by the `action` in the POST body.

   That leaves a dangerous hole: a request addressed at, say,
   `/api/personal-course` whose action the dispatcher cannot read — an unparsed
   body, a method rewritten to GET by an upstream redirect, a stale cached
   bundle calling an action that no longer exists — used to fall all the way
   through to the LEADERBOARD branch and answer `200 { ok: true, subscribers,
   users }`. That response is `ok` but carries no `data`, so every client that
   speaks the `{ ok, data }` envelope reads it as a failed-but-possibly-committed
   call. My Study Library rendered "The server result couldn't be confirmed.
   Refresh your library before retrying." and the course-player AI died with a
   generic error — while "Try again" could never work, because the library was
   never asked for in the first place.

   The guard below makes that impossible: traffic addressed at a shared route is
   answered by that route (or by a precise error naming it), never by the
   leaderboard. */
const SHARED_ROUTES = [
  "personal-course",
  "personal-ai",
  "myday",
  "flowpath/control",
  "revision/data",
  "revision/generate",
  "subscription-gate",
  "embed-proxy",
] as const;

type SharedRoute = (typeof SHARED_ROUTES)[number];

/** Which shared route (if any) this request was actually addressed at. */
const sharedRouteAddressed = (req: VercelRequest & { url?: string }): SharedRoute | "" => {
  const path = incomingPath(req);
  for (const route of SHARED_ROUTES) {
    const needle = `/api/${route}`;
    if (path === needle || path.endsWith(needle)) return route;
  }
  const routed = routeQuery(req);
  return SHARED_ROUTES.includes(routed as SharedRoute) ? (routed as SharedRoute) : "";
};

/** The friendly name used in dispatch-failure messages. */
const ROUTE_LABEL: Record<SharedRoute, string> = {
  "personal-course": "My Study Library",
  "personal-ai": "the AI study engine",
  myday: "My Day",
  "flowpath/control": "FlowPath",
  "revision/data": "the Revision Test Bank",
  "revision/generate": "the Revision AI generator",
  "subscription-gate": "the subscription gate",
  "embed-proxy": "the embed proxy",
};

const jsonBody = (res: VercelResponse, status: number, body: unknown) => res.status(status).json(body);

/* Vercel parses a JSON body for us, but only when the request reaches it with a
   parseable `Content-Type`. A cross-origin redirect, a proxy that rewrites the
   header, or a form-encoded caller all leave `req.body` undefined — which used
   to silently disable dispatch for the whole feature. Recover the action by
   reading the stream ourselves; never let this hang the function. */
const MAX_RAW_BODY_BYTES = 512 * 1024;
const RAW_BODY_TIMEOUT_MS = 2_000;

type MaybeReadable = {
  on?: (event: string, listener: (chunk?: unknown) => void) => void;
  readableEnded?: boolean;
  complete?: boolean;
  read?: () => unknown;
};

const readRawBody = (req: VercelRequest): Promise<string> =>
  new Promise((resolve) => {
    const stream = req as unknown as MaybeReadable;
    if (typeof stream.on !== "function" || stream.readableEnded === true || stream.complete === true) {
      resolve("");
      return;
    }
    let text = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(text);
    };
    const timer = setTimeout(finish, RAW_BODY_TIMEOUT_MS);
    stream.on("data", (chunk) => {
      if (settled) return;
      if (text.length > MAX_RAW_BODY_BYTES) {
        finish();
        return;
      }
      text += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk ?? "");
    });
    stream.on("end", () => {
      clearTimeout(timer);
      finish();
    });
    stream.on("error", () => {
      clearTimeout(timer);
      finish();
    });
  });

const parseJsonObject = (raw: string): Record<string, unknown> => {
  if (!raw.trim()) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/**
 * Resolve the request body: the platform's parsed object when it exists, the
 * raw stream parsed as JSON when it does not, `{}` as a last resort.
 */
async function resolveRequestBody(req: VercelRequest): Promise<Record<string, unknown>> {
  const parsed = req.body;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  if (typeof parsed === "string") {
    const fromString = parseJsonObject(parsed);
    if (Object.keys(fromString).length) return fromString;
  }
  return parseJsonObject(await readRawBody(req));
}

const matchesApiRoute = (req: VercelRequest & { url?: string }, route: "manifest" | "brand-icon") => {
  const path = incomingPath(req);
  const url = `${incomingUrl(req)} ${String(req.url || "")}`;
  const needle = `/api/${route}`;
  return (
    routeQuery(req) === route
    || path === needle
    || path.endsWith(needle)
    || url.includes(`${needle}?`)
    || url.includes(`${needle} `)
    || url.endsWith(needle)
  );
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — required so the installed Android app (Capacitor runs the bundle
  // from the internal https://localhost origin) can call these endpoints.
  // Answers OPTIONS preflights immediately; same-origin web calls are
  // unaffected.
  if (applyCors(req, res)) return;
  // PWA manifest + brand icon share this deployed function to stay within the
  // 12-function Hobby cap (see vercel.json rewrites). Dispatch on path AND
  // `?route=` first — after a rewrite `req.url` is often the destination
  // `/api/referral-leaderboard`, which used to miss this branch and return
  // leaderboard JSON. Chrome then refused to install the web app.
  const reqWithUrl = req as VercelRequest & { url?: string };
  const path = incomingPath(reqWithUrl);
  // Which feature this request was addressed at, per vercel.json's rewrites.
  const route = sharedRouteAddressed(reqWithUrl);
  if (matchesApiRoute(reqWithUrl, "manifest")) {
    return handleManifest(req, res);
  }
  if (matchesApiRoute(reqWithUrl, "brand-icon")) {
    return handleBrandIcon(req, res);
  }
  // Phase-2: public read endpoint for the admin's subscription gate
  // (kill switch + per-feature / per-duration matrix). Same dispatch
  // pattern as the manifest / brand-icon endpoints so the
  // serverless-function count stays within the Hobby cap.
  if (path === "/api/subscription-gate" || path.endsWith("/api/subscription-gate") || routeQuery(req) === "subscription-gate") {
    return handleSubscriptionGate(req, res);
  }
  // Course-player GitHub embed proxy. `/api/embed-proxy` rewrites here
  // (see vercel.json) because the Hobby plan caps serverless functions at
  // 12 and the project is already at the limit — the proxy logic lives in
  // the private `_lib/embedProxy` helper so no extra function is deployed.
  if (req.method === "GET" && req.query?.url) {
    return handleEmbedProxy(req, res);
  }
  // Revision APIs share this deployed function to stay within the 12-function
  // Hobby cap. The body action safely dispatches cloud Test Bank writes while
  // the existing generation action keeps its original handler.
  if (req.method === "POST") {
    const rawBody = await resolveRequestBody(req);
    // Hand the recovered body to the feature handler too — every `_lib`
    // dispatcher reads `req.body` itself, so a body the platform failed to
    // parse has to be written back or the recovery stops at this layer.
    if (!req.body || typeof req.body !== "object") req.body = rawBody;
    const action = String(rawBody?.action || "");
    if (action.startsWith("revision.data.")) {
      return handleRevisionData(req, res);
    }
    if (action.startsWith("myday.")) {
      return handleMyDay(req, res);
    }
    // Personal Course Modules ("My Modules") — server-authoritative
    // entitlement/limit enforcement + user-owned content writes. Shares this
    // deployed function to stay within the Hobby 12-function cap.
    if (action.startsWith("personalCourse.")) {
      return handlePersonalCourse(req, res);
    }
    // Personal Module AI Study Engine ("Ask this Module") — grounded answers,
    // summaries, questions, flashcards, weak topics, study mode + study plans
    // for the learner's OWN modules. Shares this deployed function (and the
    // existing AI provider + allowance runtime) to stay inside the Hobby
    // 12-function cap.
    if (action.startsWith("personalAi.")) {
      try {
        return await handlePersonalAi(req, res);
      } catch (innerError) {
        return errorResponse(res, innerError, "The AI study engine hit an unexpected problem. Please try again.");
      }
    }
    if (action.startsWith("studyPack.") || action.startsWith("studyStack.")) {
      try {
        return await handleStudyPacks(req, res);
      } catch (innerError) {
        return errorResponse(res, innerError, "Could not complete the study pack request.");
      }
    }
    if (action.startsWith("flowpath.")) {
      return handleFlowPathControl(req, res);
    }
    // Sticker-wall user queries + the owner's emailed replies. Shares this
    // deployed function to stay within the Hobby 12-function cap.
    if (action === "queries.create") return handleCreateQuery(req, res);
    if (action === "queries.list") return handleListQueries(req, res);
    if (action === "queries.reply") return handleReplyQuery(req, res);
    // Nothing dispatched. `/api/revision/generate` and direct posts to this
    // function keep their historical default handler; every other shared route
    // must NOT fall through to the revision generator (or, worse, the
    // leaderboard) — it gets an error naming its own feature so the client can
    // show something the learner can act on.
    if (route && route !== "revision/generate") {
      return jsonBody(res, 400, {
        ok: false,
        code: action ? "UNKNOWN_ACTION" : "MISSING_ACTION",
        error: action
          ? `${ROUTE_LABEL[route]} rejected this request: "${action.slice(0, 60)}" is not a supported action. Reload the app and try again.`
          : `${ROUTE_LABEL[route]} could not read this request. Reload the page (or the app) and try again — the request reached the server without its action.`,
      });
    }
    // AI generation can run tens of seconds; if anything ever rejects above
    // the handler's own try/catch (e.g. an unexpected Firestore fault), still
    // answer JSON so the client can show a real message instead of parsing a
    // platform error page. Two layers of catch ensure even a misbehaving
    // `res` object cannot turn a 502 into Vercel's opaque HTML 500.
    try {
      try {
        return await handleRevisionGenerate(req, res);
      } catch (innerError) {
        return errorResponse(res, innerError, "Could not generate questions with AI.");
      }
    } catch (outerError) {
      console.error("[leaderboard] failed to write JSON error response", outerError);
      try {
        // `headersSent` exists on the real Node response but not on the
        // structural VercelResponse type this file compiles against.
        if (!(res as unknown as { headersSent?: boolean }).headersSent) {
          res.setHeader("Content-Type", "application/json");
          res.status(500).json({
            ok: false,
            code: "INTERNAL_FAILURE",
            error: "The server hit an unexpected problem. Please try again.",
          });
        }
      } catch {
        // The connection is already gone; nothing more we can write.
      }
    }
  }
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  // A GET reaching this line for a shared route means the request never carried
  // a dispatchable action — typically a POST turned into a GET by an upstream
  // redirect (a browser drops the body on 301/302). Answer it as the feature
  // it was aimed at, because returning leaderboard JSON here is what made My
  // Study Library report an "unconfirmed" result and the course-player AI fail.
  if (route) {
    return jsonBody(res, 405, {
      ok: false,
      code: "METHOD_NOT_ALLOWED",
      error: `${ROUTE_LABEL[route]} expects an authenticated POST. This request arrived as a ${req.method || "GET"}${req.body ? "" : " with no body"}, so it was never handled.`,
    });
  }
  try {
    const db = adminDb();
    // One-time self-healing: backfill referral usage that predates the
    // single-use fix so used IDs drop out of "Unused IDs" without any
    // manual step. After the first run this is a single doc read.
    try {
      await runReferralRepairOnce();
    } catch (repairError) {
      console.warn("[leaderboard] referral usage repair skipped", repairError);
    }
    type LeaderboardDoc = { id: string; data: () => Record<string, unknown> };
    const recent = await db.collection("users").limit(200).get();
    const allDocs: LeaderboardDoc[] = recent.docs;
    const subscriberDocs = allDocs.filter((doc: LeaderboardDoc) => isSubscriber((doc.data() || {}) as Record<string, unknown>));

    const [subscribers, users] = await Promise.all([
      Promise.all(subscriberDocs.map((doc: LeaderboardDoc) => toSubscriberRow(doc.id, (doc.data() || {}) as Record<string, unknown>))),
      Promise.resolve(allDocs.map((doc: LeaderboardDoc) => toUserRow(doc.id, (doc.data() || {}) as Record<string, unknown>))),
    ]);
    subscribers.sort((a, b) => b.usedCount - a.usedCount || a.name.localeCompare(b.name));
    users.sort((a, b) => a.name.localeCompare(b.name));
    try {
      await db.collection(PUBLIC_COLLECTION).doc(PUBLIC_DOC).set({
        ok: true,
        updatedAt: Date.now(),
        subscribers,
        users,
      });
    } catch (error) {
      console.warn("[leaderboard] public cache write skipped", error);
    }
    return res.status(200).json({ ok: true, subscribers, users });
  } catch (error) {
    try {
      const cached = await adminDb().collection(PUBLIC_COLLECTION).doc(PUBLIC_DOC).get();
      const data = cached.data() || {};
      if (cached.exists && Array.isArray(data.subscribers)) {
        return res.status(200).json({
          ok: true,
          subscribers: data.subscribers,
          users: Array.isArray(data.users) ? data.users : [],
          cached: true,
        });
      }
    } catch {
      // Fall through to the public error.
    }
    return errorResponse(res, error, "Could not open leaderboard.");
  }
}
