import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const mobileHome = read('components/MobileAppHome.tsx');
const congratulations = read('components/Congratulations.tsx');
const membership = read('components/MembershipUpgradeCard.tsx');
const css = read('public/styles/clean-neutral-theme.css');

test('Phase 3 markers exist exactly once', () => {
  assert.equal((mobileHome.match(/data-clean-neutral-workspace="mobile-home"/g) || []).length, 1);
  assert.equal((congratulations.match(/data-clean-neutral-workspace="congratulations"/g) || []).length, 1);
  assert.equal((congratulations.match(/data-clean-neutral-panel="congratulations-summary"/g) || []).length, 1);
  assert.equal((membership.match(/data-clean-neutral-component="membership-upgrade"/g) || []).length, 1);
  assert.equal((membership.match(/data-clean-neutral-icon="membership-upgrade"/g) || []).length, 1);
  assert.equal((css.match(/CLEAN_NEUTRAL_PHASE3_PRECISION_V1/g) || []).length, 1);
});

test('global navigation precision rules exist', () => {
  assert.match(css, /\.home-side-dock-surface nav > button\[aria-current="page"\]/);
  assert.match(css, /#main-bottom-dock button\[aria-current="page"\]/);
  assert.match(css, /header button\[class\*="bg-\[#1557B0\]"\]/);
});

test('workspace precision rules exist', () => {
  assert.match(css, /\[data-clean-neutral-workspace="mobile-home"\]/);
  assert.match(css, /\[data-feature="MAY_DAY_DESKTOP_V1"\]/);
  assert.match(css, /\[data-feature="MAY_DAY_MOBILE_V1"\]/);
  assert.match(css, /\[data-clean-neutral-panel="congratulations-summary"\]/);
  assert.match(css, /\[data-clean-neutral-icon="membership-upgrade"\]/);
});

test('liquid gloss is disabled in Clean Neutral', () => {
  assert.match(css, /html\[data-color-experience="clean-neutral"\] \.liquid-metal-button__surface/);
  assert.match(css, /text-shadow: none !important/);
});

test('Phase 3 selectors are Clean Neutral scoped', () => {
  const phase3 = css.split('/* CLEAN_NEUTRAL_PHASE3_PRECISION_V1 */')[1];
  assert.ok(phase3);
  for (const match of phase3.matchAll(/([^{}]+)\{[^{}]*\}/gs)) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith('/*') || selector.startsWith('@')) continue;
    assert.match(selector, /html\[data-color-experience="clean-neutral"\]/, selector);
  }
});
