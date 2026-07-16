import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const showcase = fs.readFileSync('components/ProductShowcase.tsx', 'utf8');
const card = fs.readFileSync('components/ProductCard.tsx', 'utf8');

test('mobile Store renders two compact products per row', () => {
  assert.match(showcase, /store-mobile-two-column-grid/);
  assert.match(showcase, /grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3/);
  assert.match(showcase, /roundnessSurface="store" compactMobile/);
  assert.doesNotMatch(showcase, /grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3/);
});

test('compact Store cards protect mobile text, price and action layout', () => {
  assert.match(card, /compactMobile\?: boolean/);
  assert.match(card, /compactMobile = false/);
  assert.match(card, /product-card-mobile-compact/);
  assert.match(card, /p-2\.5 sm:p-5/);
  assert.match(card, /hidden sm:block/);
  assert.match(card, /hidden sm:inline-flex/);
  assert.match(card, /text-\[13px\]/);
  assert.match(card, /gap-1\.5 rounded-xl p-2/);
  assert.match(card, /min-h-8 px-2 py-2 text-\[9px\]/);
});
