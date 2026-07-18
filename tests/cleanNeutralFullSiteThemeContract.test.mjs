import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../components/admin/WebsiteSettings.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles/clean-neutral-theme.css', import.meta.url), 'utf8');

test('Clean Neutral is a preserved independent global theme mode', () => {
  assert.match(app, /'modern-white' \| 'clean-neutral' \| 'classic'/);
  assert.match(app, /requestedColorExperience === 'clean-neutral'/);
  assert.match(app, /'clean-neutral': \{\s*primaryColor: '#171717'/);
  assert.match(html, /supportedModes = \['original', 'immersive', 'warm', 'modern-white', 'clean-neutral', 'classic'\]/);
  assert.match(html, /href="\/styles\/clean-neutral-theme\.css"/);
  assert.ok((html.match(/data-color-experience="clean-neutral"/g) || []).length >= 50);
});

test('Admin exposes the audited Clean Neutral mode and locks its fixed rules', () => {
  assert.match(settings, />Clean Neutral</);
  assert.match(settings, /All 20 Clean Neutral rules apply globally/);
  assert.match(settings, /cleanNeutralModeActive/);
  assert.match(settings, /fixedProfessionalModeActive/);
  assert.match(settings, /disabled=\{fixedProfessionalModeActive\}/);
  assert.match(settings, /disabled=\{cleanNeutralModeActive\} value=\{localSettings\.theme\.shadowIntensity\}/);
});

test('Clean Neutral CSS defines the complete professional token hierarchy', () => {
  for (const token of [
    '--cn-page: #f7f7f8',
    '--cn-surface: #ffffff',
    '--cn-heading: #171717',
    '--cn-text: #262626',
    '--cn-text-secondary: #525252',
    '--cn-muted: #737373',
    '--cn-disabled: #a3a3a3',
    '--cn-border: #e5e5e5',
    '--cn-primary: #171717',
    '--cn-shadow-card: 0 1px 3px rgba(0, 0, 0, 0.04)',
    '--cn-radius-control: 10px',
    '--cn-radius-card: 14px',
  ]) assert.ok(css.includes(token), `missing ${token}`);
});

test('Clean Neutral covers core surfaces, controls and responsive workspaces', () => {
  for (const marker of [
    '.shipnow-admin-page-theme',
    '.product-editor-workspace',
    '.eduvora-community-polish',
    '.subscription-page-theme-adaptive',
    '.payment-checkout-page',
    '.checkout-contrast-panel',
    '.course-player-theme',
    '[data-reading-drawer-panel]',
    '.profile-performance-root',
    '.product-card-shine',
    '.common-modal-content',
    '[aria-current="page"]',
    '@media (max-width: 640px)',
    '@media (prefers-reduced-motion: reduce)',
  ]) assert.ok(css.includes(marker), `missing coverage marker ${marker}`);
});

test('Clean Neutral keeps semantic statuses and intentional media contrast', () => {
  assert.match(css, /--cn-success: #166534/);
  assert.match(css, /--cn-warning: #92400e/);
  assert.match(css, /--cn-danger: #b91c1c/);
  assert.match(css, /\.course-drive-fixed-stage[\s\S]*background: #000000 !important/);
  assert.match(css, /\.course-drive-fixed-audio-viewport[\s\S]*background: #ffffff !important/);
  assert.match(css, /\.checkout-contrast-panel[\s\S]*background: var\(--cn-primary\) !important/);
});
