import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const payment = fs.readFileSync('components/PaymentModal.tsx','utf8');
const product = fs.readFileSync('components/ProductDetailPage.tsx','utf8');
const app = fs.readFileSync('App.tsx','utf8');
const access = fs.readFileSync('utils/subscriptionAccess.ts','utf8');
const subscription = fs.readFileSync('components/SubscriptionPage.tsx','utf8');
const html = fs.readFileSync('index.html','utf8');
const createOrder = fs.readFileSync('api/razorpay/create-order.ts','utf8');
const verify = fs.readFileSync('api/razorpay/verify-payment.ts','utf8');

test('demo auto unlock is removed and Razorpay is server verified', () => {
  assert.doesNotMatch(payment,/completeDemoRazorpayUnlock/);
  assert.doesNotMatch(payment,/Razorpay demo \+/);
  assert.match(payment,/api\/razorpay\/create-order/);
  assert.match(payment,/api\/razorpay\/verify-payment/);
  assert.match(createOrder,/api\.razorpay\.com\/v1\/orders/);
  assert.match(verify,/createHmac\('sha256'/);
  assert.match(verify,/timingSafeEqual/);
});

test('all checkout surfaces forward verification metadata', () => {
  assert.match(product,/PaymentVerificationDetails/);
  assert.match(app,/paymentVerificationBreakdown/);
  assert.match(app,/checkoutType="cart"/);
  assert.match(app,/checkoutType="latest-update"/);
  assert.match(app,/checkoutType="subscription"/);
  assert.match(app,/completeVerifiedSubscriptionActivation/);
});

test('expired subscription repurchase popup is user-specific and only after expiry', () => {
  assert.match(access,/isSubscriptionExpired/);
  assert.doesNotMatch(access,/UserSubscriptionProfile/);
  assert.match(app,/expired subscription repurchase prompt only after expiry/);
  assert.match(app,/expired_subscription_repurchase_/);
  assert.match(app,/remainingSessions: 2/);
  assert.match(app,/subscription has expired/);
  assert.doesNotMatch(app,/subscription purchase two-session popup/);
});

test('subscription theme adapts and desktop home lag guards exist', () => {
  assert.match(subscription,/subscription-page-theme-adaptive/);
  assert.match(html,/live-payment-subscription-theme-performance-v[345]/);
  assert.match(html,/desktop-site-content/);
  assert.match(app,/pointerMoveEventName: 'pointermove' \| 'mousemove'/);
  assert.match(app,/pointerMoveEventName: 'pointermove' \| 'mousemove'/);
  assert.match(app,/window\.addEventListener\(pointerMoveEventName/);
  assert.match(app,/window\.removeEventListener\(pointerMoveEventName/);
});
