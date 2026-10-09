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
  CatalogContext: `import { products as catalog } from '${data}'; const params = new URLSearchParams(location.search); const products=params.has('fractional')?catalog.map(item=>item.id==='pdf'?{...item,price:123456.99,originalPrice:199999.99}:item):catalog; const purchasedIds = new Set(['course']); export const useCatalog = () => ({products:params.has('empty')||params.has('loading')?[]:products,purchasedIds,loading:params.has('loading'),error:null});`,
  BrandingContext: `export const useBranding = () => ({appName:'Digital Catalyst',logoUrl:'',homeGradientFrom:'#4f46e5',homeGradientTo:'#7c3aed'});`,
  useUnreadNotificationCount: `export const useUnreadNotificationCount = () => 0;`,
  useCourseAccess: `const params = new URLSearchParams(location.search); const resolution = {hasFullProductAccess:false,ownedUpdateIds:new Set(),ownedModuleIds:new Set(params.has('moduleOwned')?['algebra']:[]),ownedResourceIds:new Set(params.has('resourceOwned')?['notebook']:[])}; export const useCourseAccess = () => ({resolution});`,
  useProductReviews: `const params = new URLSearchParams(location.search); const reviews=params.has('reviews')?Array.from({length:12},(_,index)=>({id:'review-'+index,productId:params.get('product')||'course',rating:5,comment:'Clear, practical lessons with helpful examples.',name:'Learner '+(index+1),initials:'L',date:'9 Oct 2026',avatarColor:'',verifiedPurchase:index===0,createdAtMs:1000-index})):[]; export const useHomepageProductReviews = () => ({reviews:[]}); export const usePublishedProductReviews = () => ({reviews});`,
  useHomeBanners: `export const useHomeBanners = () => ({banners:[],usingCustom:false});`,
  webPush: `export const ensureSavedWebPushSubscription = async () => {}; export const subscribeToWebPush = async () => {};`,
  firebase: `export const db={}; export const auth={currentUser:{getIdToken:async()=> 'fixture'}};`,
  firestore: `export const collection=(...parts)=>parts; export const serverTimestamp=()=>null; export const addDoc=async()=>({id:'review'}); export const onSnapshot=(ref,callback)=>{callback({docs:new URLSearchParams(location.search).has('noProgress')?[]:[{id:'course',data:()=>({productId:'course',completedFileIds:[],lastOpenedFileId:'lesson',updatedAt:1})}]});return()=>{};};`,
  apiBase: `export { apiFetch } from '/tests/fixtures/homeMobileLayoutHarness/quoteService.ts';`,
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
  if (query.includes("page=pdp")) await page.waitForFunction(() => {
    const image = document.querySelector("[data-pdp-hero-img]");
    return !image || (image.complete && image.naturalWidth > 0 && Number(getComputedStyle(image).opacity) >= 0.99);
  }, undefined, { timeout: 10000 });
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
    assert.deepEqual(prices, ["₹1,299", "₹1,23,456", "₹0", "₹599"]);
    const freePrice = cards.nth(2).locator(".dc-home-product-price");
    assert.equal(await freePrice.locator("del").textContent(), "₹399");
    const originals = await cards.locator(".dc-home-product-price del").evaluateAll((nodes) => nodes.map((node) => ({ size: parseFloat(getComputedStyle(node).fontSize), strike: getComputedStyle(node).textDecorationLine })));
    assert.ok(originals.every((original) => original.size >= 13 && original.strike.includes("line-through")), `original prices stay readable and struck through at ${width}`);
    const priceSizes = await cards.locator(".dc-home-product-current-price").evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)));
    assert.ok(priceSizes.every((size) => size >= 18), `prices stay readable at ${width}: ${priceSizes}`);
    const mediaRatios = await cards.locator(".dc-home-product-media").evaluateAll((nodes) => nodes.map((node) => node.clientWidth / node.clientHeight));
    assert.ok(mediaRatios.every((ratio) => Math.abs(ratio - 4 / 3) < 0.03), `images keep their ratio at ${width}: ${mediaRatios}`);
  }
  if (process.env.HOME_MOBILE_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.HOME_MOBILE_SCREENSHOT_DIR, { recursive: true });
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.screenshot({ path: path.join(process.env.HOME_MOBILE_SCREENSHOT_DIR, "home-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 1150 });
    await page.locator("[data-home-trending]").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(process.env.HOME_MOBILE_SCREENSHOT_DIR, "trending-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.locator("[data-home-trending] .dc-home-product-card").nth(2).locator(".dc-home-product-price").evaluate((node) => node.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: path.join(process.env.HOME_MOBILE_SCREENSHOT_DIR, "home-free-pricing-mobile.png"), fullPage: true });
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

const primaryPurchase = "[data-pdp-checkout], [data-pdp-cta-button], [data-pdp-upgrade-checkout], [data-pdp-library-primary]";
async function receipt(page) { return JSON.parse(await page.locator("output").textContent()); }
async function screenshot(page, name) {
  if (!process.env.HOME_MOBILE_SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.HOME_MOBILE_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.HOME_MOBILE_SCREENSHOT_DIR, name), fullPage: true });
}

check("minimal PDP has one primary action, flat metadata/details, one description and readable actual prices", async () => {
  const { page, errors } = await open("page=pdp");
  assert.equal(await page.locator("[data-pdp-instructor]").textContent(), "By Dr. Ananya Sharma");
  for (const width of allWidths) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `PDP fits ${width}`);
    assert.equal(await page.locator(primaryPurchase).count(), 1);
    assert.equal(await page.locator("[data-pdp-thumb-bar], [data-pdp-thumb-checkout], #pdp-purchase-options").count(), 0);
    assert.equal(await page.locator("[data-pdp-stack] .dc-simple-panel, [data-pdp-meta] .dc-scene-plate, [data-pdp-meta-item] svg").count(), 0);
    assert.equal(await page.getByText("Live catalog", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Focused lessons and practical examples you can revisit at your own pace.", { exact: true }).count(), 1);
    assert.deepEqual(await page.locator("[data-pdp-tabbar] button").allTextContents(), ["About", "Content"]);
    await assertContained(page, "[data-pdp-tabbar] button", "[data-pdp-tabbar]", `detail controls fit at ${width}`);
    await assertContained(page, "[data-pdp-buy] .dc-pdp-current-price, [data-pdp-buy] .dc-pdp-original-price", "[data-pdp-price-box]", `prices fit at ${width}`);
    const price = await page.locator("[data-pdp-buy] .dc-pdp-current-price").evaluate((node) => ({ text: node.textContent, size: parseFloat(getComputedStyle(node).fontSize), weight: Number(getComputedStyle(node).fontWeight) }));
    assert.equal(price.text, "₹1,299");
    assert.ok(price.size >= 28 && price.weight >= 750, `PDP price typography at ${width}`);
    assert.equal(await page.locator("[data-pdp-buy] .dc-pdp-original-price").textContent(), "₹2,499");
    assert.ok(await page.locator("[data-pdp-buy] .dc-pdp-original-price").evaluate((node) => getComputedStyle(node).textDecorationLine.includes("line-through")));
    assert.equal(await page.locator(`${primaryPurchase.split(',')[1].trim()} svg`).count(), 0, "no decorative payment glyph");
  }
  assert.equal(await page.locator("[data-pdp-media]").getAttribute("aria-busy"), "false");
  assert.equal(await page.locator(".dc-pdp-image-loading").count(), 0, "cached artwork is not hidden behind a permanent loading plate");
  await screenshot(page, "pdp-desktop.png");
  await page.setViewportSize({ width: 390, height: 1000 });
  await screenshot(page, "pdp-mobile.png");
  await page.locator(primaryPurchase).click();
  const checkout = await receipt(page);
  assert.equal(checkout.purchaseKind, "full_product");
  assert.equal(checkout.finalPrice, 1299);
  assert.deepEqual(checkout.productIds, ["course"]);
  assert.deepEqual(errors, []);
  await page.close();
});

check("free, explicit free-flag and missing-MRP PDPs keep numeric prices and a single working access action", async () => {
  for (const [query, price, original] of [
    ["product=book", 0, "₹399"],
    ["freeFlag", 0, "₹2,499"],
    ["freeCourse", 0, "₹2,499"],
    ["freeCourse&noMRP", 0, null],
    ["noMRP", 1299, null],
  ]) {
    const { page, errors } = await open(`page=pdp&${query}`, 320);
    assert.equal(await page.locator(primaryPurchase).count(), 1, query);
    assert.equal(await page.locator("[data-pdp-buy] .dc-pdp-current-price").textContent(), price === 0 ? "₹0" : "₹1,299", query);
    assert.equal(await page.locator("[data-pdp-buy] .dc-pdp-original-price").count(), original ? 1 : 0, query);
    if (original) assert.equal(await page.locator("[data-pdp-buy] .dc-pdp-original-price").textContent(), original);
    if (price === 0) assert.equal(await page.locator("[data-pdp-coupon]").count(), 0, "no meaningless coupon for free access");
    await page.locator(primaryPurchase).click();
    assert.equal((await receipt(page)).finalPrice, price, query);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), query);
    if (query === "product=book") await screenshot(page, "pdp-free-mobile.png");
    assert.deepEqual(errors, []);
    await page.close();
  }
});

check("owned, upgrade-owned and unavailable PDPs do not repeat purchase or library actions", async () => {
  for (const query of ["owned", "owned&upgrade", "owned&upgrade&updateOwned", "unavailable"]) {
    const { page, errors } = await open(`page=pdp&${query}`);
    assert.equal(await page.locator(primaryPurchase).count(), 1, query);
    assert.equal(await page.locator("[data-pdp-purchase-builder], [data-pdp-coupon]").count(), 0, query);
    if (query === "unavailable") {
      assert.ok(await page.locator(primaryPurchase).isDisabled());
      assert.equal(await page.locator(primaryPurchase).textContent(), "Coming soon");
      assert.equal(await page.locator("output").textContent(), "");
    } else if (query === "owned&upgrade") {
      assert.equal(await page.locator("[data-pdp-buy] .dc-pdp-current-price").textContent(), "₹249");
      await page.locator("[data-pdp-upgrade-checkout]").click();
      const checkout = await receipt(page);
      assert.equal(checkout.purchaseKind, "paid_update");
      assert.equal(checkout.updateId, "revision-update");
      assert.equal(checkout.finalPrice, 249);
      await page.locator("[data-pdp-library-secondary]").click();
      assert.equal(await page.locator("output").textContent(), "course:course");
    } else {
      await page.locator("[data-pdp-library-primary]").click();
      assert.equal(await page.locator("output").textContent(), "course:course");
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
});

check("individual modules change the sole price/CTA, include dependencies and respect module ownership", async () => {
  for (const owned of [false, true]) {
    const { page, errors } = await open(`page=pdp&options${owned ? "&moduleOwned" : ""}`, 350);
    await page.locator("[data-pdp-modules-trigger]").click();
    const modal = page.locator("[data-pdp-module-select-modal]");
    await modal.waitFor();
    if (owned) {
      assert.equal(await modal.locator('[data-pdp-module-pick="algebra"]').getAttribute("data-owned"), "true");
      assert.ok(await modal.locator('[data-pdp-module-pick="algebra"] input[type="checkbox"]').isDisabled());
      await modal.locator('[data-pdp-module-pick="algebra"]').click({ force: true });
      assert.equal(await modal.locator('[data-pdp-module-pick="algebra"]').getAttribute("data-selected"), "false");
    }
    await modal.locator('[data-pdp-module-pick="geometry"]').click();
    await modal.locator("[data-pdp-module-select-confirm]").click();
    assert.equal(await page.locator(primaryPurchase).count(), 1);
    assert.equal(await page.locator("[data-pdp-buy] .dc-pdp-current-price").textContent(), owned ? "₹299" : "₹798");
    assert.equal(await page.getByRole("button", { name: "Add to cart", exact: true }).count(), 0, "a partial selection cannot accidentally add the full product");
    await page.locator(primaryPurchase).click();
    const checkout = await receipt(page);
    assert.equal(checkout.purchaseKind, "selected_modules");
    assert.deepEqual(checkout.moduleIds.sort(), owned ? ["geometry"] : ["algebra", "geometry"]);
    assert.equal(checkout.finalPrice, owned ? 299 : 798);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

check("resource choices stay plain, reflect real sale prices and cannot charge for an owned resource", async () => {
  const { page, errors } = await open("page=pdp&options", 320);
  await page.getByRole("button", { name: "Resources", exact: true }).click();
  assert.ok(await page.locator(primaryPurchase).isDisabled(), "empty selections cannot check out");
  assert.equal(await page.locator("[data-pdp-buy] .dc-pdp-current-price").count(), 0, "an empty selection is not presented as a free product");
  await page.getByRole("checkbox", { name: "Select Practice notebook", exact: true }).check();
  assert.equal(await page.locator("[data-pdp-buy] .dc-pdp-current-price").textContent(), "₹199");
  assert.equal(await page.locator("[data-pdp-buy] .dc-pdp-original-price").textContent(), "₹249");
  assert.equal(await page.locator("[data-pdp-resource] .dc-simple-panel").count(), 0);
  await page.locator(primaryPurchase).click();
  const checkout = await receipt(page);
  assert.equal(checkout.purchaseKind, "selected_resources");
  assert.deepEqual(checkout.resourceIds, ["notebook"]);
  assert.equal(checkout.finalPrice, 199);
  assert.deepEqual(errors, []);
  await page.close();
  const owned = await open("page=pdp&options&resourceOwned", 320);
  await owned.page.getByRole("button", { name: "Resources", exact: true }).click();
  assert.ok(await owned.page.getByRole("checkbox", { name: "Practice notebook — already owned", exact: true }).isDisabled());
  assert.ok(await owned.page.locator(primaryPurchase).isDisabled());
  assert.deepEqual(owned.errors, []);
  await owned.page.close();
});

check("the collapsed coupon still validates, reports errors, carries its code into checkout and can be removed", async () => {
  const { page, errors } = await open("page=pdp", 350);
  const coupon = page.locator("[data-pdp-coupon]");
  assert.equal(await coupon.getAttribute("open"), null);
  await coupon.locator("summary").click();
  await coupon.getByPlaceholder("Enter code").fill("INVALID");
  await coupon.getByRole("button", { name: "Apply", exact: true }).click();
  await coupon.getByRole("alert").waitFor();
  assert.match(await coupon.getByRole("alert").textContent(), /Invalid coupon/);
  await coupon.getByPlaceholder("Enter code").fill("SAVE100");
  await coupon.getByRole("button", { name: "Apply", exact: true }).click();
  await coupon.getByText("SAVE100 applied", { exact: true }).waitFor();
  await page.locator(primaryPurchase).click();
  assert.equal((await receipt(page)).couponCode, "SAVE100");
  await coupon.getByRole("button", { name: "Remove code", exact: true }).click();
  await page.locator(primaryPurchase).click();
  assert.equal((await receipt(page)).couponCode, null);
  assert.deepEqual(errors, []);
  await page.close();
});

check("flat content rows support nested accordion navigation without losing the open parent", async () => {
  const { page, errors } = await open("page=pdp&options", 320);
  await page.getByRole("button", { name: "Content", exact: true }).click();
  const parent = page.locator('[data-pdp-curriculum-module][data-module-id="algebra"]');
  const child = page.locator('[data-pdp-curriculum-module][data-module-id="nested"]');
  await child.locator("button").click();
  assert.equal(await parent.locator("button").first().getAttribute("aria-expanded"), "true");
  assert.equal(await child.locator("button").getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator('[data-pdp-curriculum-module][data-paid="true"]').count(), 0, "unowned base product hides paid updates");
  await page.getByRole("button", { name: "About", exact: true }).click();
  assert.equal(await page.locator(".dc-pdp-description").count(), 1);
  assert.deepEqual(errors, []);
  await page.close();
  const owned = await open("page=pdp&options&owned", 320);
  await owned.page.getByRole("button", { name: "Content", exact: true }).click();
  assert.equal(await owned.page.locator('[data-pdp-curriculum-module][data-paid="true"]').count(), 1);
  assert.match(await owned.page.locator("[data-pdp-curriculum]").textContent(), /Paid upgrade/);
  assert.deepEqual(owned.errors, []);
  await owned.page.close();
});

check("gallery, favorites, cart, fullscreen and keyboard-operable sharing still work without decorative effects", async () => {
  const { page, errors } = await open("page=pdp&gallery", 390);
  await page.getByRole("button", { name: "Show product image 2", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Show product image 2", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "View product image fullscreen", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  const save = page.locator("[data-pdp-save]");
  await save.click();
  assert.equal(await save.getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("output").textContent(), "favorite:course");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  assert.equal(await page.locator("output").textContent(), "cart:course");
  assert.ok(await page.getByRole("button", { name: "In cart", exact: true }).isDisabled());
  const share = page.getByRole("button", { name: "Share product", exact: true });
  await share.click();
  await page.getByRole("menu").waitFor();
  await assertContained(page, "[data-product-share]", "[data-pdp-buy]", "share menu stays within the product decision area");
  await page.getByRole("menuitem", { name: "Share via device", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.getByRole("menuitem", { name: "WhatsApp", exact: true }).evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press("Escape");
  assert.equal(await share.getAttribute("aria-expanded"), "false");
  assert.equal(await share.evaluate((node) => node === document.activeElement), true);
  assert.deepEqual(errors, []);
  await page.close();
});

check("reviews use concise list previews, full-view pagination and working review/login actions", async () => {
  const { page, errors } = await open("page=pdp&reviews", 390);
  assert.equal(await page.locator("[data-pdp-review-list] article").count(), 2);
  assert.equal(await page.locator("[data-pdp-reviews] .dc-simple-panel, [data-pdp-rating-summary]").count(), 0, "no nested cards or repeated rating summary on the product view");
  const hash = await page.evaluate(() => location.hash);
  await page.locator(".dc-pdp-identity-rating button").click();
  assert.equal(await page.evaluate(() => location.hash), hash, "in-page rating navigation does not destroy the hash route");
  await page.getByRole("button", { name: "Write a review", exact: true }).click();
  await page.getByRole("button", { name: "4 stars", exact: true }).click();
  await page.getByRole("textbox", { name: "Your product review", exact: true }).fill("Helpful explanations.");
  await page.getByRole("button", { name: "Submit review", exact: true }).click();
  await page.locator("[data-pdp-reviews]").getByRole("status").waitFor();
  assert.match(await page.locator("[data-pdp-reviews]").getByRole("status").textContent(), /review/i);
  await page.locator("[data-see-all-reviews]").click();
  await page.locator("[data-pdp-reviews-page]").waitFor();
  assert.equal(await page.locator("[data-pdp-review-list] article").count(), 8);
  await page.locator("[data-load-more-reviews]").click();
  assert.equal(await page.locator("[data-pdp-review-list] article").count(), 13);
  await page.locator("[data-pdp-reviews-back]").click();
  await page.locator("[data-pdp-body]").waitFor();
  assert.deepEqual(errors, []);
  await page.close();
  const guest = await open("page=pdp&guest&noRatings");
  assert.equal(await guest.page.locator(".dc-pdp-identity-rating").count(), 0);
  await guest.page.getByRole("button", { name: "Sign in to review", exact: true }).click();
  assert.match(await guest.page.evaluate(() => location.hash), /#\/auth\?mode=login&return=/);
  assert.deepEqual(guest.errors, []);
  await guest.page.close();
});

check("image failures stay clean and related-product links/page controls preserve their navigation", async () => {
  const broken = await open("page=pdp&brokenImage", 320);
  await broken.page.locator(".dc-pdp-artwork-fallback").waitFor();
  assert.equal(await broken.page.getByRole("button", { name: "View product image fullscreen", exact: true }).count(), 0);
  assert.equal(await broken.page.locator(primaryPurchase).count(), 1);
  assert.deepEqual(broken.errors, []);
  await broken.page.close();
  const { page, errors } = await open("page=pdp&related", 320);
  const next = page.locator('[data-pdp-related-next="1"]');
  await next.click();
  assert.equal(await page.locator('[data-pdp-related-row="1"] [data-pdp-related-track]').getAttribute("data-active-page"), "1");
  await page.locator('[data-pdp-related-row="1"] [data-pdp-related-page]').nth(1).locator("[data-pdp-related-card]").first().click();
  assert.match(await page.locator("output").textContent(), /^product:related-/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  await page.close();
});


check("cached gallery artwork remains visible after reload and after returning from reviews", async () => {
  const { page, errors } = await open("page=pdp&reviews");
  await page.reload();
  await page.locator("[data-pdp-hero-img]").waitFor();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector("[data-pdp-hero-img]")).opacity) >= 0.99);
  assert.equal(await page.locator("[data-pdp-media]").getAttribute("aria-busy"), "false");
  await page.locator("[data-see-all-reviews]").click();
  await page.locator("[data-pdp-reviews-back]").click();
  await page.locator("[data-pdp-hero-img]").waitFor();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector("[data-pdp-hero-img]")).opacity) >= 0.99);
  assert.equal(await page.locator("[data-pdp-media]").getAttribute("aria-busy"), "false");
  assert.deepEqual(errors, []);
  await page.close();
});


check("long product copy expands on demand without duplicate text or extra cards", async () => {
  const { page, errors } = await open("page=pdp&longCopy", 320);
  const description = page.locator(".dc-pdp-description");
  const collapsed = await description.evaluate((node) => ({ height: node.clientHeight, line: parseFloat(getComputedStyle(node).lineHeight), text: node.textContent }));
  assert.ok(collapsed.height <= collapsed.line * 4 + 1);
  assert.equal(await description.count(), 1);
  await page.getByRole("button", { name: "Read more", exact: true }).click();
  assert.ok(await description.evaluate((node) => node.clientHeight) > collapsed.height);
  assert.equal(await description.textContent(), collapsed.text, "the source description is preserved, not rewritten");
  await page.getByRole("button", { name: "Show less", exact: true }).click();
  assert.equal(await description.getAttribute("data-expanded"), "false");
  const more = page.locator(".dc-pdp-more-highlights");
  assert.equal(await more.locator("li").first().isVisible(), false);
  await more.locator("summary").click();
  assert.equal(await more.locator("li").count(), 2);
  assert.equal(await more.locator("li").first().isVisible(), true);
  assert.deepEqual(errors, []);
  await page.close();
});

check("a missing product has a clear back action and never offers checkout", async () => {
  const { page, errors } = await open("page=pdp&missingProduct", 320);
  assert.equal(await page.locator(primaryPurchase).count(), 0);
  assert.equal(await page.getByRole("heading", { name: "Product not found", exact: true }).count(), 1);
  await page.getByRole("button", { name: "Back to store", exact: true }).click();
  assert.equal(await page.locator("output").textContent(), "back");
  assert.deepEqual(errors, []);
  await page.close();
});


check("paise-valued Home prices remain exact and contained on the narrowest phones", async () => {
  const { page, errors } = await open("fractional", 320);
  const card = page.locator("[data-home-trending] .dc-home-product-card").nth(1);
  for (const width of [320, 350, 390]) {
    await page.setViewportSize({ width, height: 800 });
    assert.equal(await card.locator(".dc-home-product-current-price").textContent(), "₹1,23,456.99");
    assert.equal(await card.locator(".dc-home-product-price del").textContent(), "₹1,99,999.99");
    await assertContained(page, "[data-home-trending] .dc-home-product-current-price, [data-home-trending] .dc-home-product-price del", ".dc-home-product-card", `paise-valued amounts fit ${width}`);
  }
  assert.deepEqual(errors, []);
  await page.close();
});

check("the single PDP purchase action stays reachable above the dock on short phone viewports", async () => {
  const { page, errors } = await open("page=pdp", 390);
  for (const [width, height] of [[320, 640], [350, 740], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const action = page.locator(primaryPurchase);
    await action.evaluate((node) => node.scrollIntoView({ block: "center" }));
    const button = await action.boundingBox();
    const dock = await page.locator("[data-site-footer-nav]").boundingBox();
    assert.ok(button.y >= 70 && button.y + button.height <= dock.y, `checkout stays reachable at ${width}×${height}`);
    assert.equal(await page.locator(primaryPurchase).count(), 1);
    await action.click();
    assert.equal((await receipt(page)).finalPrice, 1299);
  }
  assert.deepEqual(errors, []);
  await page.close();
});


check("zero-cost content choices hide coupons and never carry an old code into free checkout", async () => {
  const { page, errors } = await open("page=pdp&options&freeResource", 350);
  const coupon = page.locator("[data-pdp-coupon]");
  await coupon.locator("summary").click();
  await coupon.getByPlaceholder("Enter code").fill("SAVE100");
  await coupon.getByRole("button", { name: "Apply", exact: true }).click();
  await coupon.getByText("SAVE100 applied", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Resources", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select Practice notebook", exact: true }).check();
  await coupon.waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-pdp-buy] .dc-pdp-current-price").textContent(), "₹0");
  await page.locator(primaryPurchase).click();
  const checkout = await receipt(page);
  assert.equal(checkout.finalPrice, 0);
  assert.equal(checkout.couponCode, null);
  assert.deepEqual(errors, []);
  await page.close();
});

check("navigating to another product resets the selected-content price and checkout state", async () => {
  const { page, errors } = await open("page=pdp&options&related&switchable", 390);
  await page.locator("[data-pdp-modules-trigger]").click();
  const modal = page.locator("[data-pdp-module-select-modal]");
  await modal.locator('[data-pdp-module-pick="geometry"]').click();
  await modal.locator("[data-pdp-module-select-confirm]").click();
  assert.equal(await page.locator("[data-pdp-buy] .dc-pdp-current-price").textContent(), "₹798");
  await page.locator("[data-pdp-related-card]").first().click();
  await page.waitForFunction(() => document.querySelector("[data-pdp-titleblock] h1").textContent.startsWith("Algebra practice"));
  assert.equal(await page.locator("[data-pdp-buy] .dc-pdp-current-price").textContent(), "₹1,499");
  assert.equal(await page.locator(primaryPurchase).count(), 1);
  await page.waitForFunction(() => document.querySelector('[data-pdp-order-summary]')?.getAttribute('data-pricing-status') === 'verified');
  assert.equal(await page.locator(primaryPurchase).textContent(), "Get access");
  await page.locator(primaryPurchase).click();
  const checkout = await receipt(page);
  assert.equal(checkout.purchaseKind, "full_product");
  assert.equal(checkout.finalPrice, 1499);
  assert.match(checkout.productIds[0], /^related-/);
  assert.deepEqual(checkout.moduleIds, []);
  assert.deepEqual(errors, []);
  await page.close();
});


check("individual selection summary names each module, its price and required dependency", async () => {
  const { page, errors } = await open("page=pdp&options", 320);
  await page.locator("[data-pdp-modules-trigger]").click();
  const modal = page.locator("[data-pdp-module-select-modal]");
  await modal.locator('[data-pdp-module-pick="geometry"]').click();
  await modal.locator("[data-pdp-module-select-confirm]").click();
  const summary = page.locator("[data-pdp-order-summary]");
  await page.waitForFunction(() => document.querySelector('[data-pdp-order-summary]')?.getAttribute('data-pricing-status') === 'verified' && document.querySelector('[data-pdp-summary-items]')?.textContent.includes('Geometry'));
  assert.equal(await summary.locator('[data-pdp-summary-item="algebra"]').textContent().then(text=>text.includes('₹499')), true);
  assert.equal(await summary.locator('[data-pdp-summary-item="geometry"]').textContent().then(text=>text.includes('₹299')), true);
  assert.equal(await summary.locator('[data-pdp-summary-total] .dc-pdp-current-price').textContent(), '₹798');
  assert.match(await summary.locator('[data-pdp-selection-rules]').textContent(), /Algebra is required for Geometry/);
  assert.match(await summary.textContent(), /not the full product/);
  assert.equal(await summary.locator('.dc-simple-panel, .dc-scene-plate').count(), 0);
  await assertContained(page, '[data-pdp-summary-items] li', '[data-pdp-order-summary]', 'itemised summary fits 320px');
  assert.deepEqual(errors, []); await page.close();
});

check("coupons quote the actual selected resources and list sale, coupon and final total", async () => {
  const { page, errors } = await open("page=pdp&options", 350);
  await page.getByRole('button', {name:'Resources',exact:true}).click();
  await page.getByRole('checkbox',{name:'Select Practice notebook',exact:true}).check();
  await page.waitForFunction(() => document.querySelector('[data-pdp-order-summary]')?.getAttribute('data-pricing-status') === 'verified');
  const coupon = page.locator('[data-pdp-coupon]'); await coupon.locator('summary').click();
  await coupon.getByPlaceholder('Enter code').fill('SAVE10'); await coupon.getByRole('button',{name:'Apply',exact:true}).click();
  await coupon.getByText('SAVE10 applied',{exact:true}).waitFor();
  const summary = page.locator('[data-pdp-order-summary]');
  assert.match(await summary.locator('[data-pdp-summary-items]').textContent(), /Practice notebook/);
  assert.match(await summary.locator('[data-pdp-summary-breakdown]').textContent(), /₹249/);
  assert.match(await summary.locator('[data-pdp-summary-breakdown]').textContent(), /Price discount−₹50/);
  assert.match(await summary.locator('[data-pdp-coupon-discount]').textContent(), /SAVE10.*₹19.9/);
  assert.equal(await summary.locator('.dc-pdp-current-price').textContent(), '₹179.1');
  const requests = await page.evaluate(() => window.quoteRequests);
  const request = requests.findLast(value=>value.couponCode==='SAVE10');
  assert.equal(request.purchaseKind,'selected_resources'); assert.deepEqual(request.resourceIds,['notebook']);
  assert.equal('finalPrice' in request,false); assert.equal('discount' in request,false);
  await page.locator(primaryPurchase).click(); const checkout=await receipt(page);
  assert.equal(checkout.couponCode,'SAVE10');assert.equal(checkout.finalPrice,179.1);
  assert.deepEqual(errors,[]);await page.close();
});

check("failed price verification blocks purchase and never presents an old quote as final", async () => {
  const {page,errors}=await open('page=pdp&quoteError',390);
  await page.locator('[data-pdp-order-summary] [role="alert"]').waitFor();
  assert.ok(await page.locator(primaryPurchase).isDisabled());
  assert.equal(await page.locator('[data-pdp-order-summary]').getAttribute('data-pricing-status'),'error');
  assert.match(await page.locator('[data-pdp-summary-total]').textContent(), /Estimated total/);
  assert.equal(await page.getByRole('button',{name:'Retry pricing',exact:true}).count(),1);
  assert.deepEqual(errors,[]);await page.close();
});


check("coupon revalidation drops an ineligible full-product discount when choosing modules", async () => {
  const {page,errors}=await open('page=pdp&options&couponFullOnly',390);
  const coupon=page.locator('[data-pdp-coupon]');await coupon.locator('summary').click();await coupon.getByPlaceholder('Enter code').fill('SAVE100');await coupon.getByRole('button',{name:'Apply',exact:true}).click();await coupon.getByText('SAVE100 applied',{exact:true}).waitFor();
  await page.locator('[data-pdp-modules-trigger]').click();const modal=page.locator('[data-pdp-module-select-modal]');await modal.locator('[data-pdp-module-pick="geometry"]').click();await modal.locator('[data-pdp-module-select-confirm]').click();
  await page.waitForFunction(()=>document.querySelector('[data-pdp-order-summary]')?.getAttribute('data-pricing-status')==='verified' && document.querySelector('[data-pdp-summary-items]')?.textContent.includes('Geometry'));
  assert.equal(await page.locator('[data-pdp-coupon-discount]').count(),0);assert.equal(await page.locator('[data-pdp-buy] .dc-pdp-current-price').textContent(),'₹798');
  await page.locator(primaryPurchase).click();const checkout=await receipt(page);assert.equal(checkout.couponCode,null);assert.equal(checkout.finalPrice,798);assert.deepEqual(errors,[]);await page.close();
});

check("minimum charge is disclosed and a full discount still carries its coupon into checkout", async () => {
  for(const [query,total] of [['minimumCharge','₹1'],['','₹0']]){
    const{page,errors}=await open(`page=pdp&options&${query}`,350);await page.getByRole('button',{name:'Resources',exact:true}).click();await page.getByRole('checkbox',{name:'Select Practice notebook',exact:true}).check();const coupon=page.locator('[data-pdp-coupon]');await coupon.locator('summary').click();await coupon.getByPlaceholder('Enter code').fill('SAVE100');await coupon.getByRole('button',{name:'Apply',exact:true}).click();await coupon.getByText('SAVE100 applied',{exact:true}).waitFor();
    // Flat fixture code discounts at most ₹100; use the nested ₹99 module to
    // exercise the paid-order floor / fully-discounted path instead.
    await page.getByRole('button',{name:'Full product',exact:true}).click();await page.locator('[data-pdp-modules-trigger]').click();const modal=page.locator('[data-pdp-module-select-modal]');await modal.locator('[data-pdp-module-pick="nested"]').click();await modal.locator('[data-pdp-module-select-confirm]').click();
    await page.waitForFunction(()=>document.querySelector('[data-pdp-order-summary]')?.getAttribute('data-pricing-status')==='verified' && document.querySelector('[data-pdp-summary-items]')?.textContent.includes('Worked examples'));
    assert.equal(await page.locator('[data-pdp-buy] .dc-pdp-current-price').textContent(),total);
    if(query)assert.match(await page.locator('[data-pdp-selection-rules]').textContent(),/Minimum payable.*₹1/);
    await page.locator(primaryPurchase).click();const checkout=await receipt(page);assert.equal(checkout.couponCode,'SAVE100');assert.equal(checkout.finalPrice,query?1:0);assert.deepEqual(errors,[]);await page.close();
  }
});

check("slow responses from a previous selection cannot overwrite the current quote", async () => {
  const{page,errors}=await open('page=pdp&options&slowQuotes',390);
  await page.locator('[data-pdp-modules-trigger]').click();const modal=page.locator('[data-pdp-module-select-modal]');await modal.locator('[data-pdp-module-pick="geometry"]').click();await modal.locator('[data-pdp-module-select-confirm]').click();
  await page.getByRole('button',{name:'Resources',exact:true}).click();await page.getByRole('checkbox',{name:'Select Practice notebook',exact:true}).check();
  await page.waitForFunction(()=>document.querySelector('[data-pdp-order-summary]')?.getAttribute('data-pricing-status')==='verified' && document.querySelector('[data-pdp-summary-items]')?.textContent.includes('Practice notebook'));
  await page.locator(primaryPurchase).click();assert.equal((await receipt(page)).finalPrice,199);assert.equal((await receipt(page)).purchaseKind,'selected_resources');assert.deepEqual(errors,[]);await page.close();
});
