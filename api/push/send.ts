// api/push/send.ts
//
// Server-side web push dispatcher. Two modes:
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
// Security: every mode requires an authenticated admin (the approved admin
// email whose users/{uid}.role is "admin"). Previously this endpoint was
// unauthenticated, which let anyone broadcast arbitrary pushes.

import * as webpush from "web-push";
import { Timestamp } from "firebase-admin/firestore";
import {
  adminDb,
  errorResponse,
  requireFirebaseUser,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/firebaseAdmin.js";
import { pushToAllDevices, pushToUser, pushConfigured, type PushPayload } from "../_lib/pushNotify.js";
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

async function handleProductAction(req: VercelRequest, res: VercelResponse, action: "product-created" | "product-updated") {
  const { db } = await requireAdminUser(req);
  if (!pushConfigured()) {
    return res.status(503).json({ ok: false, error: "Web Push VAPID keys are not configured." });
  }
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
    const result = await pushToAllDevices(db, payload);
    // Mark as announced so the content scheduler does not repeat it.
    await stateRef.set({ products: { [productId]: entry }, updatedAt: Timestamp.now() }, { merge: true });
    return res.status(200).json({ ok: true, action, ...result });
  }

  // product-updated: announce only when the course tree actually grew, and
  // only to buyers. If the product has no baseline entry yet, snapshot it
  // silently — pre-baseline products must never trigger a flood.
  const diff = diffProductInventory(state, { [productId]: entry });
  const grown = diff.updatedProducts[0] || null;
  let buyersReached = 0;
  let buyerPushes = 0;
  if (grown) {
    const key = Number.isFinite(Number(productId)) ? Number(productId) : productId;
    const buyers = await db.collection("users").where("purchasedProductIds", "array-contains", key).limit(500).get();
    const parts: string[] = [];
    if (grown.newModules) parts.push(`${grown.newModules} new module${grown.newModules === 1 ? "" : "s"}`);
    if (grown.newLessons) parts.push(`${grown.newLessons} new lesson${grown.newLessons === 1 ? "" : "s"}`);
    const body = `${grown.title}: ${parts.join(" and ")}`;
    for (const buyer of buyers.docs) {
      const docId = `content:course:${productId}:${grown.newModules}m${grown.newLessons}l`;
      await buyer.ref.collection("notifications").doc(docId).set({
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
      buyerPushes += await pushToUser(db, buyer.id, {
        title: "Your course has new content",
        body,
        tag: `content-course-${productId}`,
        url: PRODUCT_URL(productId),
      });
    }
  }
  await stateRef.set({ products: { [productId]: entry }, updatedAt: Timestamp.now() }, { merge: true });
  return res.status(200).json({ ok: true, action, announced: Boolean(grown), buyersReached, buyerPushes });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    // Instant product events from the admin data layer.
    const action = safeText(req.body?.action, 40);
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
    webpush.setVapidDetails(
      process.env.WEB_PUSH_SUBJECT || 'mailto:admin@eduvora.app',
      publicKey,
      privateKey,
    );

    const title = safeText(req.body?.title, 80);
    const body = safeText(req.body?.body, 240);
    if (!title) return res.status(400).json({ ok: false, error: 'Missing notification title.' });

    const payload = {
      title,
      body,
      tag: safeText(req.body?.tag, 60) || undefined,
      icon: safeText(req.body?.icon, 300) || undefined,
      badge: safeText(req.body?.badge, 300) || undefined,
      url: safeText(req.body?.url, 500) || undefined,
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
        .map(item => item.data())
        .filter((data): data is Record<string, unknown> => Boolean(data))
        .map(data => ({
          endpoint: safeText(data.endpoint, 500),
          keys: { p256dh: safeText(data.p256dh, 300), auth: safeText(data.auth, 100) },
        }))
        .filter(isPushSub);
    }

    if (subscriptions.length === 0) {
      return res.status(400).json({ ok: false, error: 'No push subscriptions provided or found.' });
    }

    const results: Array<{ endpoint: string; status: string; error?: string }> = [];
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(subscription, payloadString, { TTL: 60 * 60 * 24 });
        results.push({ endpoint: subscription.endpoint, status: 'sent' });
      } catch (error) {
        const statusCode = typeof (error as { statusCode?: number }).statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : 0;
        const message = error instanceof Error ? error.message : 'Send failed.';
        results.push({ endpoint: subscription.endpoint, status: `failed:${statusCode}`, error: message });
      }
    }

    const sent = results.filter(result => result.status === 'sent').length;
    return res.status(200).json({ ok: true, sent, failed: results.length - sent, results });
  } catch (error) {
    return errorResponse(res, error, "Could not send the push notification.");
  }
}
