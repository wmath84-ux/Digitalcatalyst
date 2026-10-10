import { userNotificationPolicy, createNotificationPreferenceReader } from "./notificationPreferences.js";
import { queueNotificationEmail } from "./notificationEmail.js";
// api/_lib/pushNotify.ts
//
// Shared web-push delivery helpers for the API functions. Kept out of the
// cron scheduler on purpose: the renewal/content scheduler carries its own
// copy (covered by its contract tests), while instant/event-driven sends
// (purchase unlocks, admin product saves, manual admin announcements) share
// these.

import { setVapidDetails, sendNotification } from "./webpush.js";
import type { Firestore } from "firebase-admin/firestore";
import { getNotificationBrandChrome } from "./branding.js";

export type PushPayload = { title: string; body: string; tag?: string; url?: string; icon?: string; badge?: string; category?: string; section?: string; targetType?: string; largeIcon?: string; marketing?: boolean; type?: string; eventId?: string };

const NOTIF_BASE = (() => {
  const envUrl = (process.env.SITE_URL || process.env.VERCEL_URL || "").trim();
  if (envUrl) {
    const withProto = envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
    try { return new URL(withProto).origin; } catch {}
  }
  return "https://digitalcatalyst-five.vercel.app";
})();

function absPushIcon(path: string): string {
  try { return new URL(path, NOTIF_BASE).toString(); } catch { return `${NOTIF_BASE}${path}`; }
}

function getContextualLargeIconPush(tag: string, category?: string, section?: string, targetType?: string): string {
  const t = (tag || "").toLowerCase();
  const c = (category || "").toLowerCase();
  const s = (section || "").toLowerCase();
  const tt = (targetType || "").toLowerCase();
  let p = "/notif-icons/default.png";
  if (s.includes("reminder")) p = "/notif-icons/reminder.png";
  else if (s.includes("schedule")) p = "/notif-icons/schedule.png";
  else if (s.includes("task")) p = "/notif-icons/task.png";
  else if (t.includes("reminder") || c.includes("reminder")) p = "/notif-icons/reminder.png";
  else if (t.includes("task") || c.includes("task") || tt.includes("task")) p = "/notif-icons/task.png";
  else if (t.includes("schedule") || c.includes("schedule") || tt.includes("schedule")) p = "/notif-icons/schedule.png";
  else if (t.includes("course") || c === "course" || tt === "course" || t.includes("lecture") || t.includes("revision") || t.includes("exam")) p = "/notif-icons/course.png";
  else if (t.includes("store") || c === "store" || tt === "product") p = "/notif-icons/store.png";
  else if (t.includes("unlock") || c === "unlock") p = "/notif-icons/unlock.png";
  else if (t.includes("community") || c === "community") p = "/notif-icons/community.png";
  else if (t.includes("announcement") || c === "announcement" || c === "reading") p = "/notif-icons/announcement.png";
  else if (t.includes("subscription") || c === "subscription") p = "/notif-icons/subscription.png";
  else if (t.includes("mayday") || c === "mayday") {
    if (t.includes("schedule") || s === "schedule") p = "/notif-icons/schedule.png";
    else if (t.includes("reminder") || s === "reminders") p = "/notif-icons/reminder.png";
    else p = "/notif-icons/task.png";
  } else if (t.includes("flowpath")) {
    if (t.includes("reminder")) p = "/notif-icons/reminder.png";
    else if (t.includes("schedule")) p = "/notif-icons/schedule.png";
    else if (t.includes("task")) p = "/notif-icons/task.png";
    else p = "/notif-icons/course.png";
  }
  return absPushIcon(p);
}

/** Every push payload carries the live admin branding logo as `icon`, but right side large icon is contextual per type. */
export async function serializePushPayload(payload: PushPayload, defaultTag = "eduvora"): Promise<string> {
  const brand = await getNotificationBrandChrome();
  const largeIcon = payload.largeIcon || getContextualLargeIconPush(payload.tag || "", payload.category, payload.section, payload.targetType);
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag || defaultTag,
    url: payload.url || "/",
    icon: payload.icon || brand.icon,
    badge: payload.badge || brand.badge,
    largeIcon,
    category: payload.category || "",
    section: payload.section || "",
    targetType: payload.targetType || "",
  });
}

export const pushConfigured = (): boolean => {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  setVapidDetails(process.env.WEB_PUSH_SUBJECT || "mailto:admin@eduvora.app", publicKey, privateKey);
  return true;
};

type SubscriptionDoc = { ref: { delete: () => Promise<unknown> }; data: () => Record<string, unknown> };

const sendToSubscriptionDoc = async (item: SubscriptionDoc, payloadString: string): Promise<number> => {
  const data = item.data() || {};
  if (!data.endpoint || !data.p256dh || !data.auth) return 0;
  try {
    await sendNotification(
      { endpoint: String(data.endpoint), keys: { p256dh: String(data.p256dh), auth: String(data.auth) } },
      payloadString,
      { TTL: 86400 },
    );
    return 1;
  } catch (error) {
    const status = Number((error as { statusCode?: unknown }).statusCode || 0);
    // Gone/unsubscribed endpoints are deleted so later sends stay cheap.
    if (status === 404 || status === 410) await item.ref.delete();
    return 0;
  }
};

/** Push to every stored device of one user. Returns devices reached. */
export async function pushToUser(db: Firestore, uid: string, payload: PushPayload): Promise<number> {
  await queueNotificationEmail(db, uid, payload).catch((error) => console.warn("[email] could not queue notification", error));
  if (!pushConfigured()) return 0;
  if (!(await userNotificationPolicy(db, uid, payload)).push) return 0;
  const subscriptions = await db.collection("users").doc(uid).collection("webPushSubscriptions").get();
  const payloadString = await serializePushPayload(payload, "eduvora");
  let sent = 0;
  for (const item of subscriptions.docs) sent += await sendToSubscriptionDoc(item, payloadString);
  return sent;
}

/** Push to every stored device across all users (product announcements). */
export async function pushToAllDevices(db: Firestore, payload: PushPayload): Promise<{ sent: number; devices: number }> {
  if (!pushConfigured()) return { sent: 0, devices: 0 };
  const snapshot = await db.collectionGroup("webPushSubscriptions").get();
  const payloadString = await serializePushPayload(payload, "eduvora-content");
  let sent = 0;
  let devices = 0;
  const readPolicy = createNotificationPreferenceReader(db);
  for (const item of snapshot.docs) {
    const uid = String(item.data()?.uid || item.ref.parent.parent?.id || "");
    if (!uid || !(await readPolicy(uid, payload)).push) continue;
    devices += 1;
    sent += await sendToSubscriptionDoc(item, payloadString);
  }
  return { sent, devices };
}
