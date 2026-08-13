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

test("home review rail requests exactly six diversified product reviews", () => {
  assert.match(home, /useHomepageProductReviews\(catalogProducts, fallbackReviews, 6\)/);
  assert.match(hook, /for \(const maxPerProduct of \[1, 2\]\)/);
  assert.match(hook, /b\.createdAtMs - a\.createdAtMs/);
  assert.equal((fallback.match(/id: "r\d+"/g) || []).length, 6);
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

test("PDP renders the same product-specific written review cards", () => {
  assert.match(pdp, /homepageReviews\.filter\(\(review\) => review\.productId === product\.id\)/);
  assert.match(pdp, /reviews\.map\(\(review\)/);
  assert.match(pdp, /review\.comment/);
});

test("owned learners can submit pending reviews for admin moderation", () => {
  assert.match(pdp, /addDoc\(collection\(db, "siteReviews"\)/);
  assert.match(pdp, /status: "pending"/);
  assert.match(pdp, /canReview=\{Boolean\(user\)\}/);
  assert.match(pdp, /Review submitted\. It is saved online and will appear after moderation/);
});

test("Firestore exposes only published reviews and keeps moderation admin-controlled", () => {
  assert.match(rules, /match \/siteReviews\/\{reviewId\}/);
  assert.match(rules, /allow read: if resource\.data\.status == 'published'/);
  assert.match(rules, /request\.resource\.data\.status == 'pending'/);
  assert.match(rules, /allow update, delete: if isAdmin\(\)/);
});
