import { adminDb } from "./firebaseAdmin.js";

export type ReferralConfig = {
  enabled: boolean;
  discountPaise: number;
  maxUsesPerReferrer: number | null;
};

export const referralCodeForUid = (uid: string) => `DC${String(uid || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`.slice(0, 60);

export const loadReferralConfig = async (): Promise<ReferralConfig> => {
  const snap = await adminDb().collection("settings").doc("referralProgram").get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    enabled: data.enabled !== false,
    discountPaise: Math.max(0, Math.round(Number(data.discountPaise ?? 25000))),
    // A referral ID can be redeemed exactly once, then it is spent.
    maxUsesPerReferrer: 1,
  };
};

export const ensureReferralCoupon = async (input: { uid: string; name?: string; photoURL?: string | null }) => {
  const db = adminDb();
  const config = await loadReferralConfig();
  const code = referralCodeForUid(input.uid);
  if (!code) throw new Error("Could not generate referral code.");
  const couponRef = db.collection("coupons").doc(code);
  const [existing, userSnap] = await Promise.all([couponRef.get(), db.collection("users").doc(input.uid).get()]);
  const userData = userSnap.data() || {};
  const usedCount = Math.max(0, Number(existing.data()?.usedCount || 0));
  await Promise.all([
    couponRef.set({
      code,
      type: "flat",
      value: config.discountPaise,
      status: config.enabled ? "active" : "inactive",
      perUserLimit: 1,
      globalLimit: 1,
      usedCount,
      allowedPurchaseKinds: ["subscription", "subscription_features"],
      referralOwnerUid: input.uid,
      description: "Subscriber referral discount",
      updatedAt: Date.now(),
    }, { merge: true }),
    db.collection("referralProfiles").doc(input.uid).set({
      uid: input.uid,
      name: input.name || String(userData.name || userData.displayName || "Subscriber"),
      photoURL: input.photoURL || userData.photoURL || null,
      referralCode: code,
      usedCount,
      active: true,
      updatedAt: Date.now(),
    }, { merge: true }),
    db.collection("users").doc(input.uid).set({ referralCode: code, updatedAt: Date.now() }, { merge: true }),
  ]);
  return { code, config, usedCount };
};
