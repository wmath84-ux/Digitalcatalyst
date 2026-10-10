import test from "node:test";
import assert from "node:assert/strict";

import {
  getReadResourcePresentation,
  githubRawPdfUrl,
  isPdfSourceUrl,
  normalizeReadResourceUrl,
} from "../utils/readResources.js";
import { checkPdfSource, hasPdfHeader } from "../src/course/pdfSourceCheck.ts";

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
const HTML_BYTES = new TextEncoder().encode("<!doctype html><html><body>Hi</body></html>");

// ── GitHub URL rewriting ───────────────────────────────────────────────────

test("github blob PDF links are rewritten to raw.githubusercontent.com", () => {
  assert.equal(
    githubRawPdfUrl("https://github.com/acme/notes/blob/main/docs/week%201.pdf"),
    "https://raw.githubusercontent.com/acme/notes/main/docs/week%201.pdf",
  );
  assert.equal(
    githubRawPdfUrl("https://github.com/acme/notes/blob/v1.2/guide.PDF?token=abc#page=3"),
    "https://raw.githubusercontent.com/acme/notes/v1.2/guide.PDF?token=abc",
  );
  assert.equal(
    githubRawPdfUrl("https://github.com/acme/notes/raw/main/a.pdf"),
    "https://raw.githubusercontent.com/acme/notes/main/a.pdf",
  );
});

test("github non-PDF and non-file pages are not rewritten", () => {
  assert.equal(githubRawPdfUrl("https://github.com/acme/notes/blob/main/readme.md"), "");
  assert.equal(githubRawPdfUrl("https://github.com/acme/notes/tree/main/docs"), "");
  assert.equal(githubRawPdfUrl("https://github.com/acme/notes/blob/main/"), "");
  assert.equal(githubRawPdfUrl("http://github.com/acme/notes/blob/main/a.pdf"), "");
  assert.equal(githubRawPdfUrl("https://user:pw@github.com/acme/notes/blob/main/a.pdf"), "");
  assert.equal(githubRawPdfUrl("https://evil.example/acme/notes/blob/main/a.pdf"), "");
});

test("normalizeReadResourceUrl applies the GitHub rewrite for pdf_url and embed_url", () => {
  assert.equal(
    normalizeReadResourceUrl("https://github.com/acme/notes/blob/main/a.pdf", "pdf_url"),
    "https://raw.githubusercontent.com/acme/notes/main/a.pdf",
  );
  assert.equal(
    normalizeReadResourceUrl("https://github.com/acme/notes/blob/main/a.pdf", "embed_url"),
    "https://raw.githubusercontent.com/acme/notes/main/a.pdf",
  );
  assert.equal(
    normalizeReadResourceUrl("https://github.com/acme/notes/blob/main/a.md", "pdf_url"),
    "https://github.com/acme/notes/blob/main/a.md",
  );
});

test("isPdfSourceUrl detects .pdf paths only for http(s) URLs", () => {
  assert.equal(isPdfSourceUrl("https://cdn.example.com/files/Guide.PDF?x=1"), true);
  assert.equal(isPdfSourceUrl("https://cdn.example.com/view?file=a.pdf"), false);
  assert.equal(isPdfSourceUrl("https://cdn.example.com/page.html"), false);
  assert.equal(isPdfSourceUrl("not a url"), false);
  assert.equal(isPdfSourceUrl(""), false);
});

// ── Routing: which viewer a Read resource gets ────────────────────────────

test("an embed_url that points at a PDF is routed to the PDF.js viewer", () => {
  const presentation = getReadResourcePresentation({
    id: "r1",
    type: "read",
    readSourceKind: "embed_url",
    url: "https://cdn.example.com/files/guide.pdf",
  });
  assert.equal(presentation.kind, "pdfjs");
  assert.equal(presentation.sourceUrl, "https://cdn.example.com/files/guide.pdf");
});

test("a GitHub blob PDF routes to the PDF.js viewer with the raw address", () => {
  const presentation = getReadResourcePresentation({
    id: "r2",
    type: "read",
    readSourceKind: "pdf_url",
    url: "https://github.com/acme/notes/blob/main/guide.pdf",
  });
  assert.equal(presentation.kind, "pdfjs");
  assert.equal(presentation.sourceUrl, "https://raw.githubusercontent.com/acme/notes/main/guide.pdf");
});

test("a non-PDF embed page stays in the sandboxed iframe", () => {
  const presentation = getReadResourcePresentation({
    id: "r3",
    type: "read",
    readSourceKind: "embed_url",
    url: "https://github.com/acme/notes/blob/main/readme.md",
  });
  assert.equal(presentation.kind, "embed");
});

// ── Preflight: checkPdfSource (fetch is stubbed) ──────────────────────────

const stubFetch = (factory) => async (url, init) => factory(url, init);
const response = (status, body, type = "application/pdf") =>
  new Response(body, { status, headers: { "content-type": type } });

test("hasPdfHeader recognises the %PDF- signature only", () => {
  assert.equal(hasPdfHeader(PDF_BYTES), true);
  assert.equal(hasPdfHeader(HTML_BYTES), false);
  assert.equal(hasPdfHeader(new Uint8Array([])), false);
});

test("checkPdfSource accepts a readable PDF", async () => {
  const verdict = await checkPdfSource("https://cdn.example.com/a.pdf", {
    fetchImpl: stubFetch(() => response(200, PDF_BYTES)),
  });
  assert.deepEqual(verdict, { ok: true });
});

test("checkPdfSource reports a CORS/network failure as retryable", async () => {
  const verdict = await checkPdfSource("https://cdn.example.com/a.pdf", {
    fetchImpl: stubFetch(() => {
      throw new TypeError("Failed to fetch");
    }),
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, "network");
  assert.equal(verdict.retryable, true);
});

test("checkPdfSource reports 404 as not_found, not retryable", async () => {
  const verdict = await checkPdfSource("https://cdn.example.com/a.pdf", {
    fetchImpl: stubFetch(() => response(404, "nope", "text/plain")),
  });
  assert.equal(verdict.kind, "not_found");
  assert.equal(verdict.retryable, false);
});

test("checkPdfSource reports 401/403 as forbidden", async () => {
  for (const status of [401, 403]) {
    const verdict = await checkPdfSource("https://cdn.example.com/a.pdf", {
      fetchImpl: stubFetch(() => response(status, "no", "text/plain")),
    });
    assert.equal(verdict.kind, "forbidden", `status ${status}`);
  }
});

test("checkPdfSource rejects an HTML page served at a PDF link", async () => {
  const verdict = await checkPdfSource("https://github.com/acme/notes/blob/main/a.pdf", {
    fetchImpl: stubFetch(() => response(200, HTML_BYTES, "text/html; charset=utf-8")),
  });
  assert.equal(verdict.kind, "not_pdf");
  assert.match(verdict.message, /web page/);
});

test("checkPdfSource rejects a text body that is not a PDF", async () => {
  const verdict = await checkPdfSource("https://cdn.example.com/a.pdf", {
    fetchImpl: stubFetch(() => response(200, "plain text", "text/plain")),
  });
  assert.equal(verdict.kind, "not_pdf");
});

test("checkPdfSource reports an empty body", async () => {
  const verdict = await checkPdfSource("https://cdn.example.com/a.pdf", {
    fetchImpl: stubFetch(() => response(200, new Uint8Array(0))),
  });
  assert.equal(verdict.kind, "empty");
});

test("checkPdfSource reports a server error as retryable", async () => {
  const verdict = await checkPdfSource("https://cdn.example.com/a.pdf", {
    fetchImpl: stubFetch(() => response(503, "down", "text/plain")),
  });
  assert.equal(verdict.kind, "server");
  assert.equal(verdict.retryable, true);
});

test("checkPdfSource times out a hanging request", async () => {
  const verdict = await checkPdfSource("https://cdn.example.com/a.pdf", {
    timeoutMs: 20,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  });
  assert.equal(verdict.kind, "timeout");
  assert.equal(verdict.retryable, true);
});
