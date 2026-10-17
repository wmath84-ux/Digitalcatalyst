// src/course/googleSearch.ts
//
// The Course Player's GOOGLE search — the same key-gated, never-scraping
// shape as the YouTube one, on Google's own Programmable Search API.
//
// WHY IT EXISTS
// The Course Player's search box searches the course AND YouTube. This module
// adds the third answer: the open web, through Google's official Custom
// Search JSON API (`customsearch/v1`). There is no legal key-free way to
// search the web from a page — scraping google.com/results is blocked by
// CORS and against Google's terms — so this is key-gated exactly like the
// YouTube half.
//
// WHO PAYS
// Same bargain as the YouTube key, and the same reason:
//
//   1. THE LEARNER'S OWN configuration, in THEIR OWN browser
//      (their account slot, then this browser's slot);
//   2. THE OWNER's configuration, baked into the build
//      (`VITE_GOOGLE_SEARCH_API_KEY` + `VITE_GOOGLE_SEARCH_CX`).
//
// The learner's own wins, so a school that leaves the owner's values empty is
// never billed for a single Google query. The owner's values are the
// fallback for anyone who has not connected one.
//
// The learner's key never leaves their browser: it is stored in this device's
// localStorage and sent straight from the browser to Google.
//
// WHAT COMES BACK
// Everything Google's own API gives — the title, the URL, the breadcrumb, the
// snippet WITH the matched words marked, the page's picture, the file type,
// the file size, the publication date, the total result count and the search
// time — so the results page can look like Google's own instead of a list of
// bare titles. The API's own reference is the shape this file follows:
// https://developers.google.com/custom-search/v1/reference/rest/v1/Search

import { apiFetch } from "../utils/apiBase";
import { normaliseSearchQuery } from "./searchHistory";
import {
  announceSearchKeySource,
  readSearchKeySource,
  writeSearchKeySource,
  type SearchKeySource,
} from "./searchKeySource";
import {
  clearOwnQuotaExhausted,
  markOwnQuotaExhausted,
  ownQuotaExhausted,
} from "./searchQuotaHandover";

declare const __DC_GOOGLE_SEARCH_API_KEY__: string | undefined;
declare const __DC_GOOGLE_SEARCH_CX__: string | undefined;

/** This browser's slots — the device-wide fallback. */
export const GOOGLE_SEARCH_KEY_STORAGE = "dc.google.searchKey";
export const GOOGLE_SEARCH_CX_STORAGE = "dc.google.searchCx";
/** The per-account slots — "this learner's own configuration". */
export const GOOGLE_SEARCH_USER_KEY_PREFIX = "dc.google.searchKey.u.";
export const GOOGLE_SEARCH_USER_CX_PREFIX = "dc.google.searchCx.u.";
/** Fired after the configuration is written, so a live page re-reads it. */
export const GOOGLE_SEARCH_CONFIG_EVENT = "dc:google-search-config";

/** The per-account slot's name — stable, and owned by exactly one account. */
export const googleSearchUserKeyStorage = (uid: string): string =>
  `${GOOGLE_SEARCH_USER_KEY_PREFIX}${uid}`;
export const googleSearchUserCxStorage = (uid: string): string =>
  `${GOOGLE_SEARCH_USER_CX_PREFIX}${uid}`;

/** A value is only real when it is a non-empty string without the `%…%` placeholder. */
const clean = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text && !/^%.*%$/.test(text) ? text : "";
};

const readSlot = (slot: string): string => {
  try {
    return clean(globalThis.window?.localStorage.getItem(slot));
  } catch {
    return "";
  }
};

const writeSlot = (slot: string, value: string): boolean => {
  try {
    const store = globalThis.window?.localStorage;
    if (!store) return false;
    if (value) store.setItem(slot, value);
    else store.removeItem(slot);
    return true;
  } catch {
    return false;
  }
};

const buildValue = (name: "__DC_GOOGLE_SEARCH_API_KEY__" | "__DC_GOOGLE_SEARCH_CX__"): string => {
  try {
    if (name === "__DC_GOOGLE_SEARCH_API_KEY__") {
      return typeof __DC_GOOGLE_SEARCH_API_KEY__ === "string" ? clean(__DC_GOOGLE_SEARCH_API_KEY__) : "";
    }
    return typeof __DC_GOOGLE_SEARCH_CX__ === "string" ? clean(__DC_GOOGLE_SEARCH_CX__) : "";
  } catch {
    return "";
  }
};

/** The configuration a search actually uses. */
export type GoogleSearchConfig = {
  apiKey: string;
  cx: string;
};

/**
 * THE LEARNER'S OWN configuration — their account slot, else this browser's.
 */
export function ownGoogleSearchConfig(uid?: string | null): GoogleSearchConfig {
  const user = typeof uid === "string" ? uid.trim() : "";
  if (user) {
    const key = readSlot(googleSearchUserKeyStorage(user));
    const cx = readSlot(googleSearchUserCxStorage(user));
    if (key && cx) return { apiKey: key, cx };
  }
  const deviceKey = readSlot(GOOGLE_SEARCH_KEY_STORAGE);
  const deviceCx = readSlot(GOOGLE_SEARCH_CX_STORAGE);
  if (deviceKey && deviceCx) return { apiKey: deviceKey, cx: deviceCx };
  return { apiKey: "", cx: "" };
}

/**
 * THE OWNER'S configuration — the one baked into the build (or injected at
 * serve time). The school owns its quota; the learner chooses whether to
 * spend it.
 */
export function masterGoogleSearchConfig(): GoogleSearchConfig {
  const injectedKey = buildValue("__DC_GOOGLE_SEARCH_API_KEY__");
  const injectedCx = buildValue("__DC_GOOGLE_SEARCH_CX__");
  return {
    apiKey: injectedKey || clean((globalThis as Record<string, unknown>).__DC_GOOGLE_SEARCH_API_KEY__),
    cx: injectedCx || clean((globalThis as Record<string, unknown>).__DC_GOOGLE_SEARCH_CX__),
  };
}

/** Is there a master configuration at all? (The Settings switch needs it.) */
export const masterGoogleSearchAvailable = (): boolean => {
  const config = masterGoogleSearchConfig();
  return Boolean(config.apiKey && config.cx);
};

/** The choice in effect: "mine" (their own) or "master" (the school's). */
export function googleSearchKeySource(uid?: string | null): SearchKeySource {
  return readSearchKeySource("google", uid);
}

/**
 * The configuration a search uses FIRST, whose it is, and which one takes
 * over when this one's daily quota is gone.
 *
 *   · "mine"   → the learner's own configuration first, the master's as the
 *                background handover (this is the default);
 *   · "master" → the school's configuration, because the learner asked for it.
 *
 * The choice is never a trap: if the chosen configuration is not there at
 * all, the other one is used — a working search always beats a dead one.
 */
export type GoogleSearchPlan = {
  apiKey: string;
  cx: string;
  /** Whose configuration that is. */
  origin: "own" | "master";
  /** The other configuration — the automatic handover on a dead quota. */
  handover: GoogleSearchConfig | null;
};

export function googleSearchPlan(uid?: string | null): GoogleSearchPlan {
  const own = ownGoogleSearchConfig(uid);
  const master = masterGoogleSearchConfig();
  const hasOwn = Boolean(own.apiKey && own.cx);
  const hasMaster = Boolean(master.apiKey && master.cx);
  if (googleSearchKeySource(uid) === "master") {
    return {
      apiKey: hasMaster ? master.apiKey : own.apiKey,
      cx: hasMaster ? master.cx : own.cx,
      origin: hasMaster ? "master" : "own",
      handover: null,
    };
  }
  // The learner's own configuration burns a DAILY budget: once it is spent,
  // the master's takes over — but only until Google's next daily reset. The
  // moment that reset comes, the learner's own configuration is back on its
  // own, with nothing to press.
  if (hasOwn && hasMaster && ownQuotaExhausted("google", uid)) {
    return {
      apiKey: master.apiKey,
      cx: master.cx,
      origin: "master",
      handover: null,
    };
  }
  return {
    apiKey: hasOwn ? own.apiKey : master.apiKey,
    cx: hasOwn ? own.cx : master.cx,
    origin: hasOwn ? "own" : "master",
    handover: hasOwn && hasMaster ? master : null,
  };
}

/** The configuration a search actually uses. */
export function googleSearchConfig(uid?: string | null): GoogleSearchConfig {
  const plan = googleSearchPlan(uid);
  return { apiKey: plan.apiKey, cx: plan.cx };
}

/**
 * Store the choice the learner made in Settings: "mine" or "master". The
 * page is told at once, so the search picks the new configuration at once.
 */
export function setGoogleSearchSource(source: SearchKeySource, uid?: string | null): boolean {
  const stored = writeSearchKeySource("google", source, uid);
  if (!stored) return false;
  announceSearchKeySource();
  announceGoogleSearchConfig();
  return true;
}

/** True when a search can actually run. */
export const googleSearchAvailable = (uid?: string | null): boolean => {
  const { apiKey, cx } = googleSearchConfig(uid);
  return Boolean(apiKey && cx);
};

/** True when the OWNER's build-time configuration is the one in play. */
export const googleSearchOwnerConfigured = (uid?: string | null): boolean => {
  const plan = googleSearchPlan(uid);
  if (!plan.apiKey || !plan.cx) return false;
  return plan.origin === "master";
};

function announceGoogleSearchConfig(): void {
  const win = globalThis.window as (Window & typeof globalThis) | undefined;
  if (!win?.dispatchEvent) return;
  try {
    const EventCtor = win.Event;
    if (!EventCtor) return;
    win.dispatchEvent(new EventCtor(GOOGLE_SEARCH_CONFIG_EVENT));
  } catch {
    // A host without events simply does not need them.
  }
}

/** Store the learner's own configuration (their account slot). */
export function saveGoogleSearchConfig(apiKey: string, cx: string, uid?: string | null): boolean {
  const key = clean(apiKey);
  const engine = clean(cx);
  if (!key || !engine) return false;
  const user = typeof uid === "string" ? uid.trim() : "";
  const keySlot = user ? googleSearchUserKeyStorage(user) : GOOGLE_SEARCH_KEY_STORAGE;
  const cxSlot = user ? googleSearchUserCxStorage(user) : GOOGLE_SEARCH_CX_STORAGE;
  if (!writeSlot(keySlot, key)) return false;
  writeSlot(cxSlot, engine);
  // A NEW configuration is a fresh daily budget: the old "quota is gone"
  // pause is meaningless now.
  clearOwnQuotaExhausted("google", uid);
  announceGoogleSearchConfig();
  return true;
}

/** Remove the configuration that is actually in effect. */
export function clearGoogleSearchConfig(uid?: string | null): void {
  const user = typeof uid === "string" ? uid.trim() : "";
  writeSlot(user ? googleSearchUserKeyStorage(user) : GOOGLE_SEARCH_KEY_STORAGE, "");
  writeSlot(user ? googleSearchUserCxStorage(user) : GOOGLE_SEARCH_CX_STORAGE, "");
  clearOwnQuotaExhausted("google", uid);
  announceGoogleSearchConfig();
}

/** Watch for the configuration appearing (or being cleared) without a reload. */
export function subscribeGoogleSearchConfig(listener: () => void): () => void {
  const target = globalThis.window;
  if (!target?.addEventListener) return () => undefined;
  target.addEventListener("storage", listener);
  target.addEventListener(GOOGLE_SEARCH_CONFIG_EVENT, listener);
  return () => {
    target.removeEventListener("storage", listener);
    target.removeEventListener(GOOGLE_SEARCH_CONFIG_EVENT, listener);
  };
}

/** Where a query goes when nothing is configured: Google's own search page. */
export const googleSearchUrl = (query: string): string =>
  `https://www.google.com/search?q=${encodeURIComponent(normaliseSearchQuery(query))}`;

/* ── The results, in Google's own shape ──────────────────────────────────── */

/** Which of Google's two result kinds we are asking for. */
export type GoogleSearchType = "web" | "image";

/** ONE result — a web page, with everything the API said about it. */
export type GoogleResult = {
  id: string;
  title: string;
  url: string;
  /** Google's own `displayLink` — the abridged URL (the site's address). */
  displayUrl: string;
  /** The site's own name (its `og:site_name`), or its host. */
  source: string;
  /** The snippet, as plain text. */
  snippet: string;
  /** The snippet with Google's own `<b>` marks around the matched words. */
  htmlSnippet: string;
  /** The page's picture, when it has one. */
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  /** The small thumbnail (Google's own `cse_thumbnail`). */
  thumbnailUrl: string;
  /** "application/pdf" and friends. */
  mime: string;
  /** "PDF", "XLS"… */
  fileFormat: string;
  /** The file's size, when Google counted it. */
  fileSize: string;
  /** The page's own date, when it published one. */
  publishedAt: string;
  /** Google marked this one as a popular result. */
  isPopular: boolean;
};

export type GoogleSearchErrorCode =
  | "no-config"
  | "invalid-key"
  | "invalid-cx"
  | "api-disabled"
  | "quota"
  | "referrer"
  | "ip-blocked"
  | "permission"
  | "proxy-unavailable"
  | "network"
  | "unknown";

/** The one sentence each failure deserves. */
export const GOOGLE_SEARCH_ERROR_MESSAGES: Record<GoogleSearchErrorCode, string> = {
  "no-config":
    "Google search ke liye ek API key aur Search Engine ID chahiye — Settings me apna configuration jodo, ya Google par khud search karo.",
  "invalid-key": "Ye Google API key accept nahi ho rahi. Key dobara copy karke check karo.",
  "invalid-cx":
    "Ye Search Engine ID (cx) valid nahi hai. Programmable Search Engine ka ID copy karke check karo.",
  "api-disabled":
    "Is key ke Google Cloud project mein Custom Search API enable nahi hai — console mein API ON karna hoga.",
  quota: "Is key ki daily search quota khatam ho gayi hai. Kal try karo, ya doosri key use karo.",
  referrer:
    "Google ne request rok di — is key ki “Website” restriction mein app ki site ka address add karna hoga. APK / PWA / localhost sab jagah chalana hai to Google Cloud → Credentials → API key → Application restriction ko 'None' kar do, ya har origin add karo (https://yourdomain.com/*, http://localhost/*, capacitor://*).",
  "ip-blocked":
    "Is key par IP-address restriction lagi hai aur ye device us list mein nahi hai. Google Cloud → Credentials → API key → Application restriction ko 'None' karo (ya server proxy use karo, jo Settings → Google search → Diagnose me dikhta hai).",
  permission:
    "Google ne 403 bheja — key theek hai lekin is project/permission me kuch rok raha hai. Neeche Google ka apna message padho; zyada tar ye API restriction (key sirf kuch APIs ke liye allowed) ya billing band hone ki wajah se hota hai.",
  "proxy-unavailable":
    "App ka server-side search route abhi jawab nahi de raha (deployment purani ho sakti hai). Browser se seedha search try ho raha hai.",
  network: "Network error — apna internet check karke dobara try karo.",
  unknown: "Google se connect nahi ho paya. Dobara try karo.",
};

/** What Google itself said — kept so the page never has to guess again. */
export type GoogleErrorDetail = {
  code: GoogleSearchErrorCode;
  status: number;
  reason: string;
  message: string;
};

/**
 * Read Google's own error body and say what actually went wrong.
 *
 * The old version collapsed EVERY 403 into "referrer", which is exactly why
 * "restriction None kar diya, phir bhi wahi message" kept happening: an IP
 * restriction, an API restriction, a disabled API on another project or a
 * plain permission error all read as the same advice. Every branch below is
 * now driven by Google's own `reason`/`message`, and the raw text is carried
 * out in `GoogleErrorDetail` so the UI can show Google's own words.
 */
export function classifyGoogleErrorDetail(status: number, body: unknown): GoogleErrorDetail {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const error = (record.error && typeof record.error === "object" ? record.error : {}) as Record<string, unknown>;
  const errors = Array.isArray(error.errors) ? (error.errors as Array<Record<string, unknown>>) : [];
  const reason = String(errors[0]?.reason || error.status || "").trim();
  const message = String(error.message || "").trim();
  const reasonLower = reason.toLowerCase();
  const detail = (code: GoogleSearchErrorCode): GoogleErrorDetail => ({ code, status, reason, message });

  if (/keyinvalid|keynotfound/.test(reasonLower) || /api key not valid|invalid key|missing a valid api key/i.test(message)) {
    return detail("invalid-key");
  }
  if (reason === "invalid" && /cx|cse|search engine/i.test(message)) return detail("invalid-cx");
  if (/search engine id|invalid value.*'?cx'?/i.test(message) && !/key/i.test(message)) return detail("invalid-cx");
  if (
    /accessnotconfigured|service_disabled/.test(reasonLower) ||
    /has not been used in project|is not enabled|access not configured/i.test(message)
  ) {
    return detail("api-disabled");
  }
  if (
    /quotaexceeded|dailylimitexceeded|ratelimitexceeded/.test(reasonLower) ||
    /quota exceeded|daily limit exceeded/i.test(message) ||
    status === 429
  ) {
    return detail("quota");
  }
  // The two key-restriction flavours, told apart — the fix is different, and
  // Google reports BOTH under the same `ipRefererBlocked` reason, so the
  // message decides and the IP case is tested first.
  if (/requests from ip address/i.test(message)) return detail("ip-blocked");
  if (/iprefererblocked|referernotallowed/.test(reasonLower) || /disallowed referrer|requests from referer/i.test(message)) {
    return detail("referrer");
  }
  if (status === 403) return detail("permission");
  if (status >= 500) return detail("network");
  return detail("unknown");
}

/** The code alone — the shape every existing caller (and test) already uses. */
export function classifyGoogleError(status: number, body: unknown): GoogleSearchErrorCode {
  return classifyGoogleErrorDetail(status, body).code;
}

export type GoogleSearchOutcome = {
  rows: GoogleResult[];
  error: GoogleSearchErrorCode | null;
  message: string;
  /** "About 12,300 results" — Google's own count. */
  totalResults: string;
  /** "0.42 seconds" — Google's own time. */
  totalTime: string;
  /** The page we are on (1 is the first). */
  page: number;
  /** There is a next page of results. */
  hasNext: boolean;
  /** The index the next page starts at (Google's own `nextPage.startIndex`). */
  nextStart: number | null;
  /** There is a previous page of results. */
  hasPrevious: boolean;
  /** The index the previous page starts at. */
  previousStart: number | null;
  /** Google's own spelling correction, when it had one. */
  correctedQuery: string;
  /** Which of Google's two result kinds these rows are. */
  searchType: GoogleSearchType;
  /**
   * The learner's own quota was gone and the MASTER's configuration took
   * over, without a word and without a break in the search.
   */
  usedFallback?: boolean;
  /** Which path finally answered: the browser's own call, or our server. */
  via?: GoogleSearchPath;
  /** Whose key that path used. */
  keyOwner?: "own" | "master" | "server";
  /** The last 4 characters of the key that answered — "kaunsi key chali". */
  keyFingerprint?: string;
  /** Google's own status/reason/message when something refused us. */
  googleStatus?: number;
  googleReason?: string;
  googleMessage?: string;
  /** Every path that was tried, in order — the page's diagnostics line. */
  attempts?: string[];
};

/* ── The API's own shapes, exactly as the reference describes them ──────── */

interface GoogleApiImage {
  src?: string;
  width?: number;
  height?: number;
  contextLink?: string;
  thumbnailLink?: string;
  resourcetype?: string;
}

interface GoogleApiItem {
  kind?: string;
  title?: string;
  htmlTitle?: string;
  link?: string;
  displayLink?: string;
  snippet?: string;
  htmlSnippet?: string;
  formattedUrl?: string;
  cacheId?: string;
  mime?: string;
  fileFormat?: string;
  fileSize?: string;
  pagemap?: {
    cse_image?: GoogleApiImage[];
    cse_thumbnail?: GoogleApiImage[];
    metatags?: Array<Record<string, string>>;
    productimages?: GoogleApiImage[];
  };
  image?: GoogleApiImage;
  labels?: Array<{ name?: string; displayName?: string }>;
  /** Google's "popular result" mark. */
  duar?: boolean;
}

interface GoogleApiQuery {
  totalResults?: string;
  count?: number;
  startIndex?: number;
  startPage?: number;
  title?: string;
  searchTerms?: string;
}

interface GoogleApiResponse {
  searchInformation?: {
    totalResults?: string;
    formattedTotalResults?: string;
    searchTime?: number;
    formattedSearchTime?: string;
  };
  queries?: {
    request?: GoogleApiQuery[];
    nextPage?: GoogleApiQuery[];
    previousPage?: GoogleApiQuery[];
  };
  spelling?: { correctedQuery?: boolean; originalQuery?: string };
  items?: GoogleApiItem[];
}

/* ── Reading the API's answer ───────────────────────────────────────────── */

/** The site's own name — Google's metatags first, the URL's host otherwise. */
const siteName = (item: GoogleApiItem, link: string): string => {
  const metatags = item.pagemap?.metatags || [];
  for (const tags of metatags) {
    const name = String(tags["og:site_name"] || "").trim();
    if (name) return name;
  }
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** The host, without the "www." — the little grey name in Google's own row. */
const hostOf = (link: string): string => {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** A picture that a browser can actually load. */
const usableImage = (value: unknown): string => {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
};

const firstImage = (list: GoogleApiImage[] | undefined): GoogleApiImage | null => {
  if (!Array.isArray(list)) return null;
  for (const image of list) {
    if (usableImage(image?.src)) return image;
  }
  return null;
};

/** The metatag's value, however the page spelled the key. */
const metaValue = (item: GoogleApiItem, key: string): string => {
  const metatags = item.pagemap?.metatags || [];
  for (const tags of metatags) {
    const value = String(tags?.[key] || "").trim();
    if (value) return value;
  }
  return "";
};

/**
 * The page's picture — the first one Google found, in Google's own order of
 * preference: the page's own image, then its thumbnail, then the social
 * card (og:image / twitter:image), then the image-search thumbnail.
 */
const pictureOf = (item: GoogleApiItem): { url: string; width: number; height: number } => {
  const cse = firstImage(item.pagemap?.cse_image);
  if (cse?.src) {
    return { url: usableImage(cse.src), width: Number(cse.width) || 0, height: Number(cse.height) || 0 };
  }
  const social = usableImage(metaValue(item, "og:image")) || usableImage(metaValue(item, "twitter:image"));
  if (social) return { url: social, width: 0, height: 0 };
  const thumb = firstImage(item.pagemap?.cse_thumbnail);
  if (thumb?.src) {
    return { url: usableImage(thumb.src), width: Number(thumb.width) || 0, height: Number(thumb.height) || 0 };
  }
  const image = item.image?.thumbnailLink ? item.image : null;
  if (image?.thumbnailLink) {
    return { url: usableImage(image.thumbnailLink), width: Number(image.width) || 0, height: Number(image.height) || 0 };
  }
  const product = firstImage(item.pagemap?.productimages);
  if (product?.src) {
    return { url: usableImage(product.src), width: Number(product.width) || 0, height: Number(product.height) || 0 };
  }
  return { url: "", width: 0, height: 0 };
};

/** The little thumbnail — the one a result grid shows. */
const thumbnailOf = (item: GoogleApiItem, picture: string): string => {
  const thumb = firstImage(item.pagemap?.cse_thumbnail);
  if (thumb?.src) return usableImage(thumb.src);
  if (item.image?.thumbnailLink) return usableImage(item.image.thumbnailLink);
  return picture;
};

/** The page's own date, when it published one. */
const publishedOf = (item: GoogleApiItem): string => {
  const raw =
    metaValue(item, "article:published_time") ||
    metaValue(item, "og:updated_time") ||
    metaValue(item, "article:modified_time") ||
    metaValue(item, "date") ||
    metaValue(item, "pubdate");
  if (!raw) return "";
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) return raw;
  return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/** Strip the markup, keep the words. */
const plainText = (value: unknown): string =>
  String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/** Google's own `<b>` marks — kept as they are, so the words can be bolded. */
const markedText = (value: unknown): string => {
  const text = String(value || "");
  if (!text) return "";
  return text.replace(/<(?!\/?b>)[^>]*>/g, "").replace(/\s+/g, " ").trim();
};

/** Turn one API item into one result row. */
export function toGoogleResult(item: GoogleApiItem): GoogleResult | null {
  const link = String(item?.link || "").trim();
  if (!/^https?:\/\//i.test(link)) return null;
  const picture = pictureOf(item);
  const title = plainText(item?.title) || plainText(item?.htmlTitle) || link;
  return {
    id: String(item?.cacheId || link),
    title,
    url: link,
    displayUrl: String(item?.displayLink || "").trim() || hostOf(link),
    source: siteName(item, link),
    snippet: plainText(item?.snippet),
    htmlSnippet: markedText(item?.htmlSnippet) || markedText(item?.snippet),
    imageUrl: picture.url,
    imageWidth: picture.width,
    imageHeight: picture.height,
    thumbnailUrl: thumbnailOf(item, picture.url),
    mime: String(item?.mime || "").trim(),
    fileFormat: String(item?.fileFormat || "").trim(),
    fileSize: String(item?.fileSize || "").trim(),
    publishedAt: publishedOf(item),
    isPopular: Boolean(item?.duar),
  };
}

/** Google's own limits: ten results a page, and never more than a hundred. */
export const GOOGLE_PAGE_SIZE = 10;
export const GOOGLE_MAX_START = 91;

/** The page number a start index belongs to (1 is the first page). */
export const googlePageOf = (start: number): number =>
  Math.max(1, Math.floor((Math.max(1, start) - 1) / GOOGLE_PAGE_SIZE) + 1);

/* ── The two paths a query can take ────────────────────────────────────────
   "direct" — the browser asks Google itself. Cheapest, fastest, and the key
              never touches our server. It is what the page tries first.
   "server" — the same query is POSTed to /api/google-search, which asks
              Google from the serverless function. No Origin, no Referer, so
              an API key's HTTP-referrer restriction has nothing to match:
              this is the path that keeps working from the APK, the PWA, a
              preview domain and localhost without a single Google Cloud
              change. */
export type GoogleSearchPath = "direct" | "server";

/** "AIza…w9Xc" — enough for a learner to recognise their own key. */
export function googleKeyFingerprint(apiKey: string): string {
  const key = String(apiKey || "").trim();
  if (!key) return "";
  if (key.length <= 8) return `${key.slice(0, 2)}…`;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Which of the three slots the configuration in effect actually came from. */
export type GoogleConfigSlot = "account" | "device" | "build" | "none";

export type GoogleConfigReport = {
  apiKey: string;
  cx: string;
  /** Whose key: the learner's own, or the school's build-time one. */
  origin: "own" | "master" | "none";
  /** Where that value was read from — the answer to "kaunsi key chal rahi hai?". */
  slot: GoogleConfigSlot;
  fingerprint: string;
  ready: boolean;
  /** The other configuration, available as an automatic handover. */
  handover: { fingerprint: string; slot: GoogleConfigSlot } | null;
};

/** Tell the learner exactly which key a search will use, and from where. */
export function googleSearchConfigReport(uid?: string | null): GoogleConfigReport {
  const user = typeof uid === "string" ? uid.trim() : "";
  const master = masterGoogleSearchConfig();
  const plan = googleSearchPlan(uid);
  const accountKey = user ? readSlot(googleSearchUserKeyStorage(user)) : "";
  const deviceKey = readSlot(GOOGLE_SEARCH_KEY_STORAGE);
  const ownKey = accountKey || deviceKey;
  const ownSlot: GoogleConfigSlot = accountKey ? "account" : deviceKey ? "device" : "none";
  const usingMaster = Boolean(plan.apiKey) && plan.apiKey === master.apiKey && master.apiKey !== ownKey;
  const slot: GoogleConfigSlot = !plan.apiKey ? "none" : usingMaster ? "build" : ownSlot;
  return {
    apiKey: plan.apiKey,
    cx: plan.cx,
    origin: !plan.apiKey ? "none" : plan.origin === "master" ? "master" : "own",
    slot,
    fingerprint: googleKeyFingerprint(plan.apiKey),
    ready: Boolean(plan.apiKey && plan.cx),
    handover: plan.handover
      ? {
          fingerprint: googleKeyFingerprint(plan.handover.apiKey),
          slot: plan.handover.apiKey === master.apiKey ? "build" : ownSlot,
        }
      : null,
  };
}

const emptyOutcome = (
  error: GoogleSearchErrorCode | null,
  message: string,
  start: number,
  type: GoogleSearchType,
): GoogleSearchOutcome => ({
  rows: [],
  error,
  message,
  totalResults: "",
  totalTime: "",
  page: googlePageOf(start),
  hasNext: false,
  nextStart: null,
  hasPrevious: start > 1,
  previousStart: start > 1 ? Math.max(1, start - GOOGLE_PAGE_SIZE) : null,
  correctedQuery: "",
  searchType: type,
});

/** Turn Google's own payload into the page's rows + pager. */
function readGooglePayload(payload: GoogleApiResponse, start: number, type: GoogleSearchType): GoogleSearchOutcome {
  const rows = (payload.items || [])
    .map((item) => toGoogleResult(item))
    .filter((row): row is GoogleResult => Boolean(row));
  const info = payload.searchInformation || {};
  const next = payload.queries?.nextPage?.[0];
  const previous = payload.queries?.previousPage?.[0];
  const nextStart = next?.startIndex
    ? Math.min(GOOGLE_MAX_START, Number(next.startIndex))
    : start + rows.length < 100
      ? start + GOOGLE_PAGE_SIZE
      : null;
  return {
    rows,
    error: null,
    message: "",
    totalResults: String(info.formattedTotalResults || info.totalResults || "").trim(),
    totalTime: String(info.formattedSearchTime || (info.searchTime != null ? String(info.searchTime) : "")).trim(),
    page: googlePageOf(start),
    hasNext: Boolean(nextStart),
    nextStart,
    hasPrevious: Boolean(previous?.startIndex) || start > 1,
    previousStart: previous?.startIndex
      ? Math.max(1, Number(previous.startIndex))
      : start > 1
        ? Math.max(1, start - GOOGLE_PAGE_SIZE)
        : null,
    correctedQuery: payload.spelling?.correctedQuery ? String(payload.spelling.originalQuery || "").trim() : "",
    searchType: type,
  };
}

/** One attempt's outcome, including everything Google said about a refusal. */
type AttemptOutcome = GoogleSearchOutcome & {
  detail?: GoogleErrorDetail | null;
  path: GoogleSearchPath;
  /** A path that could not even be tried (no server route deployed). */
  skipped?: boolean;
};

/**
 * The search itself, with ONE configuration and ONE path in hand.
 * Never throws.
 */
async function runGoogleSearch(
  text: string,
  apiKey: string,
  cx: string,
  type: GoogleSearchType,
  start: number,
  signal?: AbortSignal,
  path: GoogleSearchPath = "direct",
): Promise<AttemptOutcome> {
  if (!apiKey || !cx) {
    return { ...emptyOutcome("no-config", GOOGLE_SEARCH_ERROR_MESSAGES["no-config"], start, type), path };
  }
  if (path === "server") return runServerGoogleSearch(text, apiKey, cx, type, start, signal);

  const endpoint = new URL("https://www.googleapis.com/customsearch/v1");
  endpoint.searchParams.set("key", apiKey);
  endpoint.searchParams.set("cx", cx);
  endpoint.searchParams.set("q", text);
  endpoint.searchParams.set("num", String(GOOGLE_PAGE_SIZE));
  if (start > 1) endpoint.searchParams.set("start", String(start));
  if (type === "image") endpoint.searchParams.set("searchType", "image");
  try {
    const response = await fetch(endpoint.toString(), { signal });
    if (!response.ok) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const detail = classifyGoogleErrorDetail(response.status, body);
      return {
        ...emptyOutcome(detail.code, GOOGLE_SEARCH_ERROR_MESSAGES[detail.code], start, type),
        path,
        detail,
        googleStatus: detail.status,
        googleReason: detail.reason,
        googleMessage: detail.message,
      };
    }
    const payload = (await response.json()) as GoogleApiResponse;
    return { ...readGooglePayload(payload, start, type), path };
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw error;
    return { ...emptyOutcome("network", GOOGLE_SEARCH_ERROR_MESSAGES.network, start, type), path };
  }
}

/**
 * The same search, sent through our own server (`/api/google-search`).
 *
 * The learner's key + cx travel in the POST BODY — never in a URL, so they
 * cannot end up in a CDN cache key or a log line. A deployment that does not
 * have the route yet answers with the SPA's HTML; that reads as
 * `proxy-unavailable` and the caller falls back to the direct path.
 */
async function runServerGoogleSearch(
  text: string,
  apiKey: string,
  cx: string,
  type: GoogleSearchType,
  start: number,
  signal?: AbortSignal,
): Promise<AttemptOutcome> {
  try {
    const response = await apiFetch("/api/google-search", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ q: text, start, type, key: apiKey, cx }),
    });
    const contentType = String(response.headers?.get?.("content-type") || "");
    if (/text\/html/i.test(contentType)) {
      // A static host answered the SPA — the route is not deployed here.
      return {
        ...emptyOutcome("proxy-unavailable", GOOGLE_SEARCH_ERROR_MESSAGES["proxy-unavailable"], start, type),
        path: "server",
        skipped: true,
      };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      return {
        ...emptyOutcome("proxy-unavailable", GOOGLE_SEARCH_ERROR_MESSAGES["proxy-unavailable"], start, type),
        path: "server",
        skipped: true,
      };
    }
    const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    if (record.ok === true && record.payload && typeof record.payload === "object") {
      const outcome = readGooglePayload(record.payload as GoogleApiResponse, start, type);
      return {
        ...outcome,
        path: "server",
        keyOwner: String(record.keyOwner || "server") === "server" ? "server" : "own",
      };
    }
    const rawCode = String(record.code || "").trim();
    const known = rawCode in GOOGLE_SEARCH_ERROR_MESSAGES;
    const detail: GoogleErrorDetail = {
      code: known ? (rawCode as GoogleSearchErrorCode) : "unknown",
      status: Number(record.googleStatus) || 0,
      reason: String(record.googleReason || "").trim(),
      message: String(record.googleMessage || record.error || "").trim(),
    };
    return {
      ...emptyOutcome(detail.code, GOOGLE_SEARCH_ERROR_MESSAGES[detail.code], start, type),
      path: "server",
      detail,
      googleStatus: detail.status || undefined,
      googleReason: detail.reason || undefined,
      googleMessage: detail.message || undefined,
    };
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw error;
    return {
      ...emptyOutcome("proxy-unavailable", GOOGLE_SEARCH_ERROR_MESSAGES["proxy-unavailable"], start, type),
      path: "server",
      skipped: true,
    };
  }
}

/* ── Which path goes first ────────────────────────────────────────────────
   Once a key has been refused BY THE BROWSER for a restriction reason, the
   direct path will keep failing for the rest of the session (Google's own
   propagation delay aside) — so the server path is tried first from then on.
   A success, or a refusal that has nothing to do with the caller (wrong key,
   dead quota, disabled API), clears the memory: those are the same on both
   paths, and the cheap one should lead. */
const blockedPathMemory = new Map<string, number>();
const BLOCKED_PATH_TTL_MS = 10 * 60 * 1000;
const PATH_WORTH_RETRYING: GoogleSearchErrorCode[] = ["referrer", "ip-blocked", "permission", "unknown", "network"];

const rememberBlockedKey = (apiKey: string) => {
  const key = googleKeyFingerprint(apiKey);
  if (!key) return;
  blockedPathMemory.set(key, Date.now());
  while (blockedPathMemory.size > 24) {
    const oldest = blockedPathMemory.keys().next().value;
    if (oldest === undefined) break;
    blockedPathMemory.delete(oldest);
  }
};

const forgetBlockedKey = (apiKey: string) => {
  blockedPathMemory.delete(googleKeyFingerprint(apiKey));
};

const directPathBlocked = (apiKey: string): boolean => {
  const at = blockedPathMemory.get(googleKeyFingerprint(apiKey));
  if (!at) return false;
  if (Date.now() - at > BLOCKED_PATH_TTL_MS) {
    blockedPathMemory.delete(googleKeyFingerprint(apiKey));
    return false;
  }
  return true;
};

/** Test hook / "I fixed the restriction, start from scratch". */
export function resetGoogleSearchPathMemory(): void {
  blockedPathMemory.clear();
}

/**
 * Which failure is worth showing. Google's OWN words, read on the direct path,
 * beat a proxy's second-hand classification; and a specific reason beats a
 * generic "unknown" every time. Without this the page could report the
 * server hop's vague answer while the browser hop had already learned the
 * precise one.
 */
const failureScore = (outcome: AttemptOutcome): number => {
  if (outcome.skipped) return -3;
  let score = outcome.detail ? 2 : 1;
  if (outcome.path === "direct") score += 1;
  if (outcome.error === "unknown" || outcome.error === "proxy-unavailable" || outcome.error === "network") score -= 2;
  return score;
};

const describeAttempt = (path: GoogleSearchPath, apiKey: string, outcome: AttemptOutcome): string =>
  `${path === "server" ? "server" : "browser"} · ${googleKeyFingerprint(apiKey)} → ${
    outcome.error ? `${outcome.error}${outcome.googleStatus ? ` (HTTP ${outcome.googleStatus})` : ""}` : "ok"
  }`;

/**
 * Search the web through Google's official Custom Search JSON API, and say
 * what happened.
 *
 * Never throws. THE CASCADE — the search simply works, and the page says
 * exactly which path and which key answered:
 *
 *   1. the chosen configuration, straight from the browser (cheapest);
 *   2. the same configuration through our own server — this is what survives
 *      an API key's website/IP restriction, because a server request carries
 *      no Origin and no Referer for Google to refuse;
 *   3. the other configuration (the school's, or the learner's) on both paths.
 *
 * A dead daily quota skips the server hop (a proxy cannot add quota) and goes
 * straight to the handover, exactly as before.
 */
export async function searchGoogleOutcome(
  query: string,
  signal?: AbortSignal,
  uid?: string | null,
  options?: { start?: number; type?: GoogleSearchType },
): Promise<GoogleSearchOutcome> {
  const text = normaliseSearchQuery(query);
  const type: GoogleSearchType = options?.type === "image" ? "image" : "web";
  const start = Math.min(GOOGLE_MAX_START, Math.max(1, Math.round(options?.start || 1)));
  if (!text) return { ...emptyOutcome(null, "", start, type), via: "direct" };
  const plan = googleSearchPlan(uid);
  if (!plan.apiKey || !plan.cx) {
    return { ...emptyOutcome("no-config", GOOGLE_SEARCH_ERROR_MESSAGES["no-config"], start, type), via: "direct" };
  }

  const attempts: string[] = [];
  const configurations: Array<{ apiKey: string; cx: string; owner: "own" | "master"; usedFallback: boolean }> = [
    { apiKey: plan.apiKey, cx: plan.cx, owner: plan.origin === "master" ? "master" : "own", usedFallback: false },
  ];
  if (plan.handover && plan.handover.apiKey !== plan.apiKey) {
    configurations.push({
      apiKey: plan.handover.apiKey,
      cx: plan.handover.cx,
      owner: "master",
      usedFallback: true,
    });
  }

  let lastFailure: AttemptOutcome | null = null;
  let quotaSeen = false;

  for (const config of configurations) {
    // The server hop only makes sense for a refusal that depends on WHO is
    // asking (referrer / IP / an unexplained 403), so it is skipped for a
    // dead quota and for a key that is simply wrong.
    const order: GoogleSearchPath[] = directPathBlocked(config.apiKey)
      ? ["server", "direct"]
      : ["direct", "server"];

    for (const path of order) {
      let outcome: AttemptOutcome;
      try {
        outcome = await runGoogleSearch(text, config.apiKey, config.cx, type, start, signal, path);
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") throw error;
        outcome = { ...emptyOutcome("network", GOOGLE_SEARCH_ERROR_MESSAGES.network, start, type), path };
      }
      attempts.push(describeAttempt(path, config.apiKey, outcome));

      if (!outcome.error) {
        // Only a success on the BROWSER path proves the restriction is gone.
        // A success through the server says nothing about it — so the memory
        // stays, and the next search does not pay for the same 403 again
        // (until the TTL expires, or Settings → Diagnose clears it).
        if (path === "direct") forgetBlockedKey(config.apiKey);
        return {
          ...outcome,
          via: path,
          keyOwner: config.owner === "master" ? (path === "server" && outcome.keyOwner === "server" ? "server" : "master") : "own",
          keyFingerprint: googleKeyFingerprint(config.apiKey),
          usedFallback: config.usedFallback || undefined,
          attempts,
        };
      }

      if (outcome.error === "quota") quotaSeen = true;
      if (path === "direct" && PATH_WORTH_RETRYING.includes(outcome.error)) rememberBlockedKey(config.apiKey);
      // Keep the most informative failure: Google's own words beat a generic
      // code, and a real refusal beats "the proxy route is not deployed yet".
      if (!lastFailure || failureScore(outcome) > failureScore(lastFailure)) {
        lastFailure = outcome;
      }
      // A dead quota is the same on both paths — stop wasting a hop.
      if (outcome.error === "quota") break;
      // A wrong key / a disabled API is the same on both paths too.
      if (outcome.error === "invalid-key" || outcome.error === "invalid-cx" || outcome.error === "api-disabled") break;
    }

    // The learner's own daily quota is gone: remember it (until Google's next
    // daily reset) so the handover is not re-discovered on every keystroke.
    if (quotaSeen && config.owner === "own" && plan.handover) markOwnQuotaExhausted("google", uid);
  }

  const failure = lastFailure;
  const code: GoogleSearchErrorCode = failure?.error || "unknown";
  return {
    ...emptyOutcome(code, GOOGLE_SEARCH_ERROR_MESSAGES[code], start, type),
    googleStatus: failure?.googleStatus,
    googleReason: failure?.googleReason,
    googleMessage: failure?.googleMessage,
    attempts,
  };
}

/** The rows alone — a failure is an empty list, never a throw. */
export async function searchGoogle(
  query: string,
  signal?: AbortSignal,
  uid?: string | null,
): Promise<GoogleResult[]> {
  const outcome = await searchGoogleOutcome(query, signal, uid);
  return outcome.rows;
}

export type GoogleConfigTest = {
  ok: boolean;
  code: GoogleSearchErrorCode | null;
  message: string;
  /** Google's own words — the thing that ends the guessing. */
  googleStatus?: number;
  googleReason?: string;
  googleMessage?: string;
  /** Which path answered. */
  path?: GoogleSearchPath;
};

/**
 * Check a configuration before it is saved. `num=1` keeps the test as cheap
 * as the API allows, and the answer names the real problem (wrong key · wrong
 * cx · the API is not enabled · the daily limit is gone · referrer mismatch).
 *
 * `path: "server"` sends the very same test through /api/google-search, which
 * is how the Settings page proves whether a refusal is about the KEY or about
 * the BROWSER the key was called from.
 */
export async function testGoogleSearchConfig(
  apiKey: string,
  cx: string,
  signal?: AbortSignal,
  options?: { path?: GoogleSearchPath },
): Promise<GoogleConfigTest> {
  const key = clean(apiKey);
  const engine = clean(cx);
  if (!key || !engine) {
    return { ok: false, code: "no-config", message: GOOGLE_SEARCH_ERROR_MESSAGES["no-config"] };
  }
  if (options?.path === "server") {
    const outcome = await runServerGoogleSearch("test", key, engine, "web", 1, signal);
    if (!outcome.error) return { ok: true, code: null, message: "Server ke through Google search chalu hai.", path: "server" };
    return {
      ok: false,
      code: outcome.error,
      message: GOOGLE_SEARCH_ERROR_MESSAGES[outcome.error],
      googleStatus: outcome.googleStatus,
      googleReason: outcome.googleReason,
      googleMessage: outcome.googleMessage,
      path: "server",
    };
  }
  const endpoint = new URL("https://www.googleapis.com/customsearch/v1");
  endpoint.searchParams.set("key", key);
  endpoint.searchParams.set("cx", engine);
  endpoint.searchParams.set("q", "test");
  endpoint.searchParams.set("num", "1");
  try {
    const response = await fetch(endpoint.toString(), { signal });
    if (response.ok) {
      return { ok: true, code: null, message: "Configuration sahi hai — Google search chalu hai.", path: "direct" };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const detail = classifyGoogleErrorDetail(response.status, body);
    return {
      ok: false,
      code: detail.code,
      message: GOOGLE_SEARCH_ERROR_MESSAGES[detail.code],
      googleStatus: detail.status,
      googleReason: detail.reason,
      googleMessage: detail.message,
      path: "direct",
    };
  } catch {
    return { ok: false, code: "network", message: GOOGLE_SEARCH_ERROR_MESSAGES.network, path: "direct" };
  }
}

/* ── The diagnostic the Settings page runs ──────────────────────────────────
   "Restriction None kar diya, phir bhi wahi error" is unanswerable from a
   single generic message. So the card can now ask the truth: WHICH key is in
   effect, from WHICH slot, and what Google says to THAT key on BOTH paths.
   The verdict is one sentence, and the steps are the ones that actually fix
   that specific refusal. */

export type GooglePathProbe = {
  path: GoogleSearchPath;
  ok: boolean;
  code: GoogleSearchErrorCode | null;
  message: string;
  googleStatus?: number;
  googleReason?: string;
  googleMessage?: string;
  ms: number;
};

export type GoogleSearchDiagnosis = {
  config: GoogleConfigReport;
  direct: GooglePathProbe;
  server: GooglePathProbe;
  /** One sentence: what is actually wrong. */
  verdict: string;
  /** The steps that fix THAT problem, in order. */
  steps: string[];
  /** True when the server path works — the search can always run. */
  usable: boolean;
};

const SLOT_LABEL: Record<GoogleConfigSlot, string> = {
  account: "is account ki slot (Settings me aapne save ki thi)",
  device: "is browser ki slot (device-wide)",
  build: "build me baked school/owner ki key (VITE_GOOGLE_SEARCH_API_KEY)",
  none: "kahin nahi",
};

const probe = async (
  path: GoogleSearchPath,
  apiKey: string,
  cx: string,
  signal?: AbortSignal,
): Promise<GooglePathProbe> => {
  const startedAt = Date.now();
  const result = await testGoogleSearchConfig(apiKey, cx, signal, { path });
  return { path, ...result, ms: Date.now() - startedAt };
};

/** What to do about each refusal — the exact clicks, not a generic essay. */
export function googleFixSteps(code: GoogleSearchErrorCode | null, report: GoogleConfigReport): string[] {
  const consoleLink = "Google Cloud → APIs & Services → Credentials → us key par click karo";
  switch (code) {
    case "referrer":
      return [
        `${consoleLink} → "Application restrictions" → "None" select karo → SAVE dabao.`,
        "Save ke baad Google ko 1–5 minute lagte hain — turant test mat karo.",
        report.slot === "build"
          ? "Dhyan do: jo key fail ho rahi hai wo BUILD ki school/owner key hai (VITE_GOOGLE_SEARCH_API_KEY) — apni key edit karne se kuch nahi hoga. Ya to wahi key theek karo, ya Settings → Google search → key source ko 'Apni' par rakho aur apni key save karo."
          : `Dhyan do: fail hone wali key ${SLOT_LABEL[report.slot]} se aa rahi hai (${report.fingerprint}). Google Cloud me USI key ko edit karna.`,
        "Phir bhi 403 aaye to server path use karo: ye route browser ka Referer bhejta hi nahi, isliye restriction se affect nahi hota.",
      ];
    case "ip-blocked":
      return [
        `${consoleLink} → "Application restrictions" → "None" (ya "IP addresses" me apna IP nahi aa sakta, kyunki device ka IP badalta rehta hai) → SAVE.`,
        "Server path is problem ko poora hata deta hai — request Vercel ke server se jaati hai.",
      ];
    case "permission":
      return [
        `${consoleLink} → "API restrictions" → "Don't restrict key" select karo (ya list me "Custom Search API" zaroor tick karo) → SAVE.`,
        "Google Cloud → APIs & Services → Library me jaakar 'Custom Search API' ENABLED hai ya nahi, dekh lo.",
        "Billing account disable/paused to nahi? Billing band hone par bhi Google 403 deta hai.",
      ];
    case "api-disabled":
      return [
        "Google Cloud → APIs & Services → Library → 'Custom Search API' → ENABLE.",
        "Ye usi project me enable karo jis project ki key use ho rahi hai (upar fingerprint se pehchano).",
      ];
    case "invalid-key":
      return [
        "Key dobara copy karo (aage/peeche space aksar chala jaata hai).",
        report.slot === "build"
          ? "Fail hone wali key BUILD ki school/owner key hai — VITE_GOOGLE_SEARCH_API_KEY badalna padega, ya Settings me apni key save karo."
          : `Fail hone wali key ${SLOT_LABEL[report.slot]} me hai — Settings me nayi key save karke purani hata do.`,
      ];
    case "invalid-cx":
      return [
        "Programmable Search Engine → apna engine → 'Search Engine ID' copy karo (format 0123456789abcdef:abcdefg).",
        "Engine usi Google account ka hona chahiye; dusre account ka cx is key ke saath kaam nahi karega.",
      ];
    case "quota":
      return [
        "Free tier 100 query/din hota hai. Aaj ka quota khatam — kal reset hoga.",
        "Ya Settings me doosri key/engine save karo; app apne aap handover kar leta hai.",
      ];
    case "no-config":
      return [
        "Settings → Google search me API key + Search Engine ID (cx) dono save karo.",
        "Ya deployment me GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX (server-side) set karo — tab bina kisi learner key ke bhi search chalta hai.",
      ];
    case "proxy-unavailable":
      return [
        "Ye deployment purani hai — /api/google-search route deploy nahi hua. Latest build deploy karo (vercel.json + api/_lib/googleSearchProxy.ts ke saath).",
      ];
    default:
      return ["Network check karo, ya thodi der baad dobara try karo."];
  }
}

/**
 * Run BOTH paths with the configuration that is actually in effect and say,
 * in one sentence, what is wrong and what to do.
 */
export async function diagnoseGoogleSearch(
  uid?: string | null,
  signal?: AbortSignal,
  apiKeyOverride?: string,
  cxOverride?: string,
): Promise<GoogleSearchDiagnosis> {
  const report = googleSearchConfigReport(uid);
  const key = clean(apiKeyOverride) || report.apiKey;
  const cx = clean(cxOverride) || report.cx;
  const emptyProbe = (path: GoogleSearchPath, code: GoogleSearchErrorCode): GooglePathProbe => ({
    path,
    ok: false,
    code,
    message: GOOGLE_SEARCH_ERROR_MESSAGES[code],
    ms: 0,
  });
  if (!key || !cx) {
    return {
      config: report,
      direct: emptyProbe("direct", "no-config"),
      server: emptyProbe("server", "no-config"),
      verdict: "Koi configuration hi nahi hai — pehle API key aur Search Engine ID save karo.",
      steps: googleFixSteps("no-config", report),
      usable: false,
    };
  }
  const [direct, server] = await Promise.all([
    probe("direct", key, cx, signal),
    probe("server", key, cx, signal),
  ]);

  let verdict: string;
  if (direct.ok && server.ok) {
    verdict = `Sab theek hai — dono path chal rahe hain (key ${report.fingerprint}, ${SLOT_LABEL[report.slot]}).`;
  } else if (!direct.ok && server.ok) {
    verdict = `Key bilkul theek hai (${report.fingerprint}) — problem sirf BROWSER se bhejne me hai (${direct.code}: ${direct.googleMessage || direct.message}). Server path se search chalu hai, isliye search ab bhi kaam karega.`;
  } else if (direct.ok && !server.ok) {
    verdict = `Browser path chal raha hai; server path abhi jawab nahi de raha (${server.code}). Search kaam karega.`;
  } else {
    const code = direct.code || server.code;
    verdict = `Dono path fail — matlab problem key/engine me hai, network me nahi. Google ka apna message: ${
      direct.googleMessage || server.googleMessage || direct.message
    }`;
    void code;
  }

  return {
    config: report,
    direct,
    server,
    verdict,
    steps: googleFixSteps(direct.ok ? server.code : direct.code, report),
    usable: direct.ok || server.ok,
  };
}
