// utils/joplinClipper.js
//
// Pure logic for the My Day Web Clipper: pairing codes, scoped tokens and clip
// payload validation. No Firebase, no DOM, no dependencies — so the SAME rules
// the server enforces can be driven by `node --test` (tests/joplinClipper.test.mjs)
// and, where it matters, by the extension.
//
// Threat model, and what each piece is for:
//
//   · THE PAIRING CODE is the only thing a user ever types. It is short, it is
//     single-use, it expires in 10 minutes, and only its SHA-256 is stored, so a
//     leaked database row cannot be replayed into a token.
//   · THE TOKEN is what the extension holds. It is 32 random bytes, stored
//     server-side as a SHA-256 hash, scoped (`clip:write`), revocable, rotatable,
//     and expiring. It is NOT a Firebase refresh token and cannot be exchanged
//     for one: the clip endpoint is the only thing it opens.
//   · THE CLIP PAYLOAD is validated here before anything is written: a size cap,
//     an http(s) source URL, bounded title/tags, and a deterministic id so
//     clipping the same page twice in a day UPDATES one note instead of
//     duplicating it.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** A pairing code lives this long — long enough to copy, short enough to leak. */
export const CLIPPER_PAIRING_TTL_MS = 10 * 60_000;
/** A token is valid for 90 days, then the extension must pair again. */
export const CLIPPER_TOKEN_TTL_MS = 90 * 24 * 60 * 60_000;
/** Scopes a token can hold. `clip:write` is the only one the popup needs. */
export const CLIPPER_SCOPES = ["clip:write"];
/** One clip may carry at most this much HTML/selection text (~2 MB). */
export const MAX_CLIP_BYTES = 2 * 1024 * 1024;
export const MAX_CLIP_TITLE = 500;
export const MAX_CLIP_TAGS = 20;
export const MAX_CLIP_TAG_CHARS = 60;
/** Codes are 8 characters from an unambiguous alphabet, typed as XXXX-XXXX. */
export const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIRING_LENGTH = 8;
/** Wrong guesses against one code before it dies. */
export const MAX_PAIRING_ATTEMPTS = 10;

export const WEB_CLIPPINGS_NOTEBOOK = "Web Clippings";
export const WORKSPACE_ROOT_NOTEBOOK = "My Day";

const FNV_OFFSET_BASIS = 0x811c9dc5;

/** One FNV-1a pass, mirroring `src/joplin/joplinIds.ts` bit for bit. */
function fnv1a(input, seed) {
  let hash = (FNV_OFFSET_BASIS ^ seed) >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

const hex8 = (value) => (value >>> 0).toString(16).padStart(8, "0");

/**
 * A Joplin-shaped id (32 lowercase hex) for a stable source string.
 *
 * The clipper derives ids itself so clipping is idempotent — and this mirror is
 * asserted against `src/joplin/joplinIds.ts` in the tests, so the two can never
 * drift into two different id spaces.
 */
export function joplinId(source) {
  const text = String(source ?? "");
  return [
    hex8(fnv1a(text, 0)),
    hex8(fnv1a(text, 0x9e3779b1)),
    hex8(fnv1a(text, 0x85ebca77)),
    hex8(fnv1a(text, 0xc2b2ae3d)),
  ].join("");
}

/** The notebook a named notebook resolves to (same rule as the migration). */
export function notebookIdForName(name, parentId = "") {
  const key = String(name ?? "").trim().toLowerCase();
  return joplinId(parentId ? `notebook:${parentId}:${key}` : `notebook:root:${key}`);
}

export const workspaceRootNotebookId = () => notebookIdForName(WORKSPACE_ROOT_NOTEBOOK);
/**
 * Clips land in the workspace's own "Web Clippings" notebook by default.
 *
 * It is NESTED under the workspace root ("My Day") — the same rule the
 * migration uses for every section notebook — so a clip never appears in a
 * second, root-level "Web Clippings" next to the migrated one.
 */
export const webClippingsNotebookId = () =>
  notebookIdForName(WEB_CLIPPINGS_NOTEBOOK, workspaceRootNotebookId());

const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");

/** `ABCD-EFGH` → `ABCDEFGH`; anything outside the alphabet is dropped. */
export function normalizePairingCode(code) {
  return String(code ?? "")
    .toUpperCase()
    .split("")
    .filter((character) => PAIRING_ALPHABET.includes(character))
    .join("")
    .slice(0, PAIRING_LENGTH);
}

export function isPairingCodeShape(code) {
  const normalized = normalizePairingCode(code);
  return normalized.length === PAIRING_LENGTH && normalized.split("").every((c) => PAIRING_ALPHABET.includes(c));
}

/** Display form for the code the app shows the learner. */
export function formatPairingCode(code) {
  const normalized = normalizePairingCode(code);
  return normalized.length === PAIRING_LENGTH ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized;
}

/** A fresh code — crypto-strong, from the unambiguous alphabet. */
export function generatePairingCode(random = (size) => randomBytes(size)) {
  const bytes = random(PAIRING_LENGTH);
  let code = "";
  for (let index = 0; index < PAIRING_LENGTH; index += 1) {
    code += PAIRING_ALPHABET[bytes[index] % PAIRING_ALPHABET.length];
  }
  return code;
}

/**
 * Firestore document id for a pairing code.
 *
 * The code itself is NEVER stored (a database read cannot mint a token) — the
 * doc id is its hash, so a claim only has to hash what the user typed.
 */
export const pairingCodeDocId = (code) => sha256(`joplin-clipper-pairing:${normalizePairingCode(code)}`);

export function buildPairingRecord({ uid, code, now = Date.now(), label = "" }) {
  return {
    uid,
    codeHash: sha256(normalizePairingCode(code)),
    label: String(label ?? "").slice(0, 60),
    createdAt: now,
    expiresAt: now + CLIPPER_PAIRING_TTL_MS,
    usedAt: 0,
    attempts: 0,
  };
}

/** `active` | `used` | `expired` | `missing` | `exhausted`. */
export function pairingCodeStatus(record, now = Date.now()) {
  if (!record) return "missing";
  if (Number(record.usedAt) > 0) return "used";
  if (Number(record.expiresAt) <= now) return "expired";
  if (Number(record.attempts) >= MAX_PAIRING_ATTEMPTS) return "exhausted";
  return "active";
}

/** Constant-time comparison for the stored code hash. */
export function pairingCodeMatches(record, code) {
  if (!record || typeof record.codeHash === "string" === false) return false;
  const candidate = Buffer.from(sha256(normalizePairingCode(code)), "utf8");
  const stored = Buffer.from(String(record.codeHash), "utf8");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

/** A 32-byte, URL-safe token. Never logged, never stored in clear. */
export function generateToken(random = (size) => randomBytes(size)) {
  return Buffer.from(random(32)).toString("base64url");
}

export const hashToken = (token) => sha256(`joplin-clipper-token:${String(token ?? "")}`);
/** The token's document id is its hash prefix — lookup never scans tokens. */
export const tokenDocId = (token) => hashToken(token).slice(0, 32);

export function buildTokenRecord({ token, uid, now = Date.now(), label = "", scopes = ["clip:write"] }) {
  return {
    uid,
    tokenHash: hashToken(token),
    scopes: scopes.filter((scope) => CLIPPER_SCOPES.includes(scope)),
    label: String(label ?? "").slice(0, 60),
    createdAt: now,
    expiresAt: now + CLIPPER_TOKEN_TTL_MS,
    lastUsedAt: 0,
    rotatedAt: 0,
    revokedAt: 0,
  };
}

/** `active` | `expired` | `revoked` | `missing`. */
export function tokenStatus(record, now = Date.now()) {
  if (!record) return "missing";
  if (Number(record.revokedAt) > 0) return "revoked";
  if (Number(record.expiresAt) <= now) return "expired";
  return "active";
}

export const tokenHasScope = (record, scope) =>
  tokenStatus(record) === "active" && Array.isArray(record.scopes) && record.scopes.includes(scope);

/**
 * Strip the parts of a URL that make the SAME page look like a new page:
 * the fragment, the scheme's case, the default port and the tracking
 * parameters a "share" button adds.
 */
export function canonicalUrl(url) {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_.*|fbclid|gclid|mc_.*|ref|igshid|si)$/i.test(key)) parsed.searchParams.delete(key);
  }
  parsed.host = parsed.host.toLowerCase();
  const search = parsed.searchParams.toString();
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${search ? `?${search}` : ""}`;
}

export function clipDayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Clipping the same page twice in one day updates ONE note.
 *
 * The id is derived from the owner, the canonical URL and the day, so the
 * second clip of a page the learner has already saved is an edit (the note
 * grows a new section) rather than a duplicate row (§ one canonical store).
 */
export const clipNoteId = (uid, url, now = Date.now()) =>
  joplinId(`webclip:${String(uid ?? "")}:${canonicalUrl(url)}:${clipDayKey(now)}`);

export const clipDeepLink = (noteId) => `#/my-day?note=${encodeURIComponent(String(noteId ?? ""))}`;

/** Does the clip carry anything worth saving? */
export function validateClipPayload(payload) {
  const clip = payload && typeof payload === "object" ? payload : {};
  const url = canonicalUrl(clip.url);
  if (!url) return { ok: false, reason: "invalid_url" };
  const title = String(clip.title ?? "").trim().slice(0, MAX_CLIP_TITLE);
  if (!title) return { ok: false, reason: "missing_title" };
  const html = String(clip.html ?? "");
  const selection = String(clip.selection ?? "");
  const text = String(clip.text ?? "");
  const bytes = Buffer.byteLength(`${html}${selection}${text}`, "utf8");
  if (bytes > MAX_CLIP_BYTES) return { ok: false, reason: "clip_too_large", bytes };
  if (!html.trim() && !selection.trim() && !text.trim()) return { ok: false, reason: "empty_clip" };
  const tags = Array.isArray(clip.tags)
    ? [...new Set(clip.tags.map((tag) => String(tag ?? "").trim().slice(0, MAX_CLIP_TAG_CHARS)).filter(Boolean))].slice(0, MAX_CLIP_TAGS)
    : [];
  return {
    ok: true,
    clip: {
      url,
      title,
      html,
      selection,
      text,
      tags,
      notebookId: String(clip.notebookId ?? "").trim() || webClippingsNotebookId(),
      clippedAt: Number(clip.clippedAt) || Date.now(),
    },
    bytes,
  };
}
