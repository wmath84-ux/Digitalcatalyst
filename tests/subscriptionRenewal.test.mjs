import test from "node:test";
import assert from "node:assert/strict";
import {
  getExpiredDayNumber,
  getRenewalBaseTime,
  getRenewalNotification,
  getRenewalReminder,
  POST_EXPIRY_REMINDER_DAYS,
  RENEWAL_REMINDER_STAGES,
} from "../utils/subscriptionRenewal.js";

const DAY = 86400000;
const NOW = Date.UTC(2026, 7, 13, 3, 30);
const sub = (days, overrides = {}) => ({ planId: "premium", status: "active", expiresAt: NOW + days * DAY, ...overrides });

test("pre-expiry cadence is limited to four informational stages", () => {
  assert.deepEqual(RENEWAL_REMINDER_STAGES.map((stage) => stage.id), ["d7", "d3", "d1", "due"]);
});

test("sends one appropriately staged reminder at 7, 3 and 1 days", () => {
  assert.equal(getRenewalReminder(sub(7), NOW).stage, "d7");
  assert.equal(getRenewalReminder(sub(3), NOW).stage, "d3");
  assert.equal(getRenewalReminder(sub(1), NOW).stage, "d1");
});

test("due reminder fires on the final day; nothing fires too early", () => {
  assert.equal(getRenewalReminder(sub(15), NOW), null);
  assert.equal(getRenewalReminder(sub(0), NOW).stage, "due");
});

test("the lifecycle stage flips to expired immediately after expiry and persists", () => {
  const one = getRenewalReminder(sub(-0.5, { status: "expired" }), NOW);
  assert.equal(one.stage, "expired");
  assert.equal(one.expired, true);
  assert.equal(one.day, 1);

  // The renew button stays active well beyond the notification window.
  const late = getRenewalReminder(sub(-20, { status: "expired" }), NOW);
  assert.equal(late.stage, "expired");
  assert.equal(late.expired, true);
  assert.equal(late.day, 21);
});

test("post-expiry notifications are daily and start immediately after expiry", () => {
  assert.equal(getRenewalNotification(sub(-0.5, { status: "expired" }), NOW).stage, "expired-1");
  assert.equal(getRenewalNotification(sub(-1, { status: "expired" }), NOW).stage, "expired-2");
  assert.equal(getRenewalNotification(sub(-2, { status: "expired" }), NOW).stage, "expired-3");
});

test("post-expiry notifications stop after ten consecutive mornings", () => {
  assert.equal(POST_EXPIRY_REMINDER_DAYS, 10);
  assert.equal(getRenewalNotification(sub(-9.5, { status: "expired" }), NOW).stage, "expired-10");
  assert.equal(getRenewalNotification(sub(-10, { status: "expired" }), NOW), null);
  assert.equal(getRenewalNotification(sub(-20, { status: "expired" }), NOW), null);
});

test("pre-expiry notifications mirror the one-shot lifecycle heads-up", () => {
  assert.deepEqual(getRenewalNotification(sub(3), NOW), getRenewalReminder(sub(3), NOW));
  assert.equal(getRenewalNotification(sub(7), NOW).stage, "d7");
});

test("expired day number counts whole days since expiry", () => {
  assert.equal(getExpiredDayNumber(NOW, NOW), 1);
  assert.equal(getExpiredDayNumber(NOW - 1 * DAY, NOW), 2);
  assert.equal(getExpiredDayNumber(NOW - 9 * DAY, NOW), 10);
});

test("cancelled, paused and opted-out subscriptions are never reminded", () => {
  assert.equal(getRenewalReminder(sub(3, { status: "cancelled" }), NOW), null);
  assert.equal(getRenewalReminder(sub(3, { status: "paused" }), NOW), null);
  assert.equal(getRenewalReminder(sub(3, { renewalReminderOptOut: true }), NOW), null);
  assert.equal(getRenewalNotification(sub(-3, { status: "expired", renewalReminderOptOut: true }), NOW), null);
});

test("reminder id is deterministic per expiry and stage for cross-device dedupe", () => {
  assert.equal(getRenewalReminder(sub(3), NOW).id, getRenewalReminder(sub(3), NOW + 1000).id);
  // The persistent expired stage keeps one stable id for a given expiry…
  assert.equal(
    getRenewalReminder(sub(-2, { status: "expired" }), NOW).id,
    getRenewalReminder(sub(-2, { status: "expired" }), NOW + DAY).id,
  );
  // …while each post-expiry morning gets its own notification id, so ten days
  // means ten distinct notifications, not one.
  assert.notEqual(
    getRenewalNotification(sub(-1, { status: "expired" }), NOW).id,
    getRenewalNotification(sub(-1, { status: "expired" }), NOW + DAY).id,
  );
});

test("post-expiry reminders carry the expired flag the scheduler keys on", () => {
  const reminder = getRenewalNotification(sub(-1, { status: "expired" }), NOW);
  assert.equal(reminder.expired, true);
  assert.equal(reminder.day, 2);
  const active = getRenewalReminder(sub(3), NOW);
  assert.equal(active.expired, false);
});

test("early renewal extends from current expiry; expired renewal starts now", () => {
  assert.equal(getRenewalBaseTime(NOW + 10 * DAY, NOW), NOW + 10 * DAY);
  assert.equal(getRenewalBaseTime(NOW - DAY, NOW), NOW);
});
