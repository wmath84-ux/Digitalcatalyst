// tests/peekDockRevealBrowser.test.mjs
//
// REAL-BROWSER coverage for the two distinct navigation controls.
//
// DesktopShell still uses a reveal dock, so its pointer/touch tests protect the
// reported line-to-button interaction. Course Player now uses a regular,
// in-flow CoursePeekDock study strip instead of a reveal overlay; its tests
// assert that the strip is already visible in document flow and that pointer
// and touch clicks select the requested tab directly.
//
// Two fixture pages (tests/fixtures/peekDockHarness) mount the production
// components on the chrome production gives them:
//   · shell.html — the REAL DesktopShell (rail + page column + DesktopPeekDock),
//     with Firebase-backed contexts stubbed so nothing touches the network;
//   · harness.html?mode=course — the REAL CoursePeekDock inside a
//     `.course-player-shell` and the player's keyboard provider.
//
// Needs Chromium, like tests/noteEditorBrowser.test.mjs: install Playwright's
// (`npx playwright install chromium`) or point PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
// at one. Without it every test here SKIPS with that reason.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";

const ROOT = process.cwd();
const HARNESS = path.join(ROOT, "tests/fixtures/peekDockHarness/harness.html");
const SHELL = path.join(ROOT, "tests/fixtures/peekDockHarness/shell.html");
const STUBS = path.join(ROOT, "tests/fixtures/peekDockHarness/stubs");
const OUT = path.join(ROOT, `node_modules/.cache/peek-dock-browser-${process.pid}`);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const enabled = fs.existsSync(executablePath);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

const browserTest = (name, fn) =>
  test(name, { timeout: 120000 }, async (t) => {
    if (!enabled) return t.skip("Install Chromium to run the real-browser peek dock tests");
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
      alias: {
        "@": path.join(ROOT, "src"),
        // The shell harness renders the real chrome; only the Firebase-backed
        // contexts are stubbed (they need a live project).
        "../context/AuthContext": path.join(STUBS, "auth.tsx"),
        "../context/BrandingContext": path.join(STUBS, "branding.tsx"),
        "../context/CommerceContext": path.join(STUBS, "commerce.tsx"),
        "../context/CatalogContext": path.join(STUBS, "catalog.tsx"),
        "../context/FeatureVisibilityContext": path.join(STUBS, "featureVisibility.tsx"),
        "../hooks/useUnreadNotificationCount": path.join(STUBS, "unread.ts"),
        "@/context/BrandingContext": path.join(STUBS, "branding.tsx"),
      },
    },
    build: { outDir: OUT, emptyOutDir: true, minify: false, cssMinify: false, rollupOptions: { input: [HARNESS, SHELL] } },
    css: { lightningcss: { errorRecovery: true } },
  });
  server = http.createServer((req, res) => {
    const file = path.join(OUT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end("not found"); return; }
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

// ── The two docks' selectors ───────────────────────────────────────────────

const DESKTOP = {
  page: "/tests/fixtures/peekDockHarness/shell.html",
  root: "[data-desktop-peek-dock]",
  line: "[data-desktop-peek-line]",
  panel: "[data-desktop-peek-panel]",
  item: "[data-glass-dock-item]",
};
const COURSE = {
  page: "/tests/fixtures/peekDockHarness/harness.html?mode=course",
  root: "[data-course-strip-nav]",
  item: "[data-course-strip]",
};

async function openPage(dock, { width = 1440, height = 900, touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console.error: ${message.text()}`); });
  await page.goto(`${origin}${dock.page}`);
  await page.waitForSelector(dock.root);
  await page.waitForTimeout(600);
  return { page, context, problems };
}

const rectOf = (page, selector) =>
  page.evaluate((s) => {
    const box = document.querySelector(s)?.getBoundingClientRect();
    return box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height } : null;
  }, selector);

const rectsOf = (page, selector) =>
  page.evaluate((s) =>
    Array.from(document.querySelectorAll(s)).map((element) => {
      const box = element.getBoundingClientRect();
      return { id: element.getAttribute("data-glass-dock-item"), top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    }), selector);

const isOpen = (page, root) => page.evaluate((s) => document.querySelector(s)?.getAttribute("data-open") === "true", root);

// ── Tests ──────────────────────────────────────────────────────────────────

browserTest("desktop: the pointer walks from the line to a button, clicks it, and the dock stays open the whole way", async () => {
  const { page, context, problems } = await openPage(DESKTOP);
  const line = await rectOf(page, DESKTOP.line);
  const lx = (line.left + line.right) / 2;
  const ly = line.bottom - 2;

  await page.mouse.move(lx, ly, { steps: 3 });
  await page.waitForTimeout(400);
  assert.equal(await isOpen(page, DESKTOP.root), true, "hovering the line reveals the dock");

  // The dock's buttons, at their open positions.
  const items = await rectsOf(page, DESKTOP.item);
  const target = items[2];
  const tx = (target.left + target.right) / 2;
  const ty = (target.top + target.bottom) / 2;

  // Every 3px of the walk: still open. (Before the fix, the leave on the line
  // could commit a close before the panel's enter cancelled it.)
  for (let y = Math.round(ly); y >= Math.round(ty); y -= 3) {
    await page.mouse.move(lx, y);
    assert.equal(await isOpen(page, DESKTOP.root), true, `the dock hid at y=${y} while travelling to the buttons`);
  }
  assert.equal(await isOpen(page, DESKTOP.root), true);

  // And the button under the pointer is really clickable.
  await page.mouse.click(tx, ty);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.location.hash), "#/store", "clicking the button under the pointer navigates");
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("desktop: a leave that reaches the line while the pointer is over the buttons does not hide the dock", async () => {
  const { page, context } = await openPage(DESKTOP);
  const line = await rectOf(page, DESKTOP.line);
  const lx = (line.left + line.right) / 2;
  const ly = line.bottom - 2;
  await page.mouse.move(lx, ly, { steps: 3 });
  await page.waitForTimeout(400);

  const items = await rectsOf(page, DESKTOP.item);
  const target = items[2];
  const tx = (target.left + target.right) / 2;
  const ty = (target.top + target.bottom) / 2;
  await page.mouse.move(tx, ty);
  await page.waitForTimeout(120);

  // Force the reported event order: a leave on the LINE while the pointer is
  // physically over the panel (a touch/pen drag reports exactly this, and so
  // does a fractional-pixel seam). The area rule must keep the dock open.
  await page.evaluate(({ lineSel, x, y }) => {
    const lineElement = document.querySelector(lineSel);
    lineElement.dispatchEvent(new PointerEvent("pointerout", {
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
      clientX: x,
      clientY: y,
      relatedTarget: document.body,
    }));
  }, { lineSel: DESKTOP.line, x: tx, y: ty });

  await page.waitForTimeout(400); // well past the 80ms grace
  assert.equal(await isOpen(page, DESKTOP.root), true, "a leave on the line must not hide a dock the pointer is inside");
  await context.close();
});

browserTest("desktop: press on the line, drag onto a button, release — that button is clicked", async () => {
  const { page, context } = await openPage(DESKTOP);
  const line = await rectOf(page, DESKTOP.line);
  const lx = (line.left + line.right) / 2;
  const ly = line.bottom - 2;

  await page.mouse.move(lx, ly, { steps: 3 });
  await page.waitForTimeout(400);
  const items = await rectsOf(page, DESKTOP.item);
  const target = items[4] ?? items[items.length - 1];
  const tx = (target.left + target.right) / 2;
  const ty = (target.top + target.bottom) / 2;

  await page.mouse.down();
  for (let y = Math.round(ly); y >= Math.round(ty); y -= 4) {
    await page.mouse.move(tx + ((lx - tx) * (y - ly)) / (ty - ly || 1), y);
    assert.equal(await isOpen(page, DESKTOP.root), true, `the dock hid mid-drag at y=${y}`);
  }
  await page.mouse.move(tx, ty);
  await page.mouse.up();
  await page.waitForTimeout(400);

  assert.match(await page.evaluate(() => window.location.hash), /^#\//, "the release on a button ships that button's click");
  await context.close();
});

browserTest("desktop: the dock hides once the pointer really leaves the area", async () => {
  const { page, context } = await openPage(DESKTOP);
  const line = await rectOf(page, DESKTOP.line);
  const lx = (line.left + line.right) / 2;
  await page.mouse.move(lx, line.bottom - 2);
  await page.waitForTimeout(400);
  assert.equal(await isOpen(page, DESKTOP.root), true);

  // Up and away, well above the dock: a real exit.
  await page.mouse.move(lx, 300, { steps: 8 });
  await page.waitForTimeout(500);
  assert.equal(await isOpen(page, DESKTOP.root), false, "leaving the interaction area hides the dock");
  await context.close();
});

browserTest("desktop touch: tapping the line pins the dock open, and a tap on a button selects it", async () => {
  const { page, context, problems } = await openPage(DESKTOP, { touch: true });
  const line = await rectOf(page, DESKTOP.line);
  const lx = Math.round((line.left + line.right) / 2);
  const ly = Math.round(line.bottom - 2);

  await page.touchscreen.tap(lx, ly);
  await page.waitForTimeout(150);
  assert.equal(await isOpen(page, DESKTOP.root), true, "a tap on the line reveals the dock");
  // The old behaviour: a synthetic leave fires at the end of the contact and
  // the dock flashed closed again ~80ms later. It must stay.
  await page.waitForTimeout(700);
  assert.equal(await isOpen(page, DESKTOP.root), true, "the touch tap must not be swallowed by a synthetic leave");

  const items = await rectsOf(page, DESKTOP.item);
  const target = items[2];
  await page.touchscreen.tap(Math.round((target.left + target.right) / 2), Math.round((target.top + target.bottom) / 2));
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.location.hash), "#/store", "tapping a button selects it");
  assert.equal(await isOpen(page, DESKTOP.root), false, "a selection ends the touch gesture");
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("course: the study strip is in flow on load and a pointer click selects a tab directly", async () => {
  const { page, context, problems } = await openPage(COURSE);
  const layout = await page.evaluate((selector) => {
    const nav = document.querySelector(selector);
    const body = document.querySelector(".course-player-shell > p");
    const rect = nav.getBoundingClientRect();
    return {
      position: getComputedStyle(nav).position,
      height: rect.height,
      top: rect.top,
      bodyBottom: body.getBoundingClientRect().bottom,
      legacyOverlay: Boolean(document.querySelector("[data-course-peek-dock], [data-course-peek-line-hit]")),
    };
  }, COURSE.root);
  assert.equal(layout.position, "static", "the Course Player strip is a normal in-flow footer, not an overlay");
  assert.ok(layout.height >= 44, "the strip has a usable touch target height");
  assert.ok(layout.top >= layout.bodyBottom, "the strip follows its content instead of covering it");
  assert.equal(layout.legacyOverlay, false, "the retired reveal dock is not mounted for Course Player");
  assert.equal(await page.locator(COURSE.root).isVisible(), true, "the strip is visible without hovering or tapping a reveal line");

  await page.locator('[data-course-strip="modules"]').focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-course-strip")), "brain");
  await page.locator('[data-course-strip="notes"]').click();
  assert.deepEqual(await page.evaluate(() => window.__selected), ["notes"], "the clicked tab is selected immediately");
  assert.equal(await page.locator('[data-course-strip="notes"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("course touch: one direct tap on the visible study strip selects a tab", async () => {
  const { page, context, problems } = await openPage(COURSE, { touch: true });
  assert.equal(await page.locator(COURSE.root).isVisible(), true, "the touch layout needs no pin/reveal tap");
  const target = await rectOf(page, '[data-course-strip="notes"]');
  await page.touchscreen.tap(Math.round((target.left + target.right) / 2), Math.round((target.top + target.bottom) / 2));
  assert.deepEqual(await page.evaluate(() => window.__selected), ["notes"], "the tap selects the tab");
  assert.equal(await page.locator('[data-course-strip="notes"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual(problems, []);
  await context.close();
});
