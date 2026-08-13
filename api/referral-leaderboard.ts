import { adminDb, errorResponse, type VercelRequest, type VercelResponse } from "./_lib/firebaseAdmin";
import { referralCodeForUid } from "./_lib/referrals";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const db = adminDb();
    const users = await db.collection("users").get();
    const subscribers = users.docs.filter((doc) => {
      const data = doc.data() || {};
      return Boolean(data.subscriptionPlanId || (data.subscriptionTier && data.subscriptionTier !== "basic"));
    });
    const rows = await Promise.all(subscribers.map(async (doc) => {
      const data = doc.data() || {};
      const code = String(data.referralCode || referralCodeForUid(doc.id));
      const coupon = await db.collection("coupons").doc(code).get();
      const usedCount = Math.max(0, Number(coupon.data()?.usedCount || 0));
      return {
        uid: doc.id,
        name: String(data.name || data.displayName || "Subscriber"),
        photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
        planId: String(data.subscriptionPlanId || data.subscriptionTier || "subscription"),
        referralCode: code,
        usedCount,
        available: coupon.exists ? coupon.data()?.status !== "inactive" : true,
      };
    }));
    rows.sort((a, b) => b.usedCount - a.usedCount || a.name.localeCompare(b.name));
    return res.status(200).json({ ok: true, subscribers: rows });
  } catch (error) {
    return errorResponse(res, error, "Could not load referral leaderboard.");
  }
}
