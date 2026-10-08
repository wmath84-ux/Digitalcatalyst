import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pdp = read("src/PdpApp.tsx");
const reviewHook = read("src/hooks/useProductReviews.ts");
const productType = read("src/data/products.ts");
const productEditor = read("src/components/admin/products/ProductEditor.tsx");
const adminClient = read("src/lib/admin/client.ts");
const catalog = read("src/context/CatalogContext.tsx");

test("product-page reviews use published product reviews, not Home placeholders", () => {
  assert.match(reviewHook, /where\("status", "==", "published"\)/);
  assert.match(pdp, /usePublishedProductReviews\(reviewCatalog\)/);
  assert.match(pdp, /const \[localReviews, setLocalReviews\] = useState<PublishedProductReview\[]>\(\[\]\)/);
  assert.match(pdp, /review\.productId === product\.id \|\| review\.productId === product\.documentId/);
  assert.doesNotMatch(pdp, /useHomepageProductReviews|home\/data\/mockData|fallbackReviews|DUMMY_REVIEWS/i);
});

test("the PDP previews four reviews and opens a full Reviews & Ratings view", () => {
  assert.match(pdp, /const REVIEW_PREVIEW_SIZE = 4/);
  assert.match(pdp, /reviews\.slice\(0, mode === "preview" \? REVIEW_PREVIEW_SIZE : visibleCount\)/);
  assert.match(pdp, /data-see-all-reviews/);
  assert.match(pdp, /See all reviews/);
  assert.match(pdp, /\?reviews=1/);
  assert.match(pdp, /if \(showReviewsPage\)/);
  assert.match(pdp, /mode="full"/);
  assert.match(pdp, /Reviews & Ratings/);
  assert.match(pdp, /data-pdp-reviews-back/);
});

test("related products require matching class and chapter metadata", () => {
  assert.match(productType, /chapters\?: string\[\]/);
  assert.match(productEditor, /label="Chapters"/);
  assert.match(adminClient, /chapters: strList\(normalizedBody\.chapters\)/);
  assert.match(catalog, /chapters: Array\.isArray\(data\.chapters\)/);
  assert.match(pdp, /const relatedClassKey/);
  assert.match(pdp, /const relatedChapterKeys/);
  assert.match(pdp, /if \(!classKey \|\| chapterKeys\.size === 0\) return \[\]/);
  assert.match(pdp, /candidateClassKey !== classKey/);
  assert.match(pdp, /sharedChapterKeys\.length === 0/);
});

test("related products page in two clipped rows with explicit arrows", () => {
  const slider = pdp.slice(pdp.indexOf("function RelatedProducts"), pdp.indexOf("function RelatedProductCard"));
  assert.match(slider, /products\.filter\(\(_, index\) => index % 2 === 0\)/);
  assert.match(slider, /products\.filter\(\(_, index\) => index % 2 === 1\)/);
  assert.match(slider, /data-pdp-related-prev/);
  assert.match(slider, /data-pdp-related-next/);
  assert.match(slider, /translate3d\(-\$\{pageIndex \* 100\}%/);
  assert.doesNotMatch(slider, /useDragScroll|onPointerDown|overflow-x-auto/);
});

test("the shared Pay button rests white and reserves its accent for interaction", () => {
  const css = read("src/components/ui/payment-button.css");
  assert.match(css, /background-color: #fff/);
  assert.match(css, /--uzp-clr: #4f46e5/);
  assert.match(css, /\.uzp-pay__icon \{[\s\S]*?background-color: transparent/);
  assert.match(css, /\.uzp-pay:hover \.uzp-pay__icon \{[\s\S]*?background-color: var\(--uzp-clr\)/);
  assert.doesNotMatch(css, /--uzp-clr:\s*#00ad54/);
});
