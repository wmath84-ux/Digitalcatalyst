// api/_lib/pushNotify.ts
//
// Shared web-push delivery helpers for the API functions. Kept out of the
// cron scheduler on purpose: the renewal/content scheduler carries its own
// copy (covered by its contract tests), while instant/event-driven sends
// (purchase unlocks, admin product saves, manual admin announcements) share
// these.

import * as webpush from "web-push";
import type { Firestore } from "firebase-admin/firestore";

export type PushPayload = { title: string; body: string; tag?: string; url?: string };

export const pushConfigured = (): boolean => {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT || "mailto:admin@eduvora.app", publicKey, privateKey);
  return true;
};

type SubscriptionDoc = { ref: { delete: () => Promise<unknown> }; data: () => Record<string, unknown> };

const sendToSubscriptionDoc = async (item: SubscriptionDoc, payloadString: string): Promise<number> => {
  const data = item.data() || {};
  if (!data.endpoint || !data.p256dh || !data.auth) return 0;
  try {
    await webpush.sendNotification(
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
  if (!pushConfigured()) return 0;
  const subscriptions = await db.collection("users").doc(uid).collection("webPushSubscriptions").get();
  const payloadString = JSON.stringify({ title: payload.title, body: payload.body, tag: payload.tag || "eduvora", url: payload.url || "/" });
  let sent = 0;
  for (const item of subscriptions.docs) sent += await sendToSubscriptionDoc(item, payloadString);
  return sent;
}

/** Push to every stored device across all users (product announcements). */
export async function pushToAllDevices(db: Firestore, payload: PushPayload): Promise<{ sent: number; devices: number }> {
  if (!pushConfigured()) return { sent: 0, devices: 0 };
  const snapshot = await db.collectionGroup("webPushSubscriptions").get();
  const payloadString = JSON.stringify({ title: payload.title, body: payload.body, tag: payload.tag || "eduvora-content", url: payload.url || "/" });
  let sent = 0;
  for (const item of snapshot.docs) sent += await sendToSubscriptionDoc(item, payloadString);
  return { sent, devices: snapshot.size };
}
