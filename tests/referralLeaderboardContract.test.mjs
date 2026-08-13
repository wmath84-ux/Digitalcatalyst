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

test("home supports left/right swipe category switching like store", () => {
  assert.match(home, /touchStartX/);
  assert.match(home, /handleTouchStart/);
  assert.match(home, /handleTouchEnd/);
  assert.match(home, /switchCategory\(delta < 0 \? 1 : -1\)/);
});

test("shared footer places leaderboard after profile and routes to its page", () => {
  assert.match(nav, /"leaderboard"/);
  assert.ok(nav.indexOf('key: "leaderboard"') > nav.indexOf('key: "profile"'));
  assert.match(nav, /#\/leaderboard/);
  assert.match(leaderboard, /<Header/);
  assert.match(leaderboard, /<BottomNav active="leaderboard"/);
});

test("leaderboard distinguishes used, available and unavailable codes", () => {
  assert.match(leaderboard, /Used \$\{row\.usedCount\}×/);
  assert.match(leaderboard, /"Use now"/);
  assert.match(leaderboard, /"Unavailable"/);
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

test("users cannot forge their referral or subscription identity", () => {
  assert.match(rules, /'referralCode', 'subscriptionPlanId', 'subscriptionTier', 'subscriptionExpiresAt'/);
});

test("referral coupons cannot be self-used", () => {
  const coupon = normaliseCouponDoc({ code: "DCOWNER", type: "flat", value: 25000, referralOwnerUid: "owner" });
  const result = validateCoupon(coupon, { subtotalPaise: 50000, productIds: [], moduleIds: [], resourceIds: [], categories: [], purchaseKind: "subscription", userHasPriorPurchases: false, userUsageCount: 0, userUid: "owner" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "REFERRAL_SELF_USE");
});
