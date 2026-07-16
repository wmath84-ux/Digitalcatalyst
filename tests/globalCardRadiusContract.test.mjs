import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync('index.html', 'utf8');
const productCard = readFileSync('components/ProductCard.tsx', 'utf8');
const globalRadiusBlock = indexHtml.match(/<style id="global-card-radius-unification">[\s\S]*?<\/style>/)?.[0] || '';

test('global card surfaces reuse the loved Store card edge radius', () => {
  assert.match(productCard, /rounded-\[22px\]/);
  assert.match(indexHtml, /id="global-card-radius-unification"/);
  assert.match(globalRadiusBlock, /--eduvora-card-radius:\s*22px;/);
  assert.match(globalRadiusBlock, /--eduvora-card-inner-radius:\s*18px;/);
  assert.match(globalRadiusBlock, /\.product-card-shine/);
  assert.match(globalRadiusBlock, /\.course-youtube-frame/);
});

test('global radius targets cards, not pills or circular buttons', () => {
  assert.match(globalRadiusBlock, /:where\(article, section, aside, form, dialog, div\)\[class\*="rounded-2xl"\]\[class\*="border"\]/);
  assert.match(globalRadiusBlock, /:where\(article, section, aside, form, dialog, div\)\[class\*="rounded-3xl"\]\[class\*="border"\]/);
  assert.doesNotMatch(globalRadiusBlock, /button\[class\*="rounded-full"\]/);
  assert.doesNotMatch(globalRadiusBlock, /\[class\*="rounded-full"\].*border-radius:\s*var\(--eduvora-card-radius\)/s);
});
