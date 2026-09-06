// api/_lib/fcm.ts
//
// Firebase Cloud Messaging (FCM) dispatcher used by the Eduvora
// TWA / Capacitor Android app.
//
// Why FCM exists alongside the web-push helper:
//
//   1. Web Push on Android Chrome is unreliable. Battery
//      optimisers, doze mode and OEM "kill background apps" all
//      delay delivery — the user reported reminders arriving 5 min
//      to several hours late, or never arriving until the app was
//      opened (which forced the foreground clock to do the work).
//   2. FCM is Google's own push transport. The Capacitor
//      `PushNotifications` plugin keeps a persistent FCM token,
//      which Google's servers use to wake the device's notification
//      shade directly. Delivery is sub-second on a healthy device
//      and ≤ 1 min even on the worst case (battery saver on, no
//      network for 30 s).
//   3. For time-precise reminders ("9:00 AM Physics" no matter
//      whether the app is open) we additionally schedule a LOCAL
//      notification client-side at the exact wall-clock time. The
//      server push is the wake-up call; the local alarm is the
//      exact tick.
//
//   This file is the server side of that flow. It reads device
//   tokens from the `users/{uid}/fcmTokens` collection (added by
//   the TWA on first launch) and calls `admin.messaging().send()`
//   per token. The contract is identical to the web-push helper,
//   so the cron scheduler and instant `/api/push/send` endpoint
//   can pick the right dispatcher per device without changing the
//   payload shape.
//
//   If FCM is not configured (no service account, no project), the
//   helper returns 0 and the caller's existing web-push path stays
//   in charge. That keeps the web app 100% functional even before
//   the Android APK ships.

import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { createHash } from "node:crypto";
import { Timestamp, type Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getFirebaseAdminApp, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import { getNotificationBrandChrome } from "./branding.js";

export type FcmPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string;
  badge?: string;
};

let cachedMessaging: Messaging | null = null;

/** Lazy-init the FCM admin handle. Returns null when FCM is not configured
 *  (no service-account credentials) so callers can fall back to web-push. */
function messagingOrNull(): Messaging | null {
  if (cachedMessaging) return cachedMessaging;
  try {
    cachedMessaging = getMessaging(getFirebaseAdminApp());
  } catch {
    cachedMessaging = null;
  }
  return cachedMessaging;
}

export const fcmConfigured = (): boolean => messagingOrNull() !== null;

type FcmTokenDoc = {
  ref: { delete: () => Promise<unknown> };
  data: () => Record<string, unknown>;
};

/** Send to one FCM token, prune it on permanent errors. Returns 1 on
 *  success, 0 on failure. Permanent failures (UNREGISTERED, INVALID_ARGUMENT)
 *  delete the token so the next run is cheaper. Transient failures
 *  (UNAVAILABLE, INTERNAL) leave it alone so the next scheduler tick
 *  retries. */
async function sendToTokenDoc(item: FcmTokenDoc, data: Record<string, string>): Promise<number> {
  const token = String(item.data()?.token || "");
  if (!token) return 0;
  const messaging = messagingOrNull();
  if (!messaging) return 0;
  try {
    await messaging.send({
      token,
      // FCM data messages (no `notification` field) are delivered
      // directly to the app's foreground handler — they don't open
      // the system tray themselves. The Capacitor `PushNotifications`
      // plugin re-broadcasts the data to the JS layer, which calls
      // LocalNotifications.schedule() to render the user-visible
      // notification with the correct icon and chrome. This is the
      // pattern Google recommends for Capacitor / Ionic apps: FCM
      // is the transport, LocalNotifications is the renderer.
      data,
      android: {
        priority: "high",
        ttl: 60 * 60 * 24 * 1000,
        // Wake the app even if doze mode has it asleep. The TWA's
        // foreground service wakes the device to show the
        // notification within a few hundred ms.
        notification: {
          title: data.title,
          body: data.body,
          // FCM's `icon` field is a DRAWABLE RESOURCE NAME (e.g.
          // ic_stat_eduvora), never a URL. Passing the branding URL here
          // made Google's SDK fail to resolve it and fall back to the
          // launcher icon (or drop the icon entirely). The real logo URL
          // stays in the `data.icon` field above, which the TWA's
          // foreground handler uses for the largeIcon.
          icon: "ic_stat_eduvora",
          tag: data.tag,
          clickAction: "OPEN_TARGET_URL",
        },
      },
    });
    return 1;
  } catch (error) {
    const code = String((error as { code?: string }).code || "");
    // UNREGISTERED = app was uninstalled or the token rotated. Drop
    // the doc so future sends stay cheap. SENDER_ID_MISMATCH and
    // INVALID_ARGUMENT are also permanent — wrong project, wrong
    // format. Everything else (UNAVAILABLE, INTERNAL, QUOTA_EXCEEDED)
    // is transient; the next scheduler tick will retry.
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-argument" || code === "messaging/mismatched-credential") {
      await item.ref.delete();
    }
    return 0;
  }
}

/** Push to every FCM token registered for one user. Returns the
 *  number of devices that were actually delivered to. */
export async function fcmPushToUser(db: Firestore, uid: string, payload: FcmPayload): Promise<number> {
  if (!fcmConfigured()) return 0;
  const snap = await db.collection("users").doc(uid).collection("fcmTokens").get();
  if (snap.empty) return 0;
  const brand = await getNotificationBrandChrome();
  const data: Record<string, string> = {
    title: payload.title,
    body: payload.body,
    tag: payload.tag || "eduvora",
    url: payload.url || "/",
    icon: payload.icon || brand.icon,
    badge: payload.badge || brand.badge,
  };
  let sent = 0;
  for (const item of snap.docs as unknown as QueryDocumentSnapshot[]) {
    sent += await sendToTokenDoc(
      { ref: item.ref as unknown as FcmTokenDoc["ref"], data: () => item.data() },
      data,
    );
  }
  return sent;
}

/** Push to every FCM token across every user (announcements). */
export async function fcmPushToAllDevices(db: Firestore, payload: FcmPayload): Promise<{ sent: number; devices: number }> {
  if (!fcmConfigured()) return { sent: 0, devices: 0 };
  const snap = await db.collectionGroup("fcmTokens").get();
  if (snap.empty) return { sent: 0, devices: 0 };
  const brand = await getNotificationBrandChrome();
  const data: Record<string, string> = {
    title: payload.title,
    body: payload.body,
    tag: payload.tag || "eduvora-content",
    url: payload.url || "/",
    icon: payload.icon || brand.icon,
    badge: payload.badge || brand.badge,
  };
  let sent = 0;
  for (const item of snap.docs as unknown as QueryDocumentSnapshot[]) {
    sent += await sendToTokenDoc(
      { ref: item.ref as unknown as FcmTokenDoc["ref"], data: () => item.data() },
      data,
    );
  }
  return { sent, devices: snap.size };
}

// ------------------------------------------------------------------ token registration

const safeText = (value: unknown, max = 4096) =>
  String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

/** SHA-256 of the token, truncated to 48 chars. Keeps the doc id
 *  short and stable so re-registration with the same value just
 *  touches the same doc (Firestore .set with merge). */
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex").slice(0, 48);

/**
 * Register an FCM token for the signed-in user.
 *
 * Called by the Capacitor / TWA Android shell on first launch and
 * every time the device's FCM token rotates. The token is written
 * to `users/{uid}/fcmTokens/{hash}` with a merge — the same token
 * re-registering is a no-op, a rotated token writes a new doc.
 *
 * Returns:
 *   • 200 with `{ ok: true, registered: docId }` on success
 *   • 400 if the token is missing or too long
 *   • 401 if the Authorization header is missing / invalid (handled
 *     by `requireFirebaseUser` — same shape as every other endpoint)
 *   • 503 if FCM is not configured on the server (no service
 *     account JSON). The client can swallow this and fall back to
 *     web push; a hard 5xx would break the install handshake.
 *
 * Routed through /api/push/send via the `fcm-register` action so
 * this function does not count as a new Vercel serverless function
 * (the Hobby plan caps the project at 12 functions).
 */
export async function handleFcmRegister(
  req: VercelRequest,
  res: VercelResponse,
  db: Firestore,
): Promise<void> {
  if (!fcmConfigured()) {
    return res.status(503).json({ ok: false, error: "FCM is not configured on the server." });
  }
  try {
    const decoded = await requireFirebaseUser(req);
    const token = safeText(req.body?.token, 4096);
    if (!token) {
      return res.status(400).json({ ok: false, error: "Missing FCM token." });
    }
    const appVersion = safeText(req.body?.appVersion, 40);
    const locale = safeText(req.body?.locale, 12);
    const platform = safeText(req.body?.platform, 20) || "android";
    const docId = hashToken(token);
    await db
      .collection("users")
      .doc(decoded.uid)
      .collection("fcmTokens")
      .doc(docId)
      .set(
        {
          token,
          appVersion,
          locale,
          platform,
          lastSeenAt: Timestamp.now(),
          createdAt: Timestamp.now(),
        },
        { merge: true },
      );
    return res.status(200).json({ ok: true, registered: docId });
  } catch (error) {
    // Distinguish auth failures (handled by requireFirebaseUser) from
    // everything else. The shape matches errorResponse so the client
    // can treat both the same way.
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode) {
      return res.status(statusCode).json({ ok: false, error: (error as Error).message });
    }
    return res.status(500).json({ ok: false, error: "Could not register FCM token." });
  }
}
