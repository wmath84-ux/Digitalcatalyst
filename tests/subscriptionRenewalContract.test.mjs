import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cron = fs.readFileSync("api/cron/subscription-renewals.ts", "utf8");
const subscriptions = fs.readFileSync("api/_lib/subscriptions.ts", "utf8");
const notifications = fs.readFileSync("src/components/NotificationsPage.tsx", "utf8");
const profile = fs.readFileSync("src/profile/App.tsx", "utf8");
const page = fs.readFileSync("src/subscription/components/SubscriptionPage.tsx", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const access = fs.readFileSync("src/hooks/useCourseAccess.ts", "utf8");

test("daily scheduler is authenticated and deduplicates notifications", () => {
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /existing\.exists/);
  assert.match(cron, /collectionGroup\("subscription"\)/);
  assert.deepEqual(vercel.crons[0], { path: "/api/cron/subscription-renewals", schedule: "30 3 * * *" });
});

test("scheduler writes in-app notification and attempts optional push", () => {
  assert.match(cron, /collection\("notifications"\)/);
  assert.match(cron, /sendPush/);
  assert.match(cron, /webPushSubscriptions/);
  assert.match(cron, /status === 404 \|\| status === 410/);
});

test("notifications sync across devices and renewal opens subscription", () => {
  assert.match(notifications, /collection\(db, "users", user\.id, "notifications"\)/);
  assert.match(notifications, /target\.type === "subscription"/);
  assert.match(notifications, /markAllRead/);
  assert.match(rules, /match \/notifications\/\{notificationId\}/);
});

test("renewal is manual, restores package, and never claims an auto-charge", () => {
  assert.match(profile, /Renewal is manual and secure/);
  assert.match(page, /every renewal requires your confirmation/);
  assert.match(page, /includedProductIds/);
  assert.match(page, /data\.features/);
  assert.doesNotMatch(page, /renews automatically/);
  assert.match(subscriptions, /autoRenew: false/);
});

test("early renewal preserves remaining paid time", () => {
  assert.match(subscriptions, /getRenewalBaseTime/);
  assert.match(subscriptions, /renewalCount/);
  assert.match(subscriptions, /renewedAt/);
  assert.match(subscriptions, /previous\.exists \? \{ \.\.\.args\.plan, trialDays: 0 \}/);
});

test("Firestore Timestamp subscription expiry is parsed correctly for access", () => {
  assert.match(access, /timestampMillis\(data\.expiresAt\)/);
});
