// api/cron/subscription-renewals.ts
//
// The project's single push scheduler (kept on this filename/path because the
// Vercel Hobby plan allows only 12 functions and the daily cron entry already
// points here). One invocation runs three independent, idempotent jobs:
//
//   1. Subscription renewal reminders (the original job) — 7d/3d/1d/due/expired
//      stages, in-app notification + optional web push per user.
//   2. My Day activity reminders — tasks, schedule events and reminders fire a
//      push at the exact user-set local time (device timezone is stored on the
//      myDay document). Works when the app is closed: this is server push.
//   3. Content announcements — new products (free or paid) push to every
//      subscribed device; new modules/lessons in a purchased product push to
//      that product's buyers. A Firestore baseline prevents repeat announcements.
//
// Invocation: Vercel cron runs this path daily as a catch-up. For timely My Day
// reminders, point any external 1-minute pinger (e.g. cron-job.org) at
// `GET /api/cron/subscription-renewals` with `Authorization: Bearer $CRON_SECRET`.
// Every job is deduplicated, so frequent pings are safe.

import * as webpush from "web-push";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb, errorResponse, type VercelRequest, type VercelResponse } from "../_lib/firebaseAdmin.js";
import { getRenewalReminder } from "../../utils/subscriptionRenewal.js";
import {
  buildProductInventoryEntry,
  collectDueMyDayItems,
  diffProductInventory,
} from "../../utils/pushScheduler.js";

const bearer = (req: VercelRequest) => {
  const raw = req.headers?.authorization;
  return Array.isArray(raw) ? raw[0] || "" : String(raw || "");
};

type PushPayload = { title: string; body: string; tag?: string; url?: string };

const vapidConfigured = () => {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT || "mailto:admin@eduvora.app", publicKey, privateKey);
  return true;
};

async function sendToSubscriptionDoc(item: { ref: { delete: () => Promise<unknown> }; data: () => Record<string, unknown> }, payloadString: string) {
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
    if (status === 404 || status === 410) await item.ref.delete();
    return 0;
  }
}

async function sendPush(db: FirebaseFirestore.Firestore, uid: string, title: string, body: string, target?: { tag?: string; url?: string }) {
  if (!vapidConfigured()) return 0;
  const subscriptions = await db.collection("users").doc(uid).collection("webPushSubscriptions").get();
  const payloadString = JSON.stringify({ title, body, tag: target?.tag || "eduvora", url: target?.url || "/" });
  let sent = 0;
  for (const item of subscriptions.docs) sent += await sendToSubscriptionDoc(item, payloadString);
  return sent;
}

async function sendPushToAll(db: FirebaseFirestore.Firestore, payload: PushPayload) {
  if (!vapidConfigured()) return { sent: 0, devices: 0 };
  const snapshot = await db.collectionGroup("webPushSubscriptions").get();
  const payloadString = JSON.stringify({ title: payload.title, body: payload.body, tag: payload.tag || "eduvora-content", url: payload.url || "/" });
  let sent = 0;
  for (const item of snapshot.docs) sent += await sendToSubscriptionDoc(item, payloadString);
  return { sent, devices: snapshot.size };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  const secret = String(process.env.CRON_SECRET || "");
  if (!secret) return res.status(503).json({ ok: false, error: "Renewal scheduler is not configured." });
  if (bearer(req) !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: "Unauthorized" });
  try {
    const db = adminDb();
    const now = Date.now();
    const summary: Record<string, unknown> = {};

    // ------------------------------------------------------------------ 1. renewals
    {
      const snapshot = await db.collectionGroup("subscription").get();
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
        pushed += await sendPush(db, uid, reminder.title, reminder.body, { tag: "subscription-renewal", url: "/#/subscription" });
      }
      summary.renewals = { scanned: snapshot.size, created, pushed };
    }

    // ------------------------------------------------------------- 2. My Day items
    {
      const myDaySnap = await db.collectionGroup("myDay").get();
      let processed = 0;
      let pushed = 0;
      let logged = 0;
      for (const document of myDaySnap.docs) {
        if (document.id !== "current") continue;
        const uid = document.ref.parent.parent?.id;
        if (!uid) continue;
        const data = document.data() || {};
        const tzOffsetMinutes = Number(data.tzOffsetMinutes);
        const due = collectDueMyDayItems(data, now, tzOffsetMinutes);
        if (!due.length) continue;
        processed += 1;
        const logPatch: Record<string, unknown> = {};
        // Prune previous days' dedupe markers so the map stays tiny.
        const todaySuffix = `:${due[0].key.split(":").pop()}`;
        Object.keys(data.notificationLog || {}).forEach((key) => {
          if (!key.endsWith(todaySuffix)) logPatch[`notificationLog.${key}`] = FieldValue.delete();
        });
        for (const item of due) {
          logPatch[`notificationLog.${item.key}`] = now;
          logged += 1;
          // Cross-device bell entry (id == key makes this write idempotent).
          await db.collection("users").doc(uid).collection("notifications").doc(item.key).set({
            id: item.key,
            title: item.title,
            body: item.body,
            category: "mayday",
            read: false,
            source: "system",
            createdAt: Timestamp.fromMillis(item.dueAt),
            target: { type: "myday" },
          }, { merge: true });
          pushed += await sendPush(db, uid, item.title, item.body, { tag: `myday-${item.kind}`, url: "/#/my-day" });
        }
        try {
          await document.ref.update(logPatch);
        } catch {
          // Doc may have been deleted between reads; next ping will retry.
        }
      }
      summary.myDay = { scanned: myDaySnap.size, usersWithDueItems: processed, items: logged, pushed };
    }

    // ------------------------------------------------------- 3. content announces
    {
      const productsSnap = await db.collection("siteProducts").limit(500).get();
      const inventory: Record<string, ReturnType<typeof buildProductInventoryEntry>> = {};
      productsSnap.docs.forEach((doc) => {
        inventory[doc.id] = buildProductInventoryEntry(doc.data() || {});
      });
      const stateRef = db.collection("settings").doc("contentPushState");
      const state = (await stateRef.get()).data() || null;
      const diff = diffProductInventory(state, inventory);
      let announced = 0;
      let coursePushes = 0;
      if (!diff.isBaseline) {
        for (const product of diff.newProducts.slice(0, 10)) {
          await sendPushToAll(db, {
            title: product.free ? "🎁 New free product available" : "🆕 New product added",
            body: product.title,
            tag: `content-product-${product.id}`,
            url: `/#/product/${product.id}`,
          });
          announced += 1;
        }
        for (const update of diff.updatedProducts.slice(0, 10)) {
          const key = Number.isFinite(Number(update.id)) ? Number(update.id) : update.id;
          const buyers = await db.collection("users").where("purchasedProductIds", "array-contains", key).limit(500).get();
          const parts: string[] = [];
          if (update.newModules) parts.push(`${update.newModules} new module${update.newModules === 1 ? "" : "s"}`);
          if (update.newLessons) parts.push(`${update.newLessons} new lesson${update.newLessons === 1 ? "" : "s"}`);
          for (const buyer of buyers.docs) {
            const docId = `content:course:${update.id}:${update.newModules}m${update.newLessons}l`;
            await buyer.ref.collection("notifications").doc(docId).set({
              id: docId,
              title: "Your course has new content",
              body: `${update.title}: ${parts.join(" and ")}`,
              category: "course",
              read: false,
              source: "system",
              createdAt: Timestamp.fromMillis(now),
              target: { type: "product", productId: update.id },
            }, { merge: true });
            coursePushes += await sendPush(db, buyer.id, "Your course has new content", `${update.title}: ${parts.join(" and ")}`, {
              tag: `content-course-${update.id}`,
              url: `/#/product/${update.id}`,
            });
          }
        }
      }
      await stateRef.set({ products: inventory, updatedAt: Timestamp.fromMillis(now) }, { merge: true });
      summary.content = {
        products: productsSnap.size,
        baseline: diff.isBaseline,
        newProductsAnnounced: announced,
        courseUpdatePushes: coursePushes,
      };
    }

    return res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    return errorResponse(res, error, "Could not process scheduled push jobs.");
  }
}
