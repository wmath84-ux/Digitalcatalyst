// Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome node --test tests/collectionCardsBrowser.test.mjs
// Real React components + the production Tailwind/global CSS. Only account and
// data hooks are stubbed, so no Firebase credentials or live purchases are used.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const enabled = fs.existsSync(executablePath);
let server, browser, origin;
before(async () => {
  if (!enabled) return;
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    resolve: { alias: { "@": path.resolve("src") } },
    plugins: [react(), tailwindcss(), {
      name: "collection-fixture-data",
      enforce: "pre",
      resolveId(id) {
        if (/\/(CatalogContext|useCourseAccess|myCourseClient)$/.test(id)) return `\0fixture:${id.split("/").at(-1)}`;
      },
      load(id) {
        if (id === "\0fixture:CatalogContext") return `import { products } from '/tests/fixtures/collectionCardsHarness/products.ts'; export const useCatalog = () => ({ products });`;
        if (id === "\0fixture:useCourseAccess") return `export const useOwnedProducts = () => ({ ownedProductIds: [], signedIn: false });export const useCourseAccess=()=>({loading:false,hasActiveSubscription:false,subscription:null,resolution:{hasFullProductAccess:false,accessibleModuleIds:new Set(),accessibleResourceIds:new Set(),ownedModuleIds:new Set(),ownedResourceIds:new Set(),ownedUpdateIds:new Set()}});`;
        if (id === "\0fixture:myCourseClient") return `export const countModules = modules => modules.length; export const countResources = () => 0;`;
      },
    }],
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
});
after(async () => { await browser?.close(); await server?.close(); });
const check = (name, fn) => test(name, { timeout: 180000 }, async t => {
  if (!enabled) return t.skip("Install Chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
  await fn();
});
async function open(pageName, width = 820, height = 1180, theme = "dark") {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${origin}/tests/fixtures/collectionCardsHarness/index.html?page=${pageName}`);
  await page.locator(pageName === "library" ? "[data-purchase-entry]" : ".dc-collection-card").first().waitFor();
  if (theme === "light") {
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  }
  await page.evaluate(() => document.fonts.ready);
  return page;
}

check("cards stay compact, readable and contained across tablet widths and rotation", async () => {
  for (const pageName of ["library", "favorites", "cart", "study"]) {
    const page = await open(pageName);
    for (const [width, height] of [[320, 740], [390, 844], [600, 960], [640, 960], [768, 1024], [800, 1280], [820, 1180], [834, 1194], [912, 1368], [960, 640], [1024, 768], [1180, 820], [1280, 800], [1366, 1024], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      // Also cover a desktop rail taking space from the landscape content.
      await page.evaluate(({ width, height }) => {
        document.documentElement.style.setProperty("--fixture-width", width > height && width >= 640 ? `${width - 260}px` : "100%");
      }, { width, height });
      if (pageName === "library") {
        const rowIssues = await page.locator("[data-purchase-entry]").evaluateAll(rows => rows.flatMap(row => {
          const button = row.querySelector("button"); const rect = row.getBoundingClientRect(); const action = button.getBoundingClientRect();
          return row.scrollWidth > row.clientWidth + 1 || action.width > rect.width + 1 || action.height < 44 ? ["purchase row overflow or undersized action"] : [];
        }));
        assert.deepEqual(rowIssues, [], `library at ${width}×${height}`);
        continue;
      }
      const problems = await page.locator(".dc-collection-card").evaluateAll(cards => cards.flatMap(card => {
        const issues = [];
        const rect = card.getBoundingClientRect();
        const media = card.querySelector(".dc-collection-media").getBoundingClientRect();
        const image = card.querySelector("img").getBoundingClientRect();
        const body = card.querySelector(".dc-collection-body").getBoundingClientRect();
        const title = card.querySelector(".dc-collection-title");
        const style = getComputedStyle(title);
        if (Math.abs(image.width - media.width) > 1 || Math.abs(image.height - media.height) > 1) issues.push("image does not fill cover");
        if (Math.abs(media.width / media.height - 4 / 3) > .02) issues.push("cover aspect ratio lost");
        if (!card.classList.contains("dc-cart-card") && Math.abs(body.top - media.bottom) > 1) issues.push("gap between artwork and copy");
        if (parseFloat(style.fontSize) !== 15 || style.textShadow !== "none") issues.push("tablet heading override/stroke returned");
        if (card.scrollWidth > card.clientWidth + 1) issues.push("card content overflows horizontally");
        if (body.bottom > rect.bottom + 1) issues.push("copy clipped by card");
        if (!card.classList.contains("dc-cart-card") && rect.bottom - body.bottom > 2) issues.push("card stretched beyond its content");
        for (const button of card.querySelectorAll(".dc-collection-actions > button, .dc-collection-watch, .dc-cart-remove")) {
          const box = button.getBoundingClientRect();
          if (box.height < 43 || box.left < rect.left || box.right > rect.right || box.bottom > rect.bottom) issues.push("action clipped or too short");
          // Nested glass labels must fit their own content boxes as well.
          for (const label of button.querySelectorAll("span")) {
            if (label.scrollWidth > label.clientWidth + 1 && getComputedStyle(label).display !== "inline") issues.push("button label clipped");
          }
        }
        return issues;
      }));
      assert.deepEqual(problems, [], `${pageName} at ${width}×${height}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${pageName} page overflow at ${width}`);
    }
    if (process.env.COLLECTION_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.COLLECTION_SCREENSHOT_DIR, { recursive: true });
      await page.setViewportSize({ width: 820, height: 1180 });
      await page.evaluate(() => document.documentElement.style.setProperty("--fixture-width", "100%"));
      await page.screenshot({ path: path.join(process.env.COLLECTION_SCREENSHOT_DIR, `${pageName}-820.png`), fullPage: true });
    }
    // Flat/kill-switch mode keeps the same readable layout.
    await page.evaluate(() => document.documentElement.dataset.glass = "off");
    assert.equal(await page.locator(pageName === "library" ? ".dc-purchases-title" : ".dc-collection-title").first().evaluate(el => getComputedStyle(el).textShadow), "none");
    await page.close();
  }
});

check("cart checkout clears the mobile footer at every width and desktop uses a two-column order summary", async () => {
  const mobile = await open("cart-shell", 320, 568);
  await mobile.waitForFunction(() => {
    const nav = document.querySelector("[data-site-footer-nav]");
    const content = document.querySelector("[data-cart-wishlist-content]");
    return Boolean(nav && content && nav.getBoundingClientRect().height > 0 && parseFloat(getComputedStyle(content).paddingBottom) >= 88);
  });

  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932], [640, 960], [768, 1024], [834, 1112], [959, 1200]]) {
    await mobile.setViewportSize({ width, height });
    await mobile.waitForTimeout(70);
    const geometry = await mobile.evaluate(() => {
      const bar = document.querySelector("[data-cart-checkout-bar]").getBoundingClientRect();
      const nav = document.querySelector("[data-site-footer-nav]").getBoundingClientRect();
      const button = document.querySelector("[data-cart-checkout]").getBoundingClientRect();
      const frame = document.querySelector("[data-app-frame]").getBoundingClientRect();
      return { barBottom: bar.bottom, navTop: nav.top, buttonLeft: button.left, buttonRight: button.right, frameLeft: frame.left, frameRight: frame.right };
    });
    assert.ok(geometry.barBottom <= geometry.navTop + 1, `checkout bar clears footer at ${width}×${height}: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.buttonLeft >= geometry.frameLeft - 1 && geometry.buttonRight <= geometry.frameRight + 1, `checkout action fits at ${width}×${height}: ${JSON.stringify(geometry)}`);
  }

  // API 35 edge-to-edge WebViews can report a zero CSS inset. The native
  // response marks that band so the nav capsule is still lifted clear of the
  // 3-button system bar, and the cart follows the re-measured height.
  await mobile.setViewportSize({ width: 390, height: 844 });
  const beforeEdgeInset = await mobile.locator("[data-site-footer-nav]").evaluate((nav) => nav.getBoundingClientRect().height);
  await mobile.evaluate(() => { document.documentElement.dataset.androidEdgeToEdge = "true"; });
  await mobile.waitForTimeout(150);
  const edgeGeometry = await mobile.evaluate(() => {
    const nav = document.querySelector("[data-site-footer-nav]");
    const content = document.querySelector("[data-cart-wishlist-content]");
    return {
      navHeight: nav.getBoundingClientRect().height,
      navTop: nav.getBoundingClientRect().top,
      navPadding: parseFloat(getComputedStyle(nav).paddingBottom),
      contentPadding: parseFloat(getComputedStyle(content).paddingBottom),
      checkoutBottom: document.querySelector("[data-cart-checkout-bar]").getBoundingClientRect().bottom,
    };
  });
  assert.ok(edgeGeometry.navPadding >= 24, `edge-to-edge CSS reserves the system navigation strip: ${JSON.stringify(edgeGeometry)}`);
  assert.ok(edgeGeometry.navHeight >= beforeEdgeInset + 13, `edge-to-edge fallback reserves nav height if env() is zero: ${JSON.stringify(edgeGeometry)}`);
  assert.ok(edgeGeometry.contentPadding >= edgeGeometry.navHeight - 1, `Cart receives the re-measured footer height: ${JSON.stringify(edgeGeometry)}`);
  assert.ok(edgeGeometry.checkoutBottom <= edgeGeometry.navTop + 1, `checkout stays above the lifted system navigation: ${JSON.stringify(edgeGeometry)}`);
  await mobile.close();

  const desktop = await open("cart-desktop", 1280, 900);
  for (const [width, height] of [[900, 600], [959, 600], [960, 720], [1024, 768], [1280, 800], [1600, 1000]]) {
    await desktop.setViewportSize({ width, height });
    const layout = await desktop.evaluate(() => {
      const row = document.querySelector("[data-cart-row]");
      const items = document.querySelector("[data-cart-items]").getBoundingClientRect();
      const summary = document.querySelector("[data-cart-summary]").getBoundingClientRect();
      const desktopCheckout = document.querySelector("[data-cart-checkout-desktop]");
      const mobileBar = document.querySelector("[data-cart-checkout-bar]");
      return {
        display: getComputedStyle(row).display,
        columns: getComputedStyle(row).gridTemplateColumns.split(" ").length,
        itemsRight: items.right,
        summaryLeft: summary.left,
        desktopCheckoutDisplay: getComputedStyle(desktopCheckout).display,
        desktopCheckoutWidth: desktopCheckout.getBoundingClientRect().width,
        mobileBarDisplay: getComputedStyle(mobileBar).display,
      };
    });
    assert.equal(layout.display, "grid", `desktop order layout at ${width}×${height}`);
    assert.ok(layout.columns >= 2, `desktop shows item and summary columns at ${width}×${height}`);
    assert.ok(layout.summaryLeft >= layout.itemsRight - 1, `summary sits beside items at ${width}×${height}`);
    assert.notEqual(layout.desktopCheckoutDisplay, "none", `desktop checkout is available at ${width}×${height}`);
    assert.ok(layout.desktopCheckoutWidth > 0, `desktop checkout is visible at ${width}×${height}`);
    assert.equal(layout.mobileBarDisplay, "none", `mobile-only bar is removed on desktop at ${width}×${height}`);
  }
  await desktop.close();

  const light = await open("cart", 390, 844, "light");
  const footnoteStyle = await light.locator("[data-cart-price-note]").evaluate((note) => ({
    color: getComputedStyle(note).color,
    theme: document.documentElement.dataset.theme,
  }));
  assert.equal(footnoteStyle.theme, "light", "the light-mode fixture is active");
  assert.equal(footnoteStyle.color, "rgb(91, 102, 121)", "the lowest cart price note uses readable light-mode tertiary ink");
  await light.close();
});

check("library access, favourites, cart and study actions keep their behaviour", async () => {
  const page = await open("library");
  await page.locator('[data-purchase-access="hindi"]').click();
  assert.equal(await page.locator("output").textContent(), "open:hindi");
  assert.match(await page.locator('[data-purchase-access="hindi"]').getAttribute("aria-label"), /^Open /);
  await page.locator("[data-purchases-search]").fill("Physics");
  assert.equal(await page.locator("[data-purchase-entry]").count(), 1);
  await page.close();

  const favorites = await open("favorites");
  const short = favorites.locator('[data-favorite-card="short"]');
  assert.equal(await short.getByRole("button", { name: "In Cart", exact: true }).isDisabled(), true);
  const long = favorites.locator('[data-favorite-card="long"]');
  await long.getByRole("button", { name: "Add", exact: true }).click();
  assert.equal(await favorites.locator("output").textContent(), "add:long");
  assert.equal(await long.getByRole("button", { name: "In Cart", exact: true }).isDisabled(), true);
  await long.getByRole("button", { name: /from favourites/ }).click();
  assert.equal(await long.count(), 0);
  assert.equal(await favorites.locator("body").textContent().then(t => /NaN|Infinity/.test(t)), false);
  await favorites.close();

  const cart = await open("cart");
  await cart.locator('[data-cart-card="short"]').getByRole("button", { name: "View Physics" }).click();
  assert.equal(await cart.locator("output").textContent(), "open:short");
  await cart.getByRole("button", { name: "Remove Physics from cart" }).click();
  assert.equal(await cart.locator('[data-cart-card="short"]').count(), 0);
  await cart.locator("[data-cart-checkout]").click();
  assert.equal(await cart.locator("output").textContent(), "checkout:");
  await cart.close();

  const study = await open("study");
  await study.locator('[data-my-course-play-button="short"]').click();
  assert.equal(await study.locator("output").textContent(), "play:short");
  await study.locator('[data-my-course-edit-button="short"]').click();
  assert.equal(await study.locator("output").textContent(), "edit:short");
  await study.locator('[data-my-course-delete="short"]').click();
  assert.equal(await study.locator('[data-my-course-card="short"]').count(), 0);
  await study.close();
});
