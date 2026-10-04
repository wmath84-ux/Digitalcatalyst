// utils/deviceNotifications.js
//
// NOTIFICATIONS THE DEVICE SHOWS — mirrored into the in-app alerts page.
//
// ── The bug this closes ───────────────────────────────────────────────────
// The learner reported: "notifications rahe hain lekin Android notification
// sabhi aa rahe hain lekin app ke andar alerts page per dikh nahi rahe."
//
// The two pipelines were completely independent:
//
//   · SYSTEM TRAY — FCM pushes from the server PLUS the client's own
//     foreground safety nets in `src/main.tsx` (the 15-second My Day clock,
//     the FlowPath poll, the exact-time local alarms) render Android
//     notifications through the LocalNotifications / Notification APIs.
//   · IN-APP ALERTS PAGE — `src/components/NotificationsPage.tsx` renders
//     `users/{uid}/notifications`, which only the SERVER ever wrote
//     (firestore.rules: "allow create … if isAdmin()").
//
// So any alert delivered by the client itself — a reminder that fired while
// the app was open, a local alarm the server scheduler never saw, an item
// delivered while GitHub's minute pinger was throttled or disabled (GitHub
// disables scheduled workflows after ~60 days of inactivity) — appeared in the
// tray and in no list at all. "Sabhi notification aa rahe hain, alerts page
// khaali hai" is exactly that asymmetry.
//
// ── The fix ───────────────────────────────────────────────────────────────
// Whenever the device itself delivers a notification, the SAME document the
// server would have written is recorded:
//
//   users/{uid}/notifications/{same id the server uses}
//
// so a My Day item that fired locally and the same item pushed by the server
// are ONE document (idempotent by construction), never a duplicate. This module
// holds the PURE part — the id derivation, the payload builder and the caps the
// Firestore rules mirror — so the Node test runner can drive it with no
// Firebase and no bundler.

/** Marks a document as written by the device (never by the server). */
export const DEVICE_NOTIFICATION_SOURCE = "device";

/** Caps mirrored by firestore.rules (`users/{uid}/notifications/{id}`). */
export const MAX_NOTIFICATION_ID_CHARS = 200;
export const MAX_NOTIFICATION_TITLE_CHARS = 160;
export const MAX_NOTIFICATION_BODY_CHARS = 600;
export const MAX_NOTIFICATION_SECTION_CHARS = 40;

/** The categories the alerts page knows how to render. */
export const NOTIFICATION_CATEGORIES = [
  "store",
  "reading",
  "course",
  "unlock",
  "community",
  "announcement",
  "mayday",
  "subscription",
];

/** The target shapes `getNotificationDeepLink` can open. */
export const NOTIFICATION_TARGET_TYPES = [
  "product",
  "reading",
  "announcement",
  "course",
  "purchases",
  "community",
  "mayday",
  "subscription",
  "flowpath",
  // My Day workspace targets: a canonical Joplin object (note/to-do/notebook/
  // tag/attachment) plus the schedule row that produced the alert. The old
  // `mayday` target keeps working, so notifications already in Firestore and
  // alarms already armed on a device stay valid (§28, §63).
  "joplin",
];

/** FlowPath kinds that are course content rather than a My Day item. */
const COURSE_KINDS = new Set(["revision", "mcq", "lecture"]);

const text = (value) => String(value == null ? "" : value);

const trim = (value, max) => text(value).replace(/\s+/g, " ").trim().slice(0, max);

const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

/**
 * The document id for an item the DEVICE delivered.
 *
 * Both ids are the ids the server already uses, so a locally delivered alert
 * and its server-pushed twin are the same document:
 *
 *   · My Day   — `item.key` (the cron writes `doc(item.key)`)
 *   · FlowPath — `flowpath:<activityId>` (`api/_lib/flowpathControl.ts` and the
 *                cron's scheduled-job block both write exactly this)
 *
 * A missing activity id falls back to the per-day key rather than collapsing
 * every FlowPath alert into one document.
 */
export const deviceNotificationDocId = (kind, item) => {
  const source = item && typeof item === "object" ? item : {};
  const itemId = trim(source.itemId, 120);
  if (kind === "flowpath") {
    return trim(itemId ? `flowpath:${itemId}` : text(source.key), MAX_NOTIFICATION_ID_CHARS);
  }
  return trim(text(source.key) || itemId, MAX_NOTIFICATION_ID_CHARS);
};

/** The `target` document every device-written alert carries. */
export const deviceNotificationTarget = (kind, item) => {
  const source = item && typeof item === "object" ? item : {};
  const itemId = trim(source.itemId, 120);
  if (kind === "flowpath") return { type: "flowpath", itemId };
  // A workspace occurrence carries its own canonical target (built by
  // `src/joplin/scheduling/scheduleNotifications.ts`). It must be preserved as
  // given: the ids in it are what a tap has to resolve.
  const explicit = source.target && typeof source.target === "object" ? source.target : null;
  if (explicit && explicit.type === "joplin") {
    const target = { type: "joplin" };
    if (explicit.noteId) target.noteId = trim(explicit.noteId, 120);
    if (explicit.notebookId) target.notebookId = trim(explicit.notebookId, 120);
    if (explicit.tagId) target.tagId = trim(explicit.tagId, 120);
    if (explicit.resourceId) target.resourceId = trim(explicit.resourceId, 120);
    if (explicit.scheduleId) target.scheduleId = trim(explicit.scheduleId, 120);
    return target;
  }
  const section = trim(source.section, MAX_NOTIFICATION_SECTION_CHARS);
  const target = { type: "mayday" };
  if (section) target.section = section;
  if (itemId) target.itemId = itemId;
  return target;
};

/** My Day items are "mayday"; a FlowPath revision/lecture is course content. */
export const deviceNotificationCategory = (kind, item) => {
  if (kind !== "flowpath") return "mayday";
  const flowKind = trim((item && item.kind) || "", 40).toLowerCase();
  return COURSE_KINDS.has(flowKind) ? "course" : "mayday";
};

/**
 * Build the Firestore payload for a device-delivered notification, or `null`
 * when the input cannot produce a valid document (the caller then simply skips
 * the write — the tray alert has already been delivered).
 *
 * `createdAtMs` is the item's OWN due time, not "now": that keeps the alerts
 * page in the order the learner experienced, and it matches the timestamp the
 * server writes for the same id, so a merge never reorders anything.
 */
export const buildDeviceNotification = (input) => {
  const source = input && typeof input === "object" ? input : {};
  const id = trim(source.id, MAX_NOTIFICATION_ID_CHARS);
  const title = trim(source.title, MAX_NOTIFICATION_TITLE_CHARS);
  if (!id || !title) return null;
  const category = NOTIFICATION_CATEGORIES.includes(source.category) ? source.category : "mayday";
  const target = source.target && typeof source.target === "object" ? source.target : { type: "mayday" };
  const targetType = NOTIFICATION_TARGET_TYPES.includes(target.type) ? target.type : "mayday";
  const cleanTarget = { type: targetType };
  if (target.section) cleanTarget.section = trim(target.section, MAX_NOTIFICATION_SECTION_CHARS);
  if (target.itemId) cleanTarget.itemId = trim(target.itemId, 120);
  if (target.productId != null) cleanTarget.productId = target.productId;
  // Workspace targets: the canonical ids the tap resolves to. Every field is
  // trimmed and length-capped exactly like the legacy ones, and the caps are
  // mirrored by firestore.rules.
  if (targetType === "joplin") {
    for (const key of ["noteId", "notebookId", "tagId", "resourceId", "scheduleId"]) {
      if (target[key]) cleanTarget[key] = trim(target[key], 120);
    }
  }
  return {
    id,
    title,
    body: trim(source.body, MAX_NOTIFICATION_BODY_CHARS),
    category,
    read: false,
    source: DEVICE_NOTIFICATION_SOURCE,
    createdAtMs: asNumber(source.createdAtMs, Date.now()),
    target: cleanTarget,
  };
};
