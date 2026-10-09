// Production Home/PDP components + production CSS; only account/catalog I/O is
// stubbed. Run with Playwright Chromium or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
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
const fixture = "/tests/fixtures/homeMobileLayoutHarness/index.html";
const data = "/tests/fixtures/homeMobileLayoutHarness/products.ts";
const phoneWidths = [320, 350, 390, 480, 520, 600, 639];
const allWidths = [...phoneWidths, 768, 1024, 1440];
const stubs = {
  AuthContext: `const params = new URLSearchParams(location.search); export const useAuth = () => ({user: params.has('guest') ? null : {id:'fixture',name:params.get('name') || '  Ananya   Sharma  ',email:'learner@example.test'}});`,
  CatalogContext: `import { products } from '${data}'; const params = new URLSearchParams(location.search); const purchasedIds = new Set(['course']); export const useCatalog = () => ({products:params.has('empty')||params.has('loading')?[]:products,purchasedIds,loading:params.has('loading'),error:null});`,
  BrandingContext: `export const useBranding = () => ({appName:'Digital Catalyst',logoUrl:'',homeGradientFrom:'#4f46e5',homeGradientTo:'#7c3aed'});`,
  useUnreadNotificationCount: `export const useUnreadNotificationCount = () => 0;`,
  useCourseAccess: `const resolution = {hasFullProductAccess:false,ownedUpdateIds:new Set(),ownedModuleIds:new Set(),ownedResourceIds:new Set()}; export const useCourseAccess = () => ({resolution});`,
  useProductReviews: `const reviews=[]; export const useHomepageProductReviews = () => ({reviews}); export const usePublishedProductReviews = () => ({reviews});`,
  useHomeBanners: `export const useHomeBanners = () => ({banners:[],usingCustom:false});`,
  webPush: `export const ensureSavedWebPushSubscription = async () => {}; export const subscribeToWebPush = async () => {};`,
  firebase: `export const db={}; export const auth={currentUser:{getIdToken:async()=> 'fixture'}};`,
  firestore: `export const collection=(...parts)=>parts; export const serverTimestamp=()=>null; export const addDoc=async()=>({id:'review'}); export const onSnapshot=(ref,callback)=>{callback({docs:new URLSearchParams(location.search).has('noProgress')?[]:[{id:'course',data:()=>({productId:'course',completedFileIds:[],lastOpenedFileId:'lesson',updatedAt:1})}]});return()=>{};};`,
  apiBase: `export const apiFetch = async () => ({ok:true,json:async()=>({ok:true})});`,
  // Not part of this regression: avoid loading the separate feedback wall.
  FeedbackExperiencePage: `export default () => null;`,
};
let server, browser, origin;

before(async () => {
  if (!enabled) return;
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    resolve: { alias: { "@": path.resolve("src") } },
    plugins: [react(), tailwindcss(), {
      name: "home-mobile-fixture-data",
      enforce: "pre",
      resolveId(id) {
        const name = id === "firebase/firestore" ? "firestore" : id.split("/").at(-1);
        if (Object.hasOwn(stubs, name)) return `\0home-fixture:${name}`;
      },
      load(id) {
        if (id.startsWith("\0home-fixture:")) return stubs[id.slice("\0home-fixture:".length)];
      },
    }],
    server: { host: "0.0.0.0", allowedHosts: true, port: 0 },
    logLevel: "error",
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
});

after(async () => { await browser?.close(); await server?.close(); });
const check = (name, run) => test(name, { timeout: 180000 }, async (t) => {
  if (!enabled) return t.skip("Install Chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
  await run();
});

async function open(query = "", width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}${fixture}?${query}`);
  await page.locator(query.includes("page=pdp") ? "[data-pdp-root]" : "[data-home-content]").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}

async function assertContained(page, selector, ancestorSelector, label) {
  const failures = await page.locator(selector).evaluateAll((nodes, ancestor) => nodes.flatMap((node) => {
    const parent = node.closest(ancestor);
    const box = node.getBoundingClientRect();
    const bounds = parent.getBoundingClientRect();
    const style = getComputedStyle(node);
    return box.width > 0 && box.height > 0 && style.display !== "none"
      && box.left >= bounds.left - 1 && box.right <= bounds.right + 1
      && box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1
      ? [] : [{ text: node.textContent, box: box.toJSON(), bounds: bounds.toJSON() }];
  }), ancestorSelector);
  assert.deepEqual(failures, [], label);
}

check("Home greeting is one bold first name and a vector waving hand, not an extra welcome row", async () => {
  const { page, errors } = await open();
  for (const width of phoneWidths) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal((await page.locator("[data-home-greeting]").textContent()).trim(), "Hello, Ananya");
    assert.equal(await page.locator("[data-home-welcome]").count(), 0);
    assert.equal(await page.locator("svg[data-home-wave]").count(), 1);
    const name = await page.locator("[data-home-user-name]").evaluate((node) => ({
      size: parseFloat(getComputedStyle(node).fontSize),
      weight: Number(getComputedStyle(node).fontWeight),
    }));
    assert.ok(name.size >= 20 && name.weight >= 800, `name should be big and bold at ${width}: ${JSON.stringify(name)}`);
    await assertContained(page, "[data-home-greeting]", "[data-home-chrome]", `greeting stays in its header at ${width}`);
  }
  assert.deepEqual(errors, []);
  await page.close();
  const fallback = await open("guest");
  assert.equal((await fallback.page.locator("[data-home-greeting]").textContent()).trim(), "Hello, Learner");
  await fallback.page.close();
});

check("promotion card uses the phone width with small edge gutters, without widening the page", async () => {
  const { page, errors } = await open();
  for (const width of phoneWidths) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.evaluate(() => {
      const hero = document.querySelector("[data-home-hero]").getBoundingClientRect();
      const content = document.querySelector("[data-home-trending]").getBoundingClientRect();
      return { left: hero.left, right: hero.right, contentLeft: content.left, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
    });
    assert.ok(layout.left >= 0 && layout.left <= 12, `hero should reach the left edge at ${width}: ${JSON.stringify(layout)}`);
    assert.ok(layout.right <= width && layout.right >= width - 12, `hero should reach the right edge at ${width}: ${JSON.stringify(layout)}`);
    assert.ok(layout.left < layout.contentLeft, "only the promotion uses the wider gutter");
    assert.ok(layout.scrollWidth <= layout.viewport, `no page overflow at ${width}`);
  }
  assert.deepEqual(errors, []);
  await page.close();
});

check("all five single-word filters fit and sit directly after learning, before Trending Now", async () => {
  const { page, errors } = await open();
  for (const width of allWidths) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.evaluate(() => {
      const nav = document.querySelector("[data-home-category-nav]");
      const learning = document.querySelector("[data-home-continue]");
      const heading = document.querySelector("[data-home-trending] h2");
      const row = document.querySelector(".dc-home-category-scroll");
      return {
        afterLearning: Boolean(learning.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING),
        beforeTrending: Boolean(nav.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING),
        rowWidth: row.clientWidth, scrollWidth: row.scrollWidth,
        buttons: [...nav.querySelectorAll("button")].map((button) => ({
          label: button.textContent.trim(), left: button.getBoundingClientRect().left,
          right: button.getBoundingClientRect().right, height: button.getBoundingClientRect().height,
        })),
      };
    });
    assert.ok(layout.afterLearning && layout.beforeTrending, `filter placement at ${width}`);
    assert.deepEqual(layout.buttons.map((button) => button.label), ["All", "Video", "PDF", "Books", "Live"]);
    assert.ok(layout.scrollWidth <= layout.rowWidth + 1, `all filters fit without horizontal scrolling at ${width}`);
    for (const button of layout.buttons) {
      assert.ok(button.left >= 0 && button.right <= width, `filter ${button.label} is inside the screen at ${width}`);
      assert.ok(button.height >= 40, `filter ${button.label} keeps a touch target`);
    }
    await assertContained(page, "[data-home-category-nav] button span", "button", `filter labels fit their buttons at ${width}`);
  }
  assert.deepEqual(errors, []);
  await page.close();
  const noProgress = await open("noProgress");
  assert.equal(await noProgress.page.locator("[data-home-continue]").count(), 0);
  assert.equal(await noProgress.page.locator("[data-home-category-nav] button").count(), 5);
  await noProgress.page.close();
});

check("trending cards keep title, details, rating, review count and all prices inside each card", async () => {
  const { page, errors } = await open();
  for (const width of allWidths) {
    await page.setViewportSize({ width, height: 1000 });
    const cards = page.locator("[data-home-trending] .dc-home-product-card");
    assert.equal(await cards.count(), 4);
    for (const selector of [".dc-home-product-title", ".dc-home-product-details", ".dc-home-product-rating", ".dc-home-product-rating-count", ".dc-home-product-price", ".dc-home-product-price del"]) {
      await assertContained(page, `[data-home-trending] ${selector}`, ".dc-home-product-card", `${selector} is not clipped at ${width}`);
    }
    const prices = await cards.locator(".dc-home-product-current-price").allTextContents();
    assert.deepEqual(prices, ["₹1,299", "₹1,23,456", "Free", "₹599"]);
    const priceSizes = await cards.locator(".dc-home-product-current-price").evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)));
    assert.ok(priceSizes.every((size) => size >= 14), `prices stay readable at ${width}: ${priceSizes}`);
    const mediaRatios = await cards.locator(".dc-home-product-media").evaluateAll((nodes) => nodes.map((node) => node.clientWidth / node.clientHeight));
    assert.ok(mediaRatios.every((ratio) => Math.abs(ratio - 4 / 3) < 0.03), `images keep their ratio at ${width}: ${mediaRatios}`);
  }
  if (process.env.HOME_MOBILE_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.HOME_MOBILE_SCREENSHOT_DIR, { recursive: true });
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.screenshot({ path: path.join(process.env.HOME_MOBILE_SCREENSHOT_DIR, "home-mobile.png"), fullPage: true });
    await page.locator("[data-home-trending]").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(process.env.HOME_MOBILE_SCREENSHOT_DIR, "trending-mobile.png"), fullPage: true });
  }
  assert.deepEqual(errors, []);
  await page.close();
});

check("filters, favorites, hero, resume and product buttons keep their existing actions", async () => {
  const { page, errors } = await open("", 320);
  for (const id of ["video", "pdf", "ebook", "live"]) {
    await page.locator(`[data-home-category-nav] button[data-value="${id}"]`).click();
    assert.equal(await page.locator(`[data-home-category-nav] button[data-value="${id}"]`).getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("[data-home-trending] .dc-home-product-card").count(), 1);
  }
  const all = page.locator('[data-home-category-nav] button[data-value="all"]');
  await all.focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("[data-home-trending] .dc-home-product-card").count(), 4);
  const favorite = page.locator("[data-home-trending] .dc-home-product-favorite").first();
  await favorite.click();
  assert.equal(await favorite.getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("output").textContent(), "favorite:course");
  await page.locator("[data-home-trending] .dc-home-product-open").first().click();
  assert.equal(await page.locator("output").textContent(), "product:course");
  await page.locator("[data-home-continue] .dc-home-continue-action").click();
  assert.equal(await page.locator("output").textContent(), "course:course");
  await page.locator("[data-home-hero] [data-banner-linked='true']").click();
  assert.equal(await page.locator("output").textContent(), "product:course");
  assert.deepEqual(errors, []);
  await page.close();
});

check("PDP hides only the breadcrumb on phones, keeps the product title and desktop Store navigation", async () => {
  const { page, errors } = await open("page=pdp");
  for (const width of allWidths) {
    await page.setViewportSize({ width, height: 1000 });
    const visible = await page.locator('nav[aria-label="Breadcrumb"]').isVisible();
    assert.equal(visible, width >= 640, `breadcrumb visibility at ${width}`);
    assert.equal(await page.locator("[data-pdp-titleblock] h1").textContent(), "Complete mathematics: algebra, geometry and advanced problem solving");
  }
  await page.locator('nav[aria-label="Breadcrumb"] button').click();
  assert.equal(await page.locator("output").textContent(), "back");
  assert.deepEqual(errors, []);
  await page.close();
});

check("loading and empty catalog states retain the compact filters without overflow", async () => {
  for (const state of ["loading", "empty"]) {
    const { page, errors } = await open(state, 320);
    assert.equal(await page.locator("[data-home-category-nav] button").count(), 4, "Live is shown only when the catalog contains live products");
    if (state === "loading") assert.equal(await page.locator("[data-home-grid-loading] .dc-home-product-skeleton").count(), 4);
    else assert.equal(await page.getByText("No products in this category yet.").count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
  }
});
