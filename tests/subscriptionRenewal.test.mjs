import test from "node:test";
import assert from "node:assert/strict";
import { getRenewalBaseTime, getRenewalReminder, RENEWAL_REMINDER_STAGES } from "../utils/subscriptionRenewal.js";

const DAY = 86400000;
const NOW = Date.UTC(2026, 7, 13, 3, 30);
const sub = (days, overrides = {}) => ({ planId: "premium", status: "active", expiresAt: NOW + days * DAY, ...overrides });

test("renewal cadence is limited to five lifecycle stages", () => {
  assert.deepEqual(RENEWAL_REMINDER_STAGES.map((stage) => stage.id), ["d7", "d3", "d1", "due", "expired"]);
});

test("sends one appropriately staged reminder at 7, 3 and 1 days", () => {
  assert.equal(getRenewalReminder(sub(7), NOW).stage, "d7");
  assert.equal(getRenewalReminder(sub(3), NOW).stage, "d3");
  assert.equal(getRenewalReminder(sub(1), NOW).stage, "d1");
});

test("sends due and expired reminders but not reminders too early", () => {
  assert.equal(getRenewalReminder(sub(15), NOW), null);
  assert.equal(getRenewalReminder(sub(0), NOW).stage, "due");
  assert.equal(getRenewalReminder(sub(-2, { status: "expired" }), NOW).stage, "expired");
});

test("cancelled, paused and opted-out subscriptions are never reminded", () => {
  assert.equal(getRenewalReminder(sub(3, { status: "cancelled" }), NOW), null);
  assert.equal(getRenewalReminder(sub(3, { status: "paused" }), NOW), null);
  assert.equal(getRenewalReminder(sub(3, { renewalReminderOptOut: true }), NOW), null);
});

test("reminder id is deterministic per expiry and stage for cross-device dedupe", () => {
  assert.equal(getRenewalReminder(sub(3), NOW).id, getRenewalReminder(sub(3), NOW + 1000).id);
});

test("early renewal extends from current expiry; expired renewal starts now", () => {
  assert.equal(getRenewalBaseTime(NOW + 10 * DAY, NOW), NOW + 10 * DAY);
  assert.equal(getRenewalBaseTime(NOW - DAY, NOW), NOW);
});
