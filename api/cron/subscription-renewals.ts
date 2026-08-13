import * as webpush from "web-push";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb, errorResponse, type VercelRequest, type VercelResponse } from "../_lib/firebaseAdmin.js";
import { getRenewalReminder } from "../../utils/subscriptionRenewal.js";

const bearer = (req: VercelRequest) => {
  const raw = req.headers?.authorization;
  return Array.isArray(raw) ? raw[0] || "" : String(raw || "");
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  const secret = String(process.env.CRON_SECRET || "");
  if (!secret) return res.status(503).json({ ok: false, error: "Renewal scheduler is not configured." });
  if (bearer(req) !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: "Unauthorized" });
  try {
    const db = adminDb();
    const snapshot = await db.collectionGroup("subscription").get();
    const now = Date.now();
    let created = 0;
    let pushed = 0;
    for (const document of snapshot.docs) {
      if (document.id !== "current") continue;
      const uid = document.ref.parent.parent?.id;
      if (!uid) continue;
      const data = document.data() || {};
      const reminder = getRenewalReminder(data, now);
      if (!reminder) continue;
      const notificationRef = db.collection("users").doc(uid).collection("notifications").doc(reminder.id);
      const existing = await notificationRef.get();
      if (existing.exists) continue;
      await notificationRef.set({ ...reminder, category: "subscription", read: false, source: "system", createdAt: Timestamp.fromMillis(now) });
      created += 1;
      if (reminder.stage === "expired" && data.status !== "expired") {
        await document.ref.set({ status: "expired", expiredAt: Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now) }, { merge: true });
      }
      pushed += await sendPush(uid, reminder.title, reminder.body);
    }
    return res.status(200).json({ ok: true, scanned: snapshot.size, created, pushed });
  } catch (error) {
    return errorResponse(res, error, "Could not process subscription renewals.");
  }
}

async function sendPush(uid: string, title: string, body: string) {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return 0;
  webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT || "mailto:admin@eduvora.app", publicKey, privateKey);
  const subscriptions = await adminDb().collection("users").doc(uid).collection("webPushSubscriptions").get();
  let sent = 0;
  for (const item of subscriptions.docs) {
    const data = item.data() || {};
    if (!data.endpoint || !data.p256dh || !data.auth) continue;
    try {
      await webpush.sendNotification({ endpoint: String(data.endpoint), keys: { p256dh: String(data.p256dh), auth: String(data.auth) } }, JSON.stringify({ title, body, tag: "subscription-renewal", url: "/#/subscription" }), { TTL: 86400 });
      sent += 1;
    } catch (error) {
      const status = Number((error as { statusCode?: unknown }).statusCode || 0);
      if (status === 404 || status === 410) await item.ref.delete();
    }
  }
  return sent;
}
