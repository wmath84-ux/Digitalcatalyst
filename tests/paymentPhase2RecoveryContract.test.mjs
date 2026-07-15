import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const payment = fs.readFileSync('components/PaymentModal.tsx', 'utf8');
const productDetail = fs.readFileSync('components/ProductDetailPage.tsx', 'utf8');
const createOrder = fs.readFileSync('api/razorpay/create-order.ts', 'utf8');
const paymentStatus = fs.readFileSync('api/razorpay/payment-status.ts', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');

test('create-order preserves exact final payable price in paise', () => {
  assert.match(createOrder, /const amountRupees = Number\(req\.body\?\.amount \|\| 0\)/);
  assert.match(createOrder, /const amountPaise = Math\.round\(amountRupees \* 100\)/);
  assert.match(createOrder, /amount: amountPaise/);
  assert.doesNotMatch(createOrder, /Math\.round\(Number\(req\.body\?\.amount \|\| 0\)\)/);
});

test('product detail no longer opens stale external payment link before exact modal checkout', () => {
  assert.doesNotMatch(productDetail, /window\.open\(product\.paymentLink \|\| 'https:\/\/pages\.razorpay\.com\/pl_RIfTCxnYj73xqE\/view'/);
  assert.match(productDetail, /finalPrice=\{finalTotalPrice\}/);
  assert.match(productDetail, /checkoutType="product"/);
});

test('payment modal stores pending checkout and can recover on close, focus, mount or manual check', () => {
  assert.match(payment, /dc_pending_checkout:/);
  assert.match(payment, /savePendingCheckout/);
  assert.match(payment, /clearPendingCheckout/);
  assert.match(payment, /reconcilePendingCheckout/);
  assert.match(payment, /api\/razorpay\/payment-status/);
  assert.match(payment, /recoveryStatus: 'handler'/);
  assert.match(payment, /reconcilePendingCheckout\(String\(orderData\.orderId\), 'dismiss'\)/);
  assert.match(payment, /window\.addEventListener\('focus'/);
  assert.match(payment, /Check payment status/);
});

test('payment status API fetches Razorpay order payments and protects amount mismatch', () => {
  assert.match(paymentStatus, /\/v1\/orders\/\$\{orderId\}\/payments/);
  assert.match(paymentStatus, /status: 'paid'/);
  assert.match(paymentStatus, /status: 'amount_mismatch'/);
  assert.match(paymentStatus, /status: 'failed'/);
  assert.match(paymentStatus, /expectedAmountPaise/);
  assert.match(paymentStatus, /Number\(paidPayment\.amount \|\| 0\) === expectedAmountPaise/);
});

test('course-player paid content uses latest-update checkout surface', () => {
  assert.match(app, /checkoutType="latest-update"/);
  assert.match(app, /getLatestUpdateCheckoutSummary/);
  assert.match(app, /finalPrice=\{summary\.price\}/);
  assert.match(app, /handleConfirmLatestUpdatePurchase\(latestUpdateCheckout\.product, latestUpdateCheckout\.updateId, payment\)/);
});
