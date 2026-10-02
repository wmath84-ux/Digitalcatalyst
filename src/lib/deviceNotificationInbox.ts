// src/lib/deviceNotificationInbox.ts
//
// When the DEVICE shows a notification, the in-app alerts page must know.
//
// The learner's report: "notifications rahe hain lekin Android notification
// sabhi aa rahe hain lekin app ke andar alerts page per dikh nahi rahe." The
// alerts page (`src/components/NotificationsPage.tsx`) renders
// `users/{uid}/notifications`, and until now only the SERVER ever wrote there.
// The client's own delivery paths — the 15-second My Day clock and the
// FlowPath poll in `src/main.tsx`, the exact-time LocalNotifications alarms —
// rendered Android notifications without leaving a single trace in Firestore,
// so everything they delivered was invisible inside the app.
//
// `recordDeviceNotification` closes that gap for exactly those alerts:
//
//   1. the device mirror (`utils/siteNotifications.ts`) is updated in the same
//      tick, so the bell badge and the alerts page update instantly — even
//      offline, and even before Firestore answers;
//   2. the cloud document is written with the SAME id the server uses for the
//      same event (see `deviceNotificationDocId`), so a locally delivered
//      alert and its server-pushed twin are ONE document, never a duplicate.
//
// This is deliberately NOT a general client-side notification generator: the
// old baseline-diff generator that lived here once re-announced the same event
// on every app open, which is why the alerts page has a "must never create
// notifications" note in `utils/siteNotifications.ts`. Only the delivery paths
// that actually showed the learner a system notification call this, and each
// one passes an id the server would have used.

import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../../firebase";
import {
  DEVICE_NOTIFICATION_SOURCE,
  buildDeviceNotification,
  type DeviceNotificationInput,
} from "../../utils/deviceNotifications";
import {
  loadSiteNotifications,
  mergeSiteNotifications,
  saveSiteNotifications,
  type SiteNotification,
  type SiteNotificationCategory,
  type SiteNotificationTarget,
} from "../../utils/siteNotifications";

/**
 * Record a notification the device just delivered.
 *
 * Never throws: the tray alert has already been shown, and the device mirror
 * keeps the entry until Firestore accepts the write (the SDK queues it while
 * offline). A rules gap can therefore never lose the alert — it retries on the
 * next write for the same item.
 */
export function recordDeviceNotification(uid: string | null | undefined, input: DeviceNotificationInput): void {
  const owner = String(uid || "").trim();
  const payload = buildDeviceNotification(input);
  if (!owner || !payload) return;

  // ── 1. Device mirror: instant paint for the badge + the alerts page ──────
  const local: SiteNotification = {
    id: payload.id,
    title: payload.title,
    body: payload.body,
    category: payload.category as SiteNotificationCategory,
    createdAt: payload.createdAtMs,
    read: false,
    source: "system",
    target: payload.target as SiteNotificationTarget,
    remoteNotificationId: payload.id,
  };
  try {
    saveSiteNotifications(owner, mergeSiteNotifications(loadSiteNotifications(owner), [local]));
  } catch {
    // Restricted storage — the cloud write below is still attempted.
  }

  // ── 2. Cloud document: the cross-device list ─────────────────────────────
  void setDoc(
    doc(db, "users", owner, "notifications", payload.id),
    {
      id: payload.id,
      title: payload.title,
      body: payload.body,
      category: payload.category,
      read: false,
      source: DEVICE_NOTIFICATION_SOURCE,
      createdAt: Timestamp.fromMillis(payload.createdAtMs),
      target: payload.target,
    },
    { merge: true },
  ).catch(() => {
    // permission-denied (rules not deployed yet) / offline: the mirror above
    // already holds the alert, and marking it read is still possible because
    // the owner-update rule is independent of the create rule.
  });
}

export { DEVICE_NOTIFICATION_SOURCE };
