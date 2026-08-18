import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normaliseCouponDoc, validateCoupon } from "../utils/coupons.js";

const home = fs.readFileSync("src/home/App.tsx", "utf8");
const nav = fs.readFileSync("src/components/BottomNav.tsx", "utf8");
const homeHeader = fs.readFileSync("src/home/components/Header.tsx", "utf8");
const leaderboard = fs.readFileSync("src/LeaderboardApp.tsx", "utf8");
const subscription = fs.readFileSync("src/subscription/components/SubscriptionPage.tsx", "utf8");
const admin = fs.readFileSync("src/admin/pages/SubscriptionsPage.tsx", "utf8");
const referrals = fs.readFileSync("api/_lib/referrals.ts", "utf8");
const entitlements = fs.readFileSync("api/_lib/entitlements.ts", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");

test("home and store no longer switch filters on left/right swipe", () => {
  // The swipe-to-switch-category gesture was removed: categories on Home and
  // filter chips on the Store only change through explicit taps.
  const store = fs.readFileSync("src/components/StorePage.tsx", "utf8");
  assert.doesNotMatch(home, /handleSwipeStart|handleSwipeEnd|switchCategory|categorySwipeHandlers|onTouchStart|onTouchEnd/);
  assert.doesNotMatch(store, /switchChip|handleTouchStart|handleTouchEnd|onTouchStart|onTouchEnd|touchStartX/);
  // The tap-driven category nav itself remains intact on Home.
  assert.match(home, /<CategoryNav/);
  assert.match(home, /onSelect=\{setActiveCategory\}/);
  // The store's tap-driven FilterChips remain intact.
  assert.match(store, /<FilterChips chips=\{chips\} active=\{activeChip\} onSelect=\{setActiveChip\} \/>/);
});

test("leaderboard is reached from the home header while the footer hosts Revision", () => {
  // The footer's last tab is Revision — it deliberately replaced the
  // leaderboard tab (the leaderboard button moved to the home header).
  assert.match(nav, /key: "revision"/);
  assert.match(nav, /#\/revision/);
  assert.doesNotMatch(nav, /key: "leaderboard"/);
  // The leaderboard entry point is the home header button.
  assert.match(homeHeader, /aria-label="Leaderboard"/);
  assert.match(homeHeader, /window\.location\.hash = "#\/leaderboard"/);
  // The leaderboard page renders the shared footer without a highlighted tab.
  assert.match(leaderboard, /<BottomNav active=\{null\}/);
});

test("leaderboard distinguishes used, available and unavailable codes", () => {
  assert.match(leaderboard, /"Used"/);
  assert.match(leaderboard, /"Use now"/);
  assert.match(leaderboard, /Unused IDs/);
});

test("leaderboard toggles all users versus subscribers with referral IDs", () => {
  assert.match(leaderboard, /All users/);
  assert.match(leaderboard, /Subscribers/);
  assert.match(leaderboard, /Unused IDs/);
  assert.match(leaderboard, /Referral ID/);
  assert.match(leaderboard, /photoURL/);
});

test("a referral ID can be redeemed only once", () => {
  assert.match(referrals, /globalLimit: 1/);
  assert.match(referrals, /maxUsesPerReferrer: 1/);
  const apply = fs.readFileSync("api/subscription-referral.ts", "utf8");
  assert.match(apply, /Referral ID already used/);
  assert.match(apply, /usedCount \|\| 0\) >= 1/);
});

test("reusing a spent referral shows a clear already-used message on the subscription page", () => {
  // The server refuses the spent code with an explicit, human message…
  const apply = fs.readFileSync("api/subscription-referral.ts", "utf8");
  assert.match(apply, /REFERRAL_ALREADY_USED/);
  assert.match(apply, /This referral is already used by someone/);
  // …the shared coupon validator repeats the same refusal so a spent
  // code slipped straight into checkout is caught with the same words…
  const engine = fs.readFileSync("utils/coupons.js", "utf8");
  assert.match(engine, /This referral is already used by someone/);
  // …and the subscription-page input renders it as a prominent alert
  // card (not just a tiny error line) with a route to unused IDs.
  const input = fs.readFileSync("src/subscription/components/PromoCodeInput.tsx", "utf8");
  assert.match(input, /data-referral-already-used/);
  assert.match(input, /This referral is already used by someone/);
  assert.match(input, /role="alert"/);
  assert.match(input, /Open Unused IDs/);
  assert.match(input, /#\/leaderboard/);
});

test("a used referral ID is spent permanently: discontinued, never resurrected, counted for real", () => {
  const couponsLib = fs.readFileSync("api/_lib/coupons.ts", "utf8");
  const engine = fs.readFileSync("utils/coupons.js", "utf8");
  // 1. THE core fix: a fresh redemption (no prior doc → empty status)
  //    must increment usedCount. Before this fix only the rare
  //    "pending" repair path incremented, so referral usedCount never
  //    moved and a spent ID kept working from other accounts.
  assert.match(engine, /status !== "" && status !== "pending"/);
  // 2. Spending a referral flips the coupon to "inactive" in the same
  //    transaction — the ID is discontinued the moment it is used.
  assert.match(couponsLib, /status: "inactive", usedByUid: args\.uid/);
  // 3. The redemption writer re-reads the coupon INSIDE the
  //    transaction so two concurrent payments cannot both spend a
  //    one-shot referral.
  assert.match(couponsLib, /tx\.get\(couponTxRef\)/);
  // 4. The owner's profile is stamped so the UI can cross the ID out.
  assert.match(couponsLib, /referralUsedCount: FieldValue\.increment\(1\)/);
  // 5. Re-provisioning (renewals) must never resurrect a spent coupon.
  assert.match(referrals, /const spent = usedCount >= 1/);
  assert.match(referrals, /spent \? "inactive"/);
  assert.match(referrals, /active: !spent/);
});

test("historic referral usage is repaired automatically, with zero manual steps", () => {
  // The repair reconstructs redemptions + counts from siteOrders and
  // discontinues every spent referral coupon…
  assert.match(referrals, /export const repairReferralUsage/);
  assert.match(referrals, /couponRedemptions/);
  assert.match(referrals, /backfilled: true/);
  assert.match(referrals, /status: "inactive"/);
  assert.match(referrals, /referralUsedCount/);
  // …runs exactly once behind a settings flag…
  assert.match(referrals, /export const runReferralRepairOnce/);
  assert.match(referrals, /referralUsageRepair/);
  // …and is wired into three self-triggering paths: the leaderboard
  // fetch, the referral apply endpoint, and the daily cron.
  const leaderboardApi = fs.readFileSync("api/referral-leaderboard.ts", "utf8");
  const applyApi = fs.readFileSync("api/subscription-referral.ts", "utf8");
  const cron = fs.readFileSync("api/cron/subscription-renewals.ts", "utf8");
  assert.match(leaderboardApi, /runReferralRepairOnce/);
  assert.match(applyApi, /runReferralRepairOnce/);
  assert.match(cron, /runReferralRepairOnce/);
  // The repair must never break the endpoint that hosts it.
  assert.match(leaderboardApi, /repair skipped/);
  assert.match(applyApi, /repair skipped/);
  assert.match(cron, /repair skipped/);
});

test("the owner's profile crosses out a used referral ID with a clear Used badge", () => {
  const profile = fs.readFileSync("src/profile/App.tsx", "utf8");
  assert.match(profile, /referralUsedCount/);
  assert.match(profile, /data-profile-referral-used/);
  assert.match(profile, /line-through/);
  assert.match(profile, />Used</);
  assert.match(profile, /no longer active/);
});

test("leaderboard hides used IDs from Unused and crosses them out elsewhere", () => {
  // Unused view lists only never-used, still-active IDs.
  assert.match(leaderboard, /row\.usedCount < 1 && row\.available/);
  // Used rows show a crossed-out code and a discontinued note.
  assert.match(leaderboard, /line-through/);
  assert.match(leaderboard, /discontinued/);
  // The API derives availability from the coupon's live state.
  const api = fs.readFileSync("api/referral-leaderboard.ts", "utf8");
  assert.match(api, /usedCount < 1/);
  assert.match(api, /status !== "inactive"|status\)? !== \\?"inactive\\?"|"inactive"/);
});

test("a spent referral coupon is refused by the shared validator with the already-used code", () => {
  const orderContext = {
    subtotalPaise: 50000,
    productIds: [],
    moduleIds: [],
    resourceIds: [],
    categories: [],
    purchaseKind: "subscription",
    userHasPriorPurchases: false,
    userUsageCount: 0,
    userUid: "someone-else",
  };
  const coupon = normaliseCouponDoc({
    code: "DCOWNER",
    type: "flat",
    value: 25000,
    referralOwnerUid: "owner",
    globalLimit: 1,
    usedCount: 1,
  });
  const result = validateCoupon(coupon, orderContext);
  assert.equal(result.ok, false);
  assert.equal(result.code, "REFERRAL_ALREADY_USED");
  assert.match(result.reason, /already used by someone/i);
  // Even after the coupon has been discontinued (status flipped to
  // "inactive" by the redemption writer), the precise already-used
  // message wins over the generic inactive one.
  const discontinued = normaliseCouponDoc({
    code: "DCOWNER",
    type: "flat",
    value: 25000,
    referralOwnerUid: "owner",
    globalLimit: 1,
    usedCount: 1,
    status: "inactive",
  });
  const discontinuedResult = validateCoupon(discontinued, orderContext);
  assert.equal(discontinuedResult.ok, false);
  assert.equal(discontinuedResult.code, "REFERRAL_ALREADY_USED");
  assert.match(discontinuedResult.reason, /already used by someone/i);
});

test("subscription has a separate server-validated referral input", () => {
  assert.match(subscription, /kind="referral"/);
  assert.match(subscription, /\/api\/subscription-referral/);
  assert.match(subscription, /appliedReferral\?\.code \|\| appliedCoupon\?\.code/);
});

test("default referral discount is ₹250 and admin can customize it", () => {
  assert.match(referrals, /discountPaise: Math\.max\(0, Math\.round\(Number\(data\.discountPaise \?\? 25000\)\)\)/);
  assert.match(admin, /Referral discount \(₹\)/);
  assert.match(admin, /Save referral settings/);
});

test("verified subscription provisioning generates a stable unique referral", () => {
  assert.match(referrals, /referralCodeForUid/);
  assert.match(entitlements, /ensureReferralCoupon/);
  assert.match(referrals, /collection\("users"\).*referralCode/s);
});

test("leaderboard falls back to the public cache when the API is unavailable", () => {
  assert.match(leaderboard, /publicLeaderboard/);
  assert.match(leaderboard, /Could not open leaderboard/);
  const api = fs.readFileSync("api/referral-leaderboard.ts", "utf8");
  assert.match(api, /publicLeaderboard/);
  assert.match(api, /subscriptionPlanId/);
});

test("users cannot forge their referral or subscription identity", () => {
  assert.match(rules, /'referralCode', 'subscriptionPlanId', 'subscriptionTier', 'subscriptionExpiresAt'/);
});

test("referral coupons cannot be self-used", () => {
  const coupon = normaliseCouponDoc({ code: "DCOWNER", type: "flat", value: 25000, referralOwnerUid: "owner" });
  const result = validateCoupon(coupon, { subtotalPaise: 50000, productIds: [], moduleIds: [], resourceIds: [], categories: [], purchaseKind: "subscription", userHasPriorPurchases: false, userUsageCount: 0, userUid: "owner" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "REFERRAL_SELF_USE");
});
