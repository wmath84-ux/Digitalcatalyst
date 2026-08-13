import { errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./_lib/firebaseAdmin";
import { ensureReferralCoupon, loadReferralConfig } from "./_lib/referrals";
import { loadUserCouponUsageCount } from "./_lib/coupons";
import { normaliseCouponCode } from "../utils/coupons";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const user = await requireFirebaseUser(req);
    const body = req.body || {};
    const code = normaliseCouponCode(body.referralCode);
    if (!code) return res.status(400).json({ ok: false, error: "Enter a referral code." });
    const db = (await import("./_lib/firebaseAdmin")).adminDb();
    const snap = await db.collection("coupons").doc(code).get();
    const data = snap.data() || {};
    if (!snap.exists || !data.referralOwnerUid) return res.status(404).json({ ok: false, error: "Referral code not found." });
    if (String(data.referralOwnerUid) === user.uid) return res.status(400).json({ ok: false, error: "You cannot use your own referral code." });
    if (await loadUserCouponUsageCount(user.uid, code)) return res.status(409).json({ ok: false, error: "You have already used this referral code." });
    const config = await loadReferralConfig();
    if (!config.enabled) return res.status(409).json({ ok: false, error: "The referral program is currently paused." });
    if (config.maxUsesPerReferrer && Number(data.usedCount || 0) >= config.maxUsesPerReferrer) {
      return res.status(409).json({ ok: false, error: "This referral code is no longer available." });
    }
    // Refresh the generated coupon with the current admin configuration.
    await ensureReferralCoupon({ uid: String(data.referralOwnerUid) });
    return res.status(200).json({ ok: true, code, discountPaise: config.discountPaise });
  } catch (error) {
    return errorResponse(res, error, "Could not validate referral code.");
  }
}
