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

let registeredForPush = false;

/** Register for FCM push on the installed Android TWA.
 *  No-op on web (the service worker flow handles that). */
export async function registerForPush(getIdToken: () => Promise<string | null>): Promise<{ ok: boolean; reason?: string }> {
  if (!isAndroidNative()) return { ok: false, reason: "not-native" };
  if (registeredForPush) return { ok: true };
  try {
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === "prompt") {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== "granted") {
      return { ok: false, reason: "permission-denied" };
    }
    await PushNotifications.register();

    // The token listener fires once on register and again every
    // time the token rotates. We dedupe on the server (the FCM
    // register endpoint hashes the token into the doc id).
    await PushNotifications.addListener("registration", async (token: Token) => {
      try {
        const idToken = await getIdToken();
        if (!idToken) return;
        // Routed through /api/push/fcm-register → /api/push/send via a
        // Vercel rewrite (vercel.json). The action field picks the
        // fcm-register branch on the server so we don't need a
        // dedicated Vercel function (the Hobby plan caps at 12).
        await apiFetch("/api/push/fcm-register", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            action: "fcm-register",
            token: token.value,
            appVersion: "1.0.0",
            locale: typeof navigator !== "undefined" ? navigator.language : "en",
            platform: "android",
          }),
        });
      } catch (err) {
        // The TWA will retry on the next register call; do not throw.
        console.warn("[push] fcm-register failed", err);
      }
    });

    // Tap handler — a user tapping the system notification while
    // the app is in the background re-opens with the deep link.
    await PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
      const url = (action.notification.data?.url as string) || "/";
      const hashIndex = url.indexOf("#");
      if (hashIndex >= 0 && typeof window !== "undefined") {
        window.location.hash = url.slice(hashIndex);
      }
    });

    // Foreground notifications — Capacitor's LocalNotifications
    // plugin renders a system-tray notification with the right
    // icon and tag, even when the app is open.
    await PushNotifications.addListener("pushNotificationReceived", (notification: PushNotificationSchema) => {
      // Render with the local plugin so the user sees the chrome
      // (icon, tag, vibration) the same way a real local alarm
      // would render. The data payload carries the deep link.
      void renderForegroundPush(notification);
    });

    registeredForPush = true;
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "unknown" };
  }
}

async function renderForegroundPush(notification: PushNotificationSchema) {
  try {
    const granted = await LocalNotifications.checkPermissions();
    if (granted.display !== "granted") {
      await LocalNotifications.requestPermissions();
    }
    const id = Math.floor(Math.random() * 2_000_000_000);
    const data = (notification.data || {}) as Record<string, string>;
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: notification.title || data.title || "Eduvora",
          body: notification.body || data.body || "",
          smallIcon: "ic_stat_eduvora",
          largeIcon: data.icon,
          extra: data,
        },
      ],
    });
  } catch (err) {
    console.warn("[push] renderForegroundPush failed", err);
  }
}

// ------------------------------------------------------------------ local alarms

export type LocalAlarmItem = {
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
};

/** Schedule a single exact-time local alarm. TWA only — web falls back
 *  to the existing setTimeout-based foreground rendering. The local
 *  alarm fires even when the app is closed and the device is locked
 *  because Android AlarmManager is the kernel-level scheduler.
 *
 *  Permission: the LocalNotifications plugin prompts the user for
 *  POST_NOTIFY on first schedule. If the user denied, this is a
 *  no-op and the caller should fall back to in-app rendering. */
export async function scheduleLocalAlarm(item: LocalAlarmItem): Promise<boolean> {
  if (!isAndroidNative()) return false;
  try {
    let granted = await LocalNotifications.checkPermissions();
    if (granted.display !== "granted") {
      granted = await LocalNotifications.requestPermissions();
    }
    if (granted.display !== "granted") return false;

    const schedule: LocalNotificationSchema = {
      id: item.id,
      title: item.title,
      body: item.body,
      schedule: { at: new Date(item.at), allowWhileIdle: true },
      sound: "default",
      smallIcon: item.smallIcon || "ic_stat_eduvora",
      iconColor: "#2563eb",
      extra: { url: item.url, tag: item.tag },
      channelId: "eduvora-reminders",
    };
    await LocalNotifications.schedule({ notifications: [schedule] });
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
