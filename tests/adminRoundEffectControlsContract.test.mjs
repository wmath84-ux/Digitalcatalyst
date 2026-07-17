import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const utility = fs.readFileSync('utils/productRoundness.ts', 'utf8');
const websiteSettings = fs.readFileSync('components/admin/WebsiteSettings.tsx', 'utf8');
const productCard = fs.readFileSync('components/ProductCard.tsx', 'utf8');
const productShowcase = fs.readFileSync('components/ProductShowcase.tsx', 'utf8');
const featuredProducts = fs.readFileSync('components/FeaturedProducts.tsx', 'utf8');
const favourites = fs.readFileSync('components/FavouritesPage.tsx', 'utf8');
const mobileHome = fs.readFileSync('components/MobileAppHome.tsx', 'utf8');
const purchases = fs.readFileSync('components/PurchasedProducts.tsx', 'utf8');
const productDetail = fs.readFileSync('components/ProductDetailPage.tsx', 'utf8');

test('website settings persist separate product roundness controls', () => {
  assert.match(utility, /DEFAULT_PRODUCT_ROUNDNESS_SETTINGS/);
  for (const key of ['storeCards', 'homeFeaturedCards', 'homePreviewCards', 'wishlistCards', 'productDetailPanels', 'myPurchasesCards', 'mediaInnerFrame', 'productBadges', 'productActionButtons']) {
    assert.match(utility, new RegExp(`${key}: true`));
  }
  assert.match(app, /productRoundness\?: ProductRoundnessSettings/);
  assert.match(app, /productRoundness: DEFAULT_PRODUCT_ROUNDNESS_SETTINGS/);
  assert.match(app, /\.\.\.DEFAULT_PRODUCT_ROUNDNESS_SETTINGS/);
});

test('admin Store Config removes the obsolete Round Effects workspace', () => {
  assert.doesNotMatch(websiteSettings, /Round Effects/);
  assert.doesNotMatch(websiteSettings, /case 'roundness': return/);
  assert.doesNotMatch(websiteSettings, /Set all Round/);
  assert.doesNotMatch(websiteSettings, /updateProductRoundness/);
  assert.match(websiteSettings, /store-config-workspace/);
  assert.match(websiteSettings, /Community.*activeTab === 'community'/s);
});

test('public product surfaces read their own roundness keys', () => {
  assert.match(productCard, /roundnessSurface\?: ProductCardRoundnessSurface/);
  assert.match(productCard, /store: 'storeCards'/);
  assert.match(productCard, /homeFeatured: 'homeFeaturedCards'/);
  assert.match(productCard, /wishlist: 'wishlistCards'/);
  assert.match(productCard, /mediaInnerFrame/);
  assert.match(productCard, /productBadges/);
  assert.match(productCard, /productActionButtons/);
  assert.match(productShowcase, /roundnessSurface="store"/);
  assert.match(featuredProducts, /roundnessSurface="homeFeatured"/);
  assert.match(favourites, /roundnessSurface="wishlist"/);
  assert.match(mobileHome, /homePreviewCards/);
  assert.match(mobileHome, /myPurchasesCards/);
  assert.match(purchases, /myPurchasesCards/);
  assert.match(productDetail, /productDetailPanels/);
  assert.match(productDetail, /productBadges/);
  assert.match(productDetail, /productActionButtons/);
});
