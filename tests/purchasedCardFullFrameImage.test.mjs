import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const purchasedProducts = fs.readFileSync(
  new URL('../components/PurchasedProducts.tsx', import.meta.url),
  'utf8',
);

const productCard = fs.readFileSync(
  new URL('../components/ProductCard.tsx', import.meta.url),
  'utf8',
);

test('Purchased cards use the same full-frame SafeImage layout contract as working Store cards', () => {
  assert.match(productCard, /wrapperClassName="absolute inset-0"/);
  assert.match(purchasedProducts, /wrapperClassName="absolute inset-0 z-10 block"/);
  assert.match(purchasedProducts, /className="block h-full w-full object-contain"/);
  assert.match(purchasedProducts, /purchased-product-media-frame relative aspect-\[4\/3\] w-full overflow-hidden/);
});

test('Purchased cards rely on one SafeImage fallback pipeline instead of a duplicate underlay image', () => {
  assert.doesNotMatch(purchasedProducts, /purchased-product-fallback-image/);
  assert.match(purchasedProducts, /fallbackSrc=\{purchaseImageFallback\}/);
  assert.match(purchasedProducts, /fallbackCandidates=\{purchaseImageCandidates\.slice\(1\)\}/);
  assert.match(purchasedProducts, /loadTimeoutMs=\{PURCHASED_IMAGE_LOAD_TIMEOUT_MS\}/);
});
