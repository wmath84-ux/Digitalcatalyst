// tests/notificationBrandingLogoContract.test.mjs
//
// Every notification kind — in-app bell rows, local system alerts, instant
// server push, the minute cron (renewals / My Day / content), and the SW
// tray — must render the logo the admin saved on the Branding page.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const branding = read("api/_lib/branding.ts");
const pushNotify = read("api/_lib/pushNotify.ts");
const cron = read("api/cron/subscription-renewals.ts");
const pushSend = read("api/push/send.ts");
const pushTest = read("api/push/test.ts");
const sw = read("public/sw.js");
const webPush = read("utils/webPush.ts");
const page = read("src/components/NotificationsPage.tsx");
const adminBranding = read("src/admin/pages/BrandingPage.tsx");

test("server branding helper exposes a live notification icon from settings/branding", () => {
  assert.match(branding, /NOTIFICATION_ICON_PATH = "\/api\/brand-icon\?size=192"/);
  assert.match(branding, /export function notificationIconFromBranding/);
  assert.match(branding, /export async function getNotificationBrandChrome/);
  assert.match(branding, /\^https\?:\\\/\\\//);
});

test("every server push path attaches the branding logo as icon", () => {
  assert.match(pushNotify, /getNotificationBrandChrome/);
  assert.match(pushNotify, /serializePushPayload/);
  assert.match(pushNotify, /icon: payload\.icon \|\| brand\.icon/);
  assert.match(pushNotify, /await serializePushPayload\(payload, "eduvora"\)/);
  assert.match(pushNotify, /await serializePushPayload\(payload, "eduvora-content"\)/);
  assert.match(cron, /getNotificationBrandChrome/);
  assert.match(cron, /icon: brand\.icon/);
  assert.match(pushSend, /getNotificationBrandChrome/);
  assert.match(pushSend, /icon: safeText\(req\.body\?\.icon, 300\) \|\| brand\.icon/);
  assert.match(pushTest, /getNotificationBrandChrome/);
  assert.match(pushTest, /icon: brand\.icon/);
  assert.doesNotMatch(pushTest, /icon: "\/icons\/icon-192x192\.png"/);
});

test("service worker prefers the admin branding logo over shipped default icons", () => {
  assert.match(sw, /resolveNotificationIcon/);
  assert.match(sw, /SHIPPED_DEFAULT_ICONS/);
  assert.match(sw, /branding-update/);
  assert.match(sw, /\/api\/brand-icon\?size=192/);
  assert.match(sw, /const icon = resolveNotificationIcon\(data\.icon\)/);
});

test("local system notifications use the branding logo; in-app rows use per-notification icons", () => {
  // Local system alerts keep the admin branding logo as their icon.
  assert.match(webPush, /getBrandNotificationIcon/);
  assert.match(webPush, /readCachedBranding/);
  assert.match(webPush, /icon: getBrandNotificationIcon\(\)/);
  assert.doesNotMatch(webPush, /icon: '\/icons\/icon-192x192\.png'/);
  // The in-app notification list shows an icon that matches each notification's
  // category (product unlock, My Day, renewal, etc.) instead of the PWA logo.
  assert.match(page, /data-notification-icon/);
  assert.match(page, /function notificationIcon\(notification: SiteNotification\)/);
  assert.match(page, /case "store":/);
  assert.match(page, /target === "mayday" \|\| category === "mayday"/);
  assert.match(page, /case "subscription":/);
  assert.doesNotMatch(page, /data-notification-brand-logo/);
  assert.match(adminBranding, /in-app notification list/);
  assert.match(adminBranding, /every system\/push notification/);
});
