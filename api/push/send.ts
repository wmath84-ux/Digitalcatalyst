// api/push/send.ts
//
// Server-side push dispatcher — dual mode (Web Push + FCM).
//
//   1. Instant product actions (new): fired by the admin data layer the
//      moment a product is created or saved, so every subscribed device gets
//      the announcement instantly — no cron wait:
//        { action: "product-created", productId } → push to ALL devices
//        { action: "product-updated", productId } → if the course tree gained
//           modules/lessons vs the stored baseline, push to that product's
//           buyers + write their bell entries
//      Both also sync `settings/contentPushState` so the daily/content
//      scheduler never double-announces the same change.
//
//   2. Legacy free-form mode (title/body to explicit subscriptions, one uid,
//      or every device) — kept for operational use.
//
// Dual transport:
//
//   • Web Push (VAPID) targets every browser / service worker the user has
//     ever opened Eduvora on. Unreliable on Android Chrome (battery
//     optimisers, doze mode) but free, no signup required.
//   • FCM (Firebase Cloud Messaging) targets the Capacitor TWA on Android.
//     100% reliable for the installed app because Google's transport runs
//     inside Play Services — the system wakes the device, the Capacitor
//     push plugin hands the payload to the app, the app renders a local
//     notification with full chrome (icon, tag, deep-link URL).
//
//   Every send fans out to BOTH transports (web + FCM) so users on
//   desktop web still get reminders, and users on the TWA get the
//   guaranteed delivery. The fan-out is cheap (single read per user,
//   then parallel send per transport) and each transport's dispatcher
//   prunes its own dead tokens.
//
// Security: every mode requires an authenticated admin (the approved admin
// email whose users/{uid}.role is "admin"). Previously this endpoint was
// unauthenticated, which let anyone broadcast arbitrary pushes.

import { setVapidDetails, sendNotification } from "../_lib/webpush.js";
import { Timestamp, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  adminDb,
  errorResponse,
  requireFirebaseUser,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/firebaseAdmin.js";
import { pushToAllDevices, pushToUser, pushConfigured, type PushPayload } from "../_lib/pushNotify.js";
import { fcmPushToAllDevices, fcmPushToUser, fcmConfigured, handleFcmRegister, type FcmPayload } from "../_lib/fcm.js";
import { getNotificationBrandChrome } from "../_lib/branding.js";
import { buildProductInventoryEntry, diffProductInventory } from "../../utils/pushScheduler.js";

type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

const safeText = (value: unknown, max = 200) =>
  String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

const isPushSub = (value: unknown): value is PushSub => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const endpoint = candidate.endpoint;
  const keys = candidate.keys as Record<string, string> | undefined;
  return typeof endpoint === 'string'
    && endpoint.startsWith('https://')
    && Boolean(keys)
    && typeof keys?.p256dh === 'string'
    && typeof keys?.auth === 'string';
};

// Mirrors firestore.rules isAdmin(): approved admin email + users/{uid}.role.
const requireAdminUser = async (req: VercelRequest) => {
  const decoded = await requireFirebaseUser(req);
  const email = String(decoded.email || "").toLowerCase();
  const db = adminDb();
  const snap = await db.collection("users").doc(decoded.uid).get();
  if (email !== "wmath84@gmail.com" || snap.data()?.role !== "admin") {
    throw Object.assign(new Error("Admin access required."), { statusCode: 403 });
  }
  return { db, uid: decoded.uid };
};

const PRODUCT_URL = (productId: string) => `/#/product/${productId}`;

// Ownership has a canonical entitlement record plus a legacy array. Read both
// so old purchases, string IDs and newer checkout writes all receive updates.
async function findProductBuyerIds(db: Firestore, productId: string): Promise<string[]> {
  const ids = new Set<string>();
  const keys: Array<string | number> = [productId];
  if (Number.isFinite(Number(productId))) keys.push(Number(productId));
  for (const key of keys) {
    const legacy = await db.collection("users").where("purchasedProductIds", "array-contains", key).get();
    legacy.docs.forEach((item: QueryDocumentSnapshot) => ids.add(item.id));
    const entitlements = await db.collectionGroup("entitlements").where("productId", "==", key).get();
    entitlements.docs.forEach((item: QueryDocumentSnapshot) => {
      const uid = item.ref.parent.parent?.id;
      if (uid) ids.add(uid);
    });
  }
  return Array.from(ids);
}

async function writeNewProductBellEntries(db: Firestore, productId: string, entry: ReturnType<typeof buildProductInventoryEntry>) {
  const users = await db.collection("users").get();
  const docId = `content:product:${productId}`;
  // Keep below Firestore's 500-operation batch ceiling and cover every user,
  // not just the first page of accounts.
  for (let offset = 0; offset < users.docs.length; offset += 450) {
    const batch = db.batch();
    users.docs.slice(offset, offset + 450).forEach((user: QueryDocumentSnapshot) => batch.set(user.ref.collection("notifications").doc(docId), {
      id: docId,
      title: entry.free ? "New free product available" : "New product added",
      body: entry.title,
      category: "store",
      read: false,
      source: "system",
      createdAt: Timestamp.now(),
      target: { type: "product", productId },
    }, { merge: true }));
    await batch.commit();
  }
  return users.size;
}

async function handleProductAction(req: VercelRequest, res: VercelResponse, action: "product-created" | "product-updated") {
  const { db } = await requireAdminUser(req);
  // Bell entries and content baselines must still be written if Web Push is
  // temporarily misconfigured; delivery resumes as soon as VAPID is restored.
  const webPushConfigured = pushConfigured();
  const productId = safeText(req.body?.productId, 160);
  if (!productId) return res.status(400).json({ ok: false, error: "Missing productId." });

  const snap = await db.collection("siteProducts").doc(productId).get();
  if (!snap.exists) return res.status(404).json({ ok: false, error: "Product not found." });
  const entry = buildProductInventoryEntry(snap.data() || {});
  const stateRef = db.collection("settings").doc("contentPushState");
  const state = (await stateRef.get()).data() || null;

  if (action === "product-created") {
    const payload: PushPayload = {
      title: entry.free ? "🎁 New free product available" : "🆕 New product added",
      body: entry.title,
      tag: `content-product-${productId}`,
      url: PRODUCT_URL(productId),
    };
    const fcmPayload: FcmPayload = { ...payload };
    // Fan out to both transports in parallel. Web Push is for browser
    // service workers; FCM is for the installed Android TWA. Either
    // can be misconfigured — the bell entries are written by
    // writeNewProductBellEntries regardless, so users who install
    // later still see the announcement in their tray.
    const [webResult, fcmResult, bellEntries] = await Promise.all([
      pushToAllDevices(db, payload),
      fcmPushToAllDevices(db, fcmPayload),
      writeNewProductBellEntries(db, productId, entry),
    ]);
    // Mark as announced so the content scheduler does not repeat it.
    await stateRef.set({ products: { [productId]: entry }, updatedAt: Timestamp.now() }, { merge: true });
    return res.status(200).json({
      ok: true,
      action,
      webPushConfigured,
      fcmConfigured: fcmConfigured(),
      web: webResult,
      fcm: fcmResult,
      bellEntries,
    });
  }

  // product-updated: announce only when the course tree actually grew, and
  // only to buyers. If the product has no baseline entry yet, snapshot it
  // silently — pre-baseline products must never trigger a flood.
  const diff = diffProductInventory(state, { [productId]: entry });
  const grown = diff.updatedProducts[0] || null;
  let buyersReached = 0;
  let buyerWebPushes = 0;
  let buyerFcmPushes = 0;
  if (grown) {
    const buyerIds = await findProductBuyerIds(db, productId);
    const parts: string[] = [];
    if (grown.newModules) parts.push(`${grown.newModules} new module${grown.newModules === 1 ? "" : "s"}`);
    if (grown.newLessons) parts.push(`${grown.newLessons} new lesson${grown.newLessons === 1 ? "" : "s"}`);
    const body = `${grown.title}: ${parts.join(" and ")}`;
    for (const buyerId of buyerIds) {
      const userRef = db.collection("users").doc(buyerId);
      const docId = `content:course:${productId}:${grown.newModules}m${grown.newLessons}l`;
      await userRef.collection("notifications").doc(docId).set({
        id: docId,
        title: "Your course has new content",
        body,
        category: "course",
        read: false,
        source: "system",
        createdAt: Timestamp.now(),
        target: { type: "product", productId },
      }, { merge: true });
      buyersReached += 1;
      // Fan out to both transports so desktop browsers AND installed
      // Android TWAs see the update. The bell entry above means the
      // in-app tray shows it for users who haven't installed yet.
      const [webSent, fcmSent] = await Promise.all([
        pushToUser(db, buyerId, {
          title: "Your course has new content",
          body,
          tag: `content-course-${productId}`,
          url: `/#/course/${productId}`,
        }),
        fcmPushToUser(db, buyerId, {
          title: "Your course has new content",
          body,
          tag: `content-course-${productId}`,
          url: `/#/course/${productId}`,
        }),
      ]);
      buyerWebPushes += webSent;
      buyerFcmPushes += fcmSent;
    }
  }
  await stateRef.set({ products: { [productId]: entry }, updatedAt: Timestamp.now() }, { merge: true });
  return res.status(200).json({
    ok: true,
    action,
    webPushConfigured,
    fcmConfigured: fcmConfigured(),
    announced: Boolean(grown),
    buyersReached,
    buyerWebPushes,
    buyerFcmPushes,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    // FCM token registration from the Capacitor / TWA Android shell.
    // Routed through this same function so we don't add a new Vercel
    // serverless function (Hobby plan caps the project at 12). The
    // rewrite in vercel.json maps /api/push/fcm-register to this
    // handler, and the `action` field tells us which branch to run.
    const action = safeText(req.body?.action, 40);
    if (action === "fcm-register") {
      return await handleFcmRegister(req, res, adminDb());
    }
    if (action === "product-created" || action === "product-updated") {
      return await handleProductAction(req, res, action);
    }

    // Legacy free-form mode — admin only (was previously unauthenticated).
    const { db } = await requireAdminUser(req);

    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      return res.status(500).json({ ok: false, error: 'Web Push VAPID keys are not configured.' });
    }
    setVapidDetails(
      process.env.WEB_PUSH_SUBJECT || 'mailto:admin@eduvora.app',
      publicKey,
      privateKey,
    );

    const title = safeText(req.body?.title, 80);
    const body = safeText(req.body?.body, 240);
    if (!title) return res.status(400).json({ ok: false, error: 'Missing notification title.' });

    const brand = await getNotificationBrandChrome();
    const payload: PushPayload & Record<string, unknown> = {
      title,
      body,
      tag: safeText(req.body?.tag, 60) || undefined,
      icon: safeText(req.body?.icon, 300) || brand.icon,
      badge: safeText(req.body?.badge, 300) || brand.badge,
      url: safeText(req.body?.url, 500) || undefined,
    };
    const fcmPayload: FcmPayload = {
      title: payload.title,
      body: payload.body,
      tag: payload.tag as string | undefined,
      url: payload.url as string | undefined,
      icon: payload.icon as string | undefined,
      badge: payload.badge as string | undefined,
    };
    const payloadString = JSON.stringify(payload);

    let subscriptions: PushSub[] = Array.isArray(req.body?.subscriptions)
      ? (req.body.subscriptions as unknown[]).filter(isPushSub)
      : [];

    const uid = safeText(req.body?.uid, 60);
    const sendToAll = Boolean(req.body?.all);

    if ((uid || sendToAll) && subscriptions.length === 0) {
      const snapshot = sendToAll
        ? await db.collectionGroup('webPushSubscriptions').get()
        : await db.collection('users').doc(uid).collection('webPushSubscriptions').get();

      subscriptions = snapshot.docs
        .map((item: QueryDocumentSnapshot) => item.data())
        .filter((data: unknown): data is Record<string, unknown> => Boolean(data))
        .map((data: Record<string, unknown>) => ({
          endpoint: safeText(data.endpoint, 500),
          keys: { p256dh: safeText(data.p256dh, 300), auth: safeText(data.auth, 100) },
        }))
        .filter(isPushSub);
    }

    // Fan out to Web Push AND FCM in parallel. Web Push is for
    // browsers; FCM is for installed Android TWAs. Either
    // transport can be down — the other still delivers. The legacy
    // `subscriptions` array is the explicit push the admin might
    // pass for an ad-hoc device; we run it through Web Push since
    // it is a VAPID endpoint.
    const [results, fcmSummary] = await Promise.all([
      (async () => {
        const out: Array<{ endpoint: string; status: string; error?: string }> = [];
        for (const subscription of subscriptions) {
          try {
            await sendNotification(subscription, payloadString, { TTL: 60 * 60 * 24 });
            out.push({ endpoint: subscription.endpoint, status: 'sent' });
          } catch (error) {
            const statusCode = typeof (error as { statusCode?: number }).statusCode === 'number'
              ? (error as { statusCode: number }).statusCode
              : 0;
            const message = error instanceof Error ? error.message : 'Send failed.';
            out.push({ endpoint: subscription.endpoint, status: `failed:${statusCode}`, error: message });
          }
        }
        return out;
      })(),
      uid
        ? fcmPushToUser(db, uid, fcmPayload)
        : sendToAll
        ? fcmPushToAllDevices(db, fcmPayload).then((r) => r.sent)
        : Promise.resolve(0),
    ]);

    const sent = results.filter(result => result.status === 'sent').length;
    return res.status(200).json({
      ok: true,
      sent,
      failed: results.length - sent,
      results,
      fcm: { sent: fcmSummary },
    });
  } catch (error) {
    return errorResponse(res, error, "Could not send the push notification.");
  }
}
