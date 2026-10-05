// Type declarations for `utils/deviceNotifications.js`. The runtime lives in the
// sibling `.js` file so the Node test runner can import it without a TS
// toolchain — the same split `utils/courseNotes.js` / `.d.ts` uses.
//
// Consumer: `src/lib/deviceNotificationInbox.ts` (the writer wired into the
// My Day / FlowPath foreground safety nets in `src/main.tsx`).

export const DEVICE_NOTIFICATION_SOURCE: "device";
export const MAX_NOTIFICATION_ID_CHARS: number;
export const MAX_NOTIFICATION_TITLE_CHARS: number;
export const MAX_NOTIFICATION_BODY_CHARS: number;
export const MAX_NOTIFICATION_SECTION_CHARS: number;
export const NOTIFICATION_CATEGORIES: string[];
export const NOTIFICATION_TARGET_TYPES: string[];

export interface DeviceNotificationWorkspaceTarget {
  type?: "joplin";
  noteId?: string;
  notebookId?: string;
  tagId?: string;
  resourceId?: string;
  scheduleId?: string;
}

export interface DeviceNotificationItem {
  /** My Day / FlowPath item id. */
  itemId?: string;
  /** The per-day dedupe key the scheduler built (`<kind>:<id>:<date>`). */
  key?: string;
  /** My Day section (tasks / schedule / reminders). */
  section?: string;
  /** FlowPath kind (task / reminder / schedule / revision / mcq / lecture …). */
  kind?: string;
  /** Canonical workspace target for a My Day occurrence (joplin). */
  target?: DeviceNotificationWorkspaceTarget;
}

export interface DeviceNotificationInput {
  id?: string;
  title?: string;
  body?: string;
  category?: string;
  target?: {
    /** Includes `revision` — the Revision feature's own hash deep link. */
    type?: string;
    section?: string;
    itemId?: string;
    productId?: string | number;
    noteId?: string;
    notebookId?: string;
    tagId?: string;
    resourceId?: string;
    scheduleId?: string;
  };
  createdAtMs?: number;
}

export interface DeviceNotificationPayload {
  id: string;
  title: string;
  body: string;
  category: string;
  read: false;
  source: "device";
  createdAtMs: number;
  target: {
    type: string;
    section?: string;
    itemId?: string;
    productId?: string | number;
    noteId?: string;
    notebookId?: string;
    tagId?: string;
    resourceId?: string;
    scheduleId?: string;
  };
}

export function deviceNotificationDocId(kind: "myday" | "flowpath", item: DeviceNotificationItem): string;
export function deviceNotificationTarget(
  kind: "myday" | "flowpath",
  item: DeviceNotificationItem,
): {
  type: string;
  section?: string;
  itemId?: string;
  noteId?: string;
  notebookId?: string;
  tagId?: string;
  resourceId?: string;
  scheduleId?: string;
};
export function deviceNotificationCategory(kind: "myday" | "flowpath", item: DeviceNotificationItem): "mayday" | "course";
export function buildDeviceNotification(input: DeviceNotificationInput): DeviceNotificationPayload | null;
