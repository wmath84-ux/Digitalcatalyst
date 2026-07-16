import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexHtml = fs.readFileSync('index.html', 'utf8');
const productDetail = fs.readFileSync('components/ProductDetailPage.tsx', 'utf8');
const paymentModal = fs.readFileSync('components/PaymentModal.tsx', 'utf8');
const liquidButton = fs.readFileSync('components/ui/LiquidMetalButton.tsx', 'utf8');
const liquidCss = fs.readFileSync('components/ui/liquidMetalButton.css', 'utf8');
const sideDock = fs.readFileSync('components/HomeSideDock.tsx', 'utf8');
const cartSidebar = fs.readFileSync('components/CartSidebar.tsx', 'utf8');

test('product detail and open side panels use lightweight scroll-safe visual effects', () => {
  assert.match(productDetail, /product-detail-performance-scope/);
  assert.match(productDetail, /product-detail-decorative-blur/);
  assert.match(indexHtml, /eduvora-scroll-performance-and-classic-actions/);
  assert.match(indexHtml, /product-detail-performance-scope \.product-checkout-panel/);
  assert.match(indexHtml, /home-side-dock-performance/);
  assert.match(indexHtml, /cart-sidebar[\s\S]*backdrop-filter: none/);
  assert.match(sideDock, /home-side-dock-performance/);
  assert.match(sideDock, /event\.pointerType === 'mouse'/);
  assert.doesNotMatch(liquidButton, /requestAnimationFrame/);
  assert.doesNotMatch(liquidButton, /onPointerMove/);
  assert.doesNotMatch(liquidCss, /filter: blur\(/);
  assert.doesNotMatch(liquidCss, /mix-blend-mode/);
});

test('shared primary actions use the same professional royal-blue payment design', () => {
  assert.match(liquidButton, /eduvora-primary-action/);
  assert.match(liquidCss, /#1769ff/);
  assert.match(productDetail, /product-detail-primary-pay-button eduvora-primary-action/);
  assert.match(productDetail, /payment-card-icon/);
  assert.match(productDetail, /Pay now/);
  assert.match(paymentModal, /payment-primary-action eduvora-primary-action/);
  assert.match(cartSidebar, /cart-primary-action eduvora-primary-action/);
});

test('payment checkout is one long blue-white page with item, price, actions and trust footer', () => {
  assert.match(paymentModal, /payment-checkout-long-page/);
  assert.match(paymentModal, /payment-checkout-blue-hero/);
  assert.match(paymentModal, /Eduvora secure payment/);
  assert.match(paymentModal, /Complete your checkout/);
  assert.match(paymentModal, /Amount payable/);
  assert.match(paymentModal, /payment-detail-trust-panel/);
  assert.match(paymentModal, /Price summary/);
  assert.match(paymentModal, /Payment action/);
  assert.match(paymentModal, /Razorpay protected/);
  assert.match(paymentModal, /Payment recovery available/);
  assert.doesNotMatch(paymentModal, /bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900/);
  assert.doesNotMatch(paymentModal, /pointer-events-none absolute -left-24 top-16/);
});
