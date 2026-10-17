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

import { normaliseSearchQuery } from "./searchHistory";
import {
  announceSearchKeySource,
  readSearchKeySource,
  writeSearchKeySource,
  type SearchKeySource,
} from "./searchKeySource";

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
  announceGoogleSearchConfig();
  return true;
}

/** Remove the configuration that is actually in effect. */
export function clearGoogleSearchConfig(uid?: string | null): void {
  const user = typeof uid === "string" ? uid.trim() : "";
  writeSlot(user ? googleSearchUserKeyStorage(user) : GOOGLE_SEARCH_KEY_STORAGE, "");
  writeSlot(user ? googleSearchUserCxStorage(user) : GOOGLE_SEARCH_CX_STORAGE, "");
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
    "Google ne request rok di — is key ki “Website” restriction mein app ki site ka address add karna hoga.",
  network: "Network error — apna internet check karke dobara try karo.",
  unknown: "Google se connect nahi ho paya. Dobara try karo.",
};

/** Read Google's own error body and say what actually went wrong. */
export function classifyGoogleError(status: number, body: unknown): GoogleSearchErrorCode {
  const error = (body as { error?: { message?: string; errors?: Array<{ reason?: string }> } } | null)?.error;
  const reason = String(error?.errors?.[0]?.reason || "").trim();
  const message = String(error?.message || "").trim();
  if (reason === "keyInvalid" || reason === "keyNotFound" || /API key not valid|Invalid key/i.test(message)) {
    return "invalid-key";
  }
  if (reason === "invalid" && /cx|cse|search engine/i.test(message)) return "invalid-cx";
  if (/Search engine id|cx|Invalid value.*cx/i.test(message) && !/key/i.test(message)) return "invalid-cx";
  if (
    reason === "accessNotConfigured" ||
    reason === "SERVICE_DISABLED" ||
    /has not been used in project|is not enabled|SERVICE_DISABLED/i.test(message)
  ) {
    return "api-disabled";
  }
  if (
    reason === "quotaExceeded" ||
    reason === "dailyLimitExceeded" ||
    reason === "rateLimitExceeded" ||
    /quota exceeded|daily limit exceeded|quota/i.test(message) ||
    status === 429
  ) {
    return "quota";
  }
  if (reason === "refererNotAllowed" || reason === "forbidden" || /disallowed referrer/i.test(message) || status === 403) {
    return "referrer";
  }
  if (status >= 500) return "network";
  return "unknown";
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

/**
 * Search the web through Google's official Custom Search JSON API, and say
 * what happened. Never throws.
 *
 * `start` is Google's own pagination index (1, 11, 21 …) and `type` picks
 * between the two kinds of results the API serves: web pages, or the images
 * Google's own Images tab shows.
 */
/** The search itself, with ONE configuration in hand. */
async function runGoogleSearch(
  text: string,
  apiKey: string,
  cx: string,
  type: GoogleSearchType,
  start: number,
  signal?: AbortSignal,
): Promise<GoogleSearchOutcome> {
  const empty = (error: GoogleSearchErrorCode | null, message: string): GoogleSearchOutcome => ({
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
  if (!apiKey || !cx) {
    return empty("no-config", GOOGLE_SEARCH_ERROR_MESSAGES["no-config"]);
  }
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
      const code = classifyGoogleError(response.status, body);
      return empty(code, GOOGLE_SEARCH_ERROR_MESSAGES[code]);
    }
    const payload = (await response.json()) as GoogleApiResponse;
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
  } catch {
    return empty("network", GOOGLE_SEARCH_ERROR_MESSAGES.network);
  }
}

/**
 * Search the web through Google's official Custom Search JSON API, and say
 * what happened.
 *
 * Never throws. THE BACKGROUND RULE: the learner's own configuration goes
 * first, and the moment its daily quota is gone the MASTER's configuration
 * takes over — the very same query is re-sent, the results simply arrive, and
 * the learner never sees a break.
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
  if (!text) return runGoogleSearch(text, "", "", type, start, signal);
  const plan = googleSearchPlan(uid);
  if (!plan.apiKey || !plan.cx) {
    return runGoogleSearch(text, "", "", type, start, signal);
  }
  const first = await runGoogleSearch(text, plan.apiKey, plan.cx, type, start, signal);
  if (first.error !== "quota" || !plan.handover) return first;
  // The learner's own quota is gone — the master's configuration takes over.
  const second = await runGoogleSearch(
    text,
    plan.handover.apiKey,
    plan.handover.cx,
    type,
    start,
    signal,
  );
  if (second.error) return first;
  return { ...second, usedFallback: true };
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

export type GoogleConfigTest = { ok: boolean; code: GoogleSearchErrorCode | null; message: string };

/**
 * Check a configuration before it is saved. `num=1` keeps the test as cheap
 * as the API allows, and the answer names the real problem (wrong key · wrong
 * cx · the API is not enabled · the daily limit is gone · referrer mismatch).
 */
export async function testGoogleSearchConfig(
  apiKey: string,
  cx: string,
  signal?: AbortSignal,
): Promise<GoogleConfigTest> {
  const key = clean(apiKey);
  const engine = clean(cx);
  if (!key || !engine) {
    return { ok: false, code: "no-config", message: GOOGLE_SEARCH_ERROR_MESSAGES["no-config"] };
  }
  const endpoint = new URL("https://www.googleapis.com/customsearch/v1");
  endpoint.searchParams.set("key", key);
  endpoint.searchParams.set("cx", engine);
  endpoint.searchParams.set("q", "test");
  endpoint.searchParams.set("num", "1");
  try {
    const response = await fetch(endpoint.toString(), { signal });
    if (response.ok) {
      return { ok: true, code: null, message: "Configuration sahi hai — Google search chalu hai." };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const code = classifyGoogleError(response.status, body);
    return { ok: false, code, message: GOOGLE_SEARCH_ERROR_MESSAGES[code] };
  } catch {
    return { ok: false, code: "network", message: GOOGLE_SEARCH_ERROR_MESSAGES.network };
  }
}
