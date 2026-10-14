// Real Chromium + bundled Mozilla viewer smoke test (no Firebase backend).
// Run with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH when Chromium is not installed by Playwright.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { chromium } from "playwright";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite/package.json"))("esbuild");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();

function samplePdf() {
  const stream = "BT /F1 20 Tf 50 720 Td (Eduvora local PDF) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

test("local database PDF renders in the real PDF.js viewer and reopens after browser reload", { skip: !fs.existsSync(executablePath) }, async () => {
  const dir = path.join(process.cwd(), "node_modules", ".tmp-local-pdf-browser");
  fs.mkdirSync(dir, { recursive: true });
  await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import PdfJsGenericViewer from "./src/course/PdfJsGenericViewer";
      import { storeLocalReadPdf, listLocalReadUploads, saveLocalReadAnnotations } from "./src/course/localReadDb";
      const root = createRoot(document.getElementById("root"));
      window.api = {
        viewer: null,
        async store(pdf) { return storeLocalReadPdf("learner-1", new File([pdf], "Learnbook.PDF", { type: "application/pdf" }), "Physics", "Chapter 1"); },
        list: () => listLocalReadUploads("learner-1"),
        async save(id) { const bytes = await window.api.viewer.saveAnnotatedBytes(); await saveLocalReadAnnotations("learner-1", id, bytes, { pageCount: window.api.viewer.pageCount() }); window.api.viewer.markSaved(bytes); },
        render(row) { root.render(<PdfJsGenericViewer src={row.url} title={row.name} onPageChange={() => {}} onAnnotationApi={(api) => window.api.viewer = api} />); },
      };
    ` },
    outfile: path.join(dir, "fixture.js"), bundle: true, platform: "browser", format: "esm", jsx: "automatic", logLevel: "silent",
    plugins: [{ name: "auth-boundary", setup(builder) {
      builder.onResolve({ filter: /(?:^|\/)firebase$|context\/AuthContext$/ }, () => ({ path: "session", namespace: "local-test" }));
      builder.onLoad({ filter: /.*/, namespace: "local-test" }, () => ({ contents: 'export const auth = { currentUser: { uid: "learner-1" } }; export const useAuth = () => ({ user: { id: "learner-1" } });', loader: "js" }));
    } }],
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end('<html><body style="margin:0"><div id="root" style="height:100vh"></div><script type="module" src="/fixture.js"></script></body></html>');
      return;
    }
    let file;
    if (url.pathname === "/fixture.js") file = path.join(dir, "fixture.js");
    else if (url.pathname.startsWith("/pdfjs-viewer/6.3.289/")) file = path.join(process.cwd(), "node_modules/pdfjs-viewer-element/dist", url.pathname.slice("/pdfjs-viewer/6.3.289/".length));
    else if (url.pathname.startsWith("/pdfjs-data/6.3.289/")) file = path.join(process.cwd(), "node_modules/pdfjs-dist", url.pathname.slice("/pdfjs-data/6.3.289/".length));
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    const extension = path.extname(file);
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" })[extension] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
    browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => Boolean(window.api));
    const row = await page.evaluate((pdf) => window.api.store(pdf), samplePdf());
    assert.match(row.url, /^eduvora-local-pdf:/);
    await page.evaluate((row) => window.api.render(row), row);
    await page.waitForFunction(() => window.api.viewer?.pageCount() === 1, null, { timeout: 30000 });
    const text = await page.evaluate(async () => {
      const element = document.querySelector("pdfjs-viewer-element");
      const pdf = element.iframe.contentWindow.PDFViewerApplication.pdfDocument;
      const page = await pdf.getPage(1);
      return (await page.getTextContent()).items.map((item) => item.str).join("");
    });
    assert.equal(text, "Eduvora local PDF");
    await page.evaluate(() => {
      document.querySelector("pdfjs-viewer-element").iframe.contentWindow.PDFViewerApplication.pdfDocument.annotationStorage.onSetModified();
    });
    assert.equal(await page.evaluate(() => window.api.viewer.isDirty()), true);
    await page.evaluate(() => window.api.viewer.saveAnnotatedBytes());
    assert.equal(await page.evaluate(() => window.api.viewer.isDirty()), true, "export does not claim the DB saved it");
    await page.evaluate((id) => window.api.save(id), row.id);
    assert.equal(await page.evaluate(() => window.api.viewer.isDirty()), false);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.api));
    const reopened = await page.evaluate(async () => {
      const rows = await window.api.list();
      window.api.render(rows[0]);
      return rows[0];
    });
    assert.equal(reopened.id, row.id);
    assert.equal(reopened.hasAnnotations, true);
    await page.waitForFunction(() => window.api.viewer?.pageCount() === 1, null, { timeout: 30000 });
    assert.equal(await page.locator("[data-read-pdf-problem]").count(), 0);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
