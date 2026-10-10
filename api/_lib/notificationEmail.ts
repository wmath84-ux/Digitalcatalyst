import { createHash } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "./firebaseAdmin.js";
import { mailConfigured, sendMail } from "./userQueries.js";
import { notificationPolicy, type NotificationPolicyPayload } from "../../utils/userPreferences.js";

export type EmailNotification = NotificationPolicyPayload & {
  title: string; body: string; url?: string; eventId?: string;
};
const COLLECTION = "notificationEmailOutbox";
const EMAIL_CATEGORIES = new Set(["course", "unlock", "subscription", "store", "promotion", "announcement", "community"]);
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

/** A durable outbox, not a pretend send. No credentials or recipient addresses
 * are exposed to the client. Reminders about private notes/tasks are not emailed. */
export async function queueNotificationEmail(db: Firestore, uid: string, payload: EmailNotification) {
  if (!mailConfigured() || !EMAIL_CATEGORIES.has(payload.category || "")) return false;
  const user = await db.collection("users").doc(uid).get();
  if (!user.exists || !notificationPolicy(user.data()?.preferences, payload).email) return false;
  const event = payload.eventId || `${payload.tag || "update"}:${payload.title}:${payload.body}:${new Date().toISOString().slice(0, 10)}`;
  const id = createHash("sha256").update(`${uid}:${event}`).digest("hex");
  try {
    await db.collection(COLLECTION).doc(id).create({ uid, payload, status: "pending", attempts: 0, createdAt: Timestamp.now() });
    return true;
  } catch (error) {
    if (Number((error as { code?: unknown }).code) === 6) return false; // already queued / sent
    throw error;
  }
}

/** The existing minute scheduler drains a small, bounded batch. Claims prevent
 * concurrent runs sending the same job; failed SMTP delivery retries at most
 * three times, and preferences are checked AGAIN immediately before sending. */
export async function deliverNotificationEmails(db: Firestore, options: {
  now?: number; limit?: number;
  send?: typeof sendMail;
  authUser?: (uid: string) => Promise<{ email?: string; emailVerified: boolean }>;
} = {}) {
  const summary = { sent: 0, failed: 0, skipped: 0 };
  if (!mailConfigured()) return { ...summary, configured: false };
  const now = options.now ?? Date.now();
  const limit = Math.min(4, Math.max(1, options.limit ?? 4));
  const [pending, abandoned] = await Promise.all([
    db.collection(COLLECTION).where("status", "==", "pending").limit(24).get(),
    db.collection(COLLECTION).where("status", "==", "sending").limit(12).get(),
  ]);
  const candidates = [...pending.docs, ...abandoned.docs].filter((doc) => {
    const row = doc.data();
    return Number(row.nextAttemptAt || 0) <= now && (row.status !== "sending" || Number(row.leaseUntil || 0) <= now);
  }).slice(0, limit);
  // Two parallel workers, five-second SMTP timeout: ≤10s for four emails.
  for (let start = 0; start < candidates.length; start += 2) {
    await Promise.all(candidates.slice(start, start + 2).map(async (candidate) => {
      const claimed = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(candidate.ref);
        const row = snapshot.data();
        if (!row || !["pending", "sending"].includes(row.status)
          || Number(row.nextAttemptAt || 0) > now || (row.status === "sending" && Number(row.leaseUntil || 0) > now)) return null;
        const attempts = Number(row.attempts || 0) + 1;
        transaction.set(candidate.ref, { status: "sending", attempts, leaseUntil: now + 120000 }, { merge: true });
        return { ...row, attempts };
      });
      if (!claimed) return;
      try {
        const user = await db.collection("users").doc(claimed.uid).get();
        const policy = notificationPolicy(user.data()?.preferences, claimed.payload);
        if (!user.exists || !policy.email) {
          await candidate.ref.set({ status: "skipped", reason: "opted-out", leaseUntil: 0 }, { merge: true });
          summary.skipped += 1;
          return;
        }
        const account = await (options.authUser || ((uid) => getAuth(getFirebaseAdminApp()).getUser(uid)))(claimed.uid);
        if (!policy.email || !account.email || !account.emailVerified) {
          await candidate.ref.set({ status: "skipped", reason: !policy.email ? "opted-out" : "verified-email-required", leaseUntil: 0 }, { merge: true });
          summary.skipped += 1;
          return;
        }
        const payload = claimed.payload as EmailNotification;
        const site = process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://eduvora.shop");
        const url = new URL(payload.url || "/#/notifications", site).toString();
        if (!/^https:\/\//i.test(url)) throw new Error("Notification link must use HTTPS.");
        const result = await (options.send || sendMail)({
          to: account.email, fromName: "Eduvora", subject: payload.title,
          text: `${payload.body}\n\n${url}\n\nManage notifications: ${new URL("/#/settings", site)}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#1e293b"><p style="font-size:13px;color:#64748b">Eduvora</p><h1 style="font-size:24px">${escapeHtml(payload.title)}</h1><p style="line-height:1.6">${escapeHtml(payload.body)}</p><p><a href="${escapeHtml(url)}">View update</a></p><hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"><p style="font-size:12px"><a href="${escapeHtml(new URL("/#/settings", site).toString())}">Manage notification settings</a></p></div>`,
          messageId: `<${candidate.id}@notifications.eduvora.shop>`, timeoutMs: 5000,
        });
        if (!result.ok) throw new Error(result.reason || "SMTP did not confirm delivery.");
        await candidate.ref.set({ status: "sent", sentAt: Timestamp.fromMillis(now), leaseUntil: 0 }, { merge: true });
        summary.sent += 1;
      } catch (error) {
        await candidate.ref.set({ status: claimed.attempts >= 3 ? "failed" : "pending", leaseUntil: 0,
          nextAttemptAt: now + 300000 * claimed.attempts, lastError: String((error as Error).message).slice(0, 240) }, { merge: true });
        summary.failed += 1;
      }
    }));
  }
  return { ...summary, configured: true };
}
