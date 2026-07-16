import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const productCard = fs.readFileSync('components/ProductCard.tsx', 'utf8');
const purchasedProducts = fs.readFileSync('components/PurchasedProducts.tsx', 'utf8');
const readingDrawer = fs.readFileSync('components/ReadingDrawer.tsx', 'utf8');

test('store and home product cards keep readable media inside softer corners', () => {
  assert.match(productCard, /rounded-\[22px\] border border-\[#DDE5EF\]/);
  assert.match(productCard, /relative aspect-\[4\/3\] w-full overflow-hidden border-b border-\[#E4EAF2\] bg-\[#F7F9FC\] p-2 sm:p-3/);
  assert.match(productCard, /product-card-media-safe-frame/);
  assert.match(productCard, /rounded-\[16px\] bg-white\/70/);
  assert.match(productCard, /wrapperClassName="absolute inset-0"/);
  assert.doesNotMatch(productCard, /rounded-3xl border border-\[#DDE5EF\]/);
});

test('my purchases card image contract stays unchanged', () => {
  assert.match(purchasedProducts, /purchased-product-media-frame relative aspect-\[4\/3\] w-full overflow-hidden/);
  assert.match(purchasedProducts, /wrapperClassName="absolute inset-0 z-10 block"/);
  assert.match(purchasedProducts, /className="block h-full w-full object-contain"/);
});

test('reading drawer backdrop absorbs touch/click so background dock cannot be tapped through', () => {
  assert.match(readingDrawer, /handleOverlayPointerDownCapture/);
  assert.match(readingDrawer, /target\?\.closest\?\.\('\[data-reading-drawer-panel="true"\]'\)/);
  assert.match(readingDrawer, /event\.preventDefault\(\);/);
  assert.match(readingDrawer, /event\.stopPropagation\(\);/);
  assert.match(readingDrawer, /event\.pointerType !== 'touch'/);
  assert.match(readingDrawer, /onPointerDownCapture=\{handleOverlayPointerDownCapture\}/);
  assert.match(readingDrawer, /onClickCapture=\{absorbOverlayClick\}/);
  assert.match(readingDrawer, /className="absolute inset-0 pointer-events-auto touch-none backdrop-blur-sm"/);
  assert.match(readingDrawer, /data-reading-drawer-panel="true"/);
});
