// tests/deviceNotificationInboxContract.test.mjs
//
// "Notifications rahe hain lekin Android notification sabhi aa rahe hain lekin
// app ke andar alerts page per dikh nahi rahe."
//
// ROOT CAUSE: two independent pipelines, joined nowhere.
//
//   · SYSTEM TRAY — FCM pushes from the server AND the client's own delivery
//     paths (the 15-second My Day clock, the FlowPath poll and the exact-time
//     LocalNotifications alarms in src/main.tsx) render Android notifications.
//   · IN-APP ALERTS PAGE — src/components/NotificationsPage.tsx renders
//     `users/{uid}/notifications`, a collection ONLY the server could write
//     (firestore.rules had "allow create, delete: if isAdmin()").
//
// So every alert the DEVICE delivered itself — a reminder that fired while the
// app was open, a local alarm the server scheduler never saw, anything
// delivered while GitHub's minute pinger was throttled or disabled — showed in
// the tray and nowhere in the app. (GitHub disables scheduled workflows after
// ~60 days without repository activity: the server stops writing bell entries
// while the phone keeps firing its own alarms. Exactly the reported symptom.)
//
// THE FIX, pinned here:
//   1. when the device delivers an alert, the SAME document the server would
//      have written is recorded — id and all — so a locally delivered alert and
//      its server-pushed twin are ONE document, never a duplicate;
//   2. the device mirror (utils/siteNotifications) is updated in the same tick,
//      so the bell badge + alerts page update instantly, even offline;
//   3. firestore.rules lets an owner create exactly those documents
//      (`source == 'device'`, every field validated) while server documents
//      stay untouchable;
//   4. a refused cloud listener is no longer silent — the page says so and
//      offers a one-shot re-read.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const main = read("src/main.tsx");
const inbox = read("src/lib/deviceNotificationInbox.ts");
const siteNotifications = read("utils/siteNotifications.ts");
const rules = read("firestore.rules");
const page = read("src/components/NotificationsPage.tsx");
const cron = read("api/cron/subscription-renewals.ts");
const flowpathControl = read("api/_lib/flowpathControl.ts");

const device = await import("../utils/deviceNotifications.js");

// ---------------------------------------------------------------------------
// 1. The id the device writes IS the id the server writes
// ---------------------------------------------------------------------------

test("a My Day alert uses the server's own document id", () => {
  const item = { key: "task:abc123:2026-10-02", itemId: "abc123", section: "tasks", kind: "task" };
  assert.equal(device.deviceNotificationDocId("myday", item), item.key);
  // …which is exactly what the cron writes.
  assert.match(cron, /collection\("notifications"\)\.doc\(item\.key\)\.set\(/);
});

test("a FlowPath alert uses the id api/_lib/flowpathControl.ts writes", () => {
  const item = { key: "flowpath:act1:2026-10-02", itemId: "act1", kind: "revision" };
  assert.equal(device.deviceNotificationDocId("flowpath", item), "flowpath:act1");
  assert.match(flowpathControl, /collection\("notifications"\)\.doc\(`flowpath:\$\{activity\.id\}`\)/);
});

test("a missing activity id degrades to the per-day key instead of collapsing", () => {
  assert.equal(device.deviceNotificationDocId("flowpath", { key: "flowpath:act1:2026-10-02" }), "flowpath:act1:2026-10-02");
  assert.equal(device.deviceNotificationDocId("myday", { itemId: "abc" }), "abc");
  assert.equal(device.deviceNotificationDocId("myday", {}), "");
});

// ---------------------------------------------------------------------------
// 2. Both device delivery paths record the alert
// ---------------------------------------------------------------------------

test("the My Day foreground clock records what the device delivered", () => {
  const block = main.slice(main.indexOf("const alarmArmed = isAndroidNative()"));
  assert.match(block, /recordDeviceNotification\(user\.id, \{/);
  assert.match(block, /deviceNotificationDocId\("myday", item\)/);
  assert.match(block, /if \(!displayed && !armed\) return;/);
});

test("the FlowPath foreground clock records what the device delivered", () => {
  const block = main.slice(main.indexOf('deviceNotificationDocId("flowpath", item)'));
  assert.ok(block.length > 0);
  assert.match(main, /deviceNotificationCategory\("flowpath", item\)/);
  assert.match(main, /deviceNotificationTarget\("flowpath", item\)/);
});

test("the writer mirrors locally first and then writes the cloud document", () => {
  assert.match(inbox, /saveSiteNotifications\(owner, mergeSiteNotifications\(loadSiteNotifications\(owner\), \[local\]\)\)/);
  assert.match(inbox, /doc\(db, "users", owner, "notifications", payload\.id\)/);
  assert.match(inbox, /\{ merge: true \}/);
});

test("a FlowPath alert can be opened from the alerts page", () => {
  assert.match(siteNotifications, /\| \{ type: 'flowpath'; itemId\?: string \}/);
  assert.match(siteNotifications, /if \(target\.type === 'flowpath'\) \{/);
  assert.match(siteNotifications, /#\/flowpath\?item=/);
});

// ---------------------------------------------------------------------------
// 3. Payload validation: the rules and the client agree
// ---------------------------------------------------------------------------

test("buildDeviceNotification caps and validates every field", () => {
  const built = device.buildDeviceNotification({
    id: "task:abc:2026-10-02",
    title: "Physics — 5:00 PM",
    body: "Chapter 4 revision",
    category: "mayday",
    target: { type: "mayday", section: "tasks", itemId: "abc" },
    createdAtMs: 1_700_000_000_000,
  });
  assert.deepEqual(built, {
    id: "task:abc:2026-10-02",
    title: "Physics — 5:00 PM",
    body: "Chapter 4 revision",
    category: "mayday",
    read: false,
    source: "device",
    createdAtMs: 1_700_000_000_000,
    target: { type: "mayday", section: "tasks", itemId: "abc" },
  });

  assert.equal(device.buildDeviceNotification({ id: "", title: "x" }), null);
  assert.equal(device.buildDeviceNotification({ id: "x", title: "" }), null);

  const trimmed = device.buildDeviceNotification({
    id: "x", title: "  hello   world  ", body: "b".repeat(900),
    category: "not-a-category", target: { type: "not-a-target", itemId: "i".repeat(400) },
    createdAtMs: Number.NaN,
  });
  assert.equal(trimmed.title, "hello world");
  assert.equal(trimmed.body.length, device.MAX_NOTIFICATION_BODY_CHARS);
  assert.equal(trimmed.category, "mayday");
  assert.equal(trimmed.target.type, "mayday");
  assert.ok(trimmed.target.itemId.length <= 120);
});

test("a FlowPath revision is course content; a FlowPath task is a My Day alert", () => {
  assert.equal(device.deviceNotificationCategory("flowpath", { kind: "revision" }), "course");
  assert.equal(device.deviceNotificationCategory("flowpath", { kind: "mcq" }), "course");
  assert.equal(device.deviceNotificationCategory("flowpath", { kind: "task" }), "mayday");
  assert.equal(device.deviceNotificationCategory("myday", { section: "tasks" }), "mayday");
  assert.deepEqual(device.deviceNotificationTarget("flowpath", { itemId: "act1" }), { type: "flowpath", itemId: "act1" });
});

// ---------------------------------------------------------------------------
// 4. firestore.rules: owners may add device alerts, never touch server ones
// ---------------------------------------------------------------------------

test("the rules validate a device alert against the same caps as the client", () => {
  const helper = rules.slice(rules.indexOf("function validDeviceNotification"), rules.indexOf("function validSessionParentAt"));
  assert.match(helper, /request\.resource\.data\.source == 'device'/);
  assert.match(helper, /request\.resource\.data\.id == notificationId/);
  assert.match(helper, new RegExp(`request\\.resource\\.data\\.title\\.size\\(\\) <= ${device.MAX_NOTIFICATION_TITLE_CHARS}`));
  assert.match(helper, new RegExp(`request\\.resource\\.data\\.body\\.size\\(\\) <= ${device.MAX_NOTIFICATION_BODY_CHARS}`));
  assert.match(helper, new RegExp(`request\\.resource\\.data\\.id\\.size\\(\\) <= ${device.MAX_NOTIFICATION_ID_CHARS}`));
  assert.match(helper, /request\.resource\.data\.category in \['store', 'reading', 'course', 'unlock', 'community', 'announcement', 'mayday', 'subscription'\]/);
  assert.match(helper, /'flowpath'\]/);
});

test("server alerts stay admin-only while device alerts are owner-scoped", () => {
  const block = rules.slice(rules.indexOf("match /notifications/{notificationId}"));
  assert.match(block, /allow create: if isAdmin\(\) \|\| \(isOwner\(uid\) && validDeviceNotification\(notificationId\)\);/);
  assert.match(block, /resource\.data\.source == 'device' && validDeviceNotification\(notificationId\)/);
  // The read/readAt update path is unchanged for everything else.
  assert.match(block, /affectedKeys\(\)\.hasOnly\(\['read', 'readAt'\]\)/);
  // Swipe-to-dismiss deletes the mirrored doc, so the owner must be able to
  // delete their OWN alert list entry (otherwise the card returns on the next
  // snapshot and on every other device).
  assert.match(block, /allow delete: if isAdmin\(\) \|\| isOwner\(uid\);/);
});

test("restoring a dismissed card re-creates it as a valid device alert", () => {
  const restore = page.slice(page.indexOf("const resetDismissed"));
  assert.match(restore, /source: "device"/);
  assert.match(restore, /id: item\.remoteNotificationId/);
  assert.match(restore, /\.slice\(0, 160\)/);
  assert.match(restore, /\.slice\(0, 600\)/);
});

// ---------------------------------------------------------------------------
// 5. A refused cloud read is no longer silent
// ---------------------------------------------------------------------------

test("the alerts page names a failed cloud read and offers a retry", () => {
  assert.match(page, /mapCloudNotification/);
  assert.match(page, /const \[cloudError, setCloudError\] = useState\(false\)/);
  assert.match(page, /getDocs\(collection\(db, "users", user\.id, "notifications"\)\)/);
  assert.match(page, /data-notifications-cloud-error/);
  assert.match(page, /describeNotificationCloudError/);
});

// ---------------------------------------------------------------------------
// 6. Catch-up: an alert the device delivered while the app was CLOSED
// ---------------------------------------------------------------------------

test("the foreground clocks mirror alerts that fired while the app was closed", () => {
  const main = read("src/main.tsx");
  // A widening lookback for the mirror, plus a delivery window that keeps a
  // past item from being re-shown / re-armed at open time.
  assert.match(main, /const FOREGROUND_CATCHUP_LOOKBACK_MS = 24 \* 60 \* 60 \* 1000;/);
  assert.match(main, /const FOREGROUND_DELIVERY_WINDOW_MS = 15 \* 60 \* 1000;/);
  assert.match(main, /if \(now - item\.dueAt > FOREGROUND_DELIVERY_WINDOW_MS\) \{/);
  assert.match(main, /const mirrorDeliveredAlert = \(/);
  // Both clocks use it, and the mirror happens BEFORE the delivery branch's
  // `pending.add` (so a mirrored item is never also buzzed about).
  const myday = main.slice(main.indexOf("collectDueMyDayItems(current, now, tzOffset(), FOREGROUND_CATCHUP_LOOKBACK_MS)"));
  assert.ok(myday.indexOf("mirrorDeliveredAlert(item.key") < myday.indexOf("pending.add(item.key"));
  const flow = main.slice(main.indexOf("collectDueFlowPathItems(current, now, tzOffset(), shown, FOREGROUND_CATCHUP_LOOKBACK_MS)"));
  assert.ok(flow.indexOf("mirrorDeliveredAlert(item.key") < flow.indexOf("pending.add(item.key"));
});
