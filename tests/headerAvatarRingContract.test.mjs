import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css = fs.readFileSync('src/index.css', 'utf8');
const menu = fs.readFileSync('src/components/MobileHeaderMenu.tsx', 'utf8');
const payment = fs.readFileSync('src/components/ui/payment-button.css', 'utf8');
test('header avatar and payment CTA use the same exact indigo token', () => {
  assert.match(css, /--dc-purchase-accent: #4f46e5/);
  assert.match(css, /border: 2px solid var\(--dc-purchase-accent, #4f46e5\)/);
  assert.match(payment, /--uzp-clr: var\(--dc-purchase-accent, #4f46e5\)/);
});
test('ring surrounds photo and initials with a theme-aware gap without changing the tap target', () => {
  assert.match(menu, /<span data-mobile-header-avatar-surface>/);
  assert.match(menu, /data-mobile-header-avatar-fallback/);
  assert.match(menu, /h-10 w-10/);
  assert.match(css, /html\[data-theme="light"\] \[data-mobile-header-menu-button\]/);
  assert.match(css, /\[data-mobile-header-menu-button\]:focus-visible/);
});
