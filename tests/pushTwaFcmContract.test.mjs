// tests/pushTwaFcmContract.test.mjs
//
// Contract tests for the Capacitor / TWA + FCM notification path.
//
// The Eduvora PWA is mobile-first on the web, but on Android Chrome
// Web Push is unreliable: battery optimisers, doze mode and OEM
// "kill background apps" all delay delivery, which the user was
// experiencing as reminders arriving 5 min to several hours late
// (or never arriving at all until the app was opened).
//
// The fix is to wrap the PWA in a Capacitor / TWA Android shell.
// The TWA has two notification paths that BOTH need to work:
//
//   1. FCM (Firebase Cloud Messaging) — the server-side wake-up
//      call. The TWA's PushNotifications plugin keeps a persistent
//      FCM token; Google's servers use it to wake the device and
//      hand the payload to the app. This is the only transport
//      that reliably fires a system notification on Android.
//   2. Local AlarmManager — the exact-tick fallback. The server
//      push may arrive a few seconds before the user-set time
//      (FCM transport is ~1-30s) or a few seconds after (rare,
//      network delay). For "9:00 AM Physics no matter what", the
//      TWA also schedules a local notification at the exact
//      wall-clock time. AlarmManager fires even when the app
//      process is killed, the device is locked, or doze mode is on.
//
// This file pins the contract that the three pieces are wired up
// correctly: the bridge file, the registration endpoint and the
// dual-transport senders. The actual Android APK build + Play
// Store submission are out of scope (see docs/TWA_ANDROID_SETUP.md).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const bridge = fs.readFileSync("src/utils/capacitorBridge.ts", "utf8");
const fcmLib = fs.readFileSync("api/_lib/fcm.ts", "utf8");
const pushSend = fs.readFileSync("api/push/send.ts", "utf8");
const cron = fs.readFileSync("api/cron/subscription-renewals.ts", "utf8");
const main = fs.readFileSync("src/main.tsx", "utf8");
const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const gradle = fs.readFileSync("android/app/build.gradle", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");
const capacitorConfig = fs.readFileSync("capacitor.config.ts", "utf8");
const vercelConfig = fs.readFileSync("vercel.json", "utf8");

/* ------------------------------------------------------------------ */
/* Capacitor bridge — TWA + FCM + Local alarm wiring                  */
/* ------------------------------------------------------------------ */

test("capacitor bridge: registers for FCM on Android, no-ops on web", () => {
  // The bridge uses Capacitor.isNativePlatform() to detect the
  // TWA. On the web build the call is a no-op so the service
  // worker flow keeps running.
  assert.match(bridge, /isAndroidNative/);
  assert.match(bridge, /registerForPush/);
  assert.match(bridge, /Capacitor\.isNativePlatform/);
});

test("capacitor bridge: schedules a local alarm at the exact wall-clock time", () => {
  // The exact-time guarantee on Android comes from AlarmManager,
  // not the FCM wake-up. The scheduleLocalAlarm helper uses
  // { at, allowWhileIdle: true } so the alarm fires through doze
  // mode (otherwise doze would delay it by up to 9 minutes on
  // some OEM ROMs).
  assert.match(bridge, /scheduleLocalAlarm/);
  assert.match(bridge, /allowWhileIdle: true/);
  // The channel id is a named export (shared by the create-channel path and
  // every post) — pin both the value and the usage.
  assert.match(bridge, /REMINDER_CHANNEL_ID\s*=\s*"eduvora-reminders"/);
  assert.match(bridge, /channelId: REMINDER_CHANNEL_ID/);
});

test("capacitor bridge: dedupes local alarms by stable item id", () => {
  // The My Day scheduler computes a 31-bit hash from the
  // item key so re-scheduling the same item just updates the
  // existing alarm (AlarmManager treats schedule() as upsert
  // by id). The orphan-cleanup loop in main.tsx cancels any
  // previous ids not in the new schedule.
  assert.match(main, /alarmId\(item\.key\)/);
  assert.match(main, /cancelLocalAlarms/);
});

test("capacitor bridge: attaches the FCM token listener BEFORE register()", () => {
  // Capacitor fires the initial `registration` token event as soon as
  // register() completes. A listener attached afterwards can miss that
  // first event, leaving users/{uid}/fcmTokens empty — the "app closed,
  // no notification until I open it" symptom. The listener must be
  // attached first so the token is always POSTed to fcm-register.
  const listenerIdx = bridge.indexOf('addListener("registration"');
  const registerIdx = bridge.indexOf("PushNotifications.register()");
  assert.ok(listenerIdx > 0, "the registration listener must exist");
  assert.ok(registerIdx > 0, "the register() call must exist");
  assert.ok(listenerIdx < registerIdx, "the token listener must be attached BEFORE register()");
});

test("fcm android.notification.icon is a drawable resource name, never a URL", () => {
  // Google's SDK resolves the notification `icon` against R.drawable;
  // passing the branding URL made it fall back to the launcher icon (or
  // drop the icon). The drawable name goes here, while the URL stays in
  // `data.icon` for the TWA foreground renderer's largeIcon.
  assert.match(fcmLib, /icon:\s*"ic_stat_eduvora"/);
  assert.doesNotMatch(fcmLib, /notification:\s*\{[\s\S]*?icon:\s*data\.icon/);
  assert.match(fcmLib, /icon: payload\.icon \|\| brand\.icon/);
});

test("ic_stat_eduvora drawable exists for the FCM + LocalNotifications icon", () => {
  // Both api/_lib/fcm.ts and capacitorBridge.ts reference this name; a
  // missing drawable silently degrades every notification's status-bar
  // icon to the launcher icon.
  assert.ok(
    fs.existsSync("android/app/src/main/res/drawable/ic_stat_eduvora.xml"),
    "android/app/src/main/res/drawable/ic_stat_eduvora.xml must exist",
  );
});

test("capacitor bridge: tap handler deep-links to the notification's URL", () => {
  // onLocalAlarmTap is wired in main.tsx and converts the
  // notification's `url` extra back into a hash route. The
  // My Day scheduler passes the same kind of deep links the
  // web push path uses (e.g. /#/my-day?section=reminders&item=…),
  // so the user lands on the exact item that fired.
  assert.match(bridge, /onLocalAlarmTap/);
  assert.match(main, /onLocalAlarmTap/);
  assert.match(main, /window\.location\.hash = url\.slice\(hashIndex\)/);
});

/* ------------------------------------------------------------------ */
/* Server: FCM dispatcher                                              */
/* ------------------------------------------------------------------ */

test("fcm dispatcher uses firebase-admin messaging", () => {
  // The server-side fan-out is admin.messaging().send — the
  // official Firebase Admin SDK, not a third-party shim. This
  // is what the cron scheduler and the instant /api/push/send
  // endpoint use to reach the TWA.
  assert.match(fcmLib, /from "firebase-admin\/messaging"/);
  assert.match(fcmLib, /getMessaging/);
});

test("fcm dispatcher prunes UNREGISTERED / INVALID_ARGUMENT tokens", () => {
  // When a user uninstalls the TWA or the token rotates, FCM
  // returns one of these errors. The dispatcher deletes the
  // doc so future sends stay cheap and the dispatcher doesn't
  // keep retrying a dead token forever.
  assert.match(fcmLib, /registration-token-not-registered/);
  assert.match(fcmLib, /invalid-argument/);
  assert.match(fcmLib, /mismatched-credential/);
  assert.match(fcmLib, /item\.ref\.delete\(\)/);
});

test("fcm dispatcher is a no-op when FCM is not configured", () => {
  // A developer who hasn't set up the service account JSON
  // yet still has a working web build. The dispatcher returns
  // 0 instead of throwing so the rest of the request (web
  // push, bell entries) still completes.
  assert.match(fcmLib, /fcmConfigured/);
  assert.match(fcmLib, /return 0/);
});

/* ------------------------------------------------------------------ */
/* Server: dual transport in /api/push/send                             */
/* ------------------------------------------------------------------ */

test("/api/push/send fans out to BOTH web push and FCM on product-created", () => {
  // The instant product announcement must reach web browsers
  // (existing service worker path) AND installed Android TWAs
  // (FCM). Either side can be down — the other still delivers.
  assert.match(pushSend, /pushToAllDevices\(db, payload\)/);
  assert.match(pushSend, /fcmPushToAllDevices\(db, fcmPayload\)/);
  assert.match(pushSend, /Promise\.all/);
});

test("/api/push/send fans out to BOTH web push and FCM on product-updated (per buyer)", () => {
  // Buyers of the product are notified through both transports
  // so desktop web users AND installed TWA users see the new
  // content alert.
  assert.match(pushSend, /pushToUser\(db, buyerId/);
  assert.match(pushSend, /fcmPushToUser\(db, buyerId/);
});

test("/api/push/send response surfaces both transport counts", () => {
  // The response shape reports how many devices each
  // transport reached. The admin UI and the test suite
  // can use this to verify both paths are alive.
  assert.match(pushSend, /webPushConfigured/);
  assert.match(pushSend, /fcmConfigured/);
  assert.match(pushSend, /web: webResult/);
  assert.match(pushSend, /fcm: fcmResult/);
});

/* ------------------------------------------------------------------ */
/* Server: cron scheduler also fans out to FCM                          */
/* ------------------------------------------------------------------ */

test("cron scheduler's My Day sendPush fans out to BOTH web push and FCM", () => {
  // The minute pinger drives My Day reminders, content
  // announcements and subscription renewals. Every one of
  // them must reach installed Android TWAs reliably, so
  // each per-user send goes through both transports.
  assert.match(cron, /vapidConfigured/);
  assert.match(cron, /fcmPushToUser/);
  assert.match(cron, /Promise\.all/);
});

test("cron scheduler's broadcast sendPushToAll fans out to BOTH web push and FCM", () => {
  // New-product announcements reach every user; the broadcast
  // send does the same dual transport.
  assert.match(cron, /fcmPushToAllDevices/);
  assert.match(cron, /webResult\.sent \+ fcmResult\.sent/);
});

/* ------------------------------------------------------------------ */
/* FCM token registration endpoint                                     */
/* ------------------------------------------------------------------ */

test("fcm-register endpoint requires an authenticated Firebase user", () => {
  // The token is registered against users/{uid} and includes
  // the device's locale, platform and app version for
  // observability. Anyone hitting this endpoint without a
  // valid idToken gets a 401.
  // Note: the fcm-register route is served through /api/push/send
  // (action="fcm-register") to stay under the Vercel Hobby
  // function-count cap; the logic itself lives in api/_lib/fcm.ts.
  assert.match(fcmLib, /handleFcmRegister/);
  assert.match(fcmLib, /requireFirebaseUser/);
  assert.match(fcmLib, /fcmTokens/);
  // The action dispatch is what makes the rewrite work.
  assert.match(pushSend, /action === "fcm-register"/);
});

test("fcm-register returns 503 when FCM is not configured on the server", () => {
  // A web-only install of the app calls this endpoint on
  // every page load (the bridge is a no-op but the request
  // still fires). 503 means "skip FCM, the web push path is
  // still active" — never a hard error.
  assert.match(fcmLib, /503/);
  assert.match(fcmLib, /FCM is not configured/);
});

test("fcm-register hashes the token into a stable doc id", () => {
  // SHA-256 of the token keeps the doc id a sane length and
  // makes re-registration with the same value a no-op. The
  // collection stays small even on long-lived devices.
  assert.match(fcmLib, /createHash/);
  assert.match(fcmLib, /hashToken/);
});

test("fcm-register is routed through /api/push/send via a Vercel rewrite", () => {
  // The Hobby plan caps serverless functions at 12; mounting
  // fcm-register as its own api/push/fcm-register.ts file
  // would push the project over that limit. The route is
  // served by the existing push/send handler with the
  // `action: "fcm-register"` field, and vercel.json rewrites
  // /api/push/fcm-register to /api/push/send. The file must
  // NOT exist as its own function.
  assert.ok(!fs.existsSync("api/push/fcm-register.ts"), "api/push/fcm-register.ts must not exist as its own function");
  assert.match(vercelConfig, /\/api\/push\/fcm-register/);
  assert.match(vercelConfig, /\/api\/push\/send/);
});

/* ------------------------------------------------------------------ */
/* Android manifest — TWA permissions + FCM                            */
/* ------------------------------------------------------------------ */

test("Android manifest declares POST_NOTIFICATIONS", () => {
  // Android 13+ requires this runtime permission for the
  // LocalNotifications plugin. Without it the TWA's exact-
  // time alarms render silently.
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
});

test("Android manifest declares USE_EXACT_ALARM + SCHEDULE_EXACT_ALARM", () => {
  // Exact-time alarms (the "9:00 AM Physics no matter what"
  // guarantee) require these permissions. Android 14 added
  // USE_EXACT_ALARM for system-alarm use-cases like ours;
  // keeping SCHEDULE_EXACT_ALARM covers older versions.
  assert.match(manifest, /android\.permission\.USE_EXACT_ALARM/);
  assert.match(manifest, /android\.permission\.SCHEDULE_EXACT_ALARM/);
});

test("Android manifest declares RECEIVE_BOOT_COMPLETED", () => {
  // After a device reboot AlarmManager forgets every
  // schedule. The LocalNotifications plugin re-creates
  // them on boot using this permission, so the user's
  // 7 AM class reminder still fires the morning after a
  // reboot.
  assert.match(manifest, /android\.permission\.RECEIVE_BOOT_COMPLETED/);
});

test("Android manifest declares Digital Asset Links for the TWA", () => {
  // The TWA launch path uses the asset_statements meta-data
  // to verify the app belongs to eduvora.shop. Without
  // this, the app opens in Custom Tabs with a URL bar;
  // with it, the app is fullscreen and behaves like a
  // native app.
  assert.match(manifest, /asset_statements/);
  assert.match(manifest, /trustedurl/);
});

test("Android manifest sets the FCM default notification icon", () => {
  // Background FCM notifications must show the correct status-bar icon
  // without the client having to render anything. The meta-data points at
  // the committed drawable so FCM never falls back to the launcher icon.
  assert.match(manifest, /com\.google\.firebase\.messaging\.default_notification_icon/);
  assert.match(manifest, /@drawable\/ic_stat_eduvora/);
});

/* ------------------------------------------------------------------ */
/* Android build: FCM dependency + release signing                     */
/* ------------------------------------------------------------------ */

test("android/app/build.gradle pulls in firebase-messaging", () => {
  // The FCM Android library handles the on-device side of
  // FCM. The Capacitor PushNotifications plugin wraps it.
  assert.match(gradle, /firebase-bom/);
  assert.match(gradle, /firebase-messaging/);
});

test("android/app/build.gradle has a release signing config driven by env vars", () => {
  // The release keystore is generated with `keytool -genkey`
  // and referenced by env vars so the keystore material
  // never lives in Git. The gradle script applies the
  // signing config only when the env vars are present so
  // `assembleDebug` still works for smoke tests.
  assert.match(gradle, /signingConfigs/);
  assert.match(gradle, /EDUVORA_KEYSTORE_FILE/);
  assert.match(gradle, /EDUVORA_KEYSTORE_PASSWORD/);
  assert.match(gradle, /EDUVORA_KEY_PASSWORD/);
});

test("android/app/build.gradle applies google-services plugin when google-services.json is present", () => {
  // The firebase-messaging library needs the project id and
  // API key from google-services.json. The plugin applies
  // only when the file is present so a developer who hasn't
  // set up FCM yet still has a working build (the FCM
  // calls become no-ops on the client).
  assert.match(gradle, /google-services\.json/);
  assert.match(gradle, /com\.google\.gms\.google-services/);
});

/* ------------------------------------------------------------------ */
/* Firestore rules: fcmTokens collection is owner-scoped               */
/* ------------------------------------------------------------------ */

test("firestore rules allow the owner to write their own fcmTokens", () => {
  // A learner can register their TWA token from the app,
  // but cannot read or write another learner's tokens.
  // Admin is allowed too for manual cleanup if the server
  // dispatcher leaves a stale doc behind.
  assert.match(rules, /match \/fcmTokens\/{tokenId}/);
  assert.match(rules, /allow read: if isOwner\(uid\) \|\| isAdmin\(\)/);
  assert.match(rules, /allow create, update: if isOwner\(uid\)/);
  assert.match(rules, /request\.resource\.data\.token is string/);
  assert.match(rules, /request\.resource\.data\.platform in \['android', 'ios', 'web'\]/);
});

/* ------------------------------------------------------------------ */
/* Capacitor config                                                    */
/* ------------------------------------------------------------------ */

test("capacitor config points webDir at the Vite build output", () => {
  // `cap sync android` copies dist/ into the APK's assets.
  // Pointing it elsewhere (or omitting it) means the TWA
  // launches an empty page.
  assert.match(capacitorConfig, /webDir: "dist"/);
});

test("capacitor config sets the right appId for the TWA", () => {
  // The appId is the Android package id used by Play Store
  // and by the FCM token registration namespace. It must
  // match the SHA-256 fingerprint in /.well-known/assetlinks.json.
  assert.match(capacitorConfig, /appId: "app\.eduvora\.shop"/);
});

test("capacitor config disables mixed content and cleartext", () => {
  // The TWA is a HTTPS-only app. Disallowing mixed content
  // means the WebView refuses any plain-http XHR, which is
  // the security guarantee the install promises.
  assert.match(capacitorConfig, /cleartext: false/);
  assert.match(capacitorConfig, /allowMixedContent: false/);
});
