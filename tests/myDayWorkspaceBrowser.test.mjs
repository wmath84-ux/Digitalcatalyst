// Real-browser smoke/regression coverage for the shipped My Day iframe app.
// Run `npm run myday:formatting:build` first so the same static assets used in
// production are served here. If the sandbox has no Chromium, this suite skips
// cleanly and the DOM/data-pipeline tests still run.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const WORKSPACE = path.join(ROOT, "public/my-day-workspace");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const enabled = fs.existsSync(executablePath) && fs.existsSync(path.join(WORKSPACE, "noteFormatting.js"));
const noteBody = [
  "# Stress note",
  "",
  "**bold**, *italic*, ~~strike~~, `inline code`, [safe link](https://example.com).",
  "",
  "Unicode math: A = πr²; x²; √(a+b); 3 × 10⁸; ∞.",
  "",
  "$$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$",
  "",
  "- [x] checked task",
  "- [ ] open task",
  "",
  "| A wide first column | B |",
  "| --- | --- |",
  "| alpha alpha alpha alpha | beta |",
  "",
  "```js",
  'const source = "$x^2$"; // remain literal',
  "```",
].join("\n");

let server;
let browser;
let origin = "";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff" };

before(async () => {
  if (!enabled) return;
  server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.resolve(WORKSPACE, `.${relative}`);
    if (!file.startsWith(`${WORKSPACE}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    response.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
});

const browserTest = (name, run) => test(name, { timeout: 90000 }, async (t) => {
  if (!enabled) return t.skip("Build My Day formatting assets and install Playwright Chromium to run the workspace browser tests");
  await run(t);
});

async function openWorkspace(width = 1280, height = 900) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 768 ? 2 : 1, isMobile: width < 768, hasTouch: width < 768 });
  await context.addInitScript((body) => {
    const key = "eduvora.joplin_notes:local";
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify([{
      id: "format-pipeline-stress-note",
      type_: 1,
      parent_id: "",
      title: "Formatting pipeline",
      body,
      is_todo: 0,
      todo_due: 0,
      todo_completed: 0,
      tag_ids: [],
      tag_titles: [],
      created_time: Date.now(),
      updated_time: Date.now(),
    }]));
  }, noteBody);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${origin}/index.html`);
  await page.waitForSelector('.nav-item[data-view="all"]');
  await page.locator('.nav-item[data-view="all"]').click();
  await page.waitForSelector(".note-card[data-note-id]");
  await page.locator(".note-card[data-note-id]").first().click();
  await page.waitForSelector("#editor-body-input");
  await page.waitForFunction(() => window.DCMyDayNoteFormatting && document.querySelector(".editor-preview"));
  return { page, context, errors };
}

browserTest("the actual workspace renders Markdown, KaTeX, tables, task state and literal fences safely", async () => {
  const { page, context, errors } = await openWorkspace();
  const preview = page.locator(".editor-preview");
  assert.equal(await preview.locator("h1").textContent(), "Stress note");
  assert.equal(await preview.locator("strong").count(), 1);
  assert.equal(await preview.locator("em").count(), 1);
  assert.equal(await preview.locator(".katex").count() >= 6, true, "Unicode inline expressions and display math all use KaTeX");
  assert.equal(await preview.locator(".myday-table-scroll > table").count(), 1);
  assert.equal(await preview.locator('li[data-checked="true"]').count(), 1);
  assert.equal(await preview.locator('li[data-checked="false"]').count(), 1);
  assert.match(await preview.locator("pre code").textContent(), /const source = \"\$x\^2\$\"/);
  assert.equal(await page.locator("script, iframe, [onclick], [onerror]").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

browserTest("Markdown save/reload/re-edit stays canonical; rich HTML paste and toolbar marks remain structural", async () => {
  const { page, context, errors } = await openWorkspace();
  const textarea = page.locator("#editor-body-input");
  await textarea.evaluate((node) => {
    node.focus();
    node.setSelectionRange(0, 5);
  });
  await page.locator('[data-action="bold"]').click();
  assert.match(await textarea.inputValue(), /^\*\*# Str/);
  assert.match(await page.evaluate(() => JSON.parse(localStorage.getItem("eduvora.joplin_notes:local"))[0].body), /^\*\*# Str/);

  await textarea.evaluate((node) => {
    const data = new DataTransfer();
    data.setData("text/html", '<h2>Pasted</h2><p><strong>rich</strong> H<sub>2</sub>O</p><ul><li><input type="checkbox" checked disabled> done</li></ul><script>window.__pwn=1</script>');
    data.setData("text/plain", "ignored");
    node.setSelectionRange(node.value.length, node.value.length);
    node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  const pasted = await textarea.inputValue();
  assert.match(pasted, /## Pasted/);
  assert.match(pasted, /\*\*rich\*\*/);
  assert.match(pasted, /H₂O/);
  assert.match(pasted, /- \[x\] done/);
  assert.doesNotMatch(pasted, /<script|ignored/);
  assert.equal(await page.evaluate(() => window.__pwn), undefined);
  await page.reload();
  await page.waitForSelector(".note-card[data-note-id]");
  await page.locator(".note-card[data-note-id]").first().click();
  await page.waitForSelector("#editor-body-input");
  assert.equal(await page.locator("#editor-body-input").inputValue(), pasted, "reload does not migrate Markdown into HTML");
  assert.equal(await page.locator(".editor-preview h2").textContent(), "Pasted");
  assert.deepEqual(errors, []);
  await context.close();
});

for (const width of [320, 390, 768, 1024, 1440]) {
  browserTest(`${width}px: editor, formatting toolbar, math and preview remain within the viewport`, async () => {
    const { page, context, errors } = await openWorkspace(width, width < 768 ? 820 : 900);
    const metrics = await page.evaluate(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, height: box.height };
      };
      return {
        doc: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        toolbar: rect(".editor-toolbar"),
        tools: rect(".editor-format-tools"),
        textarea: rect("#editor-body-input"),
        preview: rect(".editor-preview"),
        table: rect(".myday-table-scroll"),
      };
    });
    assert.ok(metrics.doc <= metrics.viewport + 1, `document overflow: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.toolbar.left >= 0 && metrics.toolbar.right <= metrics.viewport + 1, `toolbar outside viewport: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.tools.left >= 0 && metrics.tools.right <= metrics.viewport + 1, `format controls outside viewport: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.textarea.left >= 0 && metrics.textarea.right <= metrics.viewport + 1, `editor outside viewport: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.preview.left >= 0 && metrics.preview.right <= metrics.viewport + 1, `preview outside viewport: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.table.left >= 0 && metrics.table.right <= metrics.viewport + 1, `table wrapper outside viewport: ${JSON.stringify(metrics)}`);
    if (width < 768) assert.ok(metrics.tools.scrollWidth > metrics.tools.clientWidth, "the phone toolbar deliberately scrolls inside its own row instead of expanding the page");
    assert.deepEqual(errors, []);
    await context.close();
  });
}
