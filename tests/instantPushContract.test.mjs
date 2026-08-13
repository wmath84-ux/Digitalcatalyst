import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const send = fs.readFileSync("api/push/send.ts", "utf8");
const pushNotify = fs.readFileSync("api/_lib/pushNotify.ts", "utf8");
const verifyPayment = fs.readFileSync("api/razorpay/verify-payment.ts", "utf8");
const adminClient = fs.readFileSync("src/lib/admin/client.ts", "utf8");

test("push/send requires an authenticated admin for every mode", () => {
  assert.match(send, /requireFirebaseUser/);
  assert.match(send, /Admin access required/);
  assert.match(send, /role !== "admin"/);
});

test("product save fires instant pushes through structured actions", () => {
  assert.match(send, /"product-created"/);
  assert.match(send, /"product-updated"/);
  assert.match(send, /pushToAllDevices/);
  assert.match(send, /New free product available/);
  assert.match(send, /Your course has new content/);
  // Baseline stays in sync so the cron scheduler never double-announces.
  assert.match(send, /contentPushState/);
});

test("shared push helper delivers per-user and broadcast, cleaning dead devices", () => {
  assert.match(pushNotify, /export async function pushToUser/);
  assert.match(pushNotify, /export async function pushToAllDevices/);
  assert.match(pushNotify, /status === 404 \|\| status === 410/);
});

test("purchase verification pushes the unlock instantly to the buyer", () => {
  assert.match(verifyPayment, /announceUnlock/);
  assert.match(verifyPayment, /pushToUser/);
  assert.match(verifyPayment, /Product unlocked/);
  assert.match(verifyPayment, /Subscription activated/);
  // Replays (page refresh, webhook retry) must never re-notify.
  assert.match(verifyPayment, /!grant\.replayed/);
  // Bell entry is per-order → idempotent across retries.
  assert.match(verifyPayment, /unlock:\$\{orderId\}/);
  // Free path and paid path both announce.
  assert.equal((verifyPayment.match(/announceUnlock\(adminDb\(\)/g) || []).length, 2);
});

test("admin data layer pings the server the moment a product is saved", () => {
  assert.match(adminClient, /notifyProductChange/);
  assert.match(adminClient, /notifyProductChange\(ref\.id, "product-created"\)/);
  assert.match(adminClient, /notifyProductChange\(ref\.id, "product-updated"\)/);
  // fire-and-forget — a push hiccup must never break the admin save flow.
  assert.match(adminClient, /void notifyProductChange/);
});
