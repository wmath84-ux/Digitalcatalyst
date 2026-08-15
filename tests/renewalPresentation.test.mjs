// tests/renewalPresentation.test.mjs
//
// Subscription expiry / renewal messaging.
//
// `getRenewalReminder` decides WHICH stage fires; `buildRenewalView`
// decides HOW it reads. These tests walk a subscription across its
// whole timeline and assert the banner, notification and status card
// all receive a consistent, escalating message.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getRenewalReminder } from "../utils/subscriptionRenewal.js";
import {
  RENEWAL_STAGE_PRESENTATION,
  buildRenewalView,
  daysUntil,
  formatRemaining,
  shouldShowRenewalBanner,
} from "../utils/renewalPresentation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 15, 12, 0, 0);

/** Build a subscription doc that expires `days` from NOW. */
const subAt = (days, extra = {}) => ({
  status: days < 0 ? "expired" : "active",
  planId: "premium",
  planName: "Premium",
  cycle: "monthly",
  expiresAt: NOW + days * DAY_MS,
  ...extra,
});

const viewAt = (days, extra = {}) =>
  buildRenewalView(getRenewalReminder(subAt(days, extra), NOW), { now: NOW, planName: "Premium" });

// ---------------------------------------------------------------------------
// Stage timeline
// ---------------------------------------------------------------------------

test("no reminder fires well before expiry", () => {
  assert.equal(getRenewalReminder(subAt(30), NOW), null);
  assert.equal(viewAt(30), null);
});

test("the 7-day notice fires a week out", () => {
  const view = viewAt(7);
  assert.equal(view.stage, "d7");
  assert.equal(view.tone, "info");
  assert.equal(view.urgency, 1);
});

test("the 3-day notice escalates to a warning", () => {
  const view = viewAt(3);
  assert.equal(view.stage, "d3");
  assert.equal(view.tone, "warning");
  assert.ok(view.urgency > viewAt(7).urgency, "3-day notice must outrank the 7-day one");
});

test("the day-before notice is the highest non-critical urgency", () => {
  const view = viewAt(1.5);
  assert.equal(view.stage, "d1");
  assert.equal(view.urgency, 3);
});

test("the due-today notice is critical and cannot be dismissed", () => {
  // The `due` window opens at the moment of expiry and stays open
  // through the one-day grace period before `expired` takes over.
  const view = viewAt(0);
  assert.equal(view.stage, "due");
  assert.equal(view.tone, "critical");
  assert.equal(view.dismissible, false);
});

test("the grace day after expiry still reads as due, not expired", () => {
  assert.equal(viewAt(-0.5).stage, "due");
  assert.equal(viewAt(-3).stage, "expired");
});

test("an expired subscription reports the expired stage", () => {
  const view = viewAt(-3);
  assert.equal(view.stage, "expired");
  assert.equal(view.expired, true);
  assert.equal(view.tone, "critical");
  assert.equal(view.dismissible, false);
  assert.match(view.cta, /Reactivate/i);
});

test("urgency never decreases as expiry approaches", () => {
  const stages = [7, 3, 1.5, 0, -3].map((d) => viewAt(d));
  for (let i = 1; i < stages.length; i += 1) {
    assert.ok(
      stages[i].urgency >= stages[i - 1].urgency,
      `urgency dropped between ${stages[i - 1].stage} and ${stages[i].stage}`,
    );
  }
});

test("opting out of reminders silences every stage", () => {
  for (const days of [7, 3, 1, 0, -3]) {
    assert.equal(getRenewalReminder(subAt(days, { renewalReminderOptOut: true }), NOW), null);
  }
});

// ---------------------------------------------------------------------------
// Copy + formatting
// ---------------------------------------------------------------------------

test("every stage has presentation tokens defined", () => {
  for (const stage of ["d7", "d3", "d1", "due", "expired"]) {
    const preset = RENEWAL_STAGE_PRESENTATION[stage];
    assert.ok(preset, `missing presentation for ${stage}`);
    for (const key of ["urgency", "tone", "icon", "label", "headline", "cta"]) {
      assert.ok(preset[key] !== undefined, `${stage} missing ${key}`);
    }
  }
});

test("the body always names the plan and the expiry date", () => {
  const view = viewAt(3);
  assert.match(view.body, /Premium/);
  assert.match(view.body, /\d{4}/); // year from the formatted date
});

test("active-state copy promises no automatic charge", () => {
  assert.match(viewAt(3).body, /never charged without confirming/i);
});

test("expired copy explains what renewing restores", () => {
  assert.match(viewAt(-3).body, /restore/i);
});

test("daysUntil rounds partial days away from zero", () => {
  assert.equal(daysUntil(NOW + 0.5 * DAY_MS, NOW), 1);
  assert.equal(daysUntil(NOW - 0.5 * DAY_MS, NOW), -1);
  assert.equal(daysUntil(NOW, NOW), 0);
});

test("formatRemaining reads naturally at each boundary", () => {
  assert.equal(formatRemaining(NOW + 5 * DAY_MS, NOW), "5 days left");
  assert.equal(formatRemaining(NOW + 1 * DAY_MS, NOW), "1 day left");
  assert.equal(formatRemaining(NOW, NOW), "Expires today");
  assert.equal(formatRemaining(NOW - 1 * DAY_MS, NOW), "Expired yesterday");
  assert.match(formatRemaining(NOW - 4 * DAY_MS, NOW), /Expired 4 days ago/);
});

test("buildRenewalView returns null for junk input", () => {
  assert.equal(buildRenewalView(null), null);
  assert.equal(buildRenewalView({ stage: "not-a-stage" }), null);
});

// ---------------------------------------------------------------------------
// Banner dismissal
// ---------------------------------------------------------------------------

test("dismissing one stage does not silence the next", () => {
  const sevenDay = viewAt(7);
  assert.equal(shouldShowRenewalBanner(sevenDay, []), true);
  assert.equal(shouldShowRenewalBanner(sevenDay, ["d7"]), false);
  // The 3-day notice still gets through.
  assert.equal(shouldShowRenewalBanner(viewAt(3), ["d7"]), true);
});

test("critical stages ignore dismissals entirely", () => {
  assert.equal(shouldShowRenewalBanner(viewAt(0), ["due"]), true);
  assert.equal(shouldShowRenewalBanner(viewAt(-3), ["expired"]), true);
});

// ---------------------------------------------------------------------------
// Component contract
// ---------------------------------------------------------------------------

test("RenewalBanner renders copy from the shared presentation layer", () => {
  const source = readSource("src/components/subscription/RenewalBanner.tsx");
  assert.match(source, /data-renewal-banner/);
  assert.match(source, /view\.headline/);
  assert.match(source, /view\.cta/);
  // Tone styling covers all three semantic tones.
  for (const tone of ["info", "warning", "critical"]) {
    assert.match(source, new RegExp(`\\b${tone}:`), `missing ${tone} tone styles`);
  }
});

test("RenewalStatusCard shows the expiry date and reminder toggle", () => {
  const source = readSource("src/components/subscription/RenewalStatusCard.tsx");
  assert.match(source, /data-renewal-card/);
  assert.match(source, /data-renewal-expiry/);
  assert.match(source, /data-renewal-reminder-toggle/);
});

test("the preview sandbox drives the real helpers, not a mock", () => {
  const source = readSource("src/components/subscription/RenewalPreviewPage.tsx");
  assert.match(source, /getRenewalReminder/);
  assert.match(source, /buildRenewalView/);
  assert.match(source, /data-preview-slider/);
  // It must render every surface it claims to preview.
  assert.match(source, /<RenewalBanner/);
  assert.match(source, /<RenewalStatusCard/);
});

test("the preview route is registered and needs no auth", () => {
  const source = readSource("src/main.tsx");
  assert.match(source, /RENEWAL_PREVIEW_HASH/);
  assert.match(source, /#\/dev\/subscription-preview/);
  assert.match(source, /<RenewalPreviewPage/);
});
