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
//   · text-file → plain text / markdown / csv / code / html links fetched and stripped.
//   · image-link → the URL is verified to serve a real image; the bytes are
//     read VISUALLY by the model at ask time (never turned into text here).
//   · download → fetch the bytes, then dispatch on what they actually are: an
//     Office upload (docx/xlsx/pptx from its own bytes), a PDF served without
//     its extension, plain text/code, or a public article page whose main text
//     is stripped of chrome and quality-gated before it may ground anything.
//
// Everything else (media without a transcript, Forms) has no read path, and the
// reason shown comes from the same registry row, so there is no second honesty
// list to drift out of date.
//
// Extraction results are cached per owner + resource under
// `users/{uid}/personalAi/content/{resourceId}` keyed by a hash of the URL,
// so a module summary and ten follow-up questions never re-download a PDF.

import { createHash } from "node:crypto";
import { inflateRawSync, inflateSync } from "node:zlib";
import type { Firestore } from "firebase-admin/firestore";
import { extractRawText as mammothRawText } from "mammoth";
import * as XLSX from "xlsx";
import * as JSZip from "jszip";
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
/* Office uploads (docx / xlsx / pptx — read from the file's own bytes) */
/* ------------------------------------------------------------------ */

type OfficeKind = "docx" | "xlsx" | "pptx";

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const startsWithBytes = (buffer: Buffer, magic: Buffer): boolean =>
  buffer.byteLength >= magic.byteLength && buffer.subarray(0, magic.byteLength).equals(magic);

/** Which Office family a zip is, from its own `[Content_Types].xml` — never the filename. */
const detectOfficeKind = async (buffer: Buffer): Promise<OfficeKind | null> => {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const entry = zip.file("[Content_Types].xml");
    if (!entry) return null;
    const xml = await entry.async("string");
    if (xml.includes("wordprocessingml")) return "docx";
    if (xml.includes("spreadsheetml")) return "xlsx";
    if (xml.includes("presentationml")) return "pptx";
    return null;
  } catch {
    return null;
  }
};

const extractDocxText = async (buffer: Buffer): Promise<string> => {
  const result = await mammothRawText({ buffer });
  return String(result?.value || "");
};

const extractXlsxText = (buffer: Buffer): string => {
  const workbook = XLSX.read(buffer, { type: "buffer", sheetRows: 200 });
  const out: string[] = [];
  for (const name of workbook.SheetNames.slice(0, 8)) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
    const lines = rows
      .slice(0, 150)
      .map((row) => (Array.isArray(row) ? row : [row]).slice(0, 20).map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" | "))
      .filter(Boolean);
    if (lines.length) out.push(`Sheet: ${name}\n${lines.join("\n")}`);
    if (out.join("\n").length > PERSONAL_AI_MAX_RESOURCE_CHARS) break;
  }
  return out.join("\n\n");
};

const extractPptxText = async (buffer: Buffer): Promise<string> => {
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files)
    .map((path) => ({ path, match: /^ppt\/slides\/slide(\d+)\.xml$/.exec(path) }))
    .filter((row): row is { path: string; match: RegExpExecArray } => Boolean(row.match))
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
    .slice(0, 60);
  const out: string[] = [];
  for (const slide of slides) {
    const file = zip.file(slide.path);
    if (!file) continue;
    const xml = await file.async("string");
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) => String(match[1]).replace(/\s+/g, " ").trim()).filter(Boolean);
    if (runs.length) out.push(`Slide ${slide.match[1]}:\n${runs.join(" ")}`);
    if (out.join("\n").length > PERSONAL_AI_MAX_RESOURCE_CHARS) break;
  }
  return out.join("\n\n");
};

/* ------------------------------------------------------------------ */
/* Article pages (public text, never chrome)                            */
/* ------------------------------------------------------------------ */

/** Strip page chrome (nav/header/footer/forms/buttons) BEFORE tag-stripping, so menus never read as content. */
const stripWebPage = (html: string, max = 0): string => {
  const dechromed = String(html || "").replace(
    /<\s*(nav|header|footer|aside|form|noscript|select|menu|dialog|button)([\s>])[\s\S]*?<\s*\/\s*\1\s*>/gi,
    " ",
  );
  return stripAiMarkup(dechromed, max);
};

/**
 * True when stripped page text reads like an ARTICLE, not chrome. Menus and
 * version strings pass a bare word-likeness gate ("Home About v1.0 Sign Up"),
 * so article text must additionally contain real sentences — two or more runs
 * of six-plus words ending in sentence punctuation. A page that fails is
 * reported as unreadable (screenshot path) rather than grounded in garbage.
 */
export const looksLikeArticleText = (text: string): boolean => {
  if (!looksLikeReadableText(text)) return false;
  const sentences = String(text || "").split(/[.!?]+/).filter((part) => part.trim().split(/\s+/).filter(Boolean).length >= 6);
  return sentences.length >= 2;
};

/* ------------------------------------------------------------------ */
/* Image bytes (vision reads these at ask time)                         */
/* ------------------------------------------------------------------ */

const IMAGE_MAGICS: { mime: string; magic: Buffer }[] = [
  { mime: "image/jpeg", magic: Buffer.from([0xff, 0xd8, 0xff]) },
  { mime: "image/png", magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: "image/webp", magic: Buffer.from("RIFF") },
  { mime: "image/gif", magic: Buffer.from("GIF8") },
];

/** MIME type from magic bytes alone — the content-type header is never trusted for this. */
export const imageMimeFromBytes = (buffer: Buffer): string => {
  if (!buffer || buffer.byteLength < 12) return "";
  for (const candidate of IMAGE_MAGICS) {
    if (!startsWithBytes(buffer, candidate.magic)) continue;
    if (candidate.mime === "image/webp" && buffer.subarray(8, 12).toString("latin1") !== "WEBP") continue;
    return candidate.mime;
  }
  return "";
};

const isPdfBytes = (buffer: Buffer): boolean => buffer.byteLength > 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-";

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

export interface FetchedImage {
  ok: boolean;
  mimeType: string;
  base64: string;
  bytes: number;
  reason: string;
}

/**
 * Fetch one image's bytes for ask-time vision. The SAME guardrails as every
 * other read apply (https-only, SSRF guard, timeout, size cap), and the bytes
 * must start with a raster magic — an HTML error page is never sent to the
 * model as an "image".
 */
export const fetchImageBytes = async (target: string, maxBytes = 1_500_000): Promise<FetchedImage> => {
  const fail = (reason: string): FetchedImage => ({ ok: false, mimeType: "", base64: "", bytes: 0, reason });
  try {
    assertSafeContentUrl(target);
  } catch {
    return fail("This image link can't be opened safely from the server.");
  }
  try {
    const fetched = await fetchBytes(target);
    if (!fetched.ok) {
      if ([401, 403, 404].includes(fetched.status)) return fail("This image isn't publicly readable.");
      return fail("This image couldn't be downloaded just now.");
    }
    const mimeType = imageMimeFromBytes(fetched.buffer);
    if (!mimeType) return fail("That link didn't return an image file.");
    if (fetched.buffer.byteLength > maxBytes) return fail("This image is too large to send to the AI.");
    return { ok: true, mimeType, base64: fetched.buffer.toString("base64"), bytes: fetched.buffer.byteLength, reason: "" };
  } catch {
    return fail("This image couldn't be downloaded just now.");
  }
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

    // Shared with the `download` dispatch: a PDF served without its extension
    // (an upload behind a storage URL) reads exactly like a labelled one.
    const handlePdfBytes = (): ContentExtraction => {
      if (!fetched.ok) {
        if ([401, 403, 404].includes(fetched.status)) {
          return fail("permission", "I can see that this PDF exists, but it isn't publicly downloadable, so I couldn't read it.");
        }
        return fail("error", `The PDF host returned ${fetched.status || "an error"}.`);
      }
      if (/text\/html/i.test(fetched.contentType) || !isPdfBytes(fetched.buffer)) {
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
    };

    if (plan.kind === "pdf-bytes") return handlePdfBytes();

    if (plan.kind === "image-link") {
      // Verification only: the bytes are read VISUALLY by the model at ask
      // time, so nothing is turned into text here — but a dead link, a
      // private file or an HTML page must still report honestly instead of
      // pretending an image was seen.
      if (!fetched.ok) {
        if ([401, 403, 404].includes(fetched.status)) {
          return fail("permission", "I can see that this image exists, but it isn't publicly readable, so I couldn't open it.");
        }
        return fail("error", `The image host returned ${fetched.status || "an error"}.`);
      }
      const imageMime = imageMimeFromBytes(fetched.buffer);
      if (!imageMime) {
        const head = fetched.buffer.subarray(0, 1200).toString("utf8").toLowerCase();
        if (head.includes("sign in") || head.includes("accounts.google.com") || head.includes("<!doctype html")) {
          return fail("permission", "This image is private — share it (anyone with the link) and I'll be able to see it.");
        }
        return fail("invalid", "That link didn't return an image file, so there was nothing for me to look at.");
      }
      return { ...base, status: "visual", text: "", chars: 0, reason: "", contentType: imageMime };
    }

    if (plan.kind === "download") {
      // One honest attempt at an Office upload, an extensionless PDF/image, a
      // code file, or a public article page. Magic bytes and content-type
      // decide — the label never does.
      if (!fetched.ok) {
        if ([401, 403, 404].includes(fetched.status)) {
          return fail("permission", "I can see that this resource exists, but it isn't publicly readable, so I couldn't open it.");
        }
        return fail("error", `That link returned ${fetched.status || "an error"}.`);
      }
      const contentType = fetched.contentType || "";
      if (/pdf/i.test(contentType) || isPdfBytes(fetched.buffer)) return handlePdfBytes();
      const sniffedImage = imageMimeFromBytes(fetched.buffer);
      if (sniffedImage) {
        return { ...base, status: "visual", text: "", chars: 0, reason: "", contentType: sniffedImage };
      }
      if (startsWithBytes(fetched.buffer, ZIP_MAGIC)) {
        const officeKind = await detectOfficeKind(fetched.buffer);
        if (!officeKind) {
          return fail("invalid", "That file is a compressed archive the study engine doesn't read — a document, sheet or slide file works.");
        }
        try {
          const raw = officeKind === "docx"
            ? await extractDocxText(fetched.buffer)
            : officeKind === "xlsx"
              ? extractXlsxText(fetched.buffer)
              : await extractPptxText(fetched.buffer);
          const text = cleanAiText(raw, PERSONAL_AI_MAX_RESOURCE_CHARS);
          if (text.length < PERSONAL_AI_MIN_READABLE_CHARS) {
            return fail("empty", "I opened this file but it had no readable text in it.");
          }
          return { ...base, status: "ok", text, chars: text.length, reason: "", contentType: "application/x-office" };
        } catch {
          return fail("invalid", "That Office file couldn't be opened — it may be corrupted or password-protected.");
        }
      }
      if (startsWithBytes(fetched.buffer, OLE_MAGIC)) {
        return fail("invalid", "This is a legacy .doc file, which has no read path — re-save it as .docx and I'll read it in full.");
      }
      const sniffedHead = fetched.buffer.subarray(0, 200).toString("utf8");
      if (/html/i.test(contentType) || /^\s*</.test(sniffedHead)) {
        if (isGoogleSignInPage(contentType, fetched.buffer.subarray(0, 2000).toString("utf8")) && isGoogleHost(fetched.finalUrl)) {
          return fail("permission", "This file is private — share it and I'll be able to read it.");
        }
        const text = stripWebPage(fetched.buffer.toString("utf8"), PERSONAL_AI_MAX_RESOURCE_CHARS);
        if (!text || !looksLikeArticleText(text)) {
          return fail("empty", "That page has no readable article text in it (interactive apps and login-walled pages can't be read) — a screenshot of the part you mean works.");
        }
        return { ...base, status: "ok", text, chars: text.length, reason: "", contentType: fetched.contentType };
      }
      if (/text\/|json|xml|csv|javascript|ecmascript|markdown|plain/i.test(contentType) || !contentType || /octet-stream/i.test(contentType)) {
        const rawText = fetched.buffer.toString("utf8");
        if (!looksLikeReadableText(rawText)) {
          return fail("invalid", "That file is binary, so there is no text for me to read from it.");
        }
        const text = cleanAiText(rawText, PERSONAL_AI_MAX_RESOURCE_CHARS);
        if (text.length < PERSONAL_AI_MIN_READABLE_CHARS) return fail("empty", "That file had no readable text in it.");
        return { ...base, status: "ok", text, chars: text.length, reason: "", contentType: fetched.contentType };
      }
      if (/audio|video/i.test(contentType)) {
        return fail("unsupported", "A media file needs a linked transcript before I can read it — otherwise a screenshot of the part you mean works.");
      }
      return fail("unsupported", "This kind of file has no reading path in the app yet, so only its title can be used.");
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
