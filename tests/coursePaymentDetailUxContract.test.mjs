import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const productDetail = fs.readFileSync('components/ProductDetailPage.tsx', 'utf8');
const paymentModal = fs.readFileSync('components/PaymentModal.tsx', 'utf8');

test('course product detail checkout explains price, payment choice, and unlock clearly', () => {
  assert.match(productDetail, /Course payment details/);
  assert.match(productDetail, /Clear price, safe unlock/);
  assert.match(productDetail, /Pay today/);
  assert.match(productDetail, /Verified digital access · Lifetime library/);
  assert.match(productDetail, /Pay ₹\$\{finalTotalPrice\.toFixed\(2\)\} securely/);
  assert.match(productDetail, /student discount/);
  assert.match(productDetail, /Razorpay secure pay/);
  assert.match(productDetail, /rounded-\[22px\]/);
});

test('payment detail page uses understandable product, unlock, and final payable hierarchy', () => {
  assert.match(paymentModal, /Price summary/);
  assert.match(paymentModal, /Final payable/);
  assert.match(paymentModal, /A simple view of the product, unlocks, final price, and payment safety/);
  assert.match(paymentModal, /Understand details, pay safely, unlock instantly/);
  assert.match(paymentModal, /Every discount, EduCoin adjustment, final payable amount, and unlock rule is shown before checkout/);
  assert.match(paymentModal, /Verified Razorpay payment before unlock/);
  assert.match(paymentModal, /Pay \$\{formatCheckoutMoney\(finalPayable\)\} with Razorpay/);
  assert.match(paymentModal, /rounded-\[22px\]/);
});
