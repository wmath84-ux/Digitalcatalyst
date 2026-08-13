import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const push = fs.readFileSync("utils/webPush.ts", "utf8");
const testApi = fs.readFileSync("api/push/test.ts", "utf8");
const subscribeApi = fs.readFileSync("api/push/subscribe.ts", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");
const pdp = fs.readFileSync("src/PdpApp.tsx", "utf8");
const catalog = fs.readFileSync("src/context/CatalogContext.tsx", "utf8");
const mapping = fs.readFileSync("utils/productMapping.js", "utf8");

test("push save prefers the authenticated API and still keeps a Firestore fallback", () => {
  assert.match(push, /\/api\/push\/subscribe/);
  assert.match(push, /saveViaApi/);
  assert.match(push, /saveViaFirestore/);
  assert.match(push, /showLocalSystemNotification/);
  assert.match(push, /save_failed/);
  assert.match(subscribeApi, /2000/);
});

test("push test endpoint saves the live browser subscription for the signed-in user", () => {
  assert.match(testApi, /requireFirebaseUser/);
  assert.match(testApi, /doc\(user\.uid\)/);
  assert.match(testApi, /liveEndpoint/);
  assert.match(testApi, /webPushSubscriptions/);
  assert.doesNotMatch(testApi, /req\.body.*uid/);
});

test("curriculum lists nested modules and falls back to courseContent", () => {
  assert.match(pdp, /collectCurriculumModules/);
  assert.match(pdp, /CurriculumModuleRow/);
  assert.match(pdp, /childModules/);
  assert.match(mapping, /m\.files\?\.length \? m\.files : m\.resources/);
});

test("product ratings paginate six at a time with a load more control", () => {
  assert.match(pdp, /const REVIEW_PAGE_SIZE = 6/);
  assert.match(pdp, /data-load-more-reviews/);
  assert.match(pdp, /setVisibleCount\(\(count\) => count \+ REVIEW_PAGE_SIZE\)/);
  assert.match(pdp, /usePublishedProductReviews/);
});

test("signed-in learners can save product ratings to Firestore", () => {
  assert.match(pdp, /canReview=\{Boolean\(user\)\}/);
  assert.match(pdp, /collection\(db, "siteReviews"\)/);
  assert.match(pdp, /verifiedPurchase: Boolean\(isProductOwned\)/);
  assert.match(rules, /request\.resource\.data\.rating is number/);
  assert.match(rules, /request\.resource\.data\.verifiedPurchase is bool/);
});

test("product sharing uses the device share sheet plus copy and chat apps", () => {
  assert.match(pdp, /navigator\.share/);
  assert.match(pdp, /data-product-share/);
  assert.match(pdp, /WhatsApp/);
  assert.match(pdp, /Copy product link/);
  assert.match(pdp, /#\/product\/\$\{encodeURIComponent\(product\.id\)\}/);
});

test("purchase ownership matches both public id and document id", () => {
  assert.match(catalog, /productDocumentId/);
  assert.match(pdp, /product\.documentId && ownedKeys\.has\(product\.documentId\)/);
});
