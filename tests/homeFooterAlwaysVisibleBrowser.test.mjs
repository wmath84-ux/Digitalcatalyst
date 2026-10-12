// tests/homeFooterAlwaysVisibleBrowser.test.mjs
//
// THE HOME FOOTER IN A REAL BROWSER. Owner brief 2026-10-05:
//
//   "Home page footer navigation must always be visible by default. Currently
//    it is minimized and appears only after dragging the line or tapping it."
//
// Fixture pages render production components with production CSS. The
// classic-dock coverage explicitly selects the preserved `glass-dock` setting;
// the default Uiverse capsule gets its own first-load/mobile/tablet coverage.
//   · homeFooter.html?page=home — `<BottomNav active="home" peek peekAlwaysOpen>`
//     inside Home's frame/main structure, plus the real clearance publisher;
//   · shell.html#/home — DesktopShell + DesktopPeekDock on Home at desktop
//     and tablet-landscape widths (desktop peek remains unchanged).
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
const FIXTURES = path.join(ROOT, "tests/fixtures/peekDockHarness");
const HOME = path.join(FIXTURES, "homeFooter.html");
const SHELL = path.join(FIXTURES, "shell.html");
const STUBS = path.join(FIXTURES, "stubs");
const OUT = path.join(ROOT, `node_modules/.cache/home-footer-browser-${process.pid}`);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const enabled = fs.existsSync(executablePath);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

const browserTest = (name, fn) =>
  test(name, { timeout: 120000 }, async (t) => {
    if (!enabled) return t.skip("Install Chromium to run the real-browser Home footer tests");
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
        "../context/AuthContext": path.join(STUBS, "auth.tsx"),
        "../context/BrandingContext": path.join(STUBS, "branding.tsx"),
        "../context/CommerceContext": path.join(STUBS, "commerce.tsx"),
        "../context/CatalogContext": path.join(STUBS, "catalog.tsx"),
        "../context/FeatureVisibilityContext": path.join(STUBS, "featureVisibility.tsx"),
        "../hooks/useUnreadNotificationCount": path.join(STUBS, "unread.ts"),
        "@/context/BrandingContext": path.join(STUBS, "branding.tsx"),
      },
    },
    build: { outDir: OUT, emptyOutDir: true, minify: false, cssMinify: false, rollupOptions: { input: [HOME, SHELL] } },
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

const HOME_PAGE = "/tests/fixtures/peekDockHarness/homeFooter.html";
const SHELL_PAGE = "/tests/fixtures/peekDockHarness/shell.html";

async function open(url, { width = 360, height = 740, touch = true, footerStyle } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  if (footerStyle) {
    await context.addInitScript((style) => localStorage.setItem("dc-footer-navigation-style", style), footerStyle);
  }
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console.error: ${message.text()}`);
  });
  await page.goto(`${origin}${url}`);
  await page.waitForTimeout(700);
  return { page, context, problems };
}

/** The site footer's visible state, measured — not just its attribute. */
const footerState = (page) =>
  page.evaluate(() => {
    const nav = document.querySelector("[data-site-peek-dock]");
    const panel = document.querySelector("[data-site-peek-panel]");
    const items = Array.from(document.querySelectorAll("[data-site-peek-panel] [data-glass-dock-item]")).map((node) => {
      const box = node.getBoundingClientRect();
      return { id: node.getAttribute("data-glass-dock-item"), left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
    });
    const style = panel ? getComputedStyle(panel) : null;
    const box = panel?.getBoundingClientRect();
    return {
      open: nav?.getAttribute("data-open"),
      alwaysOpen: nav?.getAttribute("data-always-open"),
      opacity: style ? Number(style.opacity) : 0,
      panelTop: box?.top ?? 0,
      panelHeight: box?.height ?? 0,
      inert: panel?.hasAttribute("inert") ?? true,
      ariaHidden: panel?.getAttribute("aria-hidden"),
      clearance: getComputedStyle(document.documentElement).getPropertyValue("--dc-footer-nav-h").trim(),
      items,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });

const assertVisible = (state, where) => {
  assert.equal(state.open, "true", `${where}: the footer is open`);
  assert.ok(state.opacity > 0.99, `${where}: the dock is fully opaque (got ${state.opacity})`);
  assert.ok(state.panelHeight > 40, `${where}: the dock has its full height (got ${state.panelHeight})`);
  assert.equal(state.inert, false, `${where}: the dock is interactive`);
  assert.equal(state.items.length, 7, `${where}: all seven tabs render`);
  for (const item of state.items) {
    assert.ok(item.left >= -0.5 && item.right <= state.viewport.width + 0.5, `${where}: tab ${item.id} is fully on screen (${item.left}–${item.right})`);
    assert.ok(item.bottom <= state.viewport.height + 0.5 && item.top >= 0, `${where}: tab ${item.id} is inside the viewport vertically`);
  }
};

const scrollToEnd = (page) =>
  page.evaluate(() => {
    const main = document.querySelector("[data-harness-main]");
    if (main) main.scrollTop = main.scrollHeight;
    window.scrollTo(0, document.documentElement.scrollHeight);
  });

// ── Phone / tablet (the site footer) ───────────────────────────────────────

browserTest("Home, phone and portrait tablet: the default Uiverse footer is visible and Profile shortcuts work", async () => {
  const { page, context, problems } = await open(`${HOME_PAGE}?page=home`);
  for (const [width, height] of [[360, 740], [768, 1024]]) {
    await page.setViewportSize({ width, height });
    const nav = page.locator('[data-footer-nav-design="uiverse"]');
    await nav.waitFor();
    const capsule = await nav.locator("[data-site-footer]").boundingBox();
    assert.equal(await nav.locator("[data-uiverse-tab]").count(), 4);
    assert.ok(capsule && capsule.height > 40, `the Uiverse capsule is painted at ${width}px`);
    assert.ok(capsule.y >= 0 && capsule.y + capsule.height <= height + 1, `the capsule fits inside ${width}×${height}`);
    const clearance = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dc-footer-nav-h")));
    assert.ok(clearance >= capsule.height, `measured clearance ${clearance}px covers the ${capsule.height}px Uiverse capsule`);
  }

  await page.setViewportSize({ width: 390, height: 800 });
  const nav = page.locator('[data-footer-nav-design="uiverse"]');
  const profile = nav.locator('[data-uiverse-tab="profile"]');
  await profile.tap();
  const menu = nav.locator(".dc-uiverse-profile-menu");
  await menu.waitFor();
  assert.equal(await menu.getAttribute("data-open"), "true");
  assert.deepEqual(
    await menu.getByRole("menuitem").allTextContents(),
    ["My Day", "My Study Library", "Revision", "FlowPath"],
  );
  await menu.getByRole("menuitem", { name: "My Day" }).tap();
  await page.waitForFunction(() => window.location.hash === "#/my-day");
  assert.equal(await menu.getAttribute("data-open"), "false");
  await profile.tap();
  await profile.tap();
  await page.waitForFunction(() => window.location.hash === "#/profile");
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("Home, phone: the preserved classic footer is visible on first load when selected", async () => {
  const { page, context, problems } = await open(`${HOME_PAGE}?page=home`, { footerStyle: "glass-dock" });
  const state = await footerState(page);
  assertVisible(state, "first load");
  assert.equal(state.alwaysOpen, "true");
  assert.notEqual(state.ariaHidden, "true", "assistive tech sees the navigation");
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("Home, phone: the selected classic footer stays open after tab, outside taps and scrolling", async () => {
  const { page, context, problems } = await open(`${HOME_PAGE}?page=home`, { footerStyle: "glass-dock" });
  const state = await footerState(page);
  const store = state.items.find((item) => item.id === "store");
  await page.touchscreen.tap((store.left + store.right) / 2, (store.top + store.bottom) / 2);
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => window.__selected), ["store"], "one tap on a tab is enough");
  assertVisible(await footerState(page), "after a tab tap");

  assert.equal(await page.locator("[data-site-peek-line]").count(), 0, "the always-open dock has no reveal line");

  await page.touchscreen.tap(180, 200); // somewhere in the page
  await page.waitForTimeout(250);
  assertVisible(await footerState(page), "after an outside tap");

  await scrollToEnd(page);
  await page.waitForTimeout(250);
  assertVisible(await footerState(page), "after scrolling to the end");
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("Home, phone: the measured clearance keeps the last content clear of the dock", async () => {
  const { page, context } = await open(`${HOME_PAGE}?page=home`, { footerStyle: "glass-dock" });
  await scrollToEnd(page);
  await page.waitForTimeout(400);
  const state = await footerState(page);
  const clearance = Number.parseFloat(state.clearance);
  assert.ok(clearance >= state.panelHeight, `--dc-footer-nav-h (${state.clearance}) covers the open dock (${state.panelHeight}px)`);
  const last = await page.evaluate(() => document.querySelector("[data-harness-last]").getBoundingClientRect().bottom);
  assert.ok(last <= state.panelTop, `the last tappable element (bottom ${last}) ends above the dock (top ${state.panelTop})`);
  await context.close();
});

browserTest("Home: rotation, tablet widths and a keyboard-sized viewport never collapse the footer", async () => {
  const { page, context, problems } = await open(`${HOME_PAGE}?page=home`, { footerStyle: "glass-dock" });
  for (const [width, height, label] of [
    // (Phone landscape is portrait-locked outside the Course Player, and the
    // 640–1023 px landscape band hands navigation to the desktop shell —
    // covered by the desktop test below.)
    [600, 960, "small tablet portrait"],
    [768, 1024, "tablet portrait"],
    [360, 380, "phone with the on-screen keyboard up"],
    [320, 640, "narrow phone"],
    [360, 740, "back to portrait"],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    assertVisible(await footerState(page), label);
  }
  await page.focus("[data-harness-input]");
  await page.keyboard.type("physics");
  await page.waitForTimeout(200);
  assertVisible(await footerState(page), "while typing");
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("Home: optional drag across the selected classic dock still picks the released tab", async () => {
  const { page, context } = await open(`${HOME_PAGE}?page=home`, { touch: false, width: 420, height: 800, footerStyle: "glass-dock" });
  const initial = await footerState(page);
  const source = initial.items.find((item) => item.id === "home");
  const target = initial.items.find((item) => item.id === "purchases");
  const start = { x: (source.left + source.right) / 2, y: (source.top + source.bottom) / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((target.left + target.right) / 2, start.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => window.__selected), ["purchases"], "drag-to-select picks the tab under the release");

  // Hash-routed tabs (Revision / FlowPath / Study Library) go through the URL.
  const revision = (await footerState(page)).items.find((item) => item.id === "revision");
  const current = (await footerState(page)).items.find((item) => item.id === "home");
  const nextStart = { x: (current.left + current.right) / 2, y: (current.top + current.bottom) / 2 };
  await page.mouse.move(nextStart.x, nextStart.y);
  await page.mouse.down();
  await page.mouse.move((revision.left + revision.right) / 2, nextStart.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.location.hash), "#/revision");
  assertVisible(await footerState(page), "after the drag");
  await context.close();
});

browserTest("My Day keeps its peek footer (the change is Home-only)", async () => {
  const { page, context } = await open(`${HOME_PAGE}?page=myday`, { footerStyle: "glass-dock" });
  const state = await footerState(page);
  assert.equal(state.open, "false");
  assert.equal(state.alwaysOpen, null);
  assert.equal(state.inert, true);
  await context.close();
});

// ── Desktop / tablet-landscape (the shell's dock) ──────────────────────────

const desktopState = (page) =>
  page.evaluate(() => {
    const host = document.querySelector("[data-desktop-peek-dock]");
    const panel = document.querySelector("[data-desktop-peek-panel]");
    const box = panel?.getBoundingClientRect();
    return {
      open: host?.getAttribute("data-open"),
      alwaysOpen: host?.getAttribute("data-always-open"),
      opacity: panel ? Number(getComputedStyle(panel).opacity) : 0,
      panelTop: box?.top ?? 0,
      panelHeight: box?.height ?? 0,
      clearanceAttr: document.querySelector("[data-desktop-content]")?.getAttribute("data-desktop-dock-clearance") ?? null,
    };
  });

browserTest("Home, desktop: the shell preserves its existing hover-to-reveal dock", async () => {
  const { page, context, problems } = await open(`${SHELL_PAGE}#/home`, { width: 1440, height: 900, touch: false });
  let state = await desktopState(page);
  assert.equal(state.open, "false", "the desktop dock remains a peek line on Home");
  assert.equal(state.alwaysOpen, null);
  assert.equal(state.clearanceAttr, null, "the closed peek dock reserves no content band");

  await page.locator("[data-desktop-peek-line]").hover();
  await page.waitForFunction(() => document.querySelector("[data-desktop-peek-dock]")?.getAttribute("data-open") === "true");
  await page.waitForTimeout(250);
  state = await desktopState(page);
  assert.ok(state.opacity > 0.99 && state.panelHeight > 40, "the hover reveals the real dock");
  await page.mouse.move(700, 300);
  await page.waitForTimeout(400);
  assert.equal((await desktopState(page)).open, "false", "leaving the interaction area returns to the peek line");
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("desktop, not Home: the dock is still a peek line and reserves nothing", async () => {
  const { page, context } = await open(`${SHELL_PAGE}#/leaderboard`, { width: 1440, height: 900, touch: false });
  const state = await desktopState(page);
  assert.equal(state.open, "false", "the leaderboard lights the Home rail entry but is not Home");
  assert.equal(state.alwaysOpen, null);
  assert.equal(state.clearanceAttr, null);
  await context.close();
});
