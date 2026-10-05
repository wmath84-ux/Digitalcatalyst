/**
 * Revision → Digitalcatalyst notification bridge.
 * ===============================================
 *
 * Migration brief §20: the Revision feature must publish its scheduled events
 * into the app's EXISTING notification stack — the Android exact-time
 * LocalNotifications alarms, web push/FCM, the Firestore-backed in-app inbox,
 * the device mirror and the deep-link table — and must not create a second one.
 *
 * Everything Revision needs therefore goes through this module, which is the
 * only place in the feature that touches:
 *
 *   `utils/capacitorBridge`            — exact-time Android alarms + tap routing
 *   `src/lib/deviceNotificationInbox`  — device mirror + `users/{uid}/notifications`
 *   `utils/siteNotifications`          — local inbox + the `#/revision…` deep links
 *
 * Notification identity is deterministic (one alert per event per day, or per
 * scheduled instant), so a re-render, a StrictMode double-invoke or a reconnect
 * cannot produce a duplicate entry — the same guarantee the study review log
 * makes with `dedupeKey`.
 */

import { recordDeviceNotification } from "../../lib/deviceNotificationInbox";
import {
  getAndroidLargeIconForTag,
  isAndroidNative,
  scheduleLocalAlarm,
} from "../../utils/capacitorBridge";
import {
  loadSiteNotifications,
  mergeSiteNotifications,
  saveSiteNotifications,
  type SiteNotification,
} from "../../../utils/siteNotifications";
import type { DeviceNotificationInput } from "../../../utils/deviceNotifications";
import { REVISION_DEEP_LINKS, isRevisionHash } from "./routes";

export type RevisionNotificationEvent =
  | "cards-due"
  | "daily-goal"
  | "scheduled-deck"
  | "test-reminder"
  | "weak-topic"
  | "streak"
  | "test";

export interface RevisionNotificationDetail {
  uid?: string | null;
  dueCount?: number;
  streak?: number;
  goalRemaining?: number;
  deckName?: string;
  /** Epoch ms. When set on Android the alert is armed as an exact-time alarm. */
  scheduledAt?: number;
  /** Overrides the default deep link (must be a `#/revision…` route). */
  url?: string;
}

interface EventCopy {
  title: string;
  body: (detail: RevisionNotificationDetail) => string;
  /** Android tag — used to coalesce and to pick the contextual large icon. */
  tag: string;
  /** Default deep link, always inside the Revision feature. */
  url: string;
  /** Stable id stem. */
  idStem: string;
}

const COPY: Record<RevisionNotificationEvent, EventCopy> = {
  "cards-due": {
    title: "Revision",
    body: (detail) =>
      (detail.dueCount ?? 0) === 1 ? "1 card is due for review." : `${detail.dueCount ?? 0} cards are due for review.`,
    tag: "revision-due",
    url: REVISION_DEEP_LINKS.dashboard,
    idStem: "revision-due",
  },
  "daily-goal": {
    title: "Revision goal",
    body: (detail) =>
      detail.goalRemaining && detail.goalRemaining > 0
        ? `${detail.goalRemaining} more reviews to hit today's goal.`
        : "Finish today's revision goal.",
    tag: "revision-goal",
    url: REVISION_DEEP_LINKS.dashboard,
    idStem: "revision-goal",
  },
  "scheduled-deck": {
    title: "Scheduled revision",
    body: (detail) => (detail.deckName ? `Time to revise ${detail.deckName}.` : "Your scheduled revision is ready."),
    tag: "revision-deck",
    url: REVISION_DEEP_LINKS.dashboard,
    idStem: "revision-deck",
  },
  "test-reminder": {
    title: "Daily Test",
    body: () => "Your Daily Test is ready. Keep the streak going.",
    tag: "revision-test",
    url: REVISION_DEEP_LINKS.testPlay(),
    idStem: "revision-test",
  },
  "weak-topic": {
    title: "Weak topic",
    body: (detail) => (detail.deckName ? `${detail.deckName} needs another pass.` : "A topic needs another pass today."),
    tag: "revision-weak",
    url: REVISION_DEEP_LINKS.weakTopics,
    idStem: "revision-weak",
  },
  streak: {
    title: "Streak",
    body: (detail) => `${detail.streak ?? 0}-day revision streak — review now to keep it.`,
    tag: "revision-streak",
    url: REVISION_DEEP_LINKS.progress,
    idStem: "revision-streak",
  },
  test: {
    title: "Revision",
    body: () => "Notifications are working — you'll be reminded when cards are due.",
    tag: "revision-test-alert",
    url: REVISION_DEEP_LINKS.profile,
    idStem: "revision-test-alert",
  },
};

/** Local calendar day, used to keep a reminder to one alert per day. */
export function revisionDayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Stable, deterministic id for an alert. The same event on the same day always
 * produces the same id, so the device mirror and Firestore converge on ONE
 * document instead of accumulating a duplicate every time a screen re-renders.
 */
export function revisionNotificationId(
  event: RevisionNotificationEvent,
  detail: RevisionNotificationDetail = {},
  now = new Date(),
): string {
  const stem = COPY[event].idStem;
  if (detail.scheduledAt) return `${stem}-${detail.scheduledAt}`;
  return `${stem}-${revisionDayKey(now)}`;
}

/** Deterministic positive 31-bit integer for `LocalNotifications.schedule`. */
export function revisionAlarmId(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 2_000_000_000 || 1;
}

/**
 * Publish a Revision notification through the existing stack.
 *
 * Returns `true` when the alert was recorded or armed. Never throws: a
 * notification must never break a study session.
 */
export async function publishRevisionNotification(
  event: RevisionNotificationEvent,
  detail: RevisionNotificationDetail = {},
): Promise<boolean> {
  const copy = COPY[event];
  const url = detail.url && isRevisionHash(detail.url) ? detail.url : copy.url;
  const id = revisionNotificationId(event, detail);
  const title = copy.title;
  const body = copy.body(detail);
  const uid = detail.uid ?? null;

  let recorded = false;

  // ── 1. In-app inbox mirror + Firestore (the same writer My Day uses) ──────
  try {
    const input: DeviceNotificationInput = {
      id,
      title,
      body,
      // A study reminder is a reminder: `mayday` keeps it in the bell page's
      // existing "reminders" filter and gives it the existing icon, while the
      // `revision` TARGET carries the deep link.
      category: "mayday",
      createdAtMs: Date.now(),
      target: { type: "revision", itemId: url },
    };
    if (uid) {
      recordDeviceNotification(uid, input);
      recorded = true;
    } else {
      // Guests still get the local inbox entry so the bell badge is truthful.
      const local: SiteNotification = {
        id,
        title,
        body,
        category: "mayday",
        createdAt: Date.now(),
        read: false,
        source: "system",
        target: { type: "revision", itemId: url },
        remoteNotificationId: id,
      };
      const viewerKey = "revision-guest";
      saveSiteNotifications(viewerKey, mergeSiteNotifications(loadSiteNotifications(viewerKey), [local]));
      recorded = true;
    }
  } catch (error) {
    console.warn("[revision] could not record notification", error);
  }

  // ── 2. Android exact-time alarm when a fire time was supplied ────────────
  if (detail.scheduledAt && isAndroidNative()) {
    try {
      await scheduleLocalAlarm({
        id: revisionAlarmId(id),
        at: detail.scheduledAt,
        title,
        body,
        url,
        tag: copy.tag,
        largeIcon: getAndroidLargeIconForTag(copy.tag),
      });
    } catch (error) {
      console.warn("[revision] could not arm local alarm", error);
    }
  }

  return recorded;
}

/**
 * The daily "cards are due" reminder, armed for the learner's next local
 * `hour` o'clock. Returns false when there is nothing due (nothing to say).
 */
export async function scheduleDailyDueReminder(input: {
  uid: string | null;
  dueCount: number;
  hour?: number;
}): Promise<boolean> {
  if (input.dueCount <= 0) return false;
  const hour = input.hour ?? 9;
  const now = new Date();
  const fireAt = new Date(now);
  fireAt.setHours(hour, 0, 0, 0);
  if (fireAt.getTime() <= now.getTime()) fireAt.setDate(fireAt.getDate() + 1);

  return publishRevisionNotification("cards-due", {
    uid: input.uid,
    dueCount: input.dueCount,
    scheduledAt: fireAt.getTime(),
  });
}
