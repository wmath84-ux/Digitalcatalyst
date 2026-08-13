import { adminDb, errorResponse, type VercelRequest, type VercelResponse } from "./_lib/firebaseAdmin.js";
import { referralCodeForUid } from "./_lib/referrals.js";

type SubscriberRow = {
  uid: string;
  name: string;
  photoURL: string | null;
  planId: string;
  referralCode: string;
  usedCount: number;
  available: boolean;
};

type UserRow = {
  uid: string;
  name: string;
  photoURL: string | null;
};

const PUBLIC_COLLECTION = "publicLeaderboard";
const PUBLIC_DOC = "referrals";

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
  }
  return "";
};

const resolvePhotoURL = (data: Record<string, unknown>) =>
  firstNonEmptyString(data.photoURL, data.avatar, data.profilePhoto, data.profileImage) || null;

const resolveName = (data: Record<string, unknown>, fallback = "Learner") =>
  firstNonEmptyString(data.name, data.displayName, data.username) || fallback;

const toSubscriberRow = async (uid: string, data: Record<string, unknown>): Promise<SubscriberRow> => {
  const db = adminDb();
  const code = String(data.referralCode || referralCodeForUid(uid));
  let usedCount = 0;
  let available = true;
  try {
    const coupon = await db.collection("coupons").doc(code).get();
    usedCount = Math.max(0, Number(coupon.data()?.usedCount || 0));
    available = usedCount < 1 && (!coupon.exists || coupon.data()?.status !== "inactive");
  } catch {
    usedCount = Math.max(0, Number(data.referralUsedCount || 0));
  }
  return {
    uid,
    name: resolveName(data, "Subscriber"),
    photoURL: resolvePhotoURL(data),
    planId: String(data.subscriptionPlanId || data.subscriptionTier || "subscription"),
    referralCode: code,
    usedCount,
    available,
  };
};

const toUserRow = (uid: string, data: Record<string, unknown>): UserRow => ({
  uid,
  name: resolveName(data),
  photoURL: resolvePhotoURL(data),
});

const isSubscriber = (data: Record<string, unknown>) =>
  Boolean(data.subscriptionPlanId || (data.subscriptionTier && data.subscriptionTier !== "basic"));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const db = adminDb();
    type LeaderboardDoc = { id: string; data: () => Record<string, unknown> };
    const recent = await db.collection("users").limit(200).get();
    const allDocs: LeaderboardDoc[] = recent.docs;
    const subscriberDocs = allDocs.filter((doc: LeaderboardDoc) => isSubscriber((doc.data() || {}) as Record<string, unknown>));

    const [subscribers, users] = await Promise.all([
      Promise.all(subscriberDocs.map((doc: LeaderboardDoc) => toSubscriberRow(doc.id, (doc.data() || {}) as Record<string, unknown>))),
      Promise.resolve(allDocs.map((doc: LeaderboardDoc) => toUserRow(doc.id, (doc.data() || {}) as Record<string, unknown>))),
    ]);
    subscribers.sort((a, b) => b.usedCount - a.usedCount || a.name.localeCompare(b.name));
    users.sort((a, b) => a.name.localeCompare(b.name));
    try {
      await db.collection(PUBLIC_COLLECTION).doc(PUBLIC_DOC).set({
        ok: true,
        updatedAt: Date.now(),
        subscribers,
        users,
      });
    } catch (error) {
      console.warn("[leaderboard] public cache write skipped", error);
    }
    return res.status(200).json({ ok: true, subscribers, users });
  } catch (error) {
    try {
      const cached = await adminDb().collection(PUBLIC_COLLECTION).doc(PUBLIC_DOC).get();
      const data = cached.data() || {};
      if (cached.exists && Array.isArray(data.subscribers)) {
        return res.status(200).json({
          ok: true,
          subscribers: data.subscribers,
          users: Array.isArray(data.users) ? data.users : [],
          cached: true,
        });
      }
    } catch {
      // Fall through to the public error.
    }
    return errorResponse(res, error, "Could not open leaderboard.");
  }
}
