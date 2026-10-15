// tests/coursePlayerPdfJsViewer.test.mjs
//
// "PDF ko pdf.js se kholna hai" — every PDF a learner can open must be drawn by
// the LOCALLY BUNDLED Mozilla PDF.js Generic Viewer, not by whatever the
// surrounding browser does with a raw PDF inside an <iframe>.
//
// Why this matters on the devices the app actually ships to:
//   · desktop Chrome draws its own built-in viewer in a frame (fine, but a
//     different UI from Read, with no page resume and no error copy);
//   · the packaged Android app is a WebView, which has NO PDF viewer at all —
//     the frame stays empty or offers a download nobody asked for.
//
// The one exception is Google Drive: its `/preview` page renders the document
// for us in a frame, and its byte URL redirects to a host that sends no
// `Access-Control-Allow-Origin`, so PDF.js can never fetch it. Drive keeps
// Drive's frame — and this file pins that too, so "just send everything to
// PDF.js" cannot quietly break every Drive lesson.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isPdfJsEmbed, pdfJsSourceUrl } from "../src/utils/courseEmbed.ts";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");
const viewer = readSource("src/course/PdfJsGenericViewer.tsx");
const resourceViewer = readSource("src/course/ResourceViewer.tsx");
const courseEmbed = readSource("src/utils/courseEmbed.ts");

// ── Which embed goes to PDF.js ─────────────────────────────────────────────

test("a direct PDF lesson (and a .pdf e-book) goes to the PDF.js viewer", () => {
  assert.equal(isPdfJsEmbed({ kind: "pdf", url: "https://cdn.example.com/notes.pdf" }), true);
  assert.equal(isPdfJsEmbed({ kind: "pdf", url: "https://cdn.example.com/notes.pdf?x=1#page=3" }), true);
  // Firebase Storage upload (the instructor's "Upload a PDF" for a lesson).
  assert.equal(
    isPdfJsEmbed({ kind: "pdf", url: "https://firebasestorage.googleapis.com/v0/b/app/o/adminProductContent%2Fread%2Fp%2Fr-1.pdf?alt=media&token=abc" }),
    true,
  );
  // GitHub blob/raw links are rewritten to raw.githubusercontent.com below.
  assert.equal(isPdfJsEmbed({ kind: "pdf", url: "https://github.com/acme/notes/blob/main/week1.pdf" }), true);
});

test("Drive and Docs stay out of PDF.js — their frames are the only renderer", () => {
  // A Drive PDF lesson reaches ResourceViewer as kind "pdf" with a /preview URL.
  assert.equal(isPdfJsEmbed({ kind: "pdf", url: "https://drive.google.com/file/d/1abc/preview" }), false);
  assert.equal(isPdfJsEmbed({ kind: "pdf", url: "https://drive.google.com/uc?export=download&id=1abc" }), false);
  // The Google Docs viewer endpoint is an HTML page that needs a frame too.
  assert.equal(isPdfJsEmbed({ kind: "pdf", url: "https://docs.google.com/gview?embedded=1&url=https%3A%2F%2Fx%2Fy.pdf" }), false);
});

test("only real, https, framed-host-free PDF embeds qualify", () => {
  assert.equal(isPdfJsEmbed(null), false);
  assert.equal(isPdfJsEmbed(undefined), false);
  assert.equal(isPdfJsEmbed({ kind: "pdf", url: "" }), false);
  assert.equal(isPdfJsEmbed({ kind: "embed", url: "https://cdn.example.com/notes.pdf" }), false, "a generic embed is not a PDF lesson");
  assert.equal(isPdfJsEmbed({ kind: "doc", url: "https://docs.google.com/document/d/1/preview" }), false);
  assert.equal(isPdfJsEmbed({ kind: "pdf", url: "http://cdn.example.com/notes.pdf" }), false, "plain http is never opened in the viewer");
  assert.equal(isPdfJsEmbed({ kind: "pdf", url: "javascript:alert(1)" }), false);
  assert.equal(isPdfJsEmbed({ kind: "pdf", url: "/notes.pdf" }), false, "a relative URL has no origin the viewer can read");
});

test("GitHub blob links are rewritten to the raw host PDF.js can actually read", () => {
  assert.equal(
    pdfJsSourceUrl({ kind: "pdf", url: "https://github.com/acme/notes/blob/main/docs/week 1.pdf" }),
    "https://raw.githubusercontent.com/acme/notes/main/docs/week%201.pdf",
  );
  assert.equal(
    pdfJsSourceUrl({ kind: "pdf", url: "https://cdn.example.com/notes.pdf?v=2" }),
    "https://cdn.example.com/notes.pdf?v=2",
  );
  // The stored file.url is tried as a second source (some admins store the
  // embed URL in `embedUrl` and the share link in `url`, or the other way round).
  assert.equal(
    pdfJsSourceUrl({ kind: "pdf", url: "https://cdn.example.com/notes.pdf" }, "https://github.com/acme/n/blob/main/x.pdf"),
    "https://cdn.example.com/notes.pdf",
  );
  assert.equal(pdfJsSourceUrl({ kind: "none", url: "" }), "");
  assert.equal(pdfJsSourceUrl(null), "");
});

// ── The wiring in the players ──────────────────────────────────────────────

test("ResourceViewer renders the bundled PDF.js viewer for those embeds", () => {
  assert.match(resourceViewer, /import PdfJsGenericViewer from "\.\/PdfJsGenericViewer";/);
  assert.match(resourceViewer, /import \{ editableGoogleKind, getCourseDownload, isPdfJsEmbed, pdfJsSourceUrl,/);
  assert.match(resourceViewer, /const pdfJs = isPdfJsEmbed\(embed\);/);
  assert.match(resourceViewer, /const pdfJsUrl = pdfJs \? pdfJsSourceUrl\(embed, file\.url\) : "";/);
  assert.match(resourceViewer, /data-course-pdf-stage="pdfjs"/);
  // Page resume uses the Course Player's own playback store.
  assert.match(resourceViewer, /initialPage=\{typeof entry\?\.page === "number" \? entry\.page : 1\}/);
  assert.match(resourceViewer, /onPageChange=\{\(page\) => report\(\{ page \}\)\}/);
  // The PDF.js branch comes BEFORE the generic iframe branch, so a pdf lesson
  // can never fall through to EmbedFrame while the viewer is available.
  const pdfBranch = resourceViewer.indexOf("showPdfJsViewer ? (");
  const frameBranch = resourceViewer.indexOf('!embed.url ? (');
  assert.ok(pdfBranch !== -1 && frameBranch !== -1 && pdfBranch < frameBranch, "PDF.js branch must precede the iframe fallback");
});

test("the one unsolvable case gets an explicit, labelled fallback — never a silent swap", () => {
  // The learner only ever leaves PDF.js on purpose (CORS/network refusal), and
  // the frame that appears says so in the stage.
  assert.match(viewer, /onOpenBasicViewer && problem\.kind === "network"/);
  assert.match(viewer, /data-read-pdf-basic-viewer/);
  assert.match(viewer, /Try the basic viewer/);
  assert.match(resourceViewer, /onOpenBasicViewer=\{\(\) => setBasicPdfFrame\(true\)\}/);
  assert.match(resourceViewer, /pdfBasicFrame=\{pdfJs && basicPdfFrame\}/);
  assert.match(resourceViewer, /data-pdf-basic-frame=\{pdfBasicFrame \? "true" : undefined\}/);
});

test("the viewer is shared with Read, and its Read-only contract is untouched", () => {
  // Read still passes its ids (page memory per read resource) …
  const readPanel = readSource("src/course/ReadLibraryPanel.tsx");
  assert.match(readPanel, /<PdfJsGenericViewer/);
  assert.match(readPanel, /productId=\{/);
  assert.match(readPanel, /resourceId=\{/);
  // … and the lesson path may omit them: the page then lives in the player's
  // own playback store, and the component must not write a bogus cache key.
  assert.match(viewer, /productId\?: string;/);
  assert.match(viewer, /resourceId\?: string;/);
  assert.match(viewer, /: storageKey \? readPageFromStorage\(storageKey\) : 1;/);
  // The pre-flight check (honest failure messages) still runs for every source.
  assert.match(viewer, /const verdict = await checkPdfSource\(viewerSrc\);/);
});

test("no other code path drops a direct PDF into a bare iframe", () => {
  // `getCourseEmbed` is the ONLY place that decides the embed kind, and it now
  // sends plain PDF URLs to kind "pdf" (which the player routes to PDF.js)…
  assert.match(courseEmbed, /if \(file\.type === "pdf" && raw\) return \{ url: raw, kind: "pdf" \};/);
  assert.match(courseEmbed, /if \(google\?\.kind === "drive"\) return \{ url: `https:\/\/drive\.google\.com\/file\/d\/\$\{google\.id\}\/preview`, kind: file\.type === "pdf" \? "pdf" : "drive" \};/);
  // … and the ResourceViewer is the only consumer that turns kind "pdf" into a
  // frame. The iframe branch must therefore be reached only via the fallback.
  assert.match(resourceViewer, /const showPdfJsViewer = pdfJs && !basicPdfFrame;/);
  assert.doesNotMatch(resourceViewer, /kind === "pdf"[\s\S]{0,200}<iframe/);
});
