import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync("utils/webPush.ts", "utf8");
const endpoint = fs.readFileSync("api/push/test.ts", "utf8");
const page = fs.readFileSync("src/components/NotificationsPage.tsx", "utf8");

test("Notifications page no longer exposes the live test control", () => {
  assert.doesNotMatch(page, /data-web-push-self-test/);
  assert.doesNotMatch(page, /Send test notification/);
  assert.doesNotMatch(page, /sendWebPushSelfTest/);
});

test("client diagnoses every browser-side push prerequisite", () => {
  for (const code of ["login_required", "browser_unsupported", "https_required", "permission_denied", "service_worker_unavailable", "subscribe_failed", "save_failed", "network_error"]) assert.match(client, new RegExp(code));
  assert.match(client, /Promise\.race/);
  assert.match(client, /getIdToken\(true\)/);
  assert.match(client, /\/api\/push\/test/);
  assert.match(client, /\/api\/push\/subscribe/);
});

test("test endpoint is authenticated and can only target current user's stored devices", () => {
  assert.match(endpoint, /requireFirebaseUser/);
  assert.match(endpoint, /doc\(user\.uid\)/);
  assert.doesNotMatch(endpoint, /req\.body.*uid/);
});

test("server returns actionable configuration and delivery errors", () => {
  assert.match(endpoint, /vapid_not_configured/);
  assert.match(endpoint, /subscription_not_saved/);
  assert.match(endpoint, /subscription_expired/);
  assert.match(endpoint, /push_send_failed/);
  assert.match(endpoint, /WEB_PUSH_VAPID_PRIVATE_KEY/);
});
