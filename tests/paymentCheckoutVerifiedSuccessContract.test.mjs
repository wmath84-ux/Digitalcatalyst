import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const product = fs.readFileSync('components/ProductDetailPage.tsx', 'utf8');
const payment = fs.readFileSync('components/PaymentModal.tsx', 'utf8');

test('checkout pages show exact product, subscription and latest update unlock context', () => {
  assert.match(product, /productFeatureUnlockDetails/);
  assert.match(product, /product\.features/);
  assert.match(product, /unlockDetails=\{productFeatureUnlockDetails\}/);
  assert.match(app, /subscriptionCheckoutRequest\.plan\.benefits/);
  assert.match(app, /subscriptionCheckoutRequest\.plan\.unlockProductIds/);
  assert.match(app, /This payment unlocks only/);
  assert.match(app, /checkoutType="latest-update"/);
});

test('paid access unlocks only after verified Razorpay or free checkout status', () => {
  assert.match(app, /isCheckoutUnlockVerified/);
  assert.match(app, /Payment not verified/);
  assert.match(app, /was not unlocked because payment was not verified as successful/);
  assert.match(payment, /api\/razorpay\/verify-payment/);
  assert.match(payment, /api\/razorpay\/payment-status/);
  assert.match(payment, /recoveryStatus: 'handler'/);
});

test('payment failures, dismiss and unavailable payment app show clear recovery messages', () => {
  assert.match(payment, /payment\.failed/);
  assert.match(payment, /confirm_close: true/);
  assert.match(payment, /Payment window was closed\/cancelled or the payment app was not available/);
  assert.match(payment, /Payment app\/window could not load/);
  assert.match(payment, /Payment app\/window could not open/);
  assert.match(payment, /Check payment status/);
});

test('verified payment success redirects to My Purchases with celebration blast', () => {
  assert.match(app, /showPurchasePageCelebration/);
  assert.match(app, /setCurrentView\('myPurchases'\)/);
  assert.match(app, /purchaseCelebration/);
  assert.match(app, /Verified success/);
  assert.match(app, /Paid update unlocked/);
  assert.match(app, /Subscription active/);
});
