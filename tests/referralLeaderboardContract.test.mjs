import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normaliseCouponDoc, validateCoupon } from "../utils/coupons.js";

const home = fs.readFileSync("src/home/App.tsx", "utf8");
const nav = fs.readFileSync("src/components/BottomNav.tsx", "utf8");
const leaderboard = fs.readFileSync("src/LeaderboardApp.tsx", "utf8");
const subscription = fs.readFileSync("src/subscription/components/SubscriptionPage.tsx", "utf8");
const admin = fs.readFileSync("src/admin/pages/SubscriptionsPage.tsx", "utf8");
const referrals = fs.readFileSync("api/_lib/referrals.ts", "utf8");
const entitlements = fs.readFileSync("api/_lib/entitlements.ts", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");

test("home switches category on horizontal swipe only on the filter and product areas", () => {
  assert.match(home, /handleSwipeStart/);
  assert.match(home, /handleSwipeEnd/);
  assert.match(home, /switchCategory\(deltaX < 0 \? 1 : -1\)/);
  // The swipe handlers wrap only the filter chips and the product grid…
  assert.match(home, /<div \{\.\.\.categorySwipeHandlers\}>\s*<CategoryNav/s);
  assert.match(home, /<section className="px-5 pt-6" \{\.\.\.categorySwipeHandlers\}>/);
  // …not the whole page: swiping the reviews rail or hero carousel must not flip the filter.
  assert.doesNotMatch(home, /<main[^>]*onTouchStart/);
  // A vertical or diagonal page scroll is not a category switch.
  assert.match(home, /Math\.abs\(deltaX\) <= Math\.abs\(deltaY\)/);
});

test("shared footer places leaderboard after profile and routes to its page", () => {
  assert.match(nav, /"leaderboard"/);
  assert.ok(nav.indexOf('key: "leaderboard"') > nav.indexOf('key: "profile"'));
  assert.match(nav, /#\/leaderboard/);
  assert.match(leaderboard, /<Header/);
  assert.match(leaderboard, /<BottomNav active="leaderboard"/);
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

test("a spent referral coupon is refused by the shared validator with the already-used code", () => {
  const coupon = normaliseCouponDoc({
    code: "DCOWNER",
    type: "flat",
    value: 25000,
    referralOwnerUid: "owner",
    globalLimit: 1,
    usedCount: 1,
  });
  const result = validateCoupon(coupon, {
    subtotalPaise: 50000,
    productIds: [],
    moduleIds: [],
    resourceIds: [],
    categories: [],
    purchaseKind: "subscription",
    userHasPriorPurchases: false,
    userUsageCount: 0,
    userUid: "someone-else",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "REFERRAL_ALREADY_USED");
  assert.match(result.reason, /already used by someone/i);
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
