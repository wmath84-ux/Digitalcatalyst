import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const productCard = fs.readFileSync('components/ProductCard.tsx', 'utf8');
const productDetail = fs.readFileSync('components/ProductDetailPage.tsx', 'utf8');
const favourites = fs.readFileSync('components/FavouritesPage.tsx', 'utf8');
const featured = fs.readFileSync('components/FeaturedProducts.tsx', 'utf8');
const mobileHome = fs.readFileSync('components/MobileAppHome.tsx', 'utf8');
const reading = fs.readFileSync('components/ReadingDrawer.tsx', 'utf8');
const adminDashboard = fs.readFileSync('components/admin/AdminDashboard.tsx', 'utf8');
const users = fs.readFileSync('components/admin/UserManagement.tsx', 'utf8');

test('owned product cards show Purchased as the only product badge', () => {
  assert.match(productCard, /\{isPurchased \? \(/);
  assert.match(productCard, /:\s*\(\s*<>\s*\{product\.isFree/);
  assert.match(productCard, /!\s*isPurchased && product\.category/);
  assert.match(favourites, /purchasedProductIds\?: number\[\]/);
  assert.match(favourites, /isPurchased=\{purchasedProductIds\.includes\(product\.id\)\}/);
  assert.match(featured, /purchasedProductIds\?: number\[\]/);
  assert.match(featured, /isPurchased=\{purchasedProductIds\.includes\(product\.id\)\}/);
  assert.match(app, /<WishlistPage[\s\S]*purchasedProductIds=\{purchasedProductIds\}/);
  assert.match(app, /<FeaturedProducts[\s\S]*purchasedProductIds=\{purchasedProductIds\}/);
});

test('owned product detail and mobile cards suppress competing badges', () => {
  assert.match(productDetail, /!\s*isPurchased && isWishlisted/);
  assert.match(productDetail, /aria-label="Purchased"/);
  assert.match(productDetail, /<span className="sr-only">OWNED<\/span>/);
  assert.match(productDetail, /<span className="sr-only">Verified access<\/span>/);
  assert.match(productDetail, /isPurchased \? \(\s*<span[\s\S]*>Purchased<\/span>/);
  assert.match(productDetail, /!\s*isPurchased && !product\.isFree && coupons\.length > 0/);
  assert.match(productDetail, /!\s*isPurchased && canShowProductCoinCheckout/);
  assert.match(mobileHome, /purchasedProductIds\.includes\(product\.id\) \? \(/);
  assert.match(mobileHome, /homeTopRated" \/\>\{purchasedProductIds\.includes\(product\.id\)/);
});

test('reading drawer preserves full article content after reward claim', () => {
  assert.match(reading, /selectedArticleForDisplay/);
  assert.match(reading, /canonicalArticle\.content \|\| selectedArticle\.content/);
  assert.match(reading, /selectedArticleContent/);
  assert.match(reading, /content=\{selectedArticleContent\}/);
  assert.match(reading, /Reward already claimed for this article/);
  assert.match(reading, /Full article content is available for rereading/);
  assert.match(reading, /view === 'article' && selectedArticleForDisplay && \(/, 'article content is not reward-gated');
  assert.match(reading, /view === 'article' && selectedArticleForDisplay && !articleReadingRewardDisabled && \(/, 'reward counter remains reward-gated');
});

test('admin customers are deduped by stable identity and admin shell is edge-to-edge', () => {
  assert.match(users, /dedupeAdminCustomersForDisplay/);
  assert.match(users, /getCustomerIdentityKey/);
  assert.match(users, /email:\$\{email\}/);
  assert.match(users, /visibleUsers\.length \? visibleUsers\.map/);
  assert.match(users, /duplicateCustomerCount/);
  assert.match(adminDashboard, /data-admin-shell="SHIPNOW_ADMIN_SHELL_V1"/);
  assert.match(adminDashboard, /p-0 font-sans/);
  assert.match(adminDashboard, /max-w-none overflow-hidden border-0/);
  assert.match(adminDashboard, /shadow-none/);
  assert.match(adminDashboard, /isProductEditorShellOpen \? 'p-0' : 'p-0'/);
  assert.match(adminDashboard, /w-full max-w-none/);
});
