import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    chromium.executablePath(),
  enabled = fs.existsSync(executablePath);
const fixture = "/tests/fixtures/marketplaceOverlaysHarness/index.html",
  data = "/tests/fixtures/marketplaceOverlaysHarness/data.ts";
const init = `const params=new URLSearchParams(location.search);`;
const stubs = {
  AuthContext: `${init}export const useAuth=()=>({user:params.has('guest')?null:{id:'fixture',uid:'fixture',name:'Ananya Sharma',email:'learner@example.test',role:'student'}});`,
  CatalogContext: `import{products}from'${data}';${init}export const useCatalog=()=>({products,purchasedIds:new Set(['owned']),loading:params.has('catalogLoading'),error:params.has('catalogError')?'Catalog unavailable':null});`,
  CommerceContext: `export const useCommerce=()=>({cartIds:new Set(),favoriteIds:new Set()});`,
  BrandingContext: `export const useBranding=()=>({appName:'Digital Catalyst',logoUrl:'',homeGradientFrom:'#4f46e5',homeGradientTo:'#7c3aed'});`,
  firebase: `export const db={};export const auth={currentUser:{uid:'fixture',getIdToken:async()=>'fixture-token'}};export const getFirebaseStorage=()=>({});`,
  useUnreadNotificationCount: `export const useUnreadNotificationCount=()=>0;`,
  firestore: `import{leaderboard,filters}from'${data}';${init}export const doc=(...parts)=>parts;export const collection=(...parts)=>parts;export const query=(...parts)=>parts;export const where=(...parts)=>parts;export const getDoc=async(ref)=>({exists:()=>params.has('cache')&&ref.includes('publicLeaderboard'),data:()=>leaderboard});export const onSnapshot=(ref,next)=>{next({exists:()=>false,data:()=>ref.includes('storeFilters')&&params.has('adminFilters')?{filters}:{},docs:[]});return()=>{};};export const getDocs=async()=>({docs:[]});export const setDoc=async()=>{};export const deleteDoc=async()=>{};export const serverTimestamp=()=>null;`,
  apiBase: `import{leaderboard}from'${data}';${init}window.fixtureFaults={leaderboard:params.has('leaderError'),save:params.has('saveError'),delete:params.has('deleteError'),course:params.has('courseError')};export const apiFetch=async()=>{if(params.has('leaderLoading'))return new Promise(()=>{});if(window.fixtureFaults.leaderboard)return new Response(JSON.stringify({ok:false,error:'Leaderboard unavailable'}),{status:503});return new Response(JSON.stringify({ok:true,...(params.has('empty')?{users:[],subscribers:[]}:leaderboard)}),{status:200});};`,
  featureAnalytics: `export const trackFeatureEvent=()=>{};`,
  myCourseClient: `import{course,cover}from'${data}';${init}export{createMyCourse,createMyModule,createMyResource,createMyQuestion,countModules,countResources}from'/src/lib/myCourseClient.ts?helpers';let stored=[structuredClone(course)];const listeners=new Set();export const subscribeMyCourses=(_uid,next,error)=>{listeners.add(next);queueMicrotask(()=>params.has('courseLoading')?null:window.fixtureFaults.course?error(Error('Course unavailable')):next(stored));return()=>listeners.delete(next);};export const describeMyCoursesError=error=>error.message;export const saveMyCourse=async(uid,doc)=>{window.fixtureSaves??=[];window.fixtureSaves.push({uid,doc:structuredClone(doc)});if(window.fixtureFaults.save)throw Error('Save failed');stored=[doc];for(const next of listeners)next(stored);};export const deleteMyCourse=async(uid,id)=>{window.fixtureDeletes??=[];window.fixtureDeletes.push({uid,id});await new Promise(resolve=>setTimeout(resolve,150));if(window.fixtureFaults.delete)throw Error('Delete failed');stored=stored.filter(doc=>doc.id!==id);for(const next of listeners)next(stored);};export const uploadMyCourseCover=async()=>cover;export const uploadMyCourseResourceFile=async(_uid,_id,file)=>({url:'https://example.test/'+file.name,fileName:file.name,size:file.size});`,
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
        name: "marketplace-ui-boundaries",
        enforce: "pre",
        resolveId(id) {
          const name =
            id === "firebase/firestore" ? "firestore" : id.split("/").at(-1);
          if (Object.hasOwn(stubs, name)) return "\0marketplace:" + name;
        },
        load(id) {
          if (id.startsWith("\0marketplace:"))
            return stubs[id.slice("\0marketplace:".length)];
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
  test(name, { timeout: 120000 }, async (t) => {
    if (!enabled) return t.skip("Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
    await fn();
  });
async function open(query, width = 390, height = 900, screen) {
  const page = await browser.newPage({
    viewport: { width, height },
    ...(screen ? { screen } : {}),
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + fixture + "?" + query);
  await page
    .locator(
      query.includes("leaderboard")
        ? "[data-leaderboard-page]"
        : query.includes("library")
        ? "[data-study-library-page]"
        : query.includes("editor")
        ? "[data-my-course-editor],[data-my-course-editor-loading]"
        : query.includes("modules")
        ? "[data-open-modules]"
        : "[data-store-page]"
    )
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}
async function bounds(page, label) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true,
    label + " document overflow"
  );
}
async function capture(page, name) {
  if (!process.env.MARKETPLACE_SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.MARKETPLACE_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(process.env.MARKETPLACE_SCREENSHOT_DIR, name + ".png"),
  });
}
check(
  "Store, leaderboard and course editor stay bounded in the real shared shell on phones/tablets/desktops",
  async () => {
    for (const target of ["store", "leaderboard", "editor"]) {
      const { page, errors } = await open("page=" + target + "&shell&long");
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await bounds(page, target + " " + width);
        if (target === "editor")
          await page.locator("[data-my-course-title-input]").waitFor();
      }
      await capture(page, target + "-desktop");
      await page.setViewportSize({ width: 390, height: 900 });
      await capture(page, target + "-mobile");
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
);
check(
  "Desktop leaderboard heading and first row are reachable above the overlay header at scrollTop zero",
  async () => {
    for (const width of [960, 1024, 1440, 1920]) {
      const { page, errors } = await open("page=leaderboard&shell", width, 650);
      await page.locator("[data-leaderboard-member]").first().waitFor();
      await page.locator("[data-desktop-content]").evaluate((node) => {
        node.scrollTop = node.scrollHeight;
        node.scrollTop = 0;
      });
      const geometry = await page.evaluate(() => ({
        header: document
          .querySelector("[data-desktop-topbar]")
          .getBoundingClientRect().bottom,
        title: document
          .querySelector(".dc-leaderboard-heading")
          .getBoundingClientRect().top,
        first: document
          .querySelector("[data-leaderboard-member]")
          .getBoundingClientRect().top,
        padding: document.querySelector("[data-leaderboard-page]").style
          .paddingTop,
      }));
      assert.ok(
        geometry.title >= geometry.header,
        JSON.stringify({ width, ...geometry })
      );
      assert.ok(geometry.first >= geometry.header);
      assert.equal(geometry.padding, "");
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
);
check(
  "Leaderboard retains available/used/unavailable code truth, copying and unused filter without fake ranks or rewards",
  async () => {
    const { page, errors } = await open("page=leaderboard&shell", 1440);
    await page
      .getByRole("button", { name: "Subscribers", exact: true })
      .click();
    await page.locator(".dc-leaderboard-subscriber").first().waitFor();
    assert.equal(await page.locator(".dc-leaderboard-subscriber").count(), 3);
    assert.match(
      await page.locator(".dc-leaderboard-subscriber").nth(1).textContent(),
      /Used/
    );
    assert.match(
      await page.locator(".dc-leaderboard-subscriber").nth(2).textContent(),
      /Unavailable/
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Copy referral ID USED250" })
        .isDisabled(),
      true
    );
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.fixtureCopied = text;
          },
        },
      })
    );
    await page
      .getByRole("button", { name: "Copy referral ID AVAILABLE250" })
      .click();
    assert.equal(
      await page.evaluate(() => window.fixtureCopied),
      "AVAILABLE250"
    );
    await page.getByRole("button", { name: "Unused IDs", exact: true }).click();
    assert.equal(await page.locator(".dc-leaderboard-subscriber").count(), 1);
    assert.doesNotMatch(
      await page.locator("[data-leaderboard-page]").textContent(),
      /you get rewards|referral champions/
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
);
check(
  "Leaderboard has honest loading/cache/errors and usable retry, without claiming copied when clipboard fails",
  async () => {
    const pending = await open("page=leaderboard&leaderLoading");
    assert.equal(
      await pending.page.locator(".dc-leaderboard-stats").count(),
      0
    );
    await pending.page.close();
    const cached = await open("page=leaderboard&leaderError&cache");
    await cached.page
      .getByText("Showing the saved leaderboard.", { exact: false })
      .waitFor();
    assert.equal(
      await cached.page.locator("[data-leaderboard-member]").count(),
      45
    );
    await cached.page.close();
    const { page, errors } = await open("page=leaderboard&leaderError");
    await page
      .getByRole("heading", { name: "Leaderboard unavailable" })
      .waitFor();
    assert.equal(await page.locator(".dc-leaderboard-stats").count(), 0);
    await page.evaluate(() => (window.fixtureFaults.leaderboard = false));
    await page.getByRole("button", { name: "Try again" }).click();
    await page.locator("[data-leaderboard-member]").first().waitFor();
    await page
      .getByRole("button", { name: "Subscribers", exact: true })
      .click();
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw Error("Denied");
          },
        },
      })
    );
    await page
      .getByRole("button", { name: "Copy referral ID AVAILABLE250" })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Could not copy" })
      .waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
);
check(
  "Marketplace uses actual names, MRP/numeric zero/paise, review evidence, genuine ownership and independent course/cart/save actions",
  async () => {
    const { page, errors } = await open("page=store");
    const alpha = page.locator("[data-store-product=alpha]");
    assert.equal(await alpha.locator("del").textContent(), "₹299.95");
    assert.equal(
      await alpha.locator("[data-store-final-price]").textContent(),
      "₹149.95"
    );
    for (const id of ["zero", "free-flag", "no-mrp"])
      assert.equal(
        await page
          .locator(`[data-store-product="${id}"] [data-store-final-price]`)
          .textContent(),
        "₹0"
      );
    assert.equal(
      await page.locator("[data-store-product=no-mrp] del").count(),
      0
    );
    assert.equal(
      await page
        .locator("[data-store-product=no-mrp] .dc-marketplace-rating")
        .count(),
      0
    );
    assert.equal(
      await page
        .locator("[data-store-product=owned] .dc-marketplace-buy")
        .count(),
      0
    );
    assert.match(
      await page.locator("[data-store-product=not-sale]").textContent(),
      /Not for sale/
    );
    await alpha
      .getByRole("button", { name: "Save Waves and optics to favorites" })
      .click();
    assert.equal(
      await alpha
        .getByRole("button", { name: "Remove Waves and optics from favorites" })
        .getAttribute("aria-pressed"),
      "true"
    );
    await alpha
      .getByRole("button", { name: "Add to cart", exact: true })
      .click();
    assert.equal(await page.locator("output").textContent(), "cart:alpha");
    await alpha.getByRole("button", { name: "View Waves and optics" }).click();
    assert.equal(await page.locator("output").textContent(), "view:alpha");
    await page
      .locator("[data-store-product=zero]")
      .getByRole("button", { name: "Get access" })
      .click();
    assert.equal(await page.locator("output").textContent(), "view:zero");
    assert.deepEqual(errors, []);
    await page.close();
  }
);
check(
  "Marketplace search, server-managed category filters, sorts and all three layouts work without fake featured products",
  async () => {
    const { page, errors } = await open("page=store&adminFilters&shell", 1440);
    await page.getByRole("button", { name: "Biology", exact: true }).click();
    assert.equal(await page.locator("[data-store-product]").count(), 1);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page
      .getByRole("searchbox", { name: "Search the Store" })
      .fill("  waves  ");
    assert.equal(await page.locator("[data-store-product]").count(), 1);
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page.getByLabel("Sort products").selectOption("Price: Low to High");
    assert.equal(
      await page
        .locator("[data-store-product]")
        .first()
        .locator("[data-store-final-price]")
        .textContent(),
      "₹0"
    );
    for (const layout of ["list", "mixed", "grid"]) {
      await page.getByLabel("Product layout").selectOption(layout);
      assert.equal(await page.locator("[data-store-product]").count(), 9);
      await bounds(page, layout);
      await page.setViewportSize({ width: 390, height: 900 });
      await bounds(page, layout + " phone");
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    assert.equal(await page.locator("[data-store-top-rated]").count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
);
check(
  "Store filter overlay is native, focus-trapped, clearable, and resets every constraint after no results",
  async () => {
    const { page, errors } = await open("page=store");
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Filter the Store" });
    await dialog.waitFor();
    await dialog.getByLabel("Price", { exact: true }).selectOption("free");
    await dialog
      .getByLabel("Resource type", { exact: true })
      .selectOption("Live");
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() =>
          Boolean(document.activeElement.closest("[role=dialog]"))
        ),
        true
      );
    }
    await dialog.getByRole("button", { name: "Show results" }).click();
    await page
      .getByRole("heading", { name: "No matching resources" })
      .waitFor();
    await page.getByRole("button", { name: "Show all resources" }).click();
    assert.equal(await page.locator("[data-store-product]").count(), 9);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() =>
      document.activeElement.hasAttribute("data-store-advanced-filter-trigger")
    );
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.hasAttribute(
          "data-store-advanced-filter-trigger"
        )
      ),
      true
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
);
check(
  "Store loading/error/empty states do not fabricate counters, cards, ratings or unavailable prices",
  async () => {
    for (const variant of ["catalogLoading", "catalogError"]) {
      const { page, errors } = await open("page=store&" + variant);
      assert.equal(await page.locator("[data-store-product]").count(), 0);
      assert.equal(
        await page
          .locator("[role=status]")
          .filter({ hasText: /0 resources/ })
          .count(),
        0
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
);
check(
  "Module overlay stays viewport-bounded, keyboard-trapped and scrollable with names, prices, ownership and dependency rules intact",
  async () => {
    const { page, errors } = await open("page=modules", 390, 600);
    await page.locator("[data-open-modules]").click();
    const dialog = page.getByRole("dialog", { name: "Select modules" });
    await dialog.waitFor();
    assert.equal(
      await dialog
        .getByRole("checkbox", { name: /Already-owned introduction/ })
        .isDisabled(),
      true
    );
    assert.match(
      await dialog.locator("[data-pdp-module-pick=owned]").textContent(),
      /No charge.*₹0/
    );
    await dialog.getByRole("checkbox", { name: /Ray optics/ }).check();
    assert.equal(
      await dialog.getByRole("checkbox", { name: /Wave motion/ }).isChecked(),
      true
    );
    assert.match(await dialog.textContent(), /Requires: Wave motion/);
    assert.match(await dialog.textContent(), /₹149.95.*₹99.95/);
    assert.match(await dialog.textContent(), /Estimate ₹229.9/);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 600 });
      const box = await dialog.boundingBox();
      assert.ok(box.y >= 0 && box.y + box.height <= 601, JSON.stringify(box));
      await bounds(page, "modules " + width);
      assert.equal(
        await dialog
          .getByRole("button", { name: "Done", exact: true })
          .isVisible(),
        true
      );
    }
    await dialog
      .getByRole("searchbox", { name: "Search modules" })
      .fill("Bonus");
    assert.equal(await dialog.locator("[data-pdp-module-pick]").count(), 1);
    assert.match(
      await dialog.locator("[data-pdp-module-pick]").textContent(),
      /₹0/
    );
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() =>
          Boolean(document.activeElement.closest("[role=dialog]"))
        ),
        true
      );
    }
    await capture(page, "module-picker");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() =>
      document.activeElement.hasAttribute("data-open-modules")
    );
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.hasAttribute("data-open-modules")
      ),
      true
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
);
check(
  "Course editing preserves real draft fields, recursive structure, all resource types, save failures and player navigation",
  async () => {
    const { page, errors } = await open("page=editor&saveError");
    await page.locator("[data-my-course-title-input]").waitFor();
    await page
      .locator("[data-my-course-title-input]")
      .fill("My updated course");
    await page.locator("[data-my-module-add-child]").click();
    assert.equal(await page.locator("[data-my-module]").count(), 2);
    assert.equal(
      await page
        .locator("[data-my-resource-type-picker]")
        .first()
        .locator("option")
        .count(),
      15
    );
    await page.locator("[data-my-course-save]").click();
    await page.getByRole("alert").filter({ hasText: "Save failed" }).waitFor();
    assert.equal(
      await page.locator("[data-my-course-title-input]").inputValue(),
      "My updated course"
    );
    await page.evaluate(() => (window.fixtureFaults.save = false));
    await page.locator("[data-my-course-save-play]").click();
    assert.equal(await page.locator("output").textContent(), "play:course-one");
    assert.equal(
      await page.evaluate(
        () => window.fixtureSaves.at(-1).doc.modules[0].modules.length
      ),
      1
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
);
check(
  "Course delete overlay retains the draft during optimistic removal/failure, allows retry and blocks duplicate writes",
  async () => {
    const { page, errors } = await open("page=editor&deleteError");
    await page.locator("[data-my-course-delete]").click();
    const dialog = page.getByRole("dialog", { name: "Delete this course?" });
    await dialog.waitFor();
    await dialog
      .getByRole("button", { name: "Delete course", exact: true })
      .click();
    await dialog
      .getByRole("alert")
      .filter({ hasText: "Delete failed" })
      .waitFor();
    assert.equal(
      await page.locator("[data-my-course-title-input]").inputValue(),
      "My physics course"
    );
    assert.equal(await page.locator("[data-my-course-missing]").count(), 0);
    await page.evaluate(() => (window.fixtureFaults.delete = false));
    await dialog
      .getByRole("button", { name: "Delete course", exact: true })
      .evaluate((node) => {
        node.click();
        node.click();
      });
    await page.waitForFunction(
      () => document.querySelector("output").textContent === "library"
    );
    assert.equal(await page.evaluate(() => window.fixtureDeletes.length), 2);
    assert.deepEqual(errors, []);
    await page.close();
  }
);
check(
  "Editor loading/auth/errors and a new blank course have honest states and one create-module action",
  async () => {
    const pending = await open("page=editor&courseLoading");
    assert.equal(
      await pending.page.locator("[data-my-course-save]").count(),
      0
    );
    await pending.page.close();
    const failed = await open("page=editor&courseError");
    await failed.page
      .getByRole("heading", { name: "Course could not be loaded" })
      .waitFor();
    await failed.page.evaluate(() => (window.fixtureFaults.course = false));
    await failed.page.getByRole("button", { name: "Try again" }).click();
    await failed.page.locator("[data-my-course-title-input]").waitFor();
    await failed.page.close();
    const guest = await open("page=editor&guest");
    await guest.page
      .getByRole("heading", { name: "Sign in to build your course" })
      .waitFor();
    assert.equal(await guest.page.locator("[data-my-course-save]").count(), 0);
    await guest.page.close();
    const { page, errors } = await open("page=editor&new");
    await page.locator("[data-my-course-add-module]").waitFor();
    assert.equal(await page.locator("[data-my-course-add-module]").count(), 1);
    assert.match(
      await page.locator(".dc-editor-save-state").textContent(),
      /Not saved/
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
);
check(
  "Library card deletion uses the same native confirmation, named rule, retry and a safe focus return after rollback",
  async () => {
    const { page, errors } = await open("page=library&deleteError&shell", 1440);
    await page.locator("[data-my-course-delete]").click();
    const dialog = page.getByRole("alertdialog", {
      name: "Delete this course?",
    });
    await dialog.waitFor();
    assert.match(
      await dialog.textContent(),
      /My physics course.*permanently deleted/s
    );
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog
      .getByRole("alert")
      .filter({ hasText: "Delete failed" })
      .waitFor();
    assert.equal(await page.locator("[data-my-course-card]").count(), 1);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForFunction(() =>
      document.activeElement.hasAttribute("data-my-course-create")
    );
    await page.locator("[data-my-course-delete]").click();
    await page.evaluate(() => (window.fixtureFaults.delete = false));
    await dialog
      .getByRole("button", { name: "Delete", exact: true })
      .evaluate((node) => {
        node.click();
        node.click();
      });
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.fixtureDeletes.length), 2);
    assert.deepEqual(errors, []);
    await page.close();
  }
);
check(
  "Short landscape leaves first content reachable and dialog footer inside the viewport, including topbar tab clearance",
  async () => {
    for (const target of ["store", "leaderboard", "editor"]) {
      const { page, errors } = await open(
        "page=" + target + "&shell",
        820,
        390,
        { width: 820, height: 1180 }
      );
      await page.locator("[data-desktop-topbar]").waitFor();
      await page.evaluate(() => {
        const bar = document.querySelector("[data-desktop-topbar]");
        bar.setAttribute("data-topbar-tabs", "");
        bar.style.height = "108px";
        document.querySelector("[data-desktop-content]").scrollTop = 0;
      });
      const heading = page.locator(
        target === "store"
          ? ".dc-marketplace-heading"
          : target === "leaderboard"
          ? ".dc-leaderboard-heading"
          : ".dc-editor-title"
      );
      await heading.waitFor();
      const box = await heading.boundingBox();
      assert.ok(box.y >= 108, `${target} ${JSON.stringify(box)}`);
      await bounds(page, target + " landscape");
      assert.deepEqual(errors, []);
      await page.close();
    }
    const { page, errors } = await open("page=modules", 820, 390);
    await page.locator("[data-open-modules]").click();
    const dialog = page.getByRole("dialog", { name: "Select modules" });
    const box = await dialog.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 391);
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    assert.deepEqual(errors, []);
    await page.close();
  }
);
check(
  "Brain bulk import, safe interactive templates, upload and cover actions remain real saved authoring features",
  async () => {
    const { page, errors } = await open("page=editor&shell", 1440);
    const picker = page.locator("[data-my-resource-type-picker]").first();
    await picker.selectOption("brain");
    await page.locator("[data-my-brain-paste-toggle]").click();
    await page
      .locator("[data-my-brain-paste-input]")
      .fill(
        "1. Which quantity has a unit of hertz?\nA. Distance\nB. Frequency\nC. Mass\nD. Work\nAnswer: B\nExplanation: Frequency counts cycles per second."
      );
    await page.locator("[data-my-brain-import]").click();
    assert.equal(
      await page.locator("[data-my-brain-question-complete=true]").count(),
      1
    );
    await page.locator("[data-my-course-save]").click();
    assert.equal(
      await page.evaluate(
        () =>
          window.fixtureSaves
            .at(-1)
            .doc.modules[0].resources.find(
              (resource) => resource.type === "brain"
            )
            .practiceQuestions.filter((question) =>
              question.prompt.includes("hertz")
            ).length
      ),
      1
    );
    await picker.selectOption("interactive");
    await page.locator("[data-my-experiment-template]").first().click();
    assert.equal(
      await page.locator("[data-my-experiment-status=ready]").count(),
      1
    );
    await page.locator("[data-my-course-save]").click();
    assert.ok(
      await page.evaluate(() =>
        window.fixtureSaves
          .at(-1)
          .doc.modules[0].resources.find(
            (resource) => resource.type === "interactive"
          )
          .interactiveHtml.includes("<html")
      )
    );
    await picker.selectOption("pdf");
    await page
      .locator("[data-my-resource-file]")
      .first()
      .setInputFiles({
        name: "lesson.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\nfixture"),
      });
    await page.waitForFunction(
      () =>
        document.querySelector("[data-my-resource-url]").value ===
        "https://example.test/lesson.pdf"
    );
    await page.locator("[data-my-course-cover-input]").setInputFiles({
      name: "cover.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    });
    await page.locator("[data-my-course-save]").click();
    assert.equal(
      await page.evaluate(
        () => window.fixtureSaves.at(-1).doc.modules[0].resources[0].fileName
      ),
      "lesson.pdf"
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
);
