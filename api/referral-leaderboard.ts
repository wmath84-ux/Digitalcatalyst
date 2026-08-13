import { adminDb, errorResponse, type VercelRequest, type VercelResponse } from "./_lib/firebaseAdmin.js";
import { referralCodeForUid } from "./_lib/referrals.js";

type Row = {
  uid: string;
  name: string;
  photoURL: string | null;
  planId: string;
  referralCode: string;
  usedCount: number;
  available: boolean;
};

const PUBLIC_COLLECTION = "publicLeaderboard";
const PUBLIC_DOC = "referrals";

const toRow = async (uid: string, data: Record<string, unknown>): Promise<Row> => {
  const db = adminDb();
  const code = String(data.referralCode || referralCodeForUid(uid));
  let usedCount = 0;
  let available = true;
  try {
    const coupon = await db.collection("coupons").doc(code).get();
    usedCount = Math.max(0, Number(coupon.data()?.usedCount || 0));
    available = coupon.exists ? coupon.data()?.status !== "inactive" : true;
  } catch {
    usedCount = Math.max(0, Number(data.referralUsedCount || 0));
  }
  return {
    uid,
    name: String(data.name || data.displayName || "Subscriber"),
    photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
    planId: String(data.subscriptionPlanId || data.subscriptionTier || "subscription"),
    referralCode: code,
    usedCount,
    available,
  };
};

const isSubscriber = (data: Record<string, unknown>) =>
  Boolean(data.subscriptionPlanId || (data.subscriptionTier && data.subscriptionTier !== "basic"));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const db = adminDb();
    type LeaderboardDoc = { id: string; data: () => Record<string, unknown> };
    let docs: LeaderboardDoc[] = [];
    try {
      const byPlan = await db.collection("users").where("subscriptionPlanId", ">", "").limit(200).get();
      docs = byPlan.docs;
    } catch {
      const recent = await db.collection("users").limit(200).get();
      docs = recent.docs.filter((doc: LeaderboardDoc) => isSubscriber((doc.data() || {}) as Record<string, unknown>));
    }
    if (!docs.length) {
      const recent = await db.collection("users").limit(200).get();
      docs = recent.docs.filter((doc: LeaderboardDoc) => isSubscriber((doc.data() || {}) as Record<string, unknown>));
    }
    const rows = await Promise.all(docs.map((doc: LeaderboardDoc) => toRow(doc.id, (doc.data() || {}) as Record<string, unknown>)));
    rows.sort((a, b) => b.usedCount - a.usedCount || a.name.localeCompare(b.name));
    try {
      await db.collection(PUBLIC_COLLECTION).doc(PUBLIC_DOC).set({
        ok: true,
        updatedAt: Date.now(),
        subscribers: rows,
      });
    } catch (error) {
      console.warn("[leaderboard] public cache write skipped", error);
    }
    return res.status(200).json({ ok: true, subscribers: rows });
  } catch (error) {
    try {
      const cached = await adminDb().collection(PUBLIC_COLLECTION).doc(PUBLIC_DOC).get();
      const data = cached.data() || {};
      if (cached.exists && Array.isArray(data.subscribers)) {
        return res.status(200).json({ ok: true, subscribers: data.subscribers, cached: true });
      }
    } catch {
      // Fall through to the public error.
    }
    return errorResponse(res, error, "Could not open leaderboard.");
  }
}
