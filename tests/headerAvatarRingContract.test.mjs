import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const indexCss = fs.readFileSync('src/index.css', 'utf8');
const menu = fs.readFileSync('src/components/MobileHeaderMenu.tsx', 'utf8');
const headerButton = fs.readFileSync('src/components/HeaderNotificationsButton.tsx', 'utf8');
const headerCss = fs.readFileSync('src/components/header-navigation.css', 'utf8');
const payment = fs.readFileSync('src/components/ui/payment-button.css', 'utf8');
test('the payment CTA retains its exact indigo token', () => {
  assert.match(indexCss, /--dc-purchase-accent: #4f46e5/);
  assert.match(payment, /--uzp-clr: var\(--dc-purchase-accent, #4f46e5\)/);
});
test('the side-panel trigger is a plain 40px three-line button and Notifications keeps its inset-glass treatment', () => {
  assert.doesNotMatch(menu, /data-mobile-header-avatar/);
  assert.match(menu, /dc-header-menu-trigger/);
  assert.doesNotMatch(menu, /data-header-glass-button="quick-actions"/);
  assert.match(menu, /data-button-size="40"/);
  assert.match(menu, /<Menu\b/);
  assert.match(headerButton, /data-header-glass-button="notifications"/);
  // 2026-10-14: the bell GLYPH is the 30px chrome icon size on every band
  // (the frosted plate it sits in is the hit target and stays 40px).
  assert.match(headerButton, /<Bell[\s\S]*size=\{30\}/);
  assert.match(headerCss, /\.dc-header-menu-trigger\s*\{[\s\S]*?width: 40px[\s\S]*?border: 0[\s\S]*?background: transparent/);
  assert.doesNotMatch(headerCss.match(/\.dc-header-menu-trigger\s*\{([^}]*)\}/)?.[1] ?? "", /border-radius:\s*999px/);
  assert.match(headerCss, /data-button-size="36"/);
  assert.match(headerCss, /box-shadow:[\s\S]*?inset 0 1px 0/);
  assert.doesNotMatch(headerCss, /box-shadow:[^;]*,\s*0\s*\d+px/, 'the glass notification button has no exterior drop shadow');
});
