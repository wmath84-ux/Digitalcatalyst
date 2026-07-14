import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const purchasedProducts = fs.readFileSync(new URL('../components/PurchasedProducts.tsx', import.meta.url), 'utf8');
const safeImage = fs.readFileSync(new URL('../components/common/SafeImage.tsx', import.meta.url), 'utf8');
const mediaCompat = fs.readFileSync(new URL('../utils/mediaCompat.ts', import.meta.url), 'utf8');

test('purchased product image cards keep real image candidates alive long enough to load', () => {
  assert.match(purchasedProducts, /PURCHASED_IMAGE_LOAD_TIMEOUT_MS = 14000/);
  assert.match(purchasedProducts, /loadTimeoutMs=\{PURCHASED_IMAGE_LOAD_TIMEOUT_MS\}/);
  assert.doesNotMatch(purchasedProducts, /loadTimeoutMs=\{3500\}/);
  assert.match(purchasedProducts, /getProductImageCandidates\(product, purchaseImageSlot\)\.filter\(Boolean\)/);
});

test('SafeImage timeout is tied to the active source so fallback cycling does not reuse stale timers', () => {
  assert.match(safeImage, /const candidateSourcesKey = candidateSources\.join\('\|'\)/);
  assert.match(safeImage, /\}, \[candidateSourcesKey\]\)/);
  assert.match(safeImage, /\}, \[activeSrc, candidateIndex, candidateSources\.length, loadTimeoutMs, loaded\]\)/);
});

test('product image normalization accepts legacy object-style image records', () => {
  assert.match(mediaCompat, /const pickImageCandidateUrl = \(value: unknown\): string =>/);
  assert.match(mediaCompat, /record\.secure_url/);
  assert.match(mediaCompat, /record\.downloadURL/);
  assert.match(mediaCompat, /record\.hostedUrl/);
  assert.match(mediaCompat, /\.map\(pickImageCandidateUrl\)\.filter\(Boolean\)/);
});
