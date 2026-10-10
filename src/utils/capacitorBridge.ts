import { captureDevicePushGate, canShowDevicePush } from "../../utils/deviceNotificationPreference";
// src/utils/capacitorBridge.ts
//
// Glue between the web build and the Capacitor / TWA Android shell.
//
// When Eduvora runs inside a browser (Chrome, Firefox, Safari) the
// app uses Web Push (VAPID) — the existing flow. When it runs
// inside the installed Android TWA (built by `npx cap run android`
// or downloaded from the Play Store), the app uses FCM (Firebase
// Cloud Messaging) plus a local notification that fires at the
// exact wall-clock time. This bridge hides the difference from the
// rest of the codebase: every other module asks `registerForPush`
// whether the platform is web or TWA, and the right transport
// wires itself up.
//
// The TWA is detected by `Capacitor.isNativePlatform()` — the
// Capacitor runtime injects a global on native builds only, so
// the check is safe in either environment.
//
//   registerForPush()        — on TWA: asks for POST_NOTIFY
//                              permission, gets the FCM token, and
//                              writes it to users/{uid}/fcmTokens
//                              via /api/push/fcm-register. On web:
//                              no-op (the existing service worker
//                              flow handles web push separately).
//
//   scheduleLocalAt(item)    — TWA only. Schedules a notification
//                              at the exact epoch-ms via the
//                              Capacitor LocalNotifications plugin,
//                              which uses Android AlarmManager
//                              under the hood. Survives app
//                              close and device lock. The FCM
//                              wake-up call still fires as a
//                              belt-and-braces; the local alarm
//                              is the exact tick.
//
//   isNativeApp()            — true when running inside the TWA.
//                              Used by Settings → to show a
//                              "this device is registered for
//                              guaranteed delivery" line.

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { apiFetch } from "./apiBase";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { ActionPerformed, PushNotificationSchema, Token } from "@capacitor/push-notifications";
import type { LocalNotificationSchema } from "@capacitor/local-notifications";

export const isNativeApp = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const isAndroidNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
};

/** Android notification channel used by every My Day alarm. Android 8+
 *  silently drops notifications that reference a channel id which was
 *  never created, so this MUST exist before the first schedule call. */
export const REMINDER_CHANNEL_ID = "eduvora-reminders";

let reminderChannelPromise: Promise<void> | null = null;

/** Create the "My Day reminders" notification channel (idempotent —
 *  Android ignores repeat creates for an existing channel id). Safe to
 *  call on every app start; no-op off Android native. */
export async function ensureReminderChannel(): Promise<void> {
  if (!isAndroidNative()) return;
  if (reminderChannelPromise) return reminderChannelPromise;
  reminderChannelPromise = (async () => {
    try {
      await LocalNotifications.createChannel({
        id: REMINDER_CHANNEL_ID,
        name: "My Day reminders",
        description: "Exact-time reminders for tasks, schedule and reminders",
        importance: 5, // IMPORTANCE_HIGH — heads-up banner + sound
        visibility: 1, // VISIBILITY_PUBLIC — shows on the lock screen
        vibration: true,
        sound: "default",
        lights: true,
        lightColor: "#2563eb",
      });
    } catch (err) {
      console.warn("[push] ensureReminderChannel failed", err);
      // Allow a later retry if channel creation failed transiently.
      reminderChannelPromise = null;
    }
  })();
  return reminderChannelPromise;
}

type PushRegistrationResult = { ok: boolean; reason?: string };
type RegistrationAttempt = {
  uid?: string; requestPermission: boolean;
  getIdToken: () => Promise<string | null>;
  finish: (result: PushRegistrationResult) => void;
  promise: Promise<PushRegistrationResult>;
  controller: AbortController;
};
let listenerSetup: Promise<void> | null = null;
let activeRegistration: RegistrationAttempt | null = null;

export async function getNativePushPermission(): Promise<"granted" | "denied" | "prompt" | "unsupported"> {
  if (!isAndroidNative()) return "unsupported";
  const status = await PushNotifications.checkPermissions();
  return status.receive === "granted" ? "granted" : status.receive === "denied" ? "denied" : "prompt";
}

async function installPushListeners() {
  if (listenerSetup) return listenerSetup;
  const handles: { remove: () => Promise<void> }[] = [];
  const setup = (async () => {
    try {
      handles.push(await PushNotifications.addListener("registration", async (token: Token) => {
        // Capture THIS attempt before awaiting auth/network. A late response
        // from an old account or timed-out request must never acknowledge a retry.
        const attempt = activeRegistration;
        if (!attempt) return;
        try {
          const idToken = await attempt.getIdToken();
          if (!idToken) { attempt.finish({ ok: false, reason: "signed-out" }); return; }
          const response = await apiFetch("/api/push/fcm-register", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ action: "fcm-register", token: token.value, appVersion: "1.0.0",
              locale: typeof navigator !== "undefined" ? navigator.language : "en", platform: "android" }),
            signal: attempt.controller.signal,
          });
          const result = await response.json().catch(() => null);
          attempt.finish(response.ok && result?.ok && (!attempt.uid || result.uid === attempt.uid)
            ? { ok: true } : { ok: false, reason: "registration-failed" });
        } catch { attempt.finish({ ok: false, reason: "registration-failed" }); }
      }));
      handles.push(await PushNotifications.addListener("registrationError", () => activeRegistration?.finish({ ok: false, reason: "registration-failed" })));
      handles.push(await PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
        const url = (action.notification.data?.url as string) || "/";
        const hashIndex = url.indexOf("#");
        if (hashIndex >= 0 && typeof window !== "undefined") window.location.hash = url.slice(hashIndex);
      }));
      handles.push(await PushNotifications.addListener("pushNotificationReceived", (notification: PushNotificationSchema) => {
        if (canShowDevicePush()) void renderForegroundPush(notification);
      }));
    } catch (error) {
      await Promise.all(handles.map((handle) => handle.remove().catch(() => undefined)));
      throw error;
    }
  })();
  listenerSetup = setup;
  try { await setup; }
  catch (error) { if (listenerSetup === setup) listenerSetup = null; throw error; }
}

/** No automatic permission prompts. Connection means an acknowledged cloud
 * registration, not merely register() returning. All setup work is single-flight
 * and UID-scoped; listener installation/partial failures are retryable. */
export async function registerForPush(getIdToken: () => Promise<string | null>, options: { requestPermission?: boolean; uid?: string } = {}): Promise<PushRegistrationResult> {
  if (!isAndroidNative()) return { ok: false, reason: "not-native" };
  const requestPermission = options.requestPermission !== false;
  if (activeRegistration) {
    const previous = activeRegistration;
    if (previous.uid === options.uid && (!requestPermission || previous.requestPermission)) return previous.promise;
    // Explicit setup is not swallowed by a check-only startup, and changing
    // users cannot inherit another user's successful acknowledgement.
    await previous.promise;
    return registerForPush(getIdToken, options);
  }
  let resolve!: (result: PushRegistrationResult) => void;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const promise = new Promise<PushRegistrationResult>((done) => { resolve = done; });
  const attempt: RegistrationAttempt = {
    uid: options.uid, requestPermission, getIdToken, promise, controller: new AbortController(),
    finish(result) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (activeRegistration === attempt) activeRegistration = null;
      attempt.controller.abort();
      resolve(result);
    },
  };
  activeRegistration = attempt;
  void (async () => {
    try {
      let permission = await PushNotifications.checkPermissions();
      if ((permission.receive === "prompt" || permission.receive === "prompt-with-rationale") && requestPermission) permission = await PushNotifications.requestPermissions();
      if (permission.receive !== "granted") { attempt.finish({ ok: false, reason: "permission-denied" }); return; }
      timer = setTimeout(() => attempt.finish({ ok: false, reason: "registration-timeout" }), 12000);
      await ensureReminderChannel();
      if (settled) return;
      await installPushListeners();
      if (settled) return;
      await PushNotifications.register();
      // Completion is driven only by registration + authenticated server ACK.
    } catch (error) { attempt.finish({ ok: false, reason: error instanceof Error ? error.message : "registration-failed" }); }
  })();
  return promise;
}

/** Account push opt-out also cancels alarms already armed on this phone. It
 * does not modify scheduledItems, My Day tasks or FlowPath content. */
export async function cancelPendingDeviceAlarms(): Promise<void> {
  if (!isAndroidNative()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await cancelLocalAlarms(pending.notifications.map((item) => item.id));
}

async function renderForegroundPush(notification: PushNotificationSchema) {
  const allowed = captureDevicePushGate(notification.data?.uid as string | undefined);
  if (!allowed()) return;
  try {
    await ensureReminderChannel();
    const granted = await LocalNotifications.checkPermissions();
    if (granted.display !== "granted" || !allowed()) return;
    const id = Math.floor(Math.random() * 2_000_000_000);
    const data = (notification.data || {}) as Record<string, string>;
    // Right side contextual icon based on notification type, left is always app logo (ic_stat_eduvora)
    const tag = String(data.tag || notification.notification?.tag || "");
    const category = String((data as any).category || "");
    const section = String((data as any).section || "");
    // Prefer the contextual notification icon to any generic brand-icon fallback.
    const contextualIcon = getAndroidLargeIconForTag(tag) !== "/notif-icons/default.png"
      ? getAndroidLargeIconForTag(tag)
      : category ? getAndroidLargeIconForCategory(category, section) : getAndroidLargeIconForTag(tag);
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: notification.title || data.title || "Eduvora",
          body: notification.body || data.body || "",
          smallIcon: "ic_stat_eduvora",
          largeIcon: contextualIcon,
          extra: data,
          channelId: REMINDER_CHANNEL_ID,
        },
      ],
    });
  } catch (err) {
    console.warn("[push] renderForegroundPush failed", err);
  }
}

// ------------------------------------------------------------------ local alarms

export type LocalAlarmItem = {
  uid?: string;
  /** Stable id used as the alarm id. Must be unique per item per day. */
  id: number;
  /** Epoch ms when the alarm should fire. */
  at: number;
  title: string;
  body: string;
  /** Hash route the user lands on when the alarm fires. */
  url: string;
  /** Tag — used by Android to coalesce identical notifications. */
  tag: string;
  /** Optional small icon override (Android only). */
  smallIcon?: string;
  /** Optional large icon — right side contextual icon (Android only). Left is always app logo. */
  largeIcon?: string;
};

/** Map notification tag/category to contextual large icon for Android right side.
 * Left small icon is always app logo (ic_stat_eduvora), right large icon shows what notification is about.
 * This fixes: both sides showed same logo, now right shows contextual icon per notification type.
 * Returns absolute URL when window is available so Android TWA can fetch it; falls back to relative.
 */
function resolveIconUrl(path: string): string {
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      // Ensure absolute https URL for Android LocalNotifications to fetch
      return new URL(path, window.location.origin).toString();
    }
  } catch {}
  return path;
}

export function getAndroidLargeIconForTag(tag: string): string {
  const t = (tag || "").toLowerCase();
  let p = "/notif-icons/default.png";
  if (t.includes("reminder") || t.includes("reminders")) p = "/notif-icons/reminder.png";
  else if (t.includes("task") || t.includes("tasks")) p = "/notif-icons/task.png";
  else if (t.includes("schedule")) p = "/notif-icons/schedule.png";
  else if (t.includes("course") || t.includes("lecture") || t.includes("revision") || t.includes("exam")) p = "/notif-icons/course.png";
  else if (t.includes("store") || t.includes("product")) p = "/notif-icons/store.png";
  else if (t.includes("unlock")) p = "/notif-icons/unlock.png";
  else if (t.includes("community")) p = "/notif-icons/community.png";
  else if (t.includes("announcement")) p = "/notif-icons/announcement.png";
  else if (t.includes("subscription")) p = "/notif-icons/subscription.png";
  else if (t.includes("mayday")) {
    if (t.includes("schedule")) p = "/notif-icons/schedule.png";
    else if (t.includes("reminder")) p = "/notif-icons/reminder.png";
    else p = "/notif-icons/task.png";
  } else if (t.includes("flowpath")) {
    if (t.includes("reminder")) p = "/notif-icons/reminder.png";
    else if (t.includes("schedule")) p = "/notif-icons/schedule.png";
    else if (t.includes("task")) p = "/notif-icons/task.png";
    else p = "/notif-icons/course.png";
  }
  return resolveIconUrl(p);
}

export function getAndroidLargeIconForCategory(category: string, section?: string): string {
  const c = (category || "").toLowerCase();
  const s = (section || "").toLowerCase();
  let p = "/notif-icons/default.png";
  if (s) {
    if (s.includes("reminder")) p = "/notif-icons/reminder.png";
    else if (s.includes("schedule")) p = "/notif-icons/schedule.png";
    else if (s.includes("task")) p = "/notif-icons/task.png";
  }
  if (p === "/notif-icons/default.png") {
    if (c.includes("reminder") || c === "mayday") {
      if (s === "schedule") p = "/notif-icons/schedule.png";
      else if (s === "reminders") p = "/notif-icons/reminder.png";
      else p = "/notif-icons/task.png";
    } else if (c.includes("task")) p = "/notif-icons/task.png";
    else if (c.includes("schedule")) p = "/notif-icons/schedule.png";
    else if (c.includes("store") || c === "product") p = "/notif-icons/store.png";
    else if (c.includes("unlock")) p = "/notif-icons/unlock.png";
    else if (c.includes("course")) p = "/notif-icons/course.png";
    else if (c.includes("community")) p = "/notif-icons/community.png";
    else if (c.includes("announcement") || c === "reading") p = "/notif-icons/announcement.png";
    else if (c.includes("subscription")) p = "/notif-icons/subscription.png";
  }
  return resolveIconUrl(p);
}

/** Schedule a single exact-time local alarm. TWA only — web falls back
 *  to the existing setTimeout-based foreground rendering. The local
 *  alarm fires even when the app is closed and the device is locked
 *  because Android AlarmManager is the kernel-level scheduler.
 *
 *  Permissions:
 *  • POST_NOTIFICATIONS — the plugin prompts the user for it on first
 *    schedule. If the user denied, this returns false and the caller
 *    falls back to in-app rendering.
 *  • SCHEDULE_EXACT_ALARM — CHECKED here, never requested: this function
 *    runs from onSnapshot callbacks, 15-second ticks and 5-minute
 *    reschedule intervals, so it must not open the system settings screen
 *    (ensureExactAlarmPermission does — that stays the explicit
 *    "Allow exact alarms" button in NotificationsPage). Until the user
 *    grants exact alarms this returns false and FCM + the foreground
 *    clock remain the delivery path. (If we scheduled anyway, the plugin
 *    would silently downgrade to an INEXACT alarm on Android 12+,
 *    reintroducing the original "reminder fires minutes late" bug and
 *    double-notifying alongside the FCM wake-up.) */
/** Android 14+ denies SCHEDULE_EXACT_ALARM by default (and we deliberately
 *  do NOT declare USE_EXACT_ALARM — Play policy restricts it to alarm-clock/
 *  calendar apps). This helper checks AlarmManager.canScheduleExactAlarms()
 *  via the LocalNotifications plugin and, if denied, opens the system
 *  ACTION_REQUEST_SCHEDULE_EXACT_ALARM settings screen so the user can grant
 *  it manually. Returns true when exact alarms are (or become) allowed.
 *  On older Android / plugin versions without the API, assumes allowed.
 *
 *  ⚠ EXPLICIT USER GESTURE ONLY — the "Allow exact alarms" button in
 *  NotificationsPage (ExactAlarmCard). It opens the system settings screen
 *  and resolves only after the user returns from it, so it must NEVER be
 *  called from onSnapshot callbacks, timers or any other background/
 *  programmatic path (see scheduleLocalAlarm, which checks instead). */
export async function getExactAlarmPermissionStatus(): Promise<"granted" | "denied" | "prompt" | "unsupported"> {
  try {
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting();
    if (exact_alarm === "granted" || exact_alarm === "denied" || exact_alarm === "prompt") return exact_alarm as any;
    return "unsupported";
  } catch {
    return "unsupported";
  }
}

export async function ensureExactAlarmPermission(): Promise<boolean> {
  try {
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting();
    if (exact_alarm === "granted") return true;
    // Opens Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM and resolves with
    // the setting after the user returns from the system screen.
    const changed = await LocalNotifications.changeExactNotificationSetting();
    return changed.exact_alarm === "granted";
  } catch {
    // API not available (Android < 12 or older plugin) — exact alarms are
    // implicitly allowed there, so don't block scheduling.
    return true;
  }
}

export async function scheduleLocalAlarm(item: LocalAlarmItem): Promise<boolean> {
  const allowed = captureDevicePushGate(item.uid);
  if (!isAndroidNative() || !allowed()) return false;
  try {
    // Android 8+ drops notifications posted to a non-existent channel.
    await ensureReminderChannel();
    // Android 12+: SCHEDULE_EXACT_ALARM must be user-granted (Android 14+
    // denies it by default). CHECK-ONLY — never call
    // ensureExactAlarmPermission() from here: this path runs from
    // onSnapshot callbacks, 15-second ticks and 5-minute reschedule
    // intervals (one call per upcoming item). Auto-opening the system
    // settings screen would yank the user into Settings on every doc
    // change while denied, and in the background the activity launch is
    // blocked (Android 10+) so the pending result never arrives and this
    // call would hang, leaving the alarm silently never armed. Denied →
    // skip the local tick; FCM + the foreground clock keep delivering,
    // and the user grants exact alarms explicitly (ExactAlarmCard).
    if ((await getExactAlarmPermissionStatus()) === "denied") return false;
    const granted = await LocalNotifications.checkPermissions();
    if (granted.display !== "granted" || !allowed()) return false;

    const schedule: LocalNotificationSchema = {
      id: item.id,
      title: item.title,
      body: item.body,
      schedule: { at: new Date(item.at), allowWhileIdle: true },
      sound: "default",
      smallIcon: item.smallIcon || "ic_stat_eduvora",
      largeIcon: item.largeIcon || getAndroidLargeIconForTag(item.tag),
      iconColor: "#2563eb",
      extra: { url: item.url, tag: item.tag },
      channelId: REMINDER_CHANNEL_ID,
    };
    if (!allowed()) return false;
    await LocalNotifications.schedule({ notifications: [schedule] });
    if (!allowed()) { await cancelLocalAlarms([item.id]); return false; }
    return true;
  } catch (err) {
    console.warn("[push] scheduleLocalAlarm failed", err);
    return false;
  }
}

/** Cancel a previously scheduled alarm. Safe to call when no alarm
 *  with the id exists — LocalNotifications silently no-ops. */
export async function cancelLocalAlarm(id: number): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    // ignore
  }
}

/** Cancel a batch of alarms at once. */
export async function cancelLocalAlarms(ids: number[]): Promise<void> {
  if (!isAndroidNative() || ids.length === 0) return;
  try {
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch {
    // ignore
  }
}

/** Listen for the user tapping a local notification. Wire this once
 *  in main.tsx so the app navigates to the deep link. */
export async function onLocalAlarmTap(handler: (url: string) => void): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
      const url = (action.notification.extra?.url as string) || "/";
      handler(url);
    });
  } catch (err) {
    console.warn("[push] onLocalAlarmTap failed", err);
  }
}
