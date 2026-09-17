// api/_lib/personalAiContent.ts
//
// The ONE content-extraction pipeline for the Personal Module AI Study Engine.
//
// Everything the module AI is allowed to ground an answer in comes from here.
// The service is deliberately conservative: it only ever reports text it
// actually read, and every failure carries an honest reason that the shared
// pure layer (`utils/personalAi.js`) turns into one of the six availability
// states the UI shows (ready / partial / processing / unavailable /
// permission_required / unsupported).
//
// Which file type gets which treatment is decided in ONE place —
// `utils/aiFileReaders.js` — and this service only executes that decision. The
// read paths, in the order the registry tries them:
//
//   · in-document → the readable text is already inside the resource document:
//     a Brain practice set's imported questions, a transcript the course owner
//     pasted, a learner mind map's own branches. No network, no permission, no
//     timeout, and it is the reason a file with no URL at all is still
//     groundable.
//   · caption-file → a linked WebVTT/SRT transcript is fetched and its cues are
//     read with their timestamps. This is how a video or YouTube lesson becomes
//     answerable — the app never watches anything and never scrapes a player.
//   · google-export → Docs / Sheets / Slides via the public `export?format=txt|csv`
//     endpoint. Files not shared publicly answer with a sign-in/permission page,
//     reported as `permission_required` (never as content, never silently skipped).
//   · pdf-bytes → PDF / e-book bytes fetched (direct https link or Drive
//     `uc?export=download`) with text pulled out of the content streams by a
//     small built-in extractor (zlib inflate + Tj/TJ operators). Scanned,
//     image-only or encrypted PDFs are reported honestly.
//   · text-file → plain text / markdown / csv / html links fetched and stripped.
//
// Everything else (images, generic embeds, Forms) has no read path, and the
// reason shown comes from the same registry row, so there is no second honesty
// list to drift out of date.
//
// Extraction results are cached per owner + resource under
// `users/{uid}/personalAi/content/{resourceId}` keyed by a hash of the URL,
// so a module summary and ten follow-up questions never re-download a PDF.

import { createHash } from "node:crypto";
import { inflateRawSync, inflateSync } from "node:zlib";
import type { Firestore } from "firebase-admin/firestore";
import {
  PERSONAL_AI_MAX_RESOURCE_CHARS,
  PERSONAL_AI_MIN_READABLE_CHARS,
  cleanAiText,
  personalAiHash,
  personalAiReadPlan,
  stripAiMarkup,
  type PersonalAiOutcomeStatus,
  type PersonalAiReadPlan,
} from "../../utils/personalAi.js";
import { aiPayloadText, parseCaptionText } from "../../utils/aiFileReaders.js";

export interface ContentExtraction {
  status: PersonalAiOutcomeStatus;
  text: string;
  chars: number;
  reason: string;
  contentType: string;
  planKind: PersonalAiReadPlan["kind"];
  fromCache: boolean;
  extractedAt: number;
}

export interface PersonalResourceLike {
  id: string;
  name?: string;
  type?: string;
  url?: string;
  sourceUrl?: string;
  embedUrl?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  /**
   * Fields that make a file readable WITHOUT a network call. The reader
   * registry (`utils/aiFileReaders.js`) looks for these, so a caller that has
   * the resource document in hand — an official course file with its imported
   * practice questions, a personal note with a pasted transcript — hands the
   * text straight over. Everything is optional and untrusted-length-capped.
   */
  practiceQuestions?: unknown;
  transcriptText?: string;
  transcriptUrl?: string;
  captionsUrl?: string;
  mind?: unknown;
}

const FETCH_TIMEOUT_MS = 9000;
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
/** Cached extraction stays valid for a day (the learner's own file may change). */
const CONTENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GOOGLE_EXPORT_HOSTS = new Set(["docs.google.com", "drive.google.com"]);

const GOOGLE_HOST = /^([a-z0-9-]+\.)*google\.com$/i;

export const urlFingerprint = (url: string) => createHash("sha256").update(String(url || "")).digest("hex").slice(0, 32);

/* ------------------------------------------------------------------ */
/* SSRF guard                                                          */
/* ------------------------------------------------------------------ */

const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1\d{2}|2[0-7]\d)\./,
  /^\[?::1\]?$/i,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe[89ab][0-9a-f]:/i,
  /^metadata\.google\.internal$/i,
  /\.local$/i,
  /\.internal$/i,
];

/**
 * A fetch target must be a public https URL with no embedded credentials and
 * a host that is not a loopback/private/link-local/metadata name. Vercel
 * resolves DNS itself, so a hostname that literally IS an IP form is caught
 * here; anything else is a public web host the learner already saved.
 */
export const assertSafeContentUrl = (rawUrl: string): URL => {
  const url = new URL(String(rawUrl || "").trim());
  if (url.protocol !== "https:") throw Object.assign(new Error("Only https resources can be read."), { code: "UNSAFE_URL" });
  if (url.username || url.password) throw Object.assign(new Error("Resource URLs with credentials are refused."), { code: "UNSAFE_URL" });
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw Object.assign(new Error("Resource URL has no host."), { code: "UNSAFE_URL" });
  if (BLOCKED_HOSTS.some((pattern) => pattern.test(host))) {
    throw Object.assign(new Error("Private/local addresses cannot be read."), { code: "UNSAFE_URL" });
  }
  if (url.port && !["", "443"].includes(url.port)) {
    throw Object.assign(new Error("Only standard https ports can be read."), { code: "UNSAFE_URL" });
  }
  return url;
};

/* ------------------------------------------------------------------ */
/* PDF text extraction (small, dependency-free)                        */
/* ------------------------------------------------------------------ */

const decodePdfString = (raw: string): string => {
  let out = "";
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char !== "\\") { out += char; continue; }
    const next = raw[index + 1];
    index += 1;
    if (next === "n") out += "\n";
    else if (next === "r") out += "";
    else if (next === "t") out += "\t";
    else if (next === "b" || next === "f") out += " ";
    else if (next === "(" || next === ")" || next === "\\") out += next;
    else if (next >= "0" && next <= "7") {
      let octal = next;
      while (octal.length < 3 && raw[index + 1] >= "0" && raw[index + 1] <= "7") {
        index += 1;
        octal += raw[index];
      }
      out += String.fromCharCode(parseInt(octal, 8));
    } else if (next === "\n") {
      // Line continuation — nothing to emit.
    } else if (next !== undefined) out += next;
  }
  return out;
};

const decodeHexString = (raw: string): string => {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "");
  const padded = hex.length % 2 ? `${hex}0` : hex;
  let out = "";
  for (let index = 0; index < padded.length; index += 2) {
    const code = parseInt(padded.slice(index, index + 2), 16);
    if (code >= 32 || code === 10 || code === 9) out += String.fromCharCode(code);
  }
  return out;
};

/** Read balanced `( … )` literals, honouring nested parens and escapes. */
const readLiterals = (stream: string): string => {
  let out = "";
  let index = 0;
  while (index < stream.length) {
    const char = stream[index];
    if (char === "(") {
      let depth = 1;
      let value = "";
      index += 1;
      while (index < stream.length && depth > 0) {
        const current = stream[index];
        if (current === "\\") { value += current + (stream[index + 1] ?? ""); index += 2; continue; }
        if (current === "(") depth += 1;
        if (current === ")") { depth -= 1; if (depth === 0) { index += 1; break; } }
        value += current;
        index += 1;
      }
      out += decodePdfString(value);
      continue;
    }
    if (char === "<" && stream[index + 1] !== "<") {
      const end = stream.indexOf(">", index);
      if (end > index) {
        out += decodeHexString(stream.slice(index + 1, end));
        index = end + 1;
        continue;
      }
    }
    // Text-positioning operators end a line; keep paragraph shape readable.
    if (char === "T" && (stream.startsWith("T*", index) || stream.startsWith("Td", index) || stream.startsWith("TD", index))) {
      out += "\n";
      index += 2;
      continue;
    }
    if (char === "E" && stream.startsWith("ET", index)) {
      out += "\n";
      index += 2;
      continue;
    }
    index += 1;
  }
  return out;
};

const inflate = (bytes: Uint8Array): string | null => {
  for (const attempt of [inflateSync, inflateRawSync]) {
    try {
      return Buffer.from(attempt(Buffer.from(bytes))).toString("latin1");
    } catch {
      // try the next decoding
    }
  }
  return null;
};

/** Quality gate: extracted bytes must actually look like prose, not garbage. */
export const looksLikeReadableText = (text: string): boolean => {
  const sample = text.slice(0, 20000);
  if (sample.length < PERSONAL_AI_MIN_READABLE_CHARS) return false;
  const printable = sample.replace(/[^\x20-\x7E\n\r\t\u00A0-\uFFFF]/g, "").length;
  if (printable / sample.length < 0.9) return false;
  const tokens = sample.split(/\s+/).filter(Boolean);
  if (tokens.length < 20) return false;
  const wordLike = tokens.filter((token) => /^[A-Za-z0-9][A-Za-z0-9.,;:'’%()\-/?+=*&$#@!"]*$/.test(token)).length;
  return wordLike / tokens.length >= 0.55;
};

/**
 * Extract readable text from PDF bytes. Returns `{ ok, text, encrypted }`.
 * Object streams (`/ObjStm`) and compressed xref streams are handled because
 * modern PDFs keep their content streams inside them.
 */
export const extractPdfText = (buffer: Buffer): { ok: boolean; text: string; encrypted: boolean } => {
  const raw = buffer.toString("latin1");
  if (!raw.startsWith("%PDF-")) return { ok: false, text: "", encrypted: false };
  const encrypted = /\/Encrypt[\s0-9]/.test(raw.slice(-Math.min(raw.length, 4096))) || raw.includes("/Encrypt ");
  const pieces: string[] = [];
  const streamPattern = /stream\r?\n?/g;
  let match = streamPattern.exec(raw);
  let guard = 0;
  while (match && guard < 4000) {
    guard += 1;
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const dictStart = Math.max(0, raw.lastIndexOf("<<", match.index));
    const dict = raw.slice(dictStart, match.index);
    const bytes = Buffer.from(raw.slice(start, end), "latin1");
    let content: string | null = null;
    if (/\/FlateDecode/.test(dict)) {
      content = inflate(bytes);
    } else if (!/\/(DCTDecode|JPXDecode|JBIG2Decode|CCITTFaxDecode|A85Decode|AHxDecode|RunLengthDecode)/.test(dict)) {
      content = bytes.toString("latin1");
    }
    streamPattern.lastIndex = end + 9;
    match = streamPattern.exec(raw);
    if (!content || content.length < 8) continue;
    // Only content streams carry text operators; skip binary/image payloads.
    if (!/(T[jJdD*]|TJ|BT|ET)/.test(content.slice(0, 4000)) && !/\/ObjStm/.test(dict)) continue;
    const text = readLiterals(content);
    if (text && text.trim().length > 2) pieces.push(text);
  }
  const text = pieces.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (encrypted && text.length < PERSONAL_AI_MIN_READABLE_CHARS) return { ok: false, text, encrypted: true };
  if (!text || !looksLikeReadableText(text)) return { ok: false, text, encrypted };
  return { ok: true, text, encrypted };
};

/* ------------------------------------------------------------------ */
/* Fetching                                                            */
/* ------------------------------------------------------------------ */

const fetchBytes = async (target: string): Promise<{ ok: boolean; status: number; contentType: string; buffer: Buffer; finalUrl: string }> => {
  let url = target;
  let lastStatus = 0;
  let lastType = "";
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const safe = assertSafeContentUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(safe.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "Digitalcatalyst-StudyEngine/1.0 (+https://eduvora.shop)" },
      });
    } finally {
      clearTimeout(timer);
    }
    lastStatus = response.status;
    lastType = response.headers.get("content-type") || "";
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) break;
      url = new URL(location, safe).toString();
      // Google's Drive download hop points at googleusercontent.com — still https + public.
      continue;
    }
    if (!response.ok) return { ok: false, status: lastStatus, contentType: lastType, buffer: Buffer.alloc(0), finalUrl: safe.toString() };
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
      return { ok: false, status: 200, contentType: lastType, buffer: Buffer.alloc(0), finalUrl: safe.toString() };
    }
    return { ok: true, status: 200, contentType: lastType, buffer: bytes, finalUrl: safe.toString() };
  }
  return { ok: false, status: lastStatus, contentType: lastType, buffer: Buffer.alloc(0), finalUrl: url };
};

const isGoogleSignInPage = (contentType: string, text: string): boolean => {
  if (/text\/html/i.test(contentType)) return true;
  const head = text.slice(0, 2000).toLowerCase();
  return head.includes("<!doctype html") || head.includes("accounts.google.com") || head.includes("sign in");
};

const isGoogleHost = (finalUrl: string): boolean => {
  try {
    const host = new URL(finalUrl).hostname;
    return GOOGLE_HOST.test(host) || GOOGLE_EXPORT_HOSTS.has(host);
  } catch {
    return false;
  }
};

/**
 * Read one resource. Never throws: every problem becomes an honest outcome so
 * the caller can still ground an answer in whatever else IS readable.
 */
export const extractResourceContent = async (resource: PersonalResourceLike): Promise<ContentExtraction> => {
  const plan = personalAiReadPlan(resource);
  const base = {
    planKind: plan.kind,
    fromCache: false,
    extractedAt: Date.now(),
    contentType: "",
  };
  const fail = (status: PersonalAiOutcomeStatus, reason: string, text = ""): ContentExtraction => ({
    ...base, status, text, chars: text.length, reason,
  });

  if (plan.kind === "none") return fail("unsupported", plan.reason);

  /*
   * in-document: the readable text is already inside the resource document, so
   * there is nothing to fetch, nothing to authorise and nothing to time out.
   * This is what makes a course's own practice sets (and any transcript the
   * owner pasted) instantly grounded instead of "unreadable".
   */
  if (plan.kind === "in-document") {
    const text = cleanAiText(aiPayloadText(resource), PERSONAL_AI_MAX_RESOURCE_CHARS);
    if (text.length < PERSONAL_AI_MIN_READABLE_CHARS) {
      return fail("empty", "This resource has no written content in it yet, so there is nothing for me to read from it.");
    }
    return { ...base, status: "ok", text, chars: text.length, reason: "", contentType: "application/x-payload" };
  }

  try {
    assertSafeContentUrl(plan.url);
  } catch {
    return fail("error", "This link can't be read safely from the server.");
  }

  try {
    const fetched = await fetchBytes(plan.url);

    if (plan.kind === "google-export") {
      if (!fetched.ok) {
        // 401/403/404 from Google's export endpoint = not shared with us.
        if ([401, 403, 404].includes(fetched.status)) {
          return fail("permission", "I can see that this resource exists, but it isn't shared publicly, so I couldn't read its contents.");
        }
        return fail("error", `Google returned ${fetched.status || "an error"} for this file.`);
      }
      const text = stripAiMarkup(fetched.buffer.toString("utf8"), PERSONAL_AI_MAX_RESOURCE_CHARS);
      if (isGoogleSignInPage(fetched.contentType, fetched.buffer.toString("utf8"))) {
        return fail("permission", "This Google file is private — share it (anyone with the link) and I'll be able to read it.");
      }
      if (!text || text.length < PERSONAL_AI_MIN_READABLE_CHARS) return fail("empty", "I opened this Google file but it had no readable text in it.");
      return { ...base, status: "ok", text, chars: text.length, reason: "", contentType: fetched.contentType };
    }

    if (plan.kind === "pdf-bytes") {
      if (!fetched.ok) {
        if ([401, 403, 404].includes(fetched.status)) {
          return fail("permission", "I can see that this PDF exists, but it isn't publicly downloadable, so I couldn't read it.");
        }
        return fail("error", `The PDF host returned ${fetched.status || "an error"}.`);
      }
      if (/text\/html/i.test(fetched.contentType) || fetched.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
        // Drive answers with an HTML interstitial when a file is not public.
        const head = fetched.buffer.subarray(0, 1200).toString("utf8").toLowerCase();
        if (head.includes("sign in") || head.includes("accounts.google.com") || head.includes("<!doctype html")) {
          return fail("permission", "This PDF is private on Google Drive — share it (anyone with the link) and I'll be able to read it.");
        }
        return fail("invalid", "That link didn't return a PDF file, so there was no text for me to read.");
      }
      const parsed = extractPdfText(fetched.buffer);
      if (parsed.encrypted) return fail("permission", "This PDF is password-protected, so I couldn't read its text.");
      if (!parsed.ok) {
        return fail("invalid", "I could open this PDF, but the text inside it isn't selectable (it may be a scan or image-only).");
      }
      const text = cleanAiText(parsed.text, PERSONAL_AI_MAX_RESOURCE_CHARS);
      if (text.length < PERSONAL_AI_MIN_READABLE_CHARS) {
        return fail("empty", "I can see that this PDF exists, but I couldn't read its contents.");
      }
      return { ...base, status: "ok", text, chars: text.length, reason: "", contentType: fetched.contentType || "application/pdf" };
    }

    if (plan.kind === "caption-file") {
      // A WebVTT/SRT transcript the course owner linked. Reading a caption file
      // is not watching the video: it is reading the text the owner published,
      // which is exactly why media lessons become answerable and why nothing
      // here ever touches a player or scrapes a page.
      if (!fetched.ok) {
        if ([401, 403, 404].includes(fetched.status)) {
          return fail("permission", "The transcript file for this lesson isn't publicly readable, so I couldn't open it.");
        }
        return fail("error", `The transcript link returned ${fetched.status || "an error"}.`);
      }
      const parsed = parseCaptionText(fetched.buffer.toString("utf8"));
      if (!parsed.text) return fail("empty", "I opened the transcript file for this lesson but it had no cues in it.");
      const text = cleanAiText(parsed.text, PERSONAL_AI_MAX_RESOURCE_CHARS);
      if (text.length < PERSONAL_AI_MIN_READABLE_CHARS) {
        return fail("empty", "The transcript for this lesson was too short to read anything from.");
      }
      return { ...base, status: "ok", text, chars: text.length, reason: "", contentType: "text/vtt" };
    }

    // plan.kind === "text-file"
    if (!fetched.ok) return fail("error", `That link returned ${fetched.status || "an error"}.`);
    const rawText = fetched.buffer.toString("utf8");
    if (isGoogleSignInPage(fetched.contentType, rawText) && isGoogleHost(fetched.finalUrl)) {
      return fail("permission", "This file is private — share it and I'll be able to read it.");
    }
    const text = /html/i.test(fetched.contentType) || /^\s*</.test(rawText)
      ? stripAiMarkup(rawText, PERSONAL_AI_MAX_RESOURCE_CHARS)
      : cleanAiText(rawText, PERSONAL_AI_MAX_RESOURCE_CHARS);
    if (!text || text.length < PERSONAL_AI_MIN_READABLE_CHARS) return fail("empty", "That file had no readable text in it.");
    return { ...base, status: "ok", text, chars: text.length, reason: "", contentType: fetched.contentType };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "UNSAFE_URL") return fail("error", "This link can't be read safely from the server.");
    const name = (error as Error)?.name;
    if (name === "AbortError") return fail("error", "Reading this resource timed out. Try again in a moment.");
    return fail("error", "I couldn't reach this resource just now.");
  }
};

/* ------------------------------------------------------------------ */
/* Cache (owner-scoped)                                                */
/* ------------------------------------------------------------------ */

const contentRef = (db: Firestore, uid: string, resourceId: string) =>
  db.collection("users").doc(uid).collection("personalAi").doc("content").collection("items").doc(resourceId);

const MAX_STORED_CHARS = PERSONAL_AI_MAX_RESOURCE_CHARS;

interface CachedContent {
  urlHash: string;
  status: PersonalAiOutcomeStatus;
  text: string;
  chars: number;
  reason: string;
  contentType: string;
  planKind: string;
  extractedAt: number;
}

const readCache = async (db: Firestore, uid: string, resourceId: string, urlHash: string, now: number): Promise<ContentExtraction | null> => {
  try {
    const snapshot = await contentRef(db, uid, resourceId).get();
    if (!snapshot.exists) return null;
    const data = (snapshot.data() || {}) as unknown as CachedContent;
    if (String(data.urlHash || "") !== urlHash) return null;
    if (now - Number(data.extractedAt || 0) > CONTENT_CACHE_TTL_MS) return null;
    return {
      status: data.status,
      text: String(data.text || ""),
      chars: Number(data.chars || 0),
      reason: String(data.reason || ""),
      contentType: String(data.contentType || ""),
      planKind: (data.planKind || "none") as PersonalAiReadPlan["kind"],
      fromCache: true,
      extractedAt: Number(data.extractedAt || 0),
    };
  } catch {
    return null;
  }
};

const writeCache = async (db: Firestore, uid: string, resourceId: string, urlHash: string, extraction: ContentExtraction): Promise<void> => {
  // Never cache a transient network/timeout failure — the next open retries.
  if (extraction.status === "error" || extraction.status === "pending") return;
  try {
    await contentRef(db, uid, resourceId).set({
      ownerUid: uid,
      resourceId,
      urlHash,
      status: extraction.status,
      text: extraction.text.slice(0, MAX_STORED_CHARS),
      chars: extraction.chars,
      reason: extraction.reason,
      contentType: extraction.contentType,
      planKind: extraction.planKind,
      extractedAt: extraction.extractedAt,
      updatedAt: Date.now(),
    });
  } catch {
    // Cache is an optimisation only; a failed write must never fail the request.
  }
};

/**
 * Read (or reuse the cached read of) one resource's content.
 *
 * `refresh: true` forces a re-read — used by the UI's explicit "Try reading
 * again" action after a learner fixes a Google sharing permission.
 */
export const readResourceContent = async (
  db: Firestore,
  uid: string,
  resource: PersonalResourceLike,
  options: { refresh?: boolean } = {},
): Promise<ContentExtraction> => {
  const plan = personalAiReadPlan(resource);
  const resourceId = String(resource.id || "");
  if (plan.kind === "none" || !resourceId) {
    return {
      status: "unsupported",
      text: "",
      chars: 0,
      reason: plan.reason,
      contentType: "",
      planKind: plan.kind,
      fromCache: false,
      extractedAt: Date.now(),
    };
  }
  /*
   * A payload read costs nothing to redo and its "source" is the document
   * itself, which can change under us (an admin importing more questions). So
   * it is keyed by the payload's own fingerprint and never served from the
   * cache after a stale write; every network read keeps the 24h cache.
   */
  const isPayload = plan.kind === "in-document";
  const urlHash = isPayload
    ? `payload_${urlFingerprint(aiPayloadText(resource).slice(0, 4000))}`
    : `${urlFingerprint(plan.url)}_${personalAiHash(plan.kind)}`;
  const now = Date.now();
  if (!options.refresh && !isPayload) {
    const cached = await readCache(db, uid, resourceId, urlHash, now);
    if (cached) return cached;
  }
  const extraction = await extractResourceContent(resource);
  await writeCache(db, uid, resourceId, urlHash, extraction);
  return extraction;
};
