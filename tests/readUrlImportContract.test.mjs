// tests/readUrlImportContract.test.mjs
//
// Real behavioural tests for the Read "add PDFs from a link" helper. The module
// is TypeScript, so it is transpiled with the repo's own esbuild and then
// imported — these assertions execute the shipped functions, not a re-reading
// of the source.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { transformSync } from "esbuild";

const source = fs.readFileSync(new URL("../src/course/readUrlImport.ts", import.meta.url), "utf8");
const { code } = transformSync(source, { loader: "ts", format: "esm", target: "node20" });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "read-url-import-"));
const file = path.join(dir, "readUrlImport.mjs");
fs.writeFileSync(file, code, "utf8");
const mod = await import(pathToFileURL(file).href);

const { parseUrlList, extractUrl, toDirectDownloadUrl, looksLikePdf, sanitizeFilename, pickFilename } = mod;

const pdfBytes = (lead = 0) => {
  const out = new Uint8Array(lead + 16);
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  magic.forEach((byte, i) => {
    out[lead + i] = byte;
  });
  return out;
};
const htmlBytes = () => new TextEncoder().encode("<!doctype html><html><body>Sign in</body></html>");

// ── Parsing ──────────────────────────────────────────────────────────────────

test("a plain http(s) link parses; junk and non-http schemes are rejected", () => {
  assert.equal(extractUrl("  https://a.test/x.pdf  "), "https://a.test/x.pdf");
  assert.equal(extractUrl("not a link"), null);
  assert.equal(extractUrl("ftp://a.test/x.pdf"), null);
  assert.equal(extractUrl("javascript:alert(1)"), null);
  assert.equal(extractUrl(""), null);
});

test("an iframe embed pasted from the admin editor yields its src", () => {
  const embed = '<iframe src="https://a.test/x.pdf" width="600"></iframe>';
  assert.equal(extractUrl(embed), "https://a.test/x.pdf");
});

test("Google Drive share and open links become the direct-download endpoint", () => {
  assert.equal(
    toDirectDownloadUrl("https://drive.google.com/file/d/ABC123/view?usp=sharing"),
    "https://drive.google.com/uc?export=download&id=ABC123",
  );
  assert.equal(
    toDirectDownloadUrl("https://drive.google.com/open?id=ABC123"),
    "https://drive.google.com/uc?export=download&id=ABC123",
  );
});

test("the docs.google viewer unwraps to the document it is pointing at", () => {
  assert.equal(
    toDirectDownloadUrl("https://docs.google.com/viewer?url=https%3A%2F%2Fa.test%2Fx.pdf"),
    "https://a.test/x.pdf",
  );
});

test("a pasted block splits per line, trims, and dedupes on the resolved URL", () => {
  const list = parseUrlList(
    [
      "https://a.test/one.pdf",
      "",
      "   https://a.test/two.pdf   ",
      // the same document again, this time as a Drive share link
      "https://drive.google.com/file/d/ABC123/view",
      "https://drive.google.com/open?id=ABC123",
      "garbage line",
    ].join("\n"),
  );
  assert.deepEqual(
    list.map((row) => row.url),
    ["https://a.test/one.pdf", "https://a.test/two.pdf", "https://drive.google.com/uc?export=download&id=ABC123"],
  );
  // the learner's own wording survives for error messages
  assert.equal(list[0].raw, "https://a.test/one.pdf");
});

// ── Byte validation ──────────────────────────────────────────────────────────

test("a real PDF is recognised, including when the header sits a few bytes in", () => {
  assert.equal(looksLikePdf(pdfBytes(0)), true);
  assert.equal(looksLikePdf(pdfBytes(4)), true);
});

test("an HTML page served from a .pdf URL is NOT accepted", () => {
  assert.equal(looksLikePdf(htmlBytes()), false);
  assert.equal(looksLikePdf(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), false); // a zip
  assert.equal(looksLikePdf(new Uint8Array(0)), false);
});

// ── Filenames ────────────────────────────────────────────────────────────────

const responseWith = (headers) => new Response(null, { headers });

test("Content-Disposition wins, in both the plain and RFC 5987 forms", () => {
  assert.equal(pickFilename(responseWith({ "content-disposition": 'attachment; filename="Lecture 3.pdf"' }), "https://a.test/x"), "Lecture 3.pdf");
  assert.equal(
    pickFilename(responseWith({ "content-disposition": "attachment; filename*=UTF-8''Lec%203.pdf" }), "https://a.test/x"),
    "Lec 3.pdf",
  );
});

test("with no header the URL pathname is used, then a fallback", () => {
  assert.equal(pickFilename(responseWith({}), "https://a.test/files/Chapter%207.pdf"), "Chapter 7.pdf");
  assert.equal(pickFilename(responseWith({}), "https://a.test/"), "document.pdf");
});

test("a Google Drive link is refused up front — the browser never even asks Drive", async () => {
  // Drive answers its download URL with a redirect to *.googleusercontent.com
  // and no Access-Control-Allow-Origin header, so this fetch is blocked every
  // time. The learner gets Drive's own reason immediately instead of a generic
  // network error after a 60s timeout.
  assert.equal(mod.isGoogleDriveUrl("https://drive.google.com/file/d/ABC123/view"), true);
  assert.equal(mod.isGoogleDriveUrl("https://drive.usercontent.google.com/download?id=ABC123&export=download"), true);
  assert.equal(mod.isGoogleDriveUrl("https://drive.google.com.evil.example/file/d/ABC123/view"), false);
  assert.equal(mod.isGoogleDriveUrl("https://docs.google.com/document/d/ABC123/edit"), false);

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("Drive must not be requested at all");
  };
  try {
    const result = await mod.fetchPdfFromUrl({
      raw: "https://drive.google.com/file/d/ABC123/view",
      url: "https://drive.google.com/uc?export=download&id=ABC123",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.retryable, false, "retrying the same URL can never succeed");
    assert.match(result.error.message, /Google Drive cannot be read through a link/);
    assert.match(result.error.message, /Upload PDF/);
    assert.equal(calls, 0, "no request is attempted for a host that always blocks it");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hostile filenames are sanitised but never emptied", () => {
  // The security property first: whatever comes off the network, the result can
  // never carry a separator or a traversal run into a Storage object path.
  for (const hostile of ["../../etc/passwd", "..\\..\\windows\\system.pdf", 'a<b>c:d"e|f.pdf', "   ", "...", "\u0000x.pdf"]) {
    const out = sanitizeFilename(hostile);
    assert.ok(out.length > 0, `${JSON.stringify(hostile)} → non-empty`);
    assert.ok(!/[\\/]/.test(out), `${JSON.stringify(hostile)} → no separators (${out})`);
    assert.ok(!out.includes(".."), `${JSON.stringify(hostile)} → no traversal run (${out})`);
    assert.ok(out.endsWith(".pdf"), `${JSON.stringify(hostile)} → pdf extension (${out})`);
    assert.ok(!out.startsWith("."), `${JSON.stringify(hostile)} → no leading dot (${out})`);
  }
  // …and the ordinary cases read the way a learner would expect.
  assert.equal(sanitizeFilename("../../etc/passwd"), "etc-passwd.pdf");
  assert.equal(sanitizeFilename('a<b>c:d"e|f.pdf'), "a-b-c-d-e-f.pdf");
  assert.equal(sanitizeFilename("   "), "document.pdf");
  assert.equal(sanitizeFilename("notes"), "notes.pdf");
});
