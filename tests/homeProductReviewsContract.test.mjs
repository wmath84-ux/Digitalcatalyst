import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const hook = fs.readFileSync("src/hooks/useProductReviews.ts", "utf8");
const home = fs.readFileSync("src/home/App.tsx", "utf8");
const rail = fs.readFileSync("src/home/components/Reviews.tsx", "utf8");
const pdp = fs.readFileSync("src/PdpApp.tsx", "utf8");
const main = fs.readFileSync("src/main.tsx", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");
const fallback = fs.readFileSync("src/home/data/mockData.ts", "utf8");

test("home review rail requests four live product reviews and no placeholder reviews", () => {
  assert.match(home, /useHomepageProductReviews\(catalogProducts, \[\], 4\)/);
  assert.match(home, /review\.source === "live"/);
  assert.match(hook, /for \(const maxPerProduct of \[1, 2\]\)/);
  assert.match(hook, /b\.createdAtMs - a\.createdAtMs/);
  assert.doesNotMatch(fallback, /export const reviews/);
  assert.doesNotMatch(home, /fallbackReviews/);
});

test("published live reviews progressively replace placeholders", () => {
  assert.match(hook, /collection\(db, "siteReviews"\)/);
  assert.match(hook, /where\("status", "==", "published"\)/);
  assert.match(hook, /selectHomepageReviews\(\[\.\.\.liveReviews, \.\.\.fallbackReviews\], limit\)/);
});

test("review cards navigate to that product's PDP review section", () => {
  assert.match(rail, /onOpenReview\(review\.productId\)/);
  assert.match(main, /\?section=reviews/);
  assert.match(pdp, /section=reviews/);
  assert.match(pdp, /getElementById\("product-reviews"\)/);
  assert.match(pdp, /id="product-reviews"/);
});

test("PDP renders only published reviews matched to the current product", () => {
  assert.match(pdp, /const belongsToProduct = \(review: PublishedProductReview\) =>/);
  assert.match(pdp, /review\.productId === product\.id \|\| review\.productId === product\.documentId/);
  assert.match(pdp, /liveProductReviews\.filter\(belongsToProduct\)/);
  assert.match(pdp, /previewReviews\.map\(\(review\)/);
  assert.match(pdp, /review\.comment/);
  assert.match(pdp, /data-pdp-all-reviews/);
  assert.match(pdp, /REVIEW_PREVIEW_COUNT/);
});

test("signed-in learners publish reviews immediately for the live rail", () => {
  assert.match(pdp, /addDoc\(collection\(db, "siteReviews"\)/);
  assert.match(pdp, /status: "published"/);
  assert.match(pdp, /canReview=\{Boolean\(user\)\}/);
  assert.match(pdp, /setReviewNotice\("Review added\."\)/);
  assert.match(pdp, /setLocalReviews/);
});

test("Firestore exposes published reviews and keeps moderation admin-controlled", () => {
  assert.match(rules, /match \/siteReviews\/\{reviewId\}/);
  assert.match(rules, /allow read: if resource\.data\.status == 'published'/);
  assert.match(rules, /request\.resource\.data\.status in \['pending', 'published'\]/);
  assert.match(rules, /allow update, delete: if isAdmin\(\)/);
});
