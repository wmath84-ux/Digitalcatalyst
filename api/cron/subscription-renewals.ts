// api/cron/subscription-renewals.ts
//
// The project's single push scheduler (kept on this filename/path because the
// Vercel Hobby plan allows only 12 functions and the daily cron entry already
// points here). One invocation runs three independent, idempotent jobs:
//
//   1. Subscription renewal reminders (the original job) — 7d/3d/1d/due heads-up
//      before expiry, then one `expired-<n>` stage per morning for 10 days after
//      expiry. In-app notification + optional web push per user. The renew
//      button (client-side) only activates on those expired stages.
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

import { setVapidDetails, sendNotification } from "../_lib/webpush.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb, errorResponse, type VercelRequest, type VercelResponse } from "../_lib/firebaseAdmin.js";
import { getRenewalNotification, getRenewalReminder } from "../../utils/subscriptionRenewal.js";
import {
  buildProductInventoryEntry,
  collectDueMyDayItems,
  diffProductInventory,
  resolveLookbackMs,
} from "../../utils/pushScheduler.js";
import { runReferralRepairOnce } from "../_lib/referrals.js";

const bearer = (req: VercelRequest) => {
  const raw = req.headers?.authorization;
  return Array.isArray(raw) ? raw[0] || "" : String(raw || "");
};

type PushPayload = { title: string; body: string; tag?: string; url?: string };

const vapidConfigured = () => {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  setVapidDetails(process.env.WEB_PUSH_SUBJECT || "mailto:admin@eduvora.app", publicKey, privateKey);
  return true;
};

async function sendToSubscriptionDoc(item: { ref: { delete: () => Promise<unknown> }; data: () => Record<string, unknown> }, payloadString: string) {
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

    // How long since the previous successful run. The My Day job uses
    // this to size its catch-up window, so a delayed or missed ping
    // makes a reminder late rather than making it vanish.
    const runStateRef = db.collection("settings").doc("pushSchedulerState");
    const lastRunAt = Number((await runStateRef.get()).data()?.lastRunAt || 0);

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

        // The lifecycle stage drives the expired flag and stays true even
        // after the 10-day notification window closes, so a missed run can
        // never leave an expired doc looking active.
        const lifecycle = getRenewalReminder(data, now);
        if (!lifecycle) continue;
        if (lifecycle.expired && data.status !== "expired") {
          await document.ref.set({ status: "expired", expiredAt: Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now) }, { merge: true });
        }

        // The notification itself only fires inside the 10-morning window.
        const reminder = getRenewalNotification(data, now);
        if (!reminder) continue;

        const notificationRef = db.collection("users").doc(uid).collection("notifications").doc(reminder.id);
        const existing = await notificationRef.get();
        if (existing.exists) continue;
        await notificationRef.set({ ...reminder, category: "subscription", read: false, source: "system", createdAt: Timestamp.fromMillis(now) });
        created += 1;
        // Per-day tag so each morning's post-expiry notice stands alone in the
        // tray instead of collapsing into the previous day's notification.
        // Expired stages deep-link straight into the renewal flow.
        const renewalUrl = reminder.expired ? "/#/subscription?renew=1" : "/#/subscription";
        pushed += await sendPush(db, uid, reminder.title, reminder.body, { tag: `subscription-renewal:${reminder.stage}`, url: renewalUrl });
      }
      summary.renewals = { scanned: snapshot.size, created, pushed };
    }

    // ------------------------------------------------------------- 2. My Day items
    {
      const lookbackMs = resolveLookbackMs(lastRunAt, now);
      summary.myDayLookbackMs = lookbackMs;
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
        const due = collectDueMyDayItems(data, now, tzOffsetMinutes, lookbackMs);
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
          // The target carries the exact My Day tab + item id so an in-app
          // tap opens that list with the item highlighted.
          await db.collection("users").doc(uid).collection("notifications").doc(item.key).set({
            id: item.key,
            title: item.title,
            body: item.body,
            category: "mayday",
            read: false,
            source: "system",
            createdAt: Timestamp.fromMillis(item.dueAt),
            target: { type: "mayday", section: item.section, itemId: item.itemId },
          }, { merge: true });
          // The tag must be per-item, not per-kind. Tagging by kind made
          // the browser collapse every due task into a single
          // notification (three tasks at 9:00 → one alert), and it did
          // not match the foreground tag, so an open app could show the
          // same reminder twice. `item.key` is unique per item per day
          // and is exactly what the in-app path uses.
          const itemUrl = `/#/my-day?section=${item.section}&item=${encodeURIComponent(item.itemId)}`;
          pushed += await sendPush(db, uid, item.title, item.body, { tag: `myday-${item.key}`, url: itemUrl });
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
              // Buyers already own the course — deep-link into the player.
              url: `/#/course/${update.id}`,
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

    // ------------------------------------------------------------------ 4. referral repair (one-time)
    // Backfill referral usage from before the single-use fix. Runs the
    // heavy pass exactly once, then costs one doc read per day.
    try {
      const repair = await runReferralRepairOnce();
      summary.referralRepair = repair.ran ? repair.summary : { alreadyCompleted: true };
    } catch (repairError) {
      console.warn("[cron] referral usage repair skipped", repairError);
      summary.referralRepair = { error: true };
    }

    // Record the run only after every job finished. If this handler
    // throws halfway, `lastRunAt` stays where it was and the next run
    // re-covers the same window — late is recoverable, skipped is not.
    await runStateRef.set({ lastRunAt: now, updatedAt: Timestamp.fromMillis(now) }, { merge: true });

    return res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    return errorResponse(res, error, "Could not process scheduled push jobs.");
  }
}
