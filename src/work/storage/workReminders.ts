import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { nextWorkMyDayOccurrence, type WorkMyDayItem } from "./workMyDay";

const WORK_REMINDER_INDEX = "dc.work.reminderIds.v1.work-device";
const CHANNEL_ID = "eduvora-work-reminders";
const MAX_TIMER_DELAY = 2_147_000_000;
const foregroundTimers = new Map<string, ReturnType<typeof setTimeout>>();
const activeNativeItems = new Map<string, WorkMyDayItem>();
let nativeDeliveryListener: PluginListenerHandle | null = null;

const isNative = (): boolean => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

const alarmId = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2_000_000_000 + 1;
};

const readPreviousIds = (): string[] => {
  try {
    const value = JSON.parse(window.localStorage.getItem(WORK_REMINDER_INDEX) || "[]") as unknown;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
};

const writePreviousIds = (ids: string[]) => {
  try { window.localStorage.setItem(WORK_REMINDER_INDEX, JSON.stringify(ids)); } catch { /* alarm still exists on this device */ }
};

const eligible = (items: WorkMyDayItem[]) => items.filter((item) =>
  !item.deletedAt && !item.completed && Number(item.dueAt) > 0,
);

function clearForegroundTimers() {
  for (const timer of foregroundTimers.values()) clearTimeout(timer);
  foregroundTimers.clear();
}

function scheduleForegroundOccurrence(item: WorkMyDayItem, after = Date.now()) {
  const at = nextWorkMyDayOccurrence(item, after);
  if (!at) return;
  const key = `${item.id}:${at}`;
  const timer = setTimeout(() => {
    foregroundTimers.delete(key);
    try {
      window.dispatchEvent(new CustomEvent("dc:work-reminder", { detail: { itemId: item.id, title: item.title || "My Day reminder" } }));
    } catch { /* the alert can only be shown while the app is open */ }
    if (item.schedule && item.schedule.recurrence.freq !== "once") scheduleForegroundOccurrence(item, at);
  }, Math.min(MAX_TIMER_DELAY, Math.max(0, at - Date.now())));
  foregroundTimers.set(key, timer);
}

function nativeNotification(item: WorkMyDayItem, at: number) {
  return {
    id: alarmId(item.id),
    title: item.title || "My Day reminder",
    body: item.bodyText || "Open Work to see your reminder.",
    schedule: { at: new Date(at), allowWhileIdle: true },
    sound: "default",
    channelId: CHANNEL_ID,
    extra: { url: `#/work/myday?item=${encodeURIComponent(item.id)}`, workItemId: item.id },
  };
}

async function ensureNativeDeliveryListener(): Promise<void> {
  if (nativeDeliveryListener || !isNative()) return;
  try {
    nativeDeliveryListener = await LocalNotifications.addListener("localNotificationReceived", (notification) => {
      const itemId = String(notification.extra?.workItemId || "");
      const item = activeNativeItems.get(itemId);
      if (!item?.schedule || item.schedule.recurrence.freq === "once") return;
      const at = nextWorkMyDayOccurrence(item, Date.now());
      if (!at) return;
      void LocalNotifications.schedule({ notifications: [nativeNotification(item, at)] }).catch(() => undefined);
    });
  } catch {
    // On the next Work mount, the live database query re-arms recurring rows.
  }
}

/** Ask only from an explicit Save gesture; mounting Work never opens a prompt. */
export async function requestWorkReminderPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") permission = await LocalNotifications.requestPermissions();
    if (permission.display !== "granted") return false;
    if (Capacitor.getPlatform() === "android") {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: "Work reminders",
        description: "Local reminders for your Work tasks and schedule",
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: "default",
        lights: true,
        lightColor: "#4f46e5",
      });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Reconcile native alarms or foreground-only web timers against the local DB.
 * No account API, Firestore, server worker, or cloud-backed notification path
 * is involved. Native alarms survive a closed app; web timers honestly do not.
 */
export async function reconcileWorkReminders(items: WorkMyDayItem[]): Promise<void> {
  const active = eligible(items);
  if (!isNative()) {
    activeNativeItems.clear();
    clearForegroundTimers();
    for (const item of active) scheduleForegroundOccurrence(item);
    return;
  }

  activeNativeItems.clear();
  for (const item of active) activeNativeItems.set(item.id, item);
  clearForegroundTimers();
  await ensureNativeDeliveryListener();
  const permission = await LocalNotifications.checkPermissions().catch(() => ({ display: "denied" as const }));
  const allowed = permission.display === "granted";
  const previous = readPreviousIds();
  const nextIds = active.map((item) => item.id);
  const nextSet = new Set(nextIds);
  const cancel = previous.filter((id) => !nextSet.has(id)).map((id) => ({ id: alarmId(id) }));
  if (cancel.length) await LocalNotifications.cancel({ notifications: cancel }).catch(() => undefined);
  if (allowed && active.length) {
    if (Capacitor.getPlatform() === "android") {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: "Work reminders",
        description: "Local reminders for your Work tasks and schedule",
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: "default",
        lights: true,
        lightColor: "#4f46e5",
      }).catch(() => undefined);
    }
    const now = Date.now();
    const notifications = active.flatMap((item) => {
      const at = nextWorkMyDayOccurrence(item, now);
      if (!at || at <= now) return [];
      return [nativeNotification(item, at)];
    });
    if (notifications.length) await LocalNotifications.schedule({ notifications }).catch(() => undefined);
  }
  writePreviousIds(nextIds);
}

export function stopForegroundWorkReminders(): void {
  clearForegroundTimers();
}

export const workRemindersRunInBackground = (): boolean => isNative();
