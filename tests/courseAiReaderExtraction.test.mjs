// tests/courseAiReaderExtraction.test.mjs
//
// Runs the REAL server extractor (api/_lib/personalAiContent.ts) against a fake
// network, one file type at a time.
//
// The reader-registry tests assert what was DECIDED; these assert what is
// actually READ, because the reported bug was a decision/pipeline mismatch: the
// table said a PDF was unreadable while the extractor could read it, and nothing
// ever verified the two agreed for a real file. A green pattern-match suite plus
// a broken fetch is exactly how "I can't read this module" survives a release.
//
// Compiled with esbuild the same way tests/revisionAiDailyTokenBudgetRuntime does
// (the module imports nothing from Firebase at runtime — only types), then driven
// with a stubbed global fetch so no test in this repo reaches the network.
//
// Run: node --test tests/courseAiReaderExtraction.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "node_modules/.tmp-ai-reader-extraction");
const OUT = path.join(OUT_DIR, "personalAiContent.mjs");

let extract = null;
let loadError = null;
try {
  const esbuildPkg = path.join(ROOT, "node_modules/esbuild");
  if (!fs.existsSync(esbuildPkg)) throw new Error("esbuild is not installed — run pnpm install");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { build } = await import(pathToFileURL(path.join(esbuildPkg, "lib/main.js")).href);
  await build({
    entryPoints: [path.join(ROOT, "api/_lib/personalAiContent.ts")],
    outfile: OUT,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"test"' },
  });
  extract = await import(pathToFileURL(OUT).href);
} catch (error) {
  loadError = error;
}

/** Serve `routes` (substring → response) and record every url asked for. */
function mockFetch(routes) {
  const asked = [];
  globalThis.fetch = async (rawUrl) => {
    const url = String(rawUrl);
    asked.push(url);
    for (const [needle, value] of Object.entries(routes)) {
      if (!url.includes(needle)) continue;
      if (value instanceof Error) throw value;
      const { status = 200, contentType = "text/plain; charset=utf-8", body = "" } = value ?? {};
      return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? contentType : null) },
        arrayBuffer: async () => Uint8Array.from(Buffer.from(body, typeof body === "string" ? "utf8" : "latin1")).buffer,
      };
    }
    return {
      status: 404,
      ok: false,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
  return asked;
}

/** A tiny but real uncompressed PDF whose text passes the prose quality gate. */
const tinyPdf = (sentence, repeat) => {
  const lines = Array.from({ length: repeat }, (_, index) =>
    `BT /F1 12 Tf 20 ${720 - index * 20} Td (${sentence} line ${index + 1} of the worked example.) Tj ET`).join("\n");
  const stream = `${lines}\n`;
  return [
    "%PDF-1.4",
    "1 0 obj",
    `<< /Length ${stream.length} >>`,
    "stream",
    stream,
    "endstream",
    "endobj",
    "trailer",
    "%%EOF",
  ].join("\n");
};

const VTT = `WEBVTT

00:00.000 --> 00:12.000
Today we finish electromagnetic induction.

00:12.000 --> 00:26.000
Flux equals B times A times cosine theta.
`;

const skip = { skip: Boolean(loadError) || !extract };

test("a public PDF is read out of its own bytes, not from a viewer", skip, async () => {
  const asked = mockFetch({
    "notes.pdf": { contentType: "application/pdf", body: tinyPdf("Magnetic flux changes three ways", 4) },
  });
  const result = await extract.extractResourceContent({
    id: "res-pdf", name: "Chapter 4 notes", type: "pdf", url: "https://files.example.test/notes.pdf",
  });
  assert.equal(result.status, "ok", result.reason);
  assert.equal(result.planKind, "pdf-bytes");
  assert.match(result.text, /Magnetic flux changes three ways line 1 of the worked example/);
  assert.deepEqual(asked, ["https://files.example.test/notes.pdf"]);
});

test("a private PDF reports a sharing problem, not an unreadable type", skip, async () => {
  mockFetch({ "private.pdf": { status: 403, body: "" } });
  const blocked = await extract.extractResourceContent({
    id: "res-private", type: "pdf", url: "https://files.example.test/private.pdf",
  });
  assert.equal(blocked.status, "permission");
  assert.match(blocked.reason, /isn't publicly downloadable/i);
  assert.doesNotMatch(blocked.reason, /not supported|unsupported/i, "never blame the pipeline for the file's sharing settings");

  // Drive answers a private file with an HTML interstitial, which is the shape
  // most learners actually hit.
  mockFetch({ "uc?export=download": { contentType: "text/html", body: "<html><head><title>Sign in - Google Accounts</title></head></html>" } });
  const interstitial = await extract.extractResourceContent({
    id: "res-drive", type: "pdf", url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view",
  });
  assert.equal(interstitial.status, "permission");
  assert.match(interstitial.reason, /private on Google Drive/i);
});

test("a scanned or image-only PDF says so instead of returning garbage", skip, async () => {
  mockFetch({ "scan.pdf": { contentType: "application/pdf", body: "%PDF-1.4\n1 0 obj\n<< /Length 20 >>\nstream\n/JBIG2Decode noop\nendstream\nendobj\n%%EOF" } });
  const scanned = await extract.extractResourceContent({ id: "res-scan", type: "pdf", url: "https://files.example.test/scan.pdf" });
  assert.notEqual(scanned.status, "ok");
  assert.equal(scanned.text.length, 0, "no text, no pretend text");
  assert.match(scanned.reason, /isn't selectable|couldn't read its contents/i);
});

test("a shared Google Doc comes back as text through Google's own export", skip, async () => {
  const asked = mockFetch({
    "export?format=txt": { body: "Teaching sequence: introduce flux before EMF, because students who meet the formula first misapply it under exam pressure." },
  });
  const result = await extract.extractResourceContent({
    id: "res-doc", type: "doc", url: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit",
  });
  assert.equal(result.status, "ok", result.reason);
  assert.deepEqual(asked, ["https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/export?format=txt"]);
  assert.match(result.text, /introduce flux before EMF/);
});

test("a signed-in Google page is never mistaken for document text", skip, async () => {
  mockFetch({ "export?format=txt": { contentType: "text/html", body: "<!DOCTYPE html><html><head>Sign in</head><body>hello class notes about flux and emf which is long enough to look fine</body></html>" } });
  const result = await extract.extractResourceContent({
    id: "res-doc2", type: "doc", url: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit",
  });
  assert.equal(result.status, "permission");
  assert.match(result.reason, /private/i);
});

test("a linked WebVTT makes a video or YouTube lesson answerable, with timestamps", skip, async () => {
  const asked = mockFetch({ "lesson.vtt": { contentType: "text/vtt", body: VTT } });
  const result = await extract.extractResourceContent({
    id: "res-vid", type: "video", url: "https://files.example.test/lesson.mp4", captionsUrl: "https://files.example.test/lesson.vtt",
  });
  assert.equal(result.status, "ok", result.reason);
  assert.equal(result.planKind, "caption-file");
  assert.match(result.text, /\[0:00\] Today we finish electromagnetic induction\./);
  assert.match(result.text, /\[0:12\] Flux equals B times A times cosine theta\./);
  assert.equal(asked.includes("https://files.example.test/lesson.mp4"), false, "the media bytes are never downloaded");
});

test("a transcript stored on the resource is read with zero network calls", skip, async () => {
  const asked = mockFetch({});
  const result = await extract.extractResourceContent({
    id: "res-yt",
    type: "youtube",
    url: "https://youtu.be/aircAruvnVk",
    transcriptText: "Welcome back. Today we finish electromagnetic induction, the idea that a changing magnetic field creates a current.",
  });
  assert.equal(result.status, "ok", result.reason);
  assert.equal(result.planKind, "in-document");
  assert.deepEqual(asked, [], "content the course owner already wrote must never be re-fetched");
  assert.match(result.text, /changing magnetic field/);
});

test("a Brain practice set is readable with no URL at all", skip, async () => {
  const asked = mockFetch({});
  const result = await extract.extractResourceContent({
    id: "res-brain",
    type: "brain",
    practiceQuestions: [
      { prompt: "What does Lenz's law fix?", options: ["Magnitude", "Direction"], correctIndex: 1, explanation: "The induced current opposes the change that produced it." },
      { prompt: "State Faraday's law in one line.", options: [], correctIndex: -1, explanation: "EMF equals minus N times the rate of change of flux." },
    ],
  });
  assert.equal(result.status, "ok", result.reason);
  assert.match(result.text, /Correct: Direction/);
  assert.match(result.text, /rate of change of flux/);
  assert.deepEqual(asked, []);

  const empty = await extract.extractResourceContent({ id: "res-brain-empty", type: "brain", practiceQuestions: [] });
  assert.equal(empty.status, "unsupported", "an empty set is explained, not invented");
  assert.match(empty.reason, /no questions imported yet/i);
});

test("forms and third-party embeds are refused by construction, not by accident", skip, async () => {
  const asked = mockFetch({ "pen": { contentType: "text/html", body: "<html><body>secret page content that must never be read as a lesson here</body></html>" } });
  const embed = await extract.extractResourceContent({ id: "res-embed", type: "embed", url: "https://codepen.io/team/full/penABCD" });
  assert.equal(embed.status, "unsupported");
  assert.match(embed.reason, /never scraped/i);
  assert.equal(embed.text, "");

  const form = await extract.extractResourceContent({ id: "res-form", type: "google_form", url: "https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOp/viewform" });
  assert.notEqual(form.status, "ok");
  assert.equal(form.text, "", "no answer may be built out of a form nobody shared");
  assert.deepEqual(asked, [], "a refused type must not even open a connection");
});

test("local and private addresses are refused before any request is made", skip, async () => {
  const asked = mockFetch({});
  // Not https at all is a different fact from "blocked by the guard", and each
  // gets its own sentence — both are things the course owner can fix.
  const plainHttp = await extract.extractResourceContent({ id: "ssrf-http", type: "pdf", url: "http://internal/notes.pdf" });
  assert.equal(plainHttp.status, "unsupported");
  assert.match(plainHttp.reason, /https/i);

  for (const url of ["https://127.0.0.1:8443/a.pdf", "https://metadata.google.internal/x", "https://example.com:8443/notes.pdf", "https://u:p@example.com/a.pdf"]) {
    const result = await extract.extractResourceContent({ id: `ssrf-${asked.length}`, type: "pdf", url });
    assert.equal(result.status, "error", url);
    assert.match(result.reason, /can't be read safely/i, url);
  }
  assert.deepEqual(asked, [], "the guard runs before the fetch, not after");
});

test("a timeout is retryable and never answered with invented content", skip, async () => {
  mockFetch({ "slow.pdf": Object.assign(new Error("boom"), { name: "AbortError" }) });
  const result = await extract.extractResourceContent({ id: "res-slow", type: "pdf", url: "https://files.example.test/slow.pdf" });
  assert.equal(result.status, "error");
  assert.match(result.reason, /timed out/i);
  assert.equal(result.text, "");
});
