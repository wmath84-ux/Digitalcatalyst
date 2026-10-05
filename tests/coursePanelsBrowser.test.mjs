// tests/coursePanelsBrowser.test.mjs
//
// THE COURSE PLAYER'S SKETCH TAB AND READ UPLOADS IN A REAL BROWSER.
//
// tests/fixtures/coursePanelsHarness mounts the production components — the
// Sketch tab (SketchPanel + useCourseSketch + the real Excalidraw editor) and
// the Read library (ReadLibraryPanel + useReadUploads) — with only Firebase
// replaced by in-browser stubs. The stub "cloud" lives in sessionStorage, so
// a page reload behaves like a real one: the device copy (localStorage) and
// the cloud copy both survive, and the hook has to reconcile them.
//
// Needs Chromium (PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or Playwright's own);
// without it every test SKIPS with that reason.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";

const ROOT = process.cwd();
const FIXTURE = path.join(ROOT, "tests/fixtures/coursePanelsHarness");
const PAGE_HTML = path.join(FIXTURE, "coursePanels.html");
const STUBS = path.join(FIXTURE, "stubs");
const OUT = path.join(ROOT, `node_modules/.cache/course-panels-browser-${process.pid}`);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const enabled = fs.existsSync(executablePath);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

const browserTest = (name, fn) =>
  test(name, { timeout: 180000 }, async (t) => {
    if (!enabled) return t.skip("Install Chromium to run the real-browser Course Player panel tests");
    return fn(t);
  });

let browser;
let server;
let origin = "";

before(async () => {
  if (!enabled) return;
  const { build } = await import("vite");
  const { default: react } = await import("@vitejs/plugin-react");
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  fs.rmSync(OUT, { recursive: true, force: true });
  await build({
    root: ROOT,
    configFile: false,
    logLevel: "error",
    base: "./",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: /^firebase\/firestore$/, replacement: path.join(STUBS, "firestore.ts") },
        { find: /^firebase\/storage$/, replacement: path.join(STUBS, "storage.ts") },
        { find: /^\.\.\/\.\.\/firebase$/, replacement: path.join(STUBS, "firebaseApp.ts") },
        { find: /^\.\.\/context\/AuthContext$/, replacement: path.join(STUBS, "auth.tsx") },
        { find: "@", replacement: path.join(ROOT, "src") },
      ],
    },
    define: { "process.env.IS_PREACT": JSON.stringify("false") },
    build: { outDir: OUT, emptyOutDir: true, minify: false, cssMinify: false, rollupOptions: { input: [PAGE_HTML] } },
    css: { lightningcss: { errorRecovery: true } },
  });
  server = http.createServer((req, res) => {
    const file = path.join(OUT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.setHeader("content-type", MIME[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const extra = (process.env.PLAYWRIGHT_CHROMIUM_ARGS || "").split(/\s+/).filter(Boolean);
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", ...extra] });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  fs.rmSync(OUT, { recursive: true, force: true });
});

const PAGE = "/tests/fixtures/coursePanelsHarness/coursePanels.html";

/** Browser noise that is not an app error (the harness serves no fonts). */
const isNoise = (text) => /Failed to load resource|excalidraw-assets|font/i.test(text);

async function open(query, { width = 1440, height = 900, touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !isNoise(message.text())) problems.push(`console.error: ${message.text()}`);
  });
  await page.goto(`${origin}${PAGE}?${query}`);
  return { page, context, problems };
}

// ── Sketch helpers ─────────────────────────────────────────────────────────

const sketchState = (page) =>
  page.evaluate(() => {
    const ctl = window.__sketch;
    const row = document.querySelector("[data-course-sketch-status]");
    return {
      status: row?.getAttribute("data-course-sketch-status") ?? null,
      label: row?.querySelector('[role="status"]')?.textContent?.trim() ?? "",
      loading: ctl?.loading,
      count: ctl ? ctl.getScene().elements.filter((element) => !element.isDeleted).length : -1,
      types: ctl ? ctl.getScene().elements.filter((element) => !element.isDeleted).map((element) => element.type) : [],
      activeBoardKey: ctl?.activeBoardKey,
      boards: ctl ? ctl.boards.map((board) => board.sketchKey) : [],
      cloud: Object.fromEntries(
        Object.entries(window.__fs.store)
          .filter(([key]) => key.includes("/sketches/"))
          .map(([key, value]) => [key.split("/").pop(), JSON.parse(value.scene || "{}").elements?.filter((element) => !element.isDeleted).length ?? 0]),
      ),
    };
  });

async function waitForEditor(page) {
  await page.waitForSelector(".excalidraw canvas.interactive", { timeout: 60000 });
  await page.waitForFunction(() => window.__sketch && !window.__sketch.loading, null, { timeout: 30000 });
  await page.waitForTimeout(500);
}

/** Draw a shape with the real pointer: pick the tool in the toolbar, drag on the canvas. */
async function draw(page, tool, from, to) {
  const testId = { r: "toolbar-rectangle", o: "toolbar-ellipse" }[tool];
  await page.locator(`.excalidraw [data-testid="${testId}"]`).first().click();
  const box = await page.locator(".excalidraw canvas.interactive").boundingBox();
  // Shifted right, clear of the properties panel that opens on the left.
  const dx = 400;
  from = [from[0] + dx, from[1]];
  to = [to[0] + dx, to[1]];
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(50);
}

const waitForStatus = (page, status, timeout = 10000) =>
  page.waitForFunction((s) => document.querySelector("[data-course-sketch-status]")?.getAttribute("data-course-sketch-status") === s, status, { timeout });

// ── Sketch tests ───────────────────────────────────────────────────────────

browserTest("Sketch: a drawing autosaves (pending → saved), survives a reload, and the reload never blanks the cloud", async () => {
  const { page, context, problems } = await open("panel=sketch&module=m1");
  await waitForEditor(page);
  await draw(page, "r", [200, 200], [380, 320]);
  // Immediately after the stroke the state is honest: not "Saved" yet.
  const early = await sketchState(page);
  assert.equal(early.count, 1, "the rectangle is in the scene");
  assert.notEqual(early.status, "saved", "a fresh edit inside the debounce window is never reported as saved");
  await waitForStatus(page, "saved");
  assert.equal((await sketchState(page)).cloud.main ?? Object.values((await sketchState(page)).cloud)[0], 1, "the cloud document holds the rectangle");

  await page.reload();
  await waitForEditor(page);
  await page.waitForTimeout(1500); // longer than the debounce: any blank overwrite would have landed
  const reloaded = await sketchState(page);
  assert.equal(reloaded.count, 1, "the drawing is back after a refresh");
  assert.deepEqual(reloaded.types, ["rectangle"]);
  assert.equal(Object.values(reloaded.cloud)[0], 1, "the editor's first render did not write a blank board over the cloud");
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("Sketch: '+' makes a blank, auto-selected canvas; double-click makes one; canvases never overwrite each other", async () => {
  const { page, context, problems } = await open("panel=sketch&module=m1");
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.reload();
  await waitForEditor(page);
  await draw(page, "r", [150, 150], [300, 260]);
  await waitForStatus(page, "saved");
  const first = await sketchState(page);

  await page.locator("[data-course-sketch-new]").dblclick();
  await page.waitForTimeout(900);
  const created = await sketchState(page);
  assert.equal(created.boards.length, 2, "a double-click creates exactly one new canvas");
  assert.notEqual(created.activeBoardKey, first.activeBoardKey, "the new canvas is selected");
  assert.equal(created.count, 0, "the new canvas starts blank");
  assert.match(await page.locator("[data-course-sketch-board-switch]").innerText(), /Canvas 2/);

  await draw(page, "o", [250, 250], [420, 360]);
  await waitForStatus(page, "saved");
  assert.deepEqual((await sketchState(page)).types, ["ellipse"]);

  // Switch back through the switcher: each canvas keeps its own drawing.
  await page.locator("[data-course-sketch-board-switch]").click();
  await page.locator(`[data-course-sketch-board-option="${first.activeBoardKey}"]`).click();
  await page.waitForTimeout(800);
  assert.deepEqual((await sketchState(page)).types, ["rectangle"], "canvas 1 still holds the rectangle");
  await page.locator("[data-course-sketch-board-switch]").click();
  await page.locator(`[data-course-sketch-board-option="${created.activeBoardKey}"]`).click();
  await page.waitForTimeout(800);
  assert.deepEqual((await sketchState(page)).types, ["ellipse"], "canvas 2 still holds the ellipse");

  // Reopen: the last canvas used comes back selected, with both listed.
  await page.reload();
  await waitForEditor(page);
  const reopened = await sketchState(page);
  assert.equal(reopened.activeBoardKey, created.activeBoardKey);
  assert.equal(reopened.boards.length, 2);
  assert.deepEqual(reopened.types, ["ellipse"]);
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("Sketch: leaving mid-debounce (module switch / tab unmount) loses nothing", async () => {
  const { page, context, problems } = await open("panel=sketch&module=m1");
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.reload();
  await waitForEditor(page);
  await draw(page, "r", [200, 200], [320, 300]);
  await page.locator("[data-harness-module='m2']").click(); // inside the debounce window
  await waitForEditor(page);
  assert.equal((await sketchState(page)).count, 0, "module 2 has its own blank board");
  await draw(page, "o", [200, 200], [320, 300]);
  await page.locator("[data-harness-toggle]").click(); // unmount the tab immediately
  await page.waitForTimeout(1200);
  await page.locator("[data-harness-toggle]").click();
  await waitForEditor(page);
  assert.deepEqual((await sketchState(page)).types, ["ellipse"], "module 2's stroke survived the unmount");
  await page.locator("[data-harness-module='m1']").click();
  await waitForEditor(page);
  assert.deepEqual((await sketchState(page)).types, ["rectangle"], "module 1's stroke survived the module switch");
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("Sketch: a refused cloud write is shown with Retry, the device copy is kept, and Retry saves", async () => {
  const { page, context, problems } = await open("panel=sketch&module=m1");
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.reload();
  await waitForEditor(page);
  await page.evaluate(() => { window.__fs.control.failWrites = "unavailable"; });
  await draw(page, "r", [200, 200], [320, 300]);
  await waitForStatus(page, "error");
  assert.ok(await page.locator("[data-course-sketch-retry]").isVisible(), "Retry is offered");
  const label = (await sketchState(page)).label;
  assert.doesNotMatch(label, /^Saved$/);
  await page.evaluate(() => { window.__fs.control.failWrites = null; });
  await page.locator("[data-course-sketch-retry]").click();
  await waitForStatus(page, "saved");
  assert.equal(Object.values((await sketchState(page)).cloud)[0], 1);
  assert.deepEqual(problems, []);
  await context.close();
});

for (const [width, height, label] of [[360, 740, "phone"], [768, 1024, "tablet"], [1440, 900, "desktop"]]) {
  browserTest(`Sketch layout (${label} ${width}×${height}): '+', switcher and status fit; the menu stays on screen`, async () => {
    const { page, context, problems } = await open("panel=sketch&module=m1", { width, height, touch: width < 1024 });
    await waitForEditor(page);
    const fit = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
      const row = box("[data-course-sketch-status]");
      return {
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        row: row && { left: row.left, right: row.right, height: row.height },
        plus: box("[data-course-sketch-new]"),
        switcher: box("[data-course-sketch-board-switch]"),
        width: window.innerWidth,
      };
    });
    assert.ok(fit.overflowX <= 0, `no horizontal overflow (${fit.overflowX}px)`);
    assert.ok(fit.row.height <= 48, `the status row stays one line (${fit.row.height}px)`);
    for (const key of ["plus", "switcher"]) {
      assert.ok(fit[key] && fit[key].width > 0, `${key} is rendered`);
      assert.ok(fit[key].left >= 0 && fit[key].right <= fit.width, `${key} is fully on screen`);
    }
    assert.ok(fit.plus.width >= 24 && fit.plus.height >= 24, "the '+' is a real target");
    await page.locator("[data-course-sketch-board-switch]").click();
    const menu = await page.evaluate(() => document.querySelector("[data-course-sketch-board-menu]")?.getBoundingClientRect());
    assert.ok(menu && menu.left >= 0 && menu.right <= width && menu.bottom <= height, "the canvas menu is fully on screen");
    await page.keyboard.press("Escape");
    await page.screenshot({ path: path.join(ROOT, `node_modules/.cache/sketch-${label}.png`) });
    assert.deepEqual(problems, []);
    await context.close();
  });
}

// ── Read upload tests ──────────────────────────────────────────────────────

const pdfBytes = (size) => {
  const bytes = Buffer.alloc(size, 32);
  bytes.write("%PDF-1.7\n", 0, "latin1");
  return bytes;
};

async function openRead(options) {
  const opened = await open("panel=read", options);
  await opened.page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await opened.page.reload();
  await opened.page.waitForSelector("[data-course-read-panel]");
  return opened;
}

const pickFiles = async (page, files) => {
  await page.locator("[data-course-read-upload]").first().click();
  await page.waitForSelector("[data-course-read-compose]");
  await page.locator("[data-course-read-compose-input]").setInputFiles(files);
};

browserTest("Read: real progress climbs past 40 % to done; the PDF is listed; no duplicate upload path", async () => {
  const { page, context, problems } = await openRead();
  await page.evaluate(() => { window.__storage.mode = "auto"; window.__storage.chunks = 8; window.__storage.chunkMs = 150; });
  await pickFiles(page, [{ name: "Physics notes.pdf", mimeType: "application/pdf", buffer: pdfBytes(3 * 1024 * 1024) }]);
  await page.locator("[data-course-read-compose] button", { hasText: "Upload to my module" }).click();
  const seen = new Set();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(() => {
      const row = document.querySelector("[data-course-read-upload-progress]");
      return row ? { stage: row.getAttribute("data-stage"), now: row.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") } : null;
    });
    if (!snapshot) {
      if (seen.size) break;
    } else {
      seen.add(`${snapshot.stage}:${snapshot.now ?? "indeterminate"}`);
    }
    await page.waitForTimeout(40);
  }
  const percents = [...seen].filter((entry) => entry.startsWith("uploading:")).map((entry) => Number(entry.split(":")[1]));
  assert.ok(percents.some((value) => value > 40 && value < 100), `progress moved through the middle (${[...seen].join(", ")})`);
  assert.ok(Math.max(...percents) >= 80, `progress kept climbing (max ${Math.max(...percents)} %)`);
  // Success opens the new PDF in the reader (the library — and its notice —
  // sit behind it), so the notice is checked by presence, not visibility.
  await page.waitForSelector("[data-course-read-notice]", { state: "attached" });
  assert.match(await page.locator("[data-course-read-notice]").innerText(), /Physics notes/);
  assert.equal(await page.evaluate(() => window.__storage.uploadBytesCalls), 0, "no fallback uploadBytes race");
  assert.equal(await page.evaluate(() => window.__storage.tasks.length), 1);
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("Read: Cancel mid-upload resets cleanly, keeps the files, and a new upload is unaffected by the old one", async () => {
  const { page, context, problems } = await openRead({ width: 360, height: 740, touch: true });
  await page.evaluate(() => { window.__storage.mode = "manual"; });
  await pickFiles(page, [{ name: "Big.pdf", mimeType: "application/pdf", buffer: pdfBytes(2 * 1024 * 1024) }]);
  await page.locator("[data-course-read-compose] button", { hasText: "Upload to my module" }).click();
  await page.waitForFunction(() => window.__storage.tasks.length === 1);
  await page.evaluate(() => window.__storage.tasks[0].step(512 * 1024));
  await page.waitForFunction(() => document.querySelector("[data-course-read-compose] [data-course-read-upload-progress] [role=progressbar]")?.getAttribute("aria-valuenow") === "25");
  // Progress is visible INSIDE the compose sheet (which covers the library).
  assert.ok(await page.locator("[data-course-read-compose] [data-course-read-upload-progress]").isVisible());
  await page.locator("[data-course-read-compose] [data-course-read-upload-cancel]").click();
  await page.waitForTimeout(50);
  await page.waitForTimeout(200);
  assert.equal(await page.locator("[data-course-read-upload-progress]").count(), 0, "the progress row is gone");
  assert.equal(await page.locator("[data-course-read-upload-error]").count(), 0, "Cancel is not an error");
  assert.match(await page.locator("[data-course-read-compose]").innerText(), /Big\.pdf/, "the picked file is still there to resend");

  await page.evaluate(() => { window.__storage.mode = "auto"; });
  await page.locator("[data-course-read-compose] button", { hasText: "Upload to my module" }).click();
  await page.waitForSelector("[data-course-read-notice]", { state: "attached", timeout: 10000 });
  // The cancelled task fires late (as real SDK tasks can): nothing changes.
  await page.evaluate(() => window.__storage.tasks[0].complete());
  await page.waitForTimeout(200);
  assert.equal(await page.locator("[data-course-read-upload-error]").count(), 0);
  assert.equal(await page.locator("[data-course-read-upload-progress]").count(), 0);
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("Read: a fake PDF is refused before uploading, with a reason and no Retry", async () => {
  const { page, context, problems } = await openRead();
  await pickFiles(page, [{ name: "renamed.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>nope</html>") }]);
  await page.locator("[data-course-read-compose] button", { hasText: "Upload to my module" }).click();
  await page.waitForSelector("[data-course-read-compose] [data-course-read-upload-error]");
  assert.match(await page.locator("[data-course-read-compose] [data-course-read-upload-error]").innerText(), /not a real PDF/);
  assert.equal(await page.locator("[data-course-read-upload-retry]").count(), 0);
  assert.equal(await page.evaluate(() => window.__storage.tasks.length), 0, "no upload task was ever created");
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("Read: a library write that fails after the bytes landed → Retry finishes without re-uploading", async () => {
  const { page, context, problems } = await openRead();
  await page.evaluate(() => { window.__storage.mode = "auto"; window.__fs.control.failWrites = "unavailable"; });
  await pickFiles(page, [{ name: "Chem.pdf", mimeType: "application/pdf", buffer: pdfBytes(256 * 1024) }]);
  await page.locator("[data-course-read-compose] button", { hasText: "Upload to my module" }).click();
  await page.waitForSelector("[data-course-read-compose] [data-course-read-upload-retry]", { timeout: 10000 });
  assert.match(await page.locator("[data-course-read-compose] [data-course-read-upload-error]").innerText(), /will not upload again/);
  await page.evaluate(() => { window.__fs.control.failWrites = null; });
  await page.locator("[data-course-read-compose] [data-course-read-upload-retry]").click();
  await page.waitForSelector("[data-course-read-notice]", { state: "attached", timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__storage.tasks.length), 1, "the bytes were sent once");
  assert.equal(await page.evaluate(() => Object.keys(window.__fs.store).filter((key) => key.includes("/readUploads/")).length), 1, "the PDF is in the library");
  assert.deepEqual(problems, []);
  await context.close();
});
