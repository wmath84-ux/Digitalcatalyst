import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const css = read('src/components/checkout/checkout-brand.css');
const gateway = read('src/components/PaymentGateway.tsx');
test('review and payment load the same scoped light branding', () => {
  assert.match(read('src/components/checkout/CheckoutApp.tsx'), /import "\.\/checkout-brand.css"/);
  assert.match(gateway, /import "\.\/checkout\/checkout-brand.css"/);
  assert.match(css, /--checkout-muted: #475569/);
  assert.match(css, /--checkout-surface: #ffffff/);
  assert.match(css, /--checkout-accent: #004ac6/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 359px\)/);
});
test('payment keeps verified amount, errors, free access and guarded actions', () => {
  assert.match(gateway, /data-payment-summary/);
  assert.match(gateway, /<strong>\{displayAmount\}<\/strong>/);
  assert.match(gateway, /theme: \{ color: "#004ac6" \}/);
  assert.match(gateway, /disabled=\{busy\}/);
  assert.match(gateway, /role="alert"/);
  assert.match(gateway, /finalPrice === 0 \? "Confirm free access"/);
  assert.match(gateway, /onClick=\{onGoBack\}/);
});
