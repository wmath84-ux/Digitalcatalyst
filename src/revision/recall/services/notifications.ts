/**
 * Recall notifications — Digitalcatalyst port override.
 *
 * Upstream sent Tauri-native desktop notifications. Digitalcatalyst already has
 * a complete notification stack (Android exact-time LocalNotifications alarms,
 * web push, the Firestore-backed in-app inbox and deep links), and migration
 * brief §20 forbids building a second one: "Revision must publish scheduled
 * events into the existing notification system".
 *
 * This override therefore forwards every Recall notification through
 * `src/revision/integrations/notificationBridge.ts`, which is the single place
 * that talks to the host stack.
 */

import {
  publishRevisionNotification,
  type RevisionNotificationEvent,
} from "../../integrations/notificationBridge";

/** "N cards are due" reminder, fired after initialisation when enabled. */
export async function sendDueReminder(dueCount: number, uid?: string | null): Promise<boolean> {
  return publishRevisionNotification("cards-due", { dueCount, uid: uid ?? null });
}

/** Settings → "test notification" button. */
export async function sendTestNotification(uid?: string | null): Promise<boolean> {
  return publishRevisionNotification("test", { uid: uid ?? null });
}

/** Goal / streak / scheduled-deck reminders, used by the dashboard and settings. */
export async function sendRevisionNotification(
  event: RevisionNotificationEvent,
  detail?: { dueCount?: number; streak?: number; goalRemaining?: number; deckName?: string; scheduledAt?: number; uid?: string | null },
): Promise<boolean> {
  return publishRevisionNotification(event, detail ?? {});
}

export type { RevisionNotificationEvent };
