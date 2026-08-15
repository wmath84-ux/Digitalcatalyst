// tests/renewalBannerMountContract.test.mjs
//
// The renewal banner is the one piece of this feature that floats over
// the entire app, so its restraint matters more than its presence.
// These tests pin both: that it is actually mounted in the shell, and
// that it cannot turn into a nag.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildRenewalView, RENEWAL_STAGE_PRESENTATION } from "../utils/renewalPresentation.js";
import { getRenewalReminder } from "../utils/subscriptionRenewal.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const main = read("src/main.tsx");
const host = read("src/components/subscription/RenewalBannerHost.tsx");

test("the banner is mounted once in the app shell", () => {
  assert.match(main, /RenewalBannerHost/, "the host must be imported");
  assert.match(main, /<RenewalNotice \/>/, "the notice must be rendered in the provider tree");
  // Root returns early per route, so exactly one mount point outside it.
  assert.equal((main.match(/<RenewalNotice \/>/g) || []).length, 1);
});

test("the renew CTA opens the subscription page in manage mode", () => {
  assert.match(main, /SUBSCRIPTION_HASH\}\?renew=1/);
  // The subscription page must understand that param.
  assert.match(read("src/subscription/components/SubscriptionPage.tsx"), /renew=1/);
});

test("the banner stays quiet where it would be redundant or intrusive", () => {
  assert.match(host, /SUPPRESSED_PREFIXES/);
  for (const route of ["#/subscription", "#/checkout", "#/admin", "#/auth", "#/landing"]) {
    assert.ok(host.includes(`"${route}"`), `${route} should suppress the banner`);
  }
});

test("members who opted out of reminders never see it", () => {
  assert.match(host, /renewalReminderOptOut === true/);
});

test("a dismissal is remembered per stage and per expiry, not forever", () => {
  // Keyed by expiry so a renewal resets the memory, and by stage so the
  // next, more urgent notice still breaks through.
  assert.match(host, /\$\{getRenewalReminder\(subscription\)\?\.expiresAt \?\? ""\}:\$\{view\.stage\}/);
  assert.match(host, /if \(view\.dismissible && dismissed\[dismissKey\]\)/);
});

test("the two critical stages cannot be dismissed", () => {
  assert.equal(RENEWAL_STAGE_PRESENTATION.due.dismissible, false);
  assert.equal(RENEWAL_STAGE_PRESENTATION.expired.dismissible, false);
  // The host defers to the presentation layer instead of deciding.
  assert.match(host, /view\.dismissible/);
});

test("urgency escalates monotonically across the stages", () => {
  const order = ["d7", "d3", "d1", "due", "expired"];
  let previous = 0;
  for (const stage of order) {
    const { urgency } = RENEWAL_STAGE_PRESENTATION[stage];
    assert.ok(urgency >= previous, `${stage} must not de-escalate`);
    previous = urgency;
  }
});

test("copy never implies an automatic charge", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const view = buildRenewalView(
    getRenewalReminder({ status: "active", planId: "premium", expiresAt: now + 7 * day, cycle: "monthly" }, now),
    { planName: "Premium", now },
  );
  assert.ok(view, "a 7-day-out subscription should produce a view");
  assert.match(view.body, /never charged without confirming/);
  assert.doesNotMatch(`${view.headline} ${view.body} ${view.cta}`, /auto-?renew|automatically charged/i);
});

test("an expired membership is told what it lost, not just that it ended", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const view = buildRenewalView(
    getRenewalReminder({ status: "active", planId: "premium", expiresAt: now - 3 * day, cycle: "monthly" }, now),
    { planName: "Premium", now },
  );
  assert.ok(view);
  assert.equal(view.stage, "expired");
  assert.equal(view.expired, true);
  assert.equal(view.canRenew, true);
  assert.match(view.body, /restore your selected features and products/);
});

test("the renew button only becomes active once the subscription has expired", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const before = buildRenewalView(
    getRenewalReminder({ status: "active", planId: "premium", expiresAt: now + 7 * day, cycle: "monthly" }, now),
    { planName: "Premium", now },
  );
  assert.ok(before);
  assert.equal(before.expired, false);
  assert.equal(before.canRenew, false);

  const after = buildRenewalView(
    getRenewalReminder({ status: "active", planId: "premium", expiresAt: now - 1 * day, cycle: "monthly" }, now),
    { planName: "Premium", now },
  );
  assert.ok(after);
  assert.equal(after.expired, true);
  assert.equal(after.canRenew, true);
});
