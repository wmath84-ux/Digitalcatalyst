// utils/inboxBridge.js
//
// Pure helpers for the notification-inbox bridge in src/main.tsx.
//
// WHY THIS EXISTS
// My Day and FlowPath reminders are reliable because the APP itself watches its
// own data and arms the device notification (utils/pushScheduler.js,
// utils/flowPathScheduler.js → scheduleLocalAlarm / showLocalSystemNotification).
// Every OTHER alert in the product — new product published, product unlocked
// after a purchase, "your course has new content", subscription renewal
// reminders, admin announcements, community activity — is generated only on the
// server (api/cron/subscription-renewals.ts + api/push/send.ts + the instant
// paths), which delivers it over Web Push / FCM. That single transport is why
// those notifications feel broken while My Day works: no VAPID keys, GitHub's
// minute pinger disabled after 60 idle days, a throttled TWA service worker, or
// a device that simply wasn't reachable at that moment, and the alert is
// silently gone forever. The bell badge still fills up (the server wrote the
// doc) but nothing ever dings — the exact "naye product ka notification nahi
// aaya" symptom.
//
// This module closes that gap the same way My Day does: the server already
// writes one idempotent doc per event to users/{uid}/notifications, so the app
// watches THAT collection and turns every unseen doc into a real device
// notification. It is a *delivery* bridge only — it never creates, mutates or
// deletes notifications, and it can never re-announce something, because the
// dedupe is permanent per document id (the server's doc ids are per-event).
//
// Deliberately independent of pushScheduler.js / flowPathScheduler.js: a bug
// here cannot break My Day or FlowPath, and vice versa.

/** How old a bell doc may be and still be surfaced. Beyond this the event is
 *  history — dinging for last week's product launch is noise, and it is also
 *  what keeps a long-idle device from firing dozens of alerts at once. */
export const INBOX_FRESH_MS = 12 * 60 * 60 * 1000;

/** Grace period after a doc is written. The server's own Web Push / FCM send
 *  races this local render; waiting briefly lets the primary path deliver first
 *  (and the tags below are aligned with the server's so a browser that does
 *  receive both collapses them into one row instead of stacking two). */
export const INBOX_GRACE_MS = 20 * 1000;

/** Cap per pass so a device that was offline for hours eases in instead of
 *  dumping a wall of notifications. The rest surface on the next pass. */
export const INBOX_MAX_PER_PASS = 5;

/** How long a surfaced id is remembered. Bell docs stop being eligible after
 *  INBOX_FRESH_MS regardless, so this only bounds the localStorage map. */
export const INBOX_SEEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Categories that already have their own exact-time device scheduler. My Day
 *  and FlowPath items are armed locally at their wall-clock instant, so
 *  re-surfacing their bell docs would double every reminder. */
export const INBOX_LOCALLY_SCHEDULED_CATEGORIES = new Set(["mayday"]);

/** Categories the bell page itself hides (see `isNewsOrBlogNotification` in
 *  utils/siteNotifications.ts). Dinging for an alert the tray refuses to show
 *  would leave the user with a notification they cannot act on, so the bridge
 *  and the bell must agree. */
export const INBOX_BELL_HIDDEN_CATEGORIES = new Set(["reading"]);

const DEFAULT_SKIP_CATEGORIES = new Set([
  ...INBOX_LOCALLY_SCHEDULED_CATEGORIES,
  ...INBOX_BELL_HIDDEN_CATEGORIES,
]);

const clean = (value, max) => {
  const text = String(value == null ? "" : value).trim();
  return text ? text.slice(0, max) : "";
};

/** Firestore Timestamp | epoch ms | ISO string | Date → epoch ms (or null). */
export const normalizeCreatedAtMs = (value, fallbackMs) => {
  if (value == null) return Number.isFinite(fallbackMs) ? fallbackMs : null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const seconds = Number(value._seconds ?? value.seconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    const nanos = Number(value._nanoseconds ?? value.nanoseconds ?? 0);
    return Math.round(seconds * 1000 + (Number.isFinite(nanos) ? nanos / 1e6 : 0));
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : (Number.isFinite(fallbackMs) ? fallbackMs : null);
};

const sanitize = (value) => String(value == null ? "" : value).replace(/[.[\]\/\\:*~`\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/**
 * Notification tag, aligned with the server's own tags wherever the doc gives
 * us enough to derive it (`content-product-<id>`, `content-course-<id>`).
 * Chrome replaces rather than stacks notifications sharing a tag, which is
 * what keeps the Web Push copy and this local copy from appearing twice.
 */
export const deriveInboxTag = (category, target, docId) => {
  const productId = target && target.productId != null ? sanitize(target.productId) : "";
  if (category === "store" && productId) return `content-product-${productId}`;
  if (category === "course" && productId) return `content-course-${productId}`;
  if (category === "unlock" && productId) return `content-unlock-${productId}`;
  return `inbox-${sanitize(docId)}`;
};

/**
 * Exact in-app location for a bell doc. Mirrors `getNotificationDeepLink` in
 * utils/siteNotifications.ts (which owns the bell-page mapping) but returns the
 * `/...` form the alarm/notification tap handlers expect, and never throws on
 * a malformed target — a bad doc must degrade to the notifications page, not
 * break the whole pass.
 */
export const resolveInboxUrl = (category, target) => {
  const type = target && typeof target === "object" ? String(target.type || "") : "";
  const productId = target && target.productId != null ? encodeURIComponent(String(target.productId)) : "";
  if (type === "product") return productId ? (category === "course" ? `/#/course/${productId}` : `/#/product/${productId}`) : "/#/store";
  if (type === "course") return productId ? `/#/course/${productId}` : "/#/store";
  if (type === "purchases") return "/#/store/purchases";
  if (type === "subscription") return target && target.expired ? "/#/subscription?renew=1" : "/#/subscription";
  if (type === "reading" && target.articleId) return `/#/reading/${encodeURIComponent(String(target.listType || "news"))}/${encodeURIComponent(String(target.articleId))}`;
  if (type === "mayday") {
    if (target.section && target.itemId) {
      return `/#/my-day?section=${encodeURIComponent(String(target.section))}&item=${encodeURIComponent(String(target.itemId))}`;
    }
    return "/#/my-day";
  }
  if (type === "announcement" || type === "community") return "/#/home";
  return "/#/notifications";
};

/**
 * Which unseen bell docs should become device notifications right now.
 *
 * @param docs   users/{uid}/notifications docs as `[{ id, data }]` (the
 *               shape src/lib/sharedSnapshot.ts hands its listeners).
 * @param nowMs  current epoch ms.
 * @param seen   this device's permanent `{ [docId]: firstSurfacedAtMs }` map.
 * @param options overrides for tests (`freshMs`, `graceMs`, `maxPerPass`,
 *               `skipCategories`).
 * @returns `[{ key, docId, category, title, body, url, tag, createdAt }]`,
 *          newest first, capped at `maxPerPass`.
 */
export const collectUnsurfacedInboxNotifications = (docs, nowMs, seen, options = {}) => {
  const freshMs = Number.isFinite(options.freshMs) ? options.freshMs : INBOX_FRESH_MS;
  const graceMs = Number.isFinite(options.graceMs) ? options.graceMs : INBOX_GRACE_MS;
  const maxPerPass = Number.isFinite(options.maxPerPass) ? options.maxPerPass : INBOX_MAX_PER_PASS;
  const skip = options.skipCategories instanceof Set ? options.skipCategories : DEFAULT_SKIP_CATEGORIES;
  const surfaced = seen && typeof seen === "object" ? seen : {};

  if (!Array.isArray(docs) || !Number.isFinite(nowMs) || maxPerPass <= 0) return [];

  const picked = [];
  for (const entry of docs) {
    const docId = entry && entry.id != null ? String(entry.id) : "";
    const data = entry && entry.data && typeof entry.data === "object" ? entry.data : null;
    if (!docId || !data) continue;
    // Already rendered on this device — ever. Bell doc ids are per-event
    // (`content:product:<id>`, `content:course:<id>:<counts>`, the renewal
    // stage id, `flowpath:<id>`), so "id seen" is a complete dedupe and no
    // time window is needed. This is precisely what the retired client-side
    // generator got wrong: it diffed a clobberable baseline instead.
    if (Object.prototype.hasOwnProperty.call(surfaced, docId)) continue;

    const category = clean(data.category, 20) || "announcement";
    if (skip.has(category)) continue;
    // A doc the user already read (here or on another device — read state is
    // synced on the doc) needs no alert.
    if (data.read === true) continue;

    const title = clean(data.title, 120);
    if (!title) continue;
    const body = clean(data.body, 500) || "Open the app to see the details.";

    let createdAt = normalizeCreatedAtMs(data.createdAt ?? data.createdAtMs, nowMs);
    if (!Number.isFinite(createdAt)) createdAt = nowMs;
    // A clock skew (a doc stamped by another device, or a device running
    // behind) would park the alert in the future, where it never satisfies the
    // grace check and is silently dropped. Clamping it to "just arrived, minus
    // the grace window" delivers it on THIS pass instead of losing it.
    if (createdAt > nowMs) createdAt = nowMs - graceMs;

    const age = nowMs - createdAt;
    if (age > freshMs) continue;
    if (age < graceMs) continue;

    picked.push({
      key: docId,
      docId,
      category,
      title,
      body,
      url: resolveInboxUrl(category, data.target),
      tag: deriveInboxTag(category, data.target, docId),
      createdAt,
    });
  }

  return picked.sort((a, b) => b.createdAt - a.createdAt).slice(0, maxPerPass);
};

/** Drop ids older than the retention window so the map stays small. */
export const pruneSeenMap = (seen, nowMs, retentionMs = INBOX_SEEN_RETENTION_MS) => {
  const source = seen && typeof seen === "object" ? seen : {};
  const cutoff = nowMs - retentionMs;
  const next = {};
  Object.keys(source).forEach((key) => {
    const at = Number(source[key]);
    if (Number.isFinite(at) && at >= cutoff) next[key] = at;
  });
  return next;
};
