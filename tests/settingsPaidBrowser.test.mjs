// Real Settings/PDP pages + preference/access/shared-listener/quote controllers.
// Only external Auth, Firestore, HTTP and OS APIs are deterministic boundaries.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createSettingsPaidServer, fixture } from "./helpers/settingsPaidTestServer.mjs";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const enabled = fs.existsSync(executablePath);
let server, origin, browser;
before(async () => {
  if (!enabled) return;
  ({ server, origin } = await createSettingsPaidServer());
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
});
after(async () => { await browser?.close(); await server?.close(); });
const check = (name, fn) => test(name, { timeout: 120000 }, async (t) => { if (!enabled) return t.skip("Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"); await fn(); });
async function open(query = "page=settings", width = 390, height = 1000) {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}${fixture}?${query}`);
  await page.locator(query.includes("page=catalog") ? "[data-catalog-probe]" : query.includes("page=pdp") ? "[data-pdp-root]" : query.includes("page=public") ? "[data-public-profile]" : "[data-settings-page]").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}
async function ready(page) { await page.waitForFunction(() => window.probe?.preferences.ready && !window.probe.preferences.loading); }
async function accessReady(page) { await page.waitForFunction(() => window.probe && !window.probe.access.loading && !window.probe.access.error); }
async function paid(page) { await accessReady(page); await page.getByRole("button", { name: "Paid", exact: true }).click(); await page.locator("[data-pdp-paid-content]").waitFor(); }
async function clean(page, errors) { assert.deepEqual(errors, []); await page.close(); }
async function capture(page, name) {
  if (!process.env.SETTINGS_PAID_SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.SETTINGS_PAID_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.SETTINGS_PAID_SCREENSHOT_DIR, name + ".png"), fullPage: true });
}
check("Settings and Paid are bounded at 320–1920px in the real chrome, with readable headings and mobile-only breadcrumb removal", async () => {
  for (const target of ["settings", "pdp"]) {
    const { page, errors } = await open(`page=${target}&shell&base&partial&long`);
    await ready(page); if (target === "pdp") await paid(page);
    for (const width of [320, 350, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${target} overflow ${width}`);
      const h1 = page.locator(target === "settings" ? ".settings-heading h1" : "[data-pdp-titleblock] h1");
      assert.ok(await h1.evaluate((node) => parseFloat(getComputedStyle(node).fontSize) >= 24), `${target} heading ${width}`);
      if (target === "settings") {
        assert.equal(await page.locator(".settings-breadcrumb").isVisible(), width >= 768);
        const switchBox = await page.locator(".settings-switch").first().boundingBox(); assert.ok(switchBox.height >= 44);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 }); if (target === "pdp") await paid(page); await capture(page, `${target}-desktop`);
    await page.setViewportSize({ width: 390, height: 1000 }); if (target === "pdp") await paid(page); await capture(page, `${target}-mobile`);
    await clean(page, errors);
  }
});
check("all five real account switches persist on → off → on, including reload and native keyboard controls", async () => {
  const { page, errors } = await open(); await ready(page);
  for (const key of ["push", "email", "promotions", "profileVisible", "shareActivity"]) {
    const input = page.locator(`#setting-${key}`);
    if (!await input.isChecked()) { await input.check({ force: true }); await page.waitForFunction((key) => !window.probe.preferences.savingKeys.includes(key), key); }
    await input.uncheck({ force: true }); await page.waitForFunction((key) => !window.probe.preferences.savingKeys.includes(key), key); assert.equal(await input.isChecked(), false);
    await input.check({ force: true }); await page.waitForFunction((key) => !window.probe.preferences.savingKeys.includes(key), key); assert.equal(await input.isChecked(), true);
  }
  assert.equal(await page.evaluate(() => window.fixtureState.permissionRequests), 0, "account controls don't prompt OS permission");
  await page.reload(); await ready(page); for (const key of ["push", "email", "promotions", "profileVisible", "shareActivity"]) assert.equal(await page.locator(`#setting-${key}`).isChecked(), true);
  await page.locator("#setting-push").focus(); await page.keyboard.press("Space"); await page.waitForFunction(() => !window.probe.preferences.savingKeys.length); assert.equal(await page.locator("#setting-push").isChecked(), false);
  await page.keyboard.press("Space"); await page.waitForFunction(() => !window.probe.preferences.savingKeys.length); assert.equal(await page.locator("#setting-push").isChecked(), true);
  await clean(page, errors);
});
check("failed save rolls back, releases its switch and retries the intended change", async () => {
  const { page, errors } = await open("page=settings&saveError"); await ready(page);
  await page.locator("#setting-push").click({ force: true }); await page.getByRole("alert").waitFor();
  assert.equal(await page.locator("#setting-push").isChecked(), true); assert.ok(await page.locator("#setting-push").isEnabled());
  await page.evaluate(() => { window.fixtureState.faults.save = false; }); await page.getByRole("button", { name: "Retry change", exact: true }).click();
  await page.waitForFunction(() => !window.probe.preferences.preferences.push && !window.probe.preferences.savingKeys.length);
  assert.equal(await page.getByRole("alert").count(), 0); assert.equal(await page.evaluate(() => window.fixtureState.writes.length), 2);
  await clean(page, errors);
});
check("lost HTTP acknowledgement with a confirmed snapshot does not falsely revert the switch", async () => {
  const { page, errors } = await open("page=settings&lostAck"); await ready(page);
  await page.locator("#setting-push").uncheck({ force: true }); await page.waitForFunction(() => !window.probe.preferences.savingKeys.length);
  assert.equal(await page.locator("#setting-push").isChecked(), false); assert.equal(await page.getByRole("alert").count(), 0);
  await clean(page, errors);
});
check("only the saving field is locked; concurrent single-field writes preserve both choices", async () => {
  const { page, errors } = await open("page=settings&slowSave"); await ready(page);
  await page.locator("#setting-push").uncheck({ force: true }); assert.ok(await page.locator("#setting-push").isDisabled()); assert.ok(await page.locator("#setting-email").isEnabled());
  await page.locator("#setting-email").uncheck({ force: true }); assert.equal(await page.evaluate(() => window.fixtureState.writes.length), 2);
  await page.evaluate(() => window.fixtureState.release()); await page.waitForFunction(() => !window.probe.preferences.savingKeys.length);
  assert.equal(await page.locator("#setting-push").isChecked(), false); assert.equal(await page.locator("#setting-email").isChecked(), false);
  await clean(page, errors);
});
check("cross-device updates sync without duplicate account listeners; switching users isolates saved and pending preferences", async () => {
  const { page, errors } = await open(); await ready(page);
  assert.equal(await page.evaluate(() => window.fixtureState.snapshotStarts["users/learner-a"]), 1);
  await page.evaluate(() => window.fixtureState.remotePreferences({ push: false, profileVisible: false }));
  await page.waitForFunction(() => !window.probe.preferences.preferences.push); assert.equal(await page.locator("#setting-profileVisible").isChecked(), false);
  await page.evaluate(() => { window.fixtureState.holdSave = true; }); await page.locator("#setting-email").uncheck({ force: true });
  await page.evaluate(() => window.fixtureState.switchUser("learner-b")); await page.waitForFunction(() => document.querySelector("[data-fixture-account]").textContent === "learner-b" && window.probe.preferences.ready);
  assert.equal(await page.locator("#setting-push").isChecked(), true); assert.equal(await page.locator("#setting-email").isChecked(), true);
  await page.evaluate(() => window.fixtureState.release()); assert.equal(await page.locator("#setting-email").isChecked(), true);
  await clean(page, errors);
});
check("read/stream failure has usable retry and reconnect keeps the mounted access consumer", async () => {
  const { page, errors } = await open("page=settings&readError&accessError=account");
  await page.getByRole("alert").waitFor(); assert.ok(await page.locator("#setting-push").isDisabled());
  await page.evaluate(() => { window.fixtureState.faults.read = false; window.fixtureState.faults.sync = false; });
  await page.getByRole("button", { name: "Retry connection", exact: true }).click(); await ready(page); await accessReady(page);
  assert.equal(await page.getByRole("alert").count(), 0); assert.ok(await page.locator("#setting-push").isEnabled());
  assert.ok(await page.evaluate(() => window.fixtureState.snapshotStarts["users/learner-a"] >= 2));
  await clean(page, errors);
});
check("unsupported or OS-blocked devices never prevent the saved account switch turning back on", async () => {
  for (const flag of ["unsupported", "blocked"]) {
    const { page, errors } = await open(`page=settings&${flag}`); await ready(page);
    await page.locator("#setting-push").uncheck({ force: true }); await page.waitForFunction(() => !window.probe.preferences.savingKeys.length);
    await page.locator("#setting-push").check({ force: true }); await page.waitForFunction(() => !window.probe.preferences.savingKeys.length);
    assert.equal(await page.locator("#setting-push").isChecked(), true); assert.equal(await page.evaluate(() => window.fixtureState.permissionRequests), 0);
    await page.locator(".settings-device button").click(); await page.locator(".settings-device-message").waitFor();
    assert.match(await page.locator(".settings-device-message").textContent(), flag === "blocked" ? /browser settings/ : /does not support/);
    assert.equal(await page.locator("#setting-push").isChecked(), true); assert.equal(await page.evaluate(() => window.fixtureState.permissionRequests), 0);
    await clean(page, errors);
  }
});
check("explicit browser setup prompts once, failed device registration preserves account consent, and retry can connect", async () => {
  const { page, errors } = await open("page=settings&setupError&pushOff"); await ready(page);
  await page.getByRole("button", { name: "Turn on & connect", exact: true }).click(); await page.locator(".settings-device-message").waitFor();
  assert.equal(await page.locator("#setting-push").isChecked(), true); assert.equal(await page.evaluate(() => window.fixtureState.permissionRequests), 1);
  assert.match(await page.locator(".settings-device-message").textContent(), /not confirmed/);
  await page.evaluate(() => { window.fixtureState.faults.setup = false; }); await page.getByRole("button", { name: "Connect device", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-device-state]").dataset.deviceState === "connected");
  assert.equal(await page.evaluate(() => window.fixtureState.permissionRequests), 1);
  await clean(page, errors);
});
check("native setup waits for the authenticated server ACK and never duplicates listeners on reconnect", async () => {
  const { page, errors } = await open("page=settings&native&permissionGranted"); await ready(page);
  await page.evaluate(() => { window.fixtureState.holdNative = true; }); await page.getByRole("button", { name: "Connect device", exact: true }).click();
  await page.waitForFunction(() => window.fixtureState.nativeRequests === 1); assert.ok(await page.getByRole("button", { name: "Connecting…", exact: true }).isDisabled());
  assert.notEqual(await page.locator("[data-device-state]").getAttribute("data-device-state"), "connected");
  await page.evaluate(() => { window.fixtureState.holdNative = false; window.fixtureState.release(); });
  await page.waitForFunction(() => document.querySelector("[data-device-state]").dataset.deviceState === "connected");
  await page.getByRole("button", { name: "Reconnect device", exact: true }).click(); await page.waitForFunction(() => window.fixtureState.nativeRequests === 2 && document.querySelector("[data-device-state]").dataset.deviceState === "connected");
  assert.equal(await page.evaluate(() => [...window.fixtureState.nativeListeners.values()].every((group) => group.size === 1)), true);
  assert.equal(await page.evaluate(() => window.fixtureState.permissionRequests), 0);
  await clean(page, errors);
});
check("missing email/push configuration is stated honestly and does not disable reversible preferences", async () => {
  const { page, errors } = await open("page=settings&emailUnconfigured&pushUnconfigured"); await ready(page);
  assert.match(await page.locator('[data-setting="email"]').textContent(), /isn't configured/);
  await page.getByRole("button", { name: "Connect device", exact: true }).click(); await page.locator(".settings-device-message").waitFor(); assert.match(await page.locator(".settings-device-message").textContent(), /not configured/);
  assert.equal(await page.locator("#setting-push").isChecked(), true);
  await clean(page, errors);
});
check("public profile withdrawal is immediate on the next request; only opted-in activity counts can appear", async () => {
  const { page, errors } = await open("page=settings"); await ready(page);
  await page.locator("#setting-shareActivity").check({ force: true }); await page.waitForFunction(() => !window.probe.preferences.savingKeys.length);
  await page.goto(`${origin}${fixture}?page=public`); await page.getByRole("heading", { name: "Ananya Sharma", exact: true }).waitFor(); assert.match(await page.locator(".public-profile-activity").textContent(), /Courses started2Completed learning items9/);
  await page.goto(`${origin}${fixture}?page=settings`); await ready(page); await page.locator("#setting-profileVisible").uncheck({ force: true }); await page.waitForFunction(() => !window.probe.preferences.savingKeys.length);
  await page.goto(`${origin}${fixture}?page=public`); await page.getByRole("alert").waitFor(); assert.match(await page.getByRole("alert").textContent(), /private or unavailable/); assert.equal(await page.locator(".public-profile-header").count(), 0);
  await clean(page, errors);
});
check("signed-out Settings offers sign-in instead of editable cosmetic controls", async () => {
  const { page, errors } = await open("page=settings&guest"); assert.equal(await page.getByRole("switch").count(), 0);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); assert.match(await page.evaluate(() => location.hash), /#\/auth.*return=%23%2Fsettings/);
  await clean(page, errors);
});
check("free-base PDP exposes About / Content / Paid with remaining scopes, genuine MRP/sale/₹0 and no hidden content", async () => {
  const { page, errors } = await open("page=pdp"); await paid(page);
  for (const name of ["About", "Content", "Paid"]) assert.equal(await page.getByRole("button", { name, exact: true }).count(), 1);
  assert.equal(await page.locator("[data-pdp-paid-item]").count(), 5); assert.equal(await page.locator("[data-pdp-owned-item]").count(), 0);
  assert.match(await page.locator('[data-pdp-paid-item="module:advanced"]').textContent(), /₹300₹249/);
  assert.match(await page.locator('[data-pdp-paid-item="module:sample"]').textContent(), /₹100₹0/);
  assert.ok(await page.locator('[data-pdp-paid-item="update:exam-2026"] input').isDisabled()); assert.match(await page.locator('[data-pdp-paid-item="update:exam-2026"]').textContent(), /base product first/);
  assert.doesNotMatch(await page.locator("[data-pdp-paid-content]").textContent(), /Private draft|Private answer key/);
  await clean(page, errors);
});
check("after a real partial purchase, remaining paid content comes first, divider then named acquired scopes, with only one library action", async () => {
  const { page, errors } = await open("page=pdp&base&partial&resource&update"); await paid(page);
  assert.equal(await page.locator('[data-pdp-paid-item="module:advanced"]').count(), 0); assert.equal(await page.locator('[data-pdp-owned-item="module:advanced"]').count(), 1); assert.match(await page.locator('[data-pdp-owned-item="module:advanced"]').textContent(), /Purchased module/);
  assert.equal(await page.locator('[data-pdp-owned-item="update:exam-2026"]').count(), 1); assert.match(await page.locator('[data-pdp-owned-item="update:exam-2026"]').textContent(), /Purchased update/);
  assert.equal(await page.locator('[data-pdp-owned-item="resource:workbook"]').count(), 1);
  const order = await page.locator("[data-pdp-paid-content]").evaluate((node) => [...node.children].map((child) => child.hasAttribute("data-pdp-paid-divider") ? "divider" : child.getAttribute("data-pdp-paid-group")));
  assert.deepEqual(order, ["available", "divider", "owned"]);
  assert.equal(await page.locator("[data-pdp-cta-button],[data-pdp-checkout]").count(), 0); assert.equal(await page.locator("[data-pdp-library-primary]").count(), 1);
  await page.locator("[data-pdp-library-primary]").click(); assert.equal(await page.locator("output").textContent(), "library");
  await clean(page, errors);
});
check("Paid selections use one verified checkout controller, preserve item names/prices and can clear/reselect", async () => {
  const { page, errors } = await open("page=pdp&base"); await paid(page);
  const choice = page.locator('[data-pdp-paid-item="module:advanced"] input'); await choice.check();
  await page.waitForFunction(() => document.querySelector('[data-pdp-order-summary][data-pricing-status="verified"]'));
  assert.match(await page.locator("[data-pdp-summary-items]").textContent(), /Advanced practice.*₹300.*₹249/);
  assert.match(await page.locator("[data-pdp-summary-total]").textContent(), /₹249/);
  assert.equal(await page.locator("[data-pdp-cta-button],[data-pdp-checkout]").count(), 1); assert.equal(await page.locator("[data-pdp-module-select-trigger]").count(), 0);
  await page.getByRole("button", { name: "Review selection", exact: true }).click(); assert.equal(await page.evaluate(() => document.activeElement.id), "pdp-purchase-review");
  await page.locator("[data-pdp-cta-button]").click(); const result = JSON.parse(await page.locator("output").textContent()); assert.deepEqual(result.selection.moduleIds, ["advanced"]); assert.equal(result.payable, 249);
  await choice.uncheck(); await page.locator("[data-pdp-library-primary]").waitFor(); assert.equal(await page.locator("[data-pdp-price-box]").count(), 0);
  await choice.check(); await page.waitForFunction(() => document.querySelector('[data-pdp-order-summary][data-pricing-status="verified"]')); assert.match(await page.locator("[data-pdp-summary-total]").textContent(), /₹249/);
  await clean(page, errors);
});
check("module prerequisites are added with individual prices but already acquired prerequisites are never charged again", async () => {
  for (const owned of [false, true]) {
    const { page, errors } = await open(`page=pdp&base${owned ? "&partial" : ""}`); await paid(page);
    await page.locator('[data-pdp-paid-item="module:strategies"] input').check(); await page.waitForFunction(() => document.querySelector('[data-pdp-order-summary][data-pricing-status="verified"]'));
    assert.equal(await page.locator('[data-pdp-summary-item="strategies"]').count(), 1); assert.equal(await page.locator('[data-pdp-summary-item="advanced"]').count(), owned ? 0 : 1);
    assert.match(await page.locator("[data-pdp-summary-total]").textContent(), owned ? /₹399/ : /₹648/);
    assert.match(await page.locator("[data-pdp-selection-rules]").textContent(), owned ? /Already owned; no additional charge/ : /Included in this selection/);
    await clean(page, errors);
  }
});
check("paid updates and resources retain their separate named verified scope, replacing module selection without duplicated pickers", async () => {
  const { page, errors } = await open("page=pdp&base"); await paid(page);
  await page.locator('[data-pdp-paid-item="module:advanced"] input').check();
  await page.locator('[data-pdp-paid-item="update:exam-2026"] input').check(); await page.waitForFunction(() => document.querySelector('[data-pdp-summary-item="exam-2026"]') && document.querySelector('[data-pdp-order-summary][data-pricing-status="verified"]'));
  assert.equal(await page.locator('[data-pdp-paid-item="module:advanced"] input').isChecked(), false); assert.match(await page.locator("[data-pdp-summary-items]").textContent(), /2026 exam pack/); assert.match(await page.locator("[data-pdp-summary-total]").textContent(), /₹500/);
  assert.equal(await page.locator("[data-pdp-paid-update]").count(), 0);
  await page.locator('[data-pdp-paid-item="resource:workbook"] input').check(); await page.waitForFunction(() => document.querySelector('[data-pdp-summary-item="workbook"]') && document.querySelector('[data-pdp-order-summary][data-pricing-status="verified"]'));
  assert.match(await page.locator("[data-pdp-summary-items]").textContent(), /Question workbook/); assert.match(await page.locator("[data-pdp-summary-total]").textContent(), /₹79/); assert.equal(await page.locator("[data-pdp-resource-row]").count(), 0);
  await clean(page, errors);
});
check("legacy courseContent and genuine zero-sale selections still flow through verified review", async () => {
  for (const legacy of [false, true]) {
    const { page, errors } = await open(`page=pdp&base${legacy ? "&legacy" : ""}`); await paid(page);
    await page.locator('[data-pdp-paid-item="module:sample"] input').check(); await page.waitForFunction(() => document.querySelector('[data-pdp-order-summary][data-pricing-status="verified"]'));
    assert.match(await page.locator('[data-pdp-summary-item="sample"]').textContent(), /₹100₹0/); assert.match(await page.locator("[data-pdp-summary-total]").textContent(), /₹0/);
    await clean(page, errors);
  }
});
check("active subscription is clearly time-limited; purchased update without base is retained with access guidance", async () => {
  const subscribed = await open("page=pdp&subscription"); await paid(subscribed.page); assert.match(await subscribed.page.locator('[data-pdp-owned-item="module:advanced"]').textContent(), /Subscription access/); await clean(subscribed.page, subscribed.errors);
  const blocked = await open("page=pdp&update"); await paid(blocked.page); assert.equal(await blocked.page.locator('[data-pdp-paid-item="update:exam-2026"]').count(), 0); assert.match(await blocked.page.locator('[data-pdp-owned-item="update:exam-2026"]').textContent(), /Get the base product/); assert.equal(await blocked.page.evaluate(() => window.probe.access.resolution.hasFullProductAccess), false); await clean(blocked.page, blocked.errors);
});
check("access waits for all real sources, not a timer; errors block quoting and retry reconnects every consumer", async () => {
  for (const source of ["entitlements", "subscription", "account", "purchases"]) {
    const { page, errors } = await open(`page=pdp&waitAccess=${source}`); await page.getByRole("button", { name: "Paid", exact: true }).click(); await page.locator("[data-pdp-paid-loading]").waitFor();
    await page.waitForTimeout(100); assert.equal(await page.evaluate(() => window.fixtureState.quoteRequests.length), 0);
    await page.evaluate(() => window.fixtureState.releaseAccess()); await paid(page); await clean(page, errors);
  }
  const { page, errors } = await open("page=pdp&accessError=entitlements"); await page.getByRole("button", { name: "Paid", exact: true }).click(); await page.locator(".dc-pdp-paid-error").waitFor(); assert.equal(await page.evaluate(() => window.fixtureState.quoteRequests.length), 0);
  await page.evaluate(() => { window.fixtureState.faults.sync = false; }); await page.locator(".dc-pdp-paid-error").getByRole("button", { name: "Retry access check", exact: true }).click(); await paid(page);
  assert.equal(await page.evaluate(() => window.probe.library.loading), false); assert.equal(await page.evaluate(() => window.probe.library.error), null);
  await clean(page, errors);
});
check("selection/ownership/subscription state cannot leak across account changes", async () => {
  const { page, errors } = await open("page=pdp&subscription&partial"); await paid(page); await page.locator('[data-pdp-paid-item="module:strategies"] input').check();
  await page.evaluate(() => window.fixtureState.switchUser("learner-b")); await page.waitForFunction(() => document.querySelector("[data-fixture-account]").textContent === "learner-b" && !window.probe.access.loading);
  assert.equal(await page.evaluate(() => window.probe.access.hasActiveSubscription), false); assert.equal(await page.evaluate(() => window.probe.access.subscription), null); assert.equal(await page.evaluate(() => window.probe.access.resolution.ownedModuleIds.size), 0);
  assert.equal(await page.locator('[data-pdp-paid-item="module:strategies"] input').isChecked(), false); assert.equal(await page.locator("[data-pdp-owned-item]").count(), 0);
  await clean(page, errors);
});
check("pricing errors disable payment and offer a real recovery without inventing a payable total", async () => {
  const { page, errors } = await open("page=pdp&base&quoteError"); await paid(page); await page.locator('[data-pdp-paid-item="module:advanced"] input').check();
  await page.locator(".dc-pdp-pricing-error").first().waitFor(); assert.ok(await page.locator("[data-pdp-cta-button]").isDisabled());
  await page.evaluate(() => { window.fixtureState.faults.quote = false; }); await page.getByRole("button", { name: "Retry pricing", exact: true }).click(); await page.waitForFunction(() => document.querySelector('[data-pdp-order-summary][data-pricing-status="verified"]')); assert.ok(await page.locator("[data-pdp-cta-button]").isEnabled());
  await clean(page, errors);
});
check("guest Paid discovery remains usable but does not claim owned content or make a verified price assertion", async () => {
  const { page, errors } = await open("page=pdp&guest"); await paid(page); assert.equal(await page.locator("[data-pdp-owned-item]").count(), 0); assert.match(await page.locator("[data-pdp-paid-content]").textContent(), /Sign in/);
  await page.locator('[data-pdp-paid-item="module:advanced"] input').check(); assert.equal(await page.evaluate(() => window.fixtureState.quoteRequests.length), 0);
  assert.notEqual(await page.locator("[data-pdp-order-summary]").getAttribute("data-pricing-status"), "verified");
  await clean(page, errors);
});

check("Content and About describe only the genuine base bundle; optional paid resources/modules belong in Paid", async () => {
  const { page, errors } = await open("page=pdp&base"); await accessReady(page);
  assert.match(await page.locator("[data-pdp-details]").textContent(), /1 module/);
  await page.getByRole("button", { name: "Content", exact: true }).click();
  assert.equal(await page.locator("[data-pdp-curriculum-module]").count(), 1);
  const text = await page.locator("[data-pdp-curriculum]").textContent();
  assert.match(text, /Foundation lessons|Core lesson notes/); assert.doesNotMatch(text, /Advanced practice|Exam strategies|Question workbook|2026 mock exams/);
  await paid(page); assert.match(await page.locator("[data-pdp-paid-content]").textContent(), /Question workbook|Advanced practice/);
  await clean(page, errors);
});

check("an explicit zero expiry and revoked/expired base grants cannot be resurrected by legacy receipts or root arrays", async () => {
  for (const flag of ["zeroExpiry", "expiredBase", "revokedBase"]) {
    const { page, errors } = await open(`page=pdp&${flag}`); await paid(page);
    assert.equal(await page.evaluate(() => window.probe.access.resolution.hasFullProductAccess), false);
    assert.equal(await page.locator('[data-pdp-owned-item="module:advanced"]').count(), 0);
    assert.equal(await page.locator("[data-pdp-library-primary]").count(), 0);
    await clean(page, errors);
  }
});

check("a purchase arriving while Paid is open moves the scope below the divider and removes the repeated purchase intent", async () => {
  const { page, errors } = await open("page=pdp&base"); await paid(page);
  await page.locator('[data-pdp-paid-item="module:advanced"] input').check(); await page.waitForFunction(() => document.querySelector('[data-pdp-order-summary][data-pricing-status="verified"]'));
  await page.evaluate(() => window.fixtureState.acquireModule("advanced")); await page.locator('[data-pdp-owned-item="module:advanced"]').waitFor();
  assert.equal(await page.locator('[data-pdp-paid-item="module:advanced"]').count(), 0);
  assert.equal(await page.getByRole("button", { name: "Review selection", exact: true }).count(), 0);
  assert.equal(await page.locator("[data-pdp-cta-button]").count(), 0); assert.equal(await page.locator("[data-pdp-library-primary]").count(), 1);
  assert.equal(await page.locator("[data-pdp-paid-divider]").count(), 1);
  await clean(page, errors);
});

check("owners of a free base can apply a real coupon to a paid add-on, with named sale and coupon reductions and final payable", async () => {
  const { page, errors } = await open("page=pdp&base"); await paid(page);
  await page.locator('[data-pdp-paid-item="module:advanced"] input').check(); await page.waitForFunction(() => document.querySelector('[data-pdp-order-summary][data-pricing-status="verified"]'));
  await page.locator("[data-pdp-coupon] summary").click(); await page.getByLabel("Coupon code", { exact: true }).fill("SAVE50"); await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.locator("[data-pdp-coupon-discount]").waitFor(); assert.match(await page.locator("[data-pdp-coupon-discount]").textContent(), /SAVE50.*−₹50/); assert.match(await page.locator("[data-pdp-summary-total]").textContent(), /₹199/);
  assert.match(await page.locator("[data-pdp-summary-breakdown]").textContent(), /Price discount−₹51/);
  await page.locator("[data-pdp-cta-button]").click(); const output = JSON.parse(await page.locator("output").textContent()); assert.equal(output.selection.couponCode, "SAVE50"); assert.equal(output.payable, 199);
  await page.locator('[data-pdp-paid-item="module:sample"] input').check(); await page.locator('[data-pdp-paid-item="module:advanced"] input').uncheck();
  await page.waitForFunction(() => document.querySelector('[data-pdp-order-summary][data-pricing-status="verified"]') && !document.querySelector('[data-pdp-coupon-discount]'));
  assert.equal(await page.locator("[data-pdp-coupon]").count(), 0); assert.match(await page.locator("[data-pdp-summary-total]").textContent(), /₹0/);
  await clean(page, errors);
});
check("late prices from a replaced Paid selection cannot override current named resources or payable", async () => {
  const { page, errors } = await open("page=pdp&base"); await paid(page); await page.evaluate(() => { window.fixtureState.holdQuote = true; });
  await page.locator('[data-pdp-paid-item="module:advanced"] input').check(); await page.waitForFunction(() => window.fixtureState.quoteRequests.length >= 1);
  await page.locator('[data-pdp-paid-item="resource:workbook"] input').check(); await page.waitForFunction(() => window.fixtureState.quoteRequests.length >= 2);
  await page.evaluate(() => { window.fixtureState.holdQuote = false; window.fixtureState.release(); });
  await page.waitForFunction(() => document.querySelector('[data-pdp-order-summary][data-pricing-status="verified"]'));
  assert.equal(await page.locator('[data-pdp-summary-item="advanced"]').count(), 0); assert.match(await page.locator("[data-pdp-summary-items]").textContent(), /Question workbook/); assert.match(await page.locator("[data-pdp-summary-total]").textContent(), /₹79/);
  await page.locator("[data-pdp-cta-button]").click(); const output = JSON.parse(await page.locator("output").textContent()); assert.deepEqual(output.selection.resourceIds, ["workbook"]); assert.equal(output.payable, 79);
  await clean(page, errors);
});

check("the real CatalogProvider mounts and never labels scoped, expired, revoked or old-account receipts as full ownership", async () => {
  for (const flags of ["partial", "update", "resource", "expiredBase", "revokedBase", "base"]) {
    const { page, errors } = await open(`page=catalog&${flags}`);
    await page.waitForFunction(() => document.querySelector('[data-catalog-probe]') && JSON.parse(document.querySelector('[data-catalog-probe]').textContent).loading === false);
    await page.waitForTimeout(50);
    const current = JSON.parse(await page.locator('[data-catalog-probe]').textContent());
    if (flags === "base") {
      assert.ok(current.ids.includes("foundations-doc")); assert.ok(current.ids.includes("foundations"));
      await page.evaluate(() => window.fixtureState.switchUser("learner-b")); await page.waitForFunction(() => JSON.parse(document.querySelector('[data-catalog-probe]').textContent).ids.length === 0);
    } else assert.deepEqual(current.ids, []);
    await clean(page, errors);
  }
});
