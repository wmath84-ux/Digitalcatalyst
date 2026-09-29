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
const OUT = path.join(OUT_DIR, "personalAiContent.cjs");

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
    // CJS, not ESM: the Office readers pull in CJS-only dynamic requires that
    // esbuild cannot lower to static ESM imports (and Vercel runs this file as
    // CJS in production too, so the bundle stays faithful).
    format: "cjs",
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

/** Minimal real Office zips, built with the same jszip the extractor reads with. */
const officeZip = async (contentTypes, files) => {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return zip.generateAsync({ type: "nodebuffer" });
};

const TYPES_XML = (override) =>
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>${override}</Types>`;

const docxFile = (paragraphs) => officeZip(
  TYPES_XML(`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`),
  {
    "word/document.xml":
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${
        paragraphs.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("")
      }</w:body></w:document>`,
  },
);

const xlsxFile = (rows) => officeZip(
  TYPES_XML(
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ),
  {
    "_rels/.rels":
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":
      `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Marks" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml":
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${
        rows.map((cells, index) => `<row r="${index + 1}">${
          cells.map((cell, col) => `<c r="${String.fromCharCode(65 + col)}${index + 1}" t="inlineStr"><is><t>${cell}</t></is></c>`).join("")
        }</row>`).join("")
      }</sheetData></worksheet>`,
  },
);

const pptxFile = (slides) => officeZip(
  TYPES_XML(slides.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")),
  Object.fromEntries(slides.map((texts, index) => [`ppt/slides/slide${index + 1}.xml`,
    `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${
      texts.map((text) => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`).join("")
    }</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`])),
);

/** Bytes that start like a PNG — enough for magic verification, nothing more. */
const pngBytes = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 0)]);

const ARTICLE_HTML = `<!DOCTYPE html><html><head><title>Faraday's law</title><script>window.track(1);</script></head><body>
<nav><a>Home</a><a>Courses</a><button>Sign Up For Free Now</button></nav>
<article><h1>Faraday's law of induction</h1>
<p>A changing magnetic field creates an electric current in a nearby conductor. The size of the induced EMF equals the rate of change of magnetic flux through the circuit.</p>
<p>Lenz's law fixes the direction: the induced current always opposes the change that produced it. Together the two laws explain transformers, generators and induction stoves.</p>
</article><footer>Copyright 2026 Example Academy. All rights reserved worldwide.</footer></body></html>`;

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

test("forms are refused by construction; embeds get one honest attempt that chrome fails", skip, async () => {
  const asked = mockFetch({ "pen": { contentType: "text/html", body: "<html><body>secret page content that must never be read as a lesson here</body></html>" } });
  const embed = await extract.extractResourceContent({ id: "res-embed", type: "embed", url: "https://codepen.io/team/full/penABCD" });
  // An interactive app page has no article text, so the attempt reports empty —
  // and empty means NOTHING is grounded, exactly like a refusal.
  assert.equal(embed.status, "empty");
  assert.equal(embed.text, "");
  assert.match(embed.reason, /screenshot/i);
  assert.deepEqual(asked, ["https://codepen.io/team/full/penABCD"], "one honest attempt, then an honest report");

  const formAsked = mockFetch({});
  const form = await extract.extractResourceContent({ id: "res-form", type: "google_form", url: "https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOp/viewform" });
  assert.notEqual(form.status, "ok");
  assert.equal(form.text, "", "no answer may be built out of a form nobody shared");
  assert.deepEqual(formAsked, [], "a refused type must not even open a connection");
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

test("a docx upload reads from its own bytes, even served as octet-stream", skip, async () => {
  mockFetch({
    "handout.docx": {
      contentType: "application/octet-stream",
      body: await docxFile([
        "Magnetic flux changes in exactly three ways for this chapter.",
        "First the field strength changes, then the area, then the angle between them.",
      ]),
    },
  });
  const result = await extract.extractResourceContent({ id: "res-docx", type: "doc", url: "https://cdn.example.test/handout.docx" });
  assert.equal(result.status, "ok", result.reason);
  assert.equal(result.planKind, "download");
  assert.match(result.text, /exactly three ways/);
});

test("an xlsx upload reads as labelled rows, sheet by sheet", skip, async () => {
  mockFetch({
    "marks.xlsx": {
      contentType: "application/octet-stream",
      body: await xlsxFile([["Student Name", "Physics Marks"], ["Aarav Sharma", "92"], ["Diya Patel", "88"]]),
    },
  });
  const result = await extract.extractResourceContent({ id: "res-xlsx", type: "sheet", url: "https://cdn.example.test/marks.xlsx" });
  assert.equal(result.status, "ok", result.reason);
  assert.match(result.text, /Sheet: Marks/);
  assert.match(result.text, /Aarav Sharma \| 92/);
});

test("a pptx upload reads slide by slide", skip, async () => {
  mockFetch({
    "deck.pptx": {
      contentType: "application/octet-stream",
      body: await pptxFile([["Induction", "A changing field creates current"], ["Faraday", "EMF equals minus N dPhi by dt"]]),
    },
  });
  const result = await extract.extractResourceContent({ id: "res-pptx", type: "slides", url: "https://cdn.example.test/deck.pptx" });
  assert.equal(result.status, "ok", result.reason);
  assert.match(result.text, /Slide 1:/);
  assert.match(result.text, /A changing field creates current/);
  assert.match(result.text, /Slide 2:/);
});

test("a legacy .doc names the fix instead of pretending to read", skip, async () => {
  mockFetch({ "old.doc": { contentType: "application/octet-stream", body: Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64, 0)]) } });
  const result = await extract.extractResourceContent({ id: "res-doc", type: "doc", url: "https://cdn.example.test/old.doc" });
  assert.equal(result.status, "invalid");
  assert.equal(result.text, "");
  assert.match(result.reason, /re-save it as \.docx/i);
});

test("an image link verifies to visual — the model looks at ask time, nothing is faked here", skip, async () => {
  mockFetch({ "fig1.png": { contentType: "image/png", body: pngBytes() } });
  const result = await extract.extractResourceContent({ id: "res-img", type: "image", url: "https://cdn.example.test/fig1.png" });
  assert.equal(result.status, "visual", result.reason);
  assert.equal(result.planKind, "image-link");
  assert.equal(result.text, "", "verification carries no text — vision carries the meaning");
  assert.equal(result.contentType, "image/png");

  mockFetch({ "notimage.png": { contentType: "text/html", body: "<html><body>nope</body></html>" } });
  const fake = await extract.extractResourceContent({ id: "res-img2", type: "image", url: "https://cdn.example.test/notimage.png" });
  assert.equal(fake.status, "invalid");
  assert.match(fake.reason, /didn't return an image/i);
});

test("a PDF without its extension still reads from its bytes", skip, async () => {
  mockFetch({ "o%2Fhandout": { contentType: "application/octet-stream", body: tinyPdf("Extensionless storage bytes still parse", 4) } });
  const result = await extract.extractResourceContent({ id: "res-sniff", type: "embed", url: "https://firebasestorage.example.test/o%2Fhandout?alt=media" });
  assert.equal(result.status, "ok", result.reason);
  assert.equal(result.planKind, "download");
  assert.match(result.text, /Extensionless storage bytes still parse/);
});

test("a public article reads as prose; chrome never grounds an answer", skip, async () => {
  mockFetch({ "faraday": { contentType: "text/html; charset=utf-8", body: ARTICLE_HTML } });
  const result = await extract.extractResourceContent({ id: "res-article", type: "embed", url: "https://example.test/articles/faraday" });
  assert.equal(result.status, "ok", result.reason);
  assert.match(result.text, /changing magnetic field creates an electric current/);
  assert.doesNotMatch(result.text, /Sign Up For Free Now/, "nav chrome must not read as lesson content");
  assert.doesNotMatch(result.text, /window\.track/, "scripts must never leak into grounding");

  mockFetch({ "chrome": { contentType: "text/html", body: "<html><body><nav>Home Products Pricing Login Contact About Careers</nav><button>Start free trial now</button></body></html>" } });
  const chrome = await extract.extractResourceContent({ id: "res-chrome", type: "embed", url: "https://example.test/chrome" });
  assert.equal(chrome.status, "empty");
  assert.equal(chrome.text, "");
  assert.match(chrome.reason, /screenshot/i);
});

test("a code file reads as text, labelled or sniffed", skip, async () => {
  const code = "# Flux helper for the induction chapter worked examples.\n# Change the field, the area or the angle and watch the EMF.\ndef total_flux(field, area, angle):\n    import math\n    change = field * area * math.cos(angle)\n    results = [change * step for step in range(ten)]\n    average = sum(results) / len(results)\n    print('mean flux over the sweep:', average)\n    return average\n";
  mockFetch({ "flux.py": { contentType: "text/plain", body: code } });
  const labelled = await extract.extractResourceContent({ id: "res-code", type: "embed", url: "https://site.example.test/flux.py" });
  assert.equal(labelled.status, "ok", labelled.reason);
  assert.equal(labelled.planKind, "text-file");
  assert.match(labelled.text, /def total_flux/);

  mockFetch({ "o%2Fscript": { contentType: "application/octet-stream", body: code } });
  const sniffed = await extract.extractResourceContent({ id: "res-code2", type: "embed", url: "https://firebasestorage.example.test/o%2Fscript?alt=media" });
  assert.equal(sniffed.status, "ok", sniffed.reason);
  assert.match(sniffed.text, /def total_flux/);
});
