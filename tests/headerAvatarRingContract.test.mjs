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
test('the profile-avatar slot is replaced by an equally sized, inset-highlight glass Notifications button', () => {
  assert.doesNotMatch(menu, /data-mobile-header-avatar/);
  assert.match(menu, /data-header-glass-button="quick-actions"/);
  assert.match(menu, /data-button-size="40"/);
  assert.match(headerButton, /data-header-glass-button="notifications"/);
  assert.match(headerButton, /<Bell[\s\S]*size=\{size === 40 \? 20 : 18\}/);
  assert.match(headerCss, /width: 40px/);
  assert.match(headerCss, /data-button-size="36"/);
  assert.match(headerCss, /box-shadow:[\s\S]*?inset 0 1px 0/);
  assert.doesNotMatch(headerCss, /box-shadow:[^;]*,\s*0\s*\d+px/, 'the button has no exterior drop shadow');
});
