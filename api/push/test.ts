import * as webpush from "web-push";
import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "../_lib/firebaseAdmin.js";

const clean = (value: unknown, max: number) => String(value || "").trim().slice(0, max);

const hashString = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, code: "method_not_allowed", error: "Method not allowed" });
  try {
    const user = await requireFirebaseUser(req);
    const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
    const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
    if (!publicKey || !privateKey) {
      return res.status(503).json({ ok: false, code: "vapid_not_configured", error: "Server Web Push keys are not configured. Add WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY in Vercel." });
    }
    webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT || "mailto:admin@eduvora.app", publicKey, privateKey);

    const body = (req.body || {}) as Record<string, unknown>;
    const liveEndpoint = clean(body.endpoint, 2000);
    const liveP256dh = clean(body.p256dh, 500);
    const liveAuth = clean(body.auth, 200);
    if (liveEndpoint && liveP256dh && liveAuth) {
      const now = Date.now();
      await adminDb().collection("users").doc(user.uid).collection("webPushSubscriptions").doc(hashString(liveEndpoint)).set({
        uid: user.uid,
        endpoint: liveEndpoint,
        p256dh: liveP256dh,
        auth: liveAuth,
        platform: clean(body.platform, 40) || "unknown",
        userAgent: clean(body.userAgent, 200),
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      }, { merge: true });
    }

    const snapshot = await adminDb().collection("users").doc(user.uid).collection("webPushSubscriptions").get();
    if (snapshot.empty) return res.status(404).json({ ok: false, code: "subscription_not_saved", error: "No browser push subscription is saved for this account. Allow notifications and try again." });

    const payload = JSON.stringify({
      title: "Eduvora test notification",
      body: "Web notifications are working correctly on this device.",
      tag: `push-test-${Date.now()}`,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/badge-96x96.png",
      url: "/#/notifications",
    });
    const results: Array<{ id: string; sent: boolean; statusCode?: number; error?: string }> = [];
    for (const item of snapshot.docs) {
      const data = item.data() || {};
      if (!data.endpoint || !data.p256dh || !data.auth) {
        results.push({ id: item.id, sent: false, error: "Stored subscription is incomplete." });
        continue;
      }
      try {
        await webpush.sendNotification({ endpoint: String(data.endpoint), keys: { p256dh: String(data.p256dh), auth: String(data.auth) } }, payload, { TTL: 300 });
        results.push({ id: item.id, sent: true });
      } catch (error) {
        const statusCode = Number((error as { statusCode?: unknown }).statusCode || 0);
        const message = error instanceof Error ? error.message : "Push provider rejected the request.";
        results.push({ id: item.id, sent: false, statusCode, error: message });
        if (statusCode === 404 || statusCode === 410) await item.ref.delete();
      }
    }
    const sent = results.filter((result) => result.sent).length;
    if (!sent) {
      const first = results.find((result) => !result.sent);
      const expired = first?.statusCode === 404 || first?.statusCode === 410;
      return res.status(502).json({ ok: false, code: expired ? "subscription_expired" : "push_send_failed", error: expired ? "This browser subscription expired and was removed. Enable notifications again, then retry." : first?.error || "The push provider did not accept the test notification.", results });
    }
    return res.status(200).json({ ok: true, sent, failed: results.length - sent, message: `Test notification sent to ${sent} saved device${sent === 1 ? "" : "s"}.`, results });
  } catch (error) {
    return errorResponse(res, error, "Could not send test notification.");
  }
}
