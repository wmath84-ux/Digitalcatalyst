// Production SubscriptionPage, checkout context + all three steps, study
// controller + list, shared chrome and CSS. Only network/storage boundaries
// and the external Razorpay SDK are deterministic fixture implementations.
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
const fixture = "/tests/fixtures/subscriptionCheckoutLibraryHarness/index.html";
const data = "/tests/fixtures/subscriptionCheckoutLibraryHarness/data.ts";
const api = "/tests/fixtures/subscriptionCheckoutLibraryHarness/api.ts";
const state = `const params=new URLSearchParams(location.search);`;
const stubs = {
  AuthContext: `${state}const user=params.has('guest')?null:{id:'fixture',uid:'fixture',name:'Ananya Sharma',email:'learner@example.test',role:'student'};export const useAuth=()=>({user});`,
  CatalogContext: `import { products } from '${data}';const purchasedIds=new Set(['owned','owned-doc']);export const useCatalog=()=>({products,purchasedIds,loading:false,error:null});`,
  CommerceContext: `const cartIds=new Set(['alpha']);export const useCommerce=()=>({cartIds,favoriteIds:new Set()});`,
  BrandingContext: `export const useBranding=()=>({appName:'Digital Catalyst',logoUrl:'',homeGradientFrom:'#4f46e5',homeGradientTo:'#7c3aed',supportEmail:'support@example.test',supportPhone:'+91 9876543210'});`,
  useUnreadNotificationCount: `export const useUnreadNotificationCount=()=>0;`,
  useSubscriptionGateLogic: `const settings={planVisibility:{},features:{},subscriberPricing:{premium:{monthly:189.5,yearly:1899.5}}};export const useSubscriptionGateLogic=()=>({settings});`,
  firebase: `export const db={};export const getFirebaseStorage=()=>({});export const auth={currentUser:{uid:'fixture',displayName:'Ananya Sharma',email:'learner@example.test',emailVerified:true,phoneNumber:'+919876543210',getIdToken:async()=> 'fixture-token'}};`,
  firestore: `import {member} from '${data}';export const doc=(...parts)=>parts;export const collection=(...parts)=>parts;export const getDoc=async()=>({exists:()=>Boolean(member),data:()=>member});export const onSnapshot=(_ref,callback)=>{callback({exists:()=>Boolean(member),data:()=>member,docs:[]});return()=>{};};export const getDocs=async()=>({docs:[]});export const serverTimestamp=()=>null;export const setDoc=async()=>{};export const deleteDoc=async()=>{};`,
  apiBase: `export {apiFetch} from '${api}';`,
  featureAnalytics: `export const trackFeatureEvent=(name)=>{window.fixtureEvents??=[];window.fixtureEvents.push(name);};`,
  // I/O boundary for the PRODUCTION useMyCourses controller. Count helpers
  // remain production code, not replicas in this mock.
  myCourseClient: `import {courses as seed} from '${data}';${state}export {countModules,countResources} from '/src/lib/myCourseClient.ts?counts';let stored=params.has('empty')||params.has('loading')||params.has('libraryError')?[]:seed;const listeners=new Set();let failures=0;export const subscribeMyCourses=(_uid,next,error)=>{listeners.add(next);queueMicrotask(()=>{if(params.has('loading'))return;if(params.has('libraryError'))error(Error('Library temporarily unavailable'));else next(stored);});return()=>listeners.delete(next);};export const deleteMyCourse=async(_uid,id)=>{window.fixtureDeletes??=[];window.fixtureDeletes.push(id);if(params.has('deleteError')&&failures++===0)throw Error('Could not delete course');stored=stored.filter(course=>course.id!==id);for(const next of listeners)next(stored);};export const describeMyCoursesError=(error)=>error.message;export const saveMyCourse=async()=>{};`,
};
let server, browser, origin;
before(async () => {
  if (!enabled) return;
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    resolve: { alias: { "@": path.resolve("src") } },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "commerce-library-fixture-io",
        enforce: "pre",
        resolveId(id) {
          const name = id === "firebase/firestore" ? "firestore" : id.split("/").at(-1);
          if (Object.hasOwn(stubs, name)) return "\0commerce-library-fixture:" + name;
        },
        load(id) {
          if (id.startsWith("\0commerce-library-fixture:"))
            return stubs[id.slice("\0commerce-library-fixture:".length)];
        },
      },
    ],
    server: { host: "0.0.0.0", allowedHosts: true, port: 0 },
    logLevel: "error",
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
});
after(async () => {
  await browser?.close();
  await server?.close();
});
const check = (name, fn) =>
  test(name, { timeout: 180000 }, async (t) => {
    if (!enabled) return t.skip("Install Chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
    await fn();
  });
async function open(query = "page=subscription", width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}${fixture}?${query}`);
  await page
    .locator(
      query.includes("page=study")
        ? "[data-study-library-page]"
        : query.includes("page=checkout")
        ? "[data-checkout-app]"
        : "[data-subscription-page]"
    )
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}
async function ready(page) {
  await page.locator("[data-checkout-proceed]").waitFor();
}
async function features(page) {
  await page.locator("[data-subscription-feature-trigger]").click();
  await page.locator("[data-subscription-feature-sheet]").waitFor();
}
async function coursePicker(page) {
  await page.locator("[data-subscription-course-trigger]").click();
  await page.locator("[data-subscription-product-sheet]").waitFor();
}
async function code(page, kind, value) {
  const form = page.locator(`[data-code-kind=${kind}]`);
  await form.locator("input").fill(value);
  await form.getByRole("button", { name: "Apply", exact: true }).click();
}
async function payment(page) {
  await ready(page);
  await page.locator("[data-checkout-proceed]").click();
  await page.locator("[data-payment-gateway]").waitFor();
}
async function pay(page) {
  await page.locator("[data-payment-gateway-pay]").click();
  await page.waitForFunction(
    () =>
      window.fixtureRazorpay?.opened &&
      document.querySelector("[data-payment-gateway]")?.dataset.paymentState === "awaiting"
  );
}
async function verify(page) {
  await page.evaluate(() => {
    window.fixtureRazorpay.options.handler({
      razorpay_order_id: "order-fixture",
      razorpay_payment_id: "pay-fixture",
      razorpay_signature: "fixture-signature",
    });
  });
  await page.locator("[data-checkout-success-step]").waitFor();
}
async function capture(page, name) {
  if (!process.env.COMMERCE_LIBRARY_SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.COMMERCE_LIBRARY_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(process.env.COMMERCE_LIBRARY_SCREENSHOT_DIR, name),
    fullPage: true,
  });
}
async function bounds(page, label) {
  for (const width of [320, 350, 390, 520, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${label}: overflow at ${width}`
    );
    const sizes = await page
      .locator("h1,h2")
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.getBoundingClientRect().width)
          .map((node) => parseFloat(getComputedStyle(node).fontSize))
      );
    assert.ok(
      sizes.every((size) => size >= 18),
      `${label}: readable headings at ${width}`
    );
  }
}

check(
  "Subscription, My Study Library and every checkout step are bounded plain layouts from 320 to 1440px",
  async () => {
    for (const name of ["subscription", "study", "checkout"]) {
      const { page, errors } = await open(`page=${name}&long`);
      if (name === "subscription") await page.locator("[data-subscription-plan-picker]").waitFor();
      if (name === "study") await page.locator("[data-my-course-card]").first().waitFor();
      if (name === "checkout") await ready(page);
      const content = page.locator(
        name === "subscription"
          ? "[data-subscription-page]"
          : name === "study"
          ? "[data-study-library-content]"
          : "[data-checkout-content]"
      );
      assert.equal(
        await content.locator(".dc-glass-card,.dc-scene-plate,.dc-profile-subpanel").count(),
        0
      );
      await bounds(page, name);
      await capture(page, `${name}-desktop.png`);
      await page.setViewportSize({ width: 390, height: 1000 });
      await capture(page, `${name}-mobile.png`);
      if (name === "checkout") {
        await payment(page);
        await bounds(page, "payment");
        await capture(page, "payment-desktop.png");
        await page.setViewportSize({ width: 390, height: 1000 });
        await capture(page, "payment-mobile.png");
        await pay(page);
        await verify(page);
        await bounds(page, "receipt");
        await page.locator("[data-checkout-success-entitlements] summary").click();
        await bounds(page, "receipt with long references");
        await capture(page, "receipt-desktop.png");
        await page.setViewportSize({ width: 390, height: 1000 });
        await capture(page, "receipt-mobile.png");
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
);

check(
  "Subscription has one itemised summary and one checkout action, with exact feature/product prices and real sale reduction",
  async () => {
    const { page, errors } = await open();
    await page.locator("[data-subscription-plan-picker]").waitFor();
    await page.getByRole("radio", { name: "Monthly", exact: true }).check();
    assert.equal(await page.locator("[data-subscription-price-summary]").count(), 1);
    assert.equal(await page.locator("[data-subscription-cta]").count(), 1);
    assert.equal(
      await page
        .locator(
          "[data-subscription-confirm-modal],[data-subscription-live-selection],.dc-sub-deck-wrap"
        )
        .count(),
      0
    );
    assert.match(
      await page.locator('[data-subscription-summary-feature="my-day"]').textContent(),
      /My Day.*₹29\.95/
    );
    assert.match(
      await page.locator('[data-subscription-summary-feature="revision"]').textContent(),
      /Roman AI Pro.*₹79/
    );
    assert.equal(await page.locator("[data-subscription-total]").textContent(), "₹238.9");
    await coursePicker(page);
    assert.ok(
      await page.locator('[data-subscription-product-pick="owned-doc"] input').isDisabled()
    );
    await page.locator('[data-subscription-product-pick="alpha-doc"] input').check();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    assert.match(
      await page.locator('[data-subscription-summary-product="alpha-doc"]').textContent(),
      /Waves and optics.*₹229\.95.*₹149\.95/
    );
    assert.match(await page.locator("[data-subscription-summary-sale]").textContent(), /₹80/);
    assert.equal(await page.locator("[data-subscription-total]").textContent(), "₹388.85");
    await code(page, "coupon", "SAVE");
    await page.locator("[data-subscription-summary-discount]").waitFor();
    assert.match(
      await page.locator("[data-subscription-summary-discount]").textContent(),
      /SAVE.*₹25/
    );
    assert.equal(await page.locator("[data-subscription-total]").textContent(), "₹363.85");
    await page.locator("[data-subscription-cta]").click();
    await ready(page);
    assert.equal(await page.locator("[data-checkout-stepbar]").getAttribute("data-step"), "1");
    assert.match(
      await page.locator('[data-checkout-subscription-feature="my-day"]').textContent(),
      /My Day/
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
);

check(
  "Subscription duration changes use catalog prices, respect feature visibility and discard selection-bound codes",
  async () => {
    const { page, errors } = await open();
    await page.locator("[data-subscription-plan-picker]").waitFor();
    await page.getByRole("radio", { name: "Monthly", exact: true }).check();
    await features(page);
    assert.equal(await page.locator('[data-subscription-feature-pick="lab"]').count(), 0);
    assert.equal(await page.locator('[data-subscription-feature-pick="advanced"]').count(), 0);
    assert.ok(await page.locator('[data-subscription-feature-pick="notes"] input').isDisabled());
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await code(page, "coupon", "SAVE");
    await page.locator("[data-subscription-summary-discount]").waitFor();
    await page.getByRole("radio", { name: "Yearly", exact: true }).check();
    assert.equal(await page.locator("[data-subscription-summary-discount]").count(), 0);
    assert.equal(await page.locator("[data-subscription-total]").textContent(), "₹2,389.45");
    await features(page);
    await page.locator('[data-subscription-feature-pick="lab"] input').check();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    assert.equal(await page.locator("[data-subscription-total]").textContent(), "₹2,788.95");
    await page.getByRole("radio", { name: "Monthly", exact: true }).check();
    assert.equal(await page.locator('[data-subscription-summary-feature="lab"]').count(), 0);
    assert.equal(await page.locator("[data-subscription-total]").textContent(), "₹238.9");
    await page.locator("[data-subscription-comparison] summary").click();
    assert.match(await page.locator("[data-subscription-comparison]").textContent(), /Not offered/);
    await bounds(page, "expanded plan comparison");
    assert.deepEqual(errors, []);
    await page.close();
  }
);

check(
  "Subscription ignores slow obsolete coupon responses and enforces actual referral/floor reductions",
  async () => {
    const { page, errors } = await open();
    await page.locator("[data-subscription-plan-picker]").waitFor();
    await page.getByRole("radio", { name: "Monthly", exact: true }).check();
    await code(page, "coupon", "SLOW");
    await page.getByRole("radio", { name: "Yearly", exact: true }).check();
    await page.waitForTimeout(800);
    assert.equal(await page.locator("[data-subscription-summary-discount]").count(), 0);
    assert.equal(await page.locator("[data-subscription-total]").textContent(), "₹2,389.45");
    await page.getByRole("radio", { name: "Monthly", exact: true }).check();
    await code(page, "referral", "FRIEND");
    await page.locator("[data-subscription-summary-discount]").waitFor();
    assert.equal(await page.locator("[data-subscription-total]").textContent(), "₹19.95");
    assert.match(
      await page.locator("[data-subscription-summary-discount]").textContent(),
      /Referral discount.*FRIEND.*₹218\.95/
    );
    assert.match(await page.locator("[data-subscription-min-payable]").textContent(), /₹19\.95/);
    await page.getByRole("button", { name: "Remove referral code" }).click();
    await code(page, "referral", "USED");
    await page.locator("[data-referral-already-used]").waitFor();
    await page.locator("[data-referral-already-used]").click();
    assert.match(page.url(), /#\/leaderboard$/);
    assert.deepEqual(errors, []);
    await page.close();
  }
);

check(
  "Membership ownership blocks repeat purchases, charges only new add-ons and retains higher-plan carry-over",
  async () => {
    const { page, errors } = await open("page=subscription&member");
    await page.locator("[data-subscription-plan-picker]").waitFor();
    await page.waitForFunction(
      () => document.querySelector('[data-subscription-plan="premium"] input')?.checked
    );
    assert.equal(await page.locator('[data-subscription-plan="basic"]').count(), 0);
    assert.ok(await page.locator("[data-subscription-cta]").isDisabled());
    await features(page);
    assert.ok(await page.locator('[data-subscription-feature-pick="my-day"] input').isDisabled());
    await page.locator('[data-subscription-feature-pick="revision"] input').check();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    assert.ok(await page.locator("[data-subscription-cta]").isEnabled());
    assert.match(
      await page.locator("[data-subscription-summary-plan]").textContent(),
      /Already paid.*₹0/
    );
    assert.equal(await page.locator("[data-subscription-total]").textContent(), "₹79");
    assert.match(
      await page.locator("[data-subscription-addon-upgrade-note]").textContent(),
      /expiry stay unchanged/
    );
    await page.locator('[data-subscription-plan="pro"] input').check();
    assert.match(
      await page.locator("[data-subscription-summary-owned]").first().textContent(),
      /Carried over.*₹0/
    );
    assert.equal(
      await page.locator("[data-subscription-summary-plan] dd").textContent(),
      "₹349.95"
    );
    assert.deepEqual(errors, []);
    await page.close();
    const yearly = await open("page=subscription&member&yearlyMember");
    await yearly.page.locator("[data-subscription-plan-picker]").waitFor();
    await yearly.page.waitForFunction(
      () =>
        document.querySelector('input[name="subscription-cycle"]:checked')?.parentElement
          .textContent === "Yearly"
    );
    assert.ok(await yearly.page.getByRole("radio", { name: "Monthly", exact: true }).isDisabled());
    await yearly.page.close();
  }
);

check(
  "Renewal uses the exact subscriber override and free subscriptions retain numeric zero without code fields",
  async () => {
    const member = await open("page=subscription&member&renewal");
    await member.page.locator("[data-subscription-plan-picker]").waitFor();
    await member.page.waitForFunction(
      () => document.querySelector('[data-subscription-plan="premium"] input')?.checked
    );
    assert.ok(await member.page.locator("[data-subscription-cta]").isEnabled());
    assert.equal(
      await member.page.locator("[data-subscription-summary-plan] dd").textContent(),
      "₹199.25"
    );
    await member.page.close();
    const free = await open("page=subscription&free");
    await free.page.locator("[data-subscription-plan-picker]").waitFor();
    assert.equal(await free.page.locator("[data-subscription-total]").textContent(), "₹0");
    assert.equal(await free.page.locator("[data-subscription-coupon-input]").count(), 0);
    assert.match(
      await free.page.locator("[data-subscription-free-note]").textContent(),
      /verifies ₹0/
    );
    await free.page.close();
  }
);

check(
  "Subscription catalog loading/fallback and support disclose real rules rather than invented offers",
  async () => {
    const pending = await open("page=subscription&catalogLoading");
    await pending.page.locator("[data-subscription-loading]").waitFor();
    assert.equal(await pending.page.locator("[data-subscription-cta]").count(), 0);
    await pending.page.close();
    const { page, errors } = await open("page=subscription&catalogError");
    await page.locator("[data-subscription-fallback-note]").waitFor();
    assert.match(
      await page.locator("[data-subscription-fallback-note]").textContent(),
      /estimates.*current availability/
    );
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await page.getByRole("button", { name: "Help & FAQ", exact: true }).click();
    await page.locator("[data-subscription-help-sheet]").waitFor();
    assert.equal(await page.locator('a[href="mailto:support@example.test"]').count(), 1);
    assert.doesNotMatch(
      await page.locator("[data-subscription-help-sheet]").textContent(),
      /Stripe|24\/7|50%|all courses/i
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
);

check(
  "Checkout review preserves buyer, named line prices, actual discounts and coupon apply/remove/error",
  async () => {
    const { page, errors } = await open("page=checkout");
    await ready(page);
    assert.match(
      await page.locator("[data-checkout-buyer]").textContent(),
      /Ananya Sharma.*learner\.example|Ananya Sharma/
    );
    assert.equal(await page.locator("[data-firebase-verified]").textContent(), "Verified buyer");
    assert.equal(await page.locator("[data-checkout-final-total]").textContent(), "₹229.9");
    assert.match(
      await page.locator("[data-checkout-line-items]").textContent(),
      /Wave motion.*₹149\.95.*₹99\.95.*Ray optics.*₹179\.95.*₹129\.95/
    );
    assert.match(
      await page.locator("[data-checkout-line-items]").textContent(),
      /Already-owned introduction.*₹0/
    );
    await page.locator("[data-checkout-coupon-input]").fill("BAD");
    await page.locator("[data-checkout-coupon-apply]").click();
    await page.locator("[data-checkout-coupon-error]").waitFor();
    assert.equal(await page.locator("[data-checkout-final-total]").textContent(), "₹229.9");
    await page.locator("[data-checkout-coupon-input]").fill("SAVE");
    await page.locator("[data-checkout-coupon-apply]").click();
    await page.locator("[data-checkout-coupon-remove]").waitFor();
    assert.equal(await page.locator("[data-checkout-final-total]").textContent(), "₹204.9");
    assert.match(
      await page.locator("[data-checkout-price-section]").textContent(),
      /Coupon discount \(SAVE\).*₹25/
    );
    await page.locator("[data-checkout-coupon-remove]").click();
    await page.locator("[data-checkout-coupon-input]").waitFor();
    assert.equal(await page.locator("[data-checkout-final-total]").textContent(), "₹229.9");
    assert.deepEqual(errors, []);
    await page.close();
  }
);

check(
  "Expired quotes automatically block checkout, failed refresh retains recovery and retry re-enables payment",
  async () => {
    const { page, errors } = await open("page=checkout&expiresSoon");
    await ready(page);
    await page.locator("[data-checkout-review-notice]").waitFor();
    assert.ok(await page.locator("[data-checkout-proceed]").isDisabled());
    await page.evaluate(() => {
      window.fixtureFaults.quote = true;
    });
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.waitForFunction(
      () =>
        window.fixtureRequests.filter((request) => request.url === "/api/quotes/create").length >= 3
    );
    assert.ok(await page.locator("[data-checkout-proceed]").isDisabled());
    await page.evaluate(() => {
      window.fixtureFaults.quote = false;
    });
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("[data-checkout-proceed]").disabled);
    assert.equal(await page.locator("[data-checkout-review-notice]").count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
);

check(
  "Paid checkout verifies only the quote/order response, shows a read-only receipt and opens My Purchases",
  async () => {
    const { page, errors } = await open("page=checkout");
    await payment(page);
    assert.equal(await page.locator("[data-checkout-stepbar]").getAttribute("data-step"), "2");
    await pay(page);
    await verify(page);
    assert.equal(await page.locator("[data-checkout-stepbar]").getAttribute("data-step"), "3");
    assert.match(
      await page.locator("[data-checkout-success-receipt]").textContent(),
      /order-fixture.*pay-fixture.*Verified/
    );
    assert.equal(await page.locator("[data-checkout-success-cash-paid]").textContent(), "₹229.9");
    assert.equal(
      await page
        .locator("[data-payment-gateway-pay],[data-checkout-success-step] [data-checkout-proceed]")
        .count(),
      0
    );
    const requests = await page.evaluate(() => window.fixtureRequests);
    assert.deepEqual(
      Object.keys(requests.find((request) => request.url === "/api/razorpay/create-order").body),
      ["quoteId"]
    );
    assert.equal(
      requests.filter((request) => request.url === "/api/razorpay/verify-payment").length,
      1
    );
    await page.locator("[data-checkout-success-library]").click();
    assert.match(page.url(), /#\/store\/purchases$/);
    assert.deepEqual(errors, []);
    await page.close();
  }
);

check(
  "Free and coupon-zero orders show numeric ₹0, skip Razorpay, and still verify entitlement grants",
  async () => {
    for (const query of ["page=checkout&free", "page=checkout"]) {
      const { page, errors } = await open(query);
      await ready(page);
      if (!query.includes("free")) {
        await page.locator("[data-checkout-coupon-input]").fill("ZERO");
        await page.locator("[data-checkout-coupon-apply]").click();
        await page.locator("[data-checkout-coupon-remove]").waitFor();
      } else assert.equal(await page.locator("[data-checkout-coupon-input]").count(), 0);
      assert.equal(await page.locator("[data-checkout-final-total]").textContent(), "₹0");
      await payment(page);
      await page.locator("[data-payment-gateway-pay]").click();
      await page.locator("[data-checkout-success-step]").waitFor();
      assert.equal(await page.locator("[data-checkout-success-cash-paid]").textContent(), "₹0");
      assert.match(
        await page.locator("[data-checkout-success-receipt]").textContent(),
        /No payment required.*Free access/
      );
      assert.ok(await page.evaluate(() => !window.fixtureRazorpay));
      assert.equal(
        await page.evaluate(
          () =>
            window.fixtureRequests.filter(
              (request) => request.url === "/api/razorpay/verify-payment" && request.body.free
            ).length
        ),
        1
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
);

check(
  "Payment cancellation and system Back retain the payment step; verification/order failures never show success",
  async () => {
    const { page, errors } = await open("page=checkout");
    await payment(page);
    await pay(page);
    await page.evaluate(() => window.fixtureRazorpay.close());
    await page.getByRole("alert").waitFor();
    assert.equal(await page.locator("[data-checkout-stepbar]").getAttribute("data-step"), "2");
    assert.equal(await page.locator("[data-checkout-success-step]").count(), 0);
    await pay(page);
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await page.waitForFunction(() => !document.body.classList.contains("eduvora-razorpay-open"));
    assert.equal(await page.locator("[data-checkout-stepbar]").getAttribute("data-step"), "2");
    await page.evaluate(() => {
      window.fixtureFaults.verify = true;
    });
    await pay(page);
    await page.evaluate(() =>
      window.fixtureRazorpay.options.handler({
        razorpay_order_id: "order-fixture",
        razorpay_payment_id: "pay-fixture",
        razorpay_signature: "fixture-signature",
      })
    );
    await page.locator("[data-payment-state=error]").waitFor();
    assert.equal(await page.locator("[data-checkout-success-step]").count(), 0);
    assert.match(await page.getByRole("alert").textContent(), /could not be verified/);
    await page.evaluate(() => {
      window.fixtureFaults.verify = false;
      window.fixtureFaults.order = true;
    });
    await page.locator("[data-payment-gateway-pay]").click();
    await page.locator("[data-payment-state=error]").waitFor();
    assert.match(await page.getByRole("alert").textContent(), /Could not create secure order/);
    assert.equal(await page.locator("[data-checkout-success-step]").count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
);

check(
  "Subscription checkout and receipt retain all named free/paid access, cycle, expiry and membership navigation",
  async () => {
    const { page, errors } = await open("page=checkout&subscription&addon");
    await ready(page);
    assert.match(
      await page.locator("[data-checkout-subscription-unlocks]").textContent(),
      /Premium.*Monthly membership.*Plan already paid.*₹0/
    );
    assert.match(
      await page.locator('[data-checkout-subscription-feature="notes"]').textContent(),
      /Study notes.*₹0/
    );
    assert.match(
      await page.locator("[data-checkout-subscription-expiry]").textContent(),
      /expiry stays unchanged/
    );
    await payment(page);
    await pay(page);
    await verify(page);
    assert.equal(await page.locator("[data-checkout-success-membership-info]").count(), 1);
    assert.match(
      await page.locator("[data-checkout-success-membership-info]").textContent(),
      /My Day.*Roman AI Pro.*Study notes.*Waves and optics.*Plan study handbook/
    );
    assert.equal(await page.locator("[data-checkout-success-library]").count(), 0);
    await page.locator("[data-checkout-success-membership]").click();
    assert.match(page.url(), /#\/profile$/);
    assert.deepEqual(errors, []);
    await page.close();
  }
);

check(
  "Checkout has honest loading, empty, rejected-selection and server-error recovery",
  async () => {
    for (const variant of ["empty", "quoteLoading", "quoteError", "invalid"]) {
      const { page, errors } = await open(`page=checkout&${variant}`);
      await page
        .locator(
          variant === "quoteLoading" ? "[data-checkout-loading]" : "[data-checkout-recovery-ui]"
        )
        .waitFor();
      assert.equal(await page.locator("[data-checkout-proceed]").count(), 0);
      assert.equal(await page.locator("[data-checkout-success-step]").count(), 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
);

check(
  "My Study Library keeps genuine recursive counts, search, one create action and open/edit/delete routes",
  async () => {
    const { page, errors } = await open("page=study");
    await page.locator("[data-my-course-card]").first().waitFor();
    assert.equal(await page.locator("[data-my-course-create]").count(), 1);
    assert.match(
      await page.locator("[data-study-library-count]").textContent(),
      /2 courses.*3 modules.*2 resources/
    );
    assert.match(
      await page.locator('[data-my-course-card="course-one"]').textContent(),
      /2 modules.*2 resources/
    );
    assert.equal(
      await page.locator("[data-my-course-play-button],[data-my-course-edit-button]").count(),
      0
    );
    await page.locator("[data-my-course-search]").fill("plant");
    assert.equal(await page.locator("[data-my-course-card]").count(), 1);
    assert.match(await page.locator("[data-my-course-card]").textContent(), /Biology/);
    await page.locator("[data-my-course-search]").fill("no-match");
    assert.match(await page.locator("[data-study-library-content]").textContent(), /No matches/);
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.locator('[data-my-course-play="course-one"]').click();
    assert.match(page.url(), /#\/my-course\/course-one$/);
    await page.locator('[data-my-course-edit="course-one"]').click();
    assert.match(page.url(), /#\/my-course\/course-one\/edit$/);
    await page.locator("[data-my-course-create]").click();
    assert.match(page.url(), /#\/my-course\/new$/);
    assert.deepEqual(errors, []);
    await page.close();
  }
);

check(
  "Library deletion requires confirmation, rolls back failed writes, preserves retry, and never double-deletes",
  async () => {
    const { page, errors } = await open("page=study&deleteError");
    await page.locator("[data-my-course-card]").first().waitFor();
    await page.locator('[data-my-course-delete="course-one"]').click();
    assert.equal(await page.locator("[data-my-course-card]").count(), 2);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    assert.equal(await page.getByRole("alertdialog").count(), 0);
    assert.equal(await page.evaluate(() => window.fixtureDeletes?.length || 0), 0);
    await page.locator('[data-my-course-delete="course-one"]').click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await page.waitForFunction(() => window.fixtureDeletes?.length === 1);
    await page.locator('[data-my-course-card="course-one"]').waitFor();
    assert.equal(await page.getByRole("alertdialog").count(), 1);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await page.waitForFunction(() => window.fixtureDeletes?.length === 2);
    await page.waitForFunction(() => !document.querySelector('[data-my-course-card="course-one"]'));
    assert.equal(await page.getByRole("alertdialog").count(), 0);
    assert.equal(await page.locator("[data-my-course-card]").count(), 1);
    assert.deepEqual(errors, []);
    await page.close();
  }
);

check(
  "Library loading/error/empty/signed-out states and broken images stay honest without extra create buttons",
  async () => {
    for (const variant of ["loading", "libraryError", "empty", "guest", "brokenCover"]) {
      const { page, errors } = await open(`page=study&${variant}`);
      if (variant === "loading") {
        await page.locator("[data-my-course-skeleton]").waitFor();
        assert.equal(await page.locator("[data-study-library-count]").count(), 0);
      } else if (variant === "libraryError") {
        await page.getByRole("alert").waitFor();
        assert.match(await page.getByRole("alert").textContent(), /temporarily unavailable/);
        assert.equal(await page.locator("[data-study-library-count]").count(), 0);
      } else if (variant === "empty") {
        await page.locator("[data-my-course-empty]").waitFor();
        assert.equal(await page.locator("[data-my-course-create]").count(), 1);
      } else if (variant === "guest") {
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        assert.match(page.url(), /#\/auth/);
      } else {
        await page.locator('[data-my-course-card="course-one"] .dc-study-cover-fallback').waitFor();
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
);

check(
  "The real AppShell keeps minimalist subscription, checkout and library layouts readable beside desktop navigation",
  async () => {
    for (const name of ["subscription", "checkout", "study"]) {
      const { page, errors } = await open(`page=${name}&shell&long`, 1440);
      if (name === "subscription") await page.locator("[data-subscription-plan-picker]").waitFor();
      else if (name === "checkout") await ready(page);
      else await page.locator("[data-my-course-card]").first().waitFor();
      const content = page.locator(
        name === "subscription"
          ? "[data-subscription-page]"
          : name === "checkout"
          ? "[data-checkout-content]"
          : "[data-study-library-content]"
      );
      assert.equal(await content.locator(".dc-glass-card,.dc-scene-plate").count(), 0);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${name}: shell overflow`
      );
      await capture(page, `${name}-actual-desktop-shell.png`);
      await page.setViewportSize({ width: 1024, height: 1000 });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${name}: tablet shell overflow`
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
);

check("Checkout toolbar stays visible below the shared mobile header", async () => {
  const { page, errors } = await open("page=checkout");
  await ready(page);
  const layout = await page.evaluate(() => {
    const out = {};
    for (const selector of [
      "[data-site-header]",
      "[data-checkout-toolbar]",
      "[data-checkout-toolbar] h1",
      '[data-checkout-toolbar] [aria-label="Back to source"]',
    ]) {
      const node = document.querySelector(selector);
      const rect = node.getBoundingClientRect(),
        style = getComputedStyle(node);
      out[selector] = {
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        position: style.position,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        transform: style.transform,
      };
    }
    return out;
  });
  assert.ok(
    layout["[data-checkout-toolbar] h1"].top >= layout["[data-site-header]"].bottom,
    "Checkout title must not sit underneath the shared header"
  );
  assert.ok(
    layout['[data-checkout-toolbar] [aria-label="Back to source"]'].height >= 44,
    "Back control remains touch-sized"
  );
  await capture(page, "checkout-mobile-current.png");
  assert.deepEqual(errors, []);
  await page.close();
});

check(
  "Plan module grants stay named and partial; review and receipt retain authoritative snapshot titles",
  async () => {
    const chooser = await open("page=subscription&moduleUnlocks");
    await chooser.page.locator("[data-subscription-price-summary]").waitFor();
    const summary = chooser.page.locator("[data-subscription-summary-module]");
    assert.equal(
      await summary.count(),
      2,
      "Aliases in metadata and unlock records must not duplicate a grant"
    );
    assert.match((await summary.allTextContents()).join(" "), /Wave motion/);
    assert.match((await summary.allTextContents()).join(" "), /Ray optics/);
    assert.match(
      (await summary.allTextContents()).join(" "),
      /Module included with this plan.*Waves and optics.*₹0/
    );
    assert.deepEqual(chooser.errors, []);
    await chooser.page.close();

    const { page, errors } = await open("page=checkout&subscription&moduleUnlocks&quotedNames");
    await ready(page);
    assert.equal(await page.locator("[data-checkout-subscription-module]").count(), 2);
    assert.equal(
      await page.locator("[data-checkout-subscription-plan-unlock]").count(),
      1,
      "A module unlock must not be represented as an extra full-course unlock"
    );
    assert.match(
      await page.locator("[data-checkout-subscription-modules-count]").textContent(),
      /Modules \(2\)/
    );
    const modules = (
      await page.locator("[data-checkout-subscription-module]").allTextContents()
    ).join(" ");
    assert.match(modules, /Wave motion.*Module.*Waves and optics.*Included with plan.*₹0/);
    assert.match(modules, /Server-quoted optics lesson.*Quoted optics course.*₹0/);
    assert.match(
      await page.locator('[data-checkout-subscription-feature="my-day"]').textContent(),
      /Quoted task workspace/
    );
    assert.match(
      await page.locator("[data-checkout-subscription-product]").textContent(),
      /Quoted waves course/
    );
    await payment(page);
    await pay(page);
    await verify(page);
    const receipt = page.locator("[data-checkout-success-membership-info]");
    assert.match(await receipt.textContent(), /Quoted task workspace/);
    assert.match(await receipt.textContent(), /Server-quoted optics lesson/);
    assert.equal(await receipt.locator("[data-checkout-subscription-module]").count(), 2);
    await bounds(page, "Named membership module receipt");
    assert.deepEqual(errors, []);
    await page.close();
  }
);
