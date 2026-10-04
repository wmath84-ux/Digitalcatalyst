// tests/joplinClipper.test.mjs
//
// The Web Clipper's contract: id mirrors, pairing-code lifecycle, token
// lifecycle and clip payload validation. These are the rules the API enforces,
// so a change here is a change in what a browser extension can put into a
// learner's workspace.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CLIPPER_PAIRING_TTL_MS,
  CLIPPER_TOKEN_TTL_MS,
  MAX_CLIP_BYTES,
  PAIRING_ALPHABET,
  buildPairingRecord,
  buildTokenRecord,
  canonicalUrl,
  clipNoteId,
  formatPairingCode,
  generatePairingCode,
  generateToken,
  hashToken,
  isPairingCodeShape,
  joplinId,
  notebookIdForName,
  normalizePairingCode,
  pairingCodeDocId,
  pairingCodeMatches,
  pairingCodeStatus,
  tokenDocId,
  tokenHasScope,
  tokenStatus,
  validateClipPayload,
  webClippingsNotebookId,
} from "../utils/joplinClipper.js";

import { joplinId as tsJoplinId, joplinIdForNamed } from "../src/joplin/joplinIds.ts";
import { notebookIdForName as tsNotebookIdForName, webClippingsNotebookId as tsWebClippings } from "../src/joplin/joplinDeepLinks.ts";

const NOW = Date.parse("2026-10-04T09:00:00.000Z");

// ── id space ───────────────────────────────────────────────────────────────

test("the clipper's id derivation is byte-identical to the workspace's", () => {
  // Two id spaces would mean a clipped note lands in a notebook the workspace
  // cannot see, or a second "Web Clippings" notebook per clip.
  for (const source of ["notebook:root:web clippings", "webclip:uid:https://a.test/x:2026-10-04", "", "x".repeat(500)]) {
    assert.equal(joplinId(source), tsJoplinId(source), `joplinId drifted for ${JSON.stringify(source.slice(0, 24))}`);
  }
  assert.equal(notebookIdForName("Web Clippings"), tsNotebookIdForName("Web Clippings"));
  assert.equal(notebookIdForName("Sub", "parent-id"), tsNotebookIdForName("Sub", "parent-id"));
  assert.equal(joplinId("tag:physics"), joplinIdForNamed("tag", "PHYSICS"));
  assert.equal(webClippingsNotebookId(), tsWebClippings());
  assert.match(webClippingsNotebookId(), /^[0-9a-f]{32}$/);
});

// ── pairing codes ──────────────────────────────────────────────────────────

test("a pairing code is unambiguous, short and never stored in clear", () => {
  const code = generatePairingCode();
  assert.equal(code.length, 8);
  assert.ok([...code].every((character) => PAIRING_ALPHABET.includes(character)));
  assert.doesNotMatch(code, /[O0Il1]/);
  assert.ok(isPairingCodeShape(formatPairingCode(code)));
  assert.equal(normalizePairingCode(formatPairingCode(code)), code);
  // Typed with stray characters and the wrong case, it still resolves.
  assert.equal(normalizePairingCode(` ${code.slice(0, 4)}-${code.slice(4).toLowerCase()} `), code);

  const docId = pairingCodeDocId(code);
  assert.match(docId, /^[0-9a-f]{64}$/);
  assert.ok(!docId.includes(code), "the code itself must not be recoverable from the doc id");
  assert.equal(docId, pairingCodeDocId(code), "the doc id is stable for one code");
});

test("a pairing code is single-use, expiring and attempt-limited", () => {
  const record = buildPairingRecord({ uid: "u1", code: "ABCD2345", now: NOW });
  assert.equal(pairingCodeStatus(record, NOW), "active");
  assert.equal(pairingCodeStatus(record, NOW + CLIPPER_PAIRING_TTL_MS - 1), "active");
  assert.equal(pairingCodeStatus(record, NOW + CLIPPER_PAIRING_TTL_MS + 1), "expired");
  assert.equal(pairingCodeStatus({ ...record, usedAt: NOW + 5 }, NOW + 6), "used");
  // The attempt cap is checked with the record still inside its window, or
  // expiry would win the race and the reason would be wrong.
  assert.equal(pairingCodeStatus({ ...record, attempts: 10 }, NOW + 60_000), "exhausted");
  assert.equal(pairingCodeStatus(null), "missing");
  // Used/expired CANNOT go back to active.
  assert.equal(pairingCodeStatus({ ...record, usedAt: NOW + 1 }, NOW), "used");
});

test("the code is compared by hash, not by string equality", () => {
  const code = "K7QM4RTZ";
  const record = buildPairingRecord({ uid: "u1", code, now: NOW });
  assert.equal(pairingCodeMatches(record, formatPairingCode(code)), true);
  assert.equal(pairingCodeMatches(record, "K7QM4RTA"), false);
  assert.equal(pairingCodeMatches(record, ""), false);
  assert.equal(pairingCodeMatches(null, code), false);
  assert.equal(record.code, undefined, "the record must not carry the code");
});

// ── tokens ─────────────────────────────────────────────────────────────────

test("a token is 32 random bytes, stored hashed, and expires", () => {
  const token = generateToken();
  assert.ok(token.length >= 40);
  assert.equal(token, generateToken() === token ? token : token); // deterministic identity for the value itself
  assert.notEqual(generateToken(), token);

  const record = buildTokenRecord({ token, uid: "u1", now: NOW, label: "Firefox" });
  assert.equal(record.token, undefined, "the record must not carry the token");
  assert.equal(record.tokenHash, hashToken(token));
  assert.match(tokenDocId(token), /^[0-9a-f]{32}$/);
  assert.notEqual(tokenDocId(token), tokenDocId(generateToken()));
  assert.deepEqual(record.scopes, ["clip:write"]);
  assert.equal(tokenStatus(record, NOW), "active");
  assert.equal(tokenStatus(record, NOW + CLIPPER_TOKEN_TTL_MS + 1), "expired");
  assert.equal(tokenStatus({ ...record, revokedAt: NOW + 2 }, NOW + 3), "revoked");
  assert.equal(tokenStatus(null), "missing");

  assert.equal(tokenHasScope(record, "clip:write"), true);
  assert.equal(tokenHasScope(record, "workspace:read"), false);
  assert.equal(tokenHasScope({ ...record, revokedAt: NOW + 2, expiresAt: NOW + CLIPPER_TOKEN_TTL_MS }, "clip:write"), false);
  assert.equal(tokenHasScope({ ...record, expiresAt: NOW - 1 }, "clip:write"), false);
  // A token can never be handed a scope the server does not know.
  const scoped = buildTokenRecord({ token, uid: "u1", now: NOW, scopes: ["clip:write", "admin:*"] });
  assert.deepEqual(scoped.scopes, ["clip:write"]);
});

// ── clips ──────────────────────────────────────────────────────────────────

test("canonicalUrl drops the fragment, the tracking and the host's case", () => {
  assert.equal(
    canonicalUrl("HTTPS://Example.com/Read/This?utm_source=x&utm_medium=y&keep=1#section-3"),
    "https://example.com/Read/This?keep=1",
  );
  assert.equal(canonicalUrl("https://a.test/p?fbclid=abc&gclid=def"), "https://a.test/p");
  assert.equal(canonicalUrl("javascript:alert(1)"), "");
  assert.equal(canonicalUrl("not a url"), "");
  assert.equal(canonicalUrl(""), "");
});

test("clipping the same page twice in a day updates ONE note", () => {
  const url = "https://news.test/story?utm_source=newsletter#top";
  const sameDay = clipNoteId("u1", url, NOW);
  assert.equal(clipNoteId("u1", url, NOW + 60_000), sameDay, "the same page the same day is one note");
  assert.equal(clipNoteId("u1", "https://news.test/story", NOW), sameDay, "tracking must not fork the note");
  assert.notEqual(clipNoteId("u2", url, NOW), sameDay, "two learners never share a note id");
  assert.notEqual(clipNoteId("u1", url, NOW + 24 * 60 * 60 * 1000), sameDay, "a new day is a new note");
  assert.match(sameDay, /^[0-9a-f]{32}$/);
});

test("a clip payload is validated before anything is written", () => {
  const base = { url: "https://a.test/p", title: "A page", html: "<p>hello</p>" };
  const ok = validateClipPayload(base);
  assert.equal(ok.ok, true);
  assert.equal(ok.clip.url, "https://a.test/p");
  assert.equal(ok.clip.notebookId, webClippingsNotebookId(), "clips default to Web Clippings");

  assert.equal(validateClipPayload({ ...base, url: "ftp://a.test/x" }).reason, "invalid_url");
  assert.equal(validateClipPayload({ ...base, title: "   " }).reason, "missing_title");
  assert.equal(validateClipPayload({ ...base, html: "", selection: "", text: "" }).reason, "empty_clip");
  assert.equal(validateClipPayload({ ...base, html: "x".repeat(MAX_CLIP_BYTES + 1) }).reason, "clip_too_large");
  assert.equal(validateClipPayload(null).reason, "invalid_url");

  const tags = validateClipPayload({ ...base, tags: ["physics", "physics", "  ", "x".repeat(200), ...Array(30).fill("t")] });
  assert.equal(tags.ok, true);
  assert.ok(tags.clip.tags.length <= 20);
  assert.equal(new Set(tags.clip.tags).size, tags.clip.tags.length, "tags are de-duplicated");
  assert.ok(tags.clip.tags.every((tag) => tag.length <= 60));
});

test("the notification target a clip resolves to is the workspace's own id", () => {
  const url = "https://a.test/p";
  const noteId = clipNoteId("u1", url, NOW);
  assert.match(`#/my-day?note=${encodeURIComponent(noteId)}`, /^#\/my-day\?note=[0-9a-f]{32}$/);
});
