import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const push = fs.readFileSync("utils/webPush.ts", "utf8");
const testApi = fs.readFileSync("api/push/test.ts", "utf8");
const subscribeApi = fs.readFileSync("api/push/subscribe.ts", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");
const pdp = fs.readFileSync("src/PdpApp.tsx", "utf8");
const pdpStyles = fs.readFileSync("src/pdp-minimal.css", "utf8");
const glassStyles = fs.readFileSync("src/glass.css", "utf8");
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

test("the Reviews & Ratings page paginates eight at a time while the PDP previews two concise reviews", () => {
  assert.match(pdp, /const REVIEW_PREVIEW_SIZE = 2/);
  assert.match(pdp, /const REVIEW_PAGE_SIZE = 8/);
  assert.match(pdp, /mode === "preview" \? REVIEW_PREVIEW_SIZE : visibleCount/);
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
  assert.match(pdp, /Copy link/);
  assert.match(pdp, /#\/product\/\$\{encodeURIComponent\(product\.id\)\}/);
});

test("the PDP share menu uses the compact sweet-sloth window animation with massive-snail glass", () => {
  const panel = glassStyles.match(/\.dc-compact-glass-window\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(panel, "shared compact glass window surface rule should exist");
  assert.match(panel, /position:\s*absolute/);
  assert.match(panel, /bottom:\s*calc\(100%\s*\+\s*0\.375rem\)/, "the existing popup placement is retained");
  assert.match(panel, /width:\s*min\(190px,\s*100%\)/);
  assert.match(panel, /height:\s*70px/);
  assert.match(panel, /border-radius:\s*70px/);
  assert.match(panel, /transform-origin:\s*bottom right/);
  assert.match(panel, /linear-gradient\(-75deg,[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.2\)/);
  assert.match(panel, /backdrop-filter:\s*blur\(clamp\(1px,\s*0\.125em,\s*4px\)\)/);
  assert.match(panel, /inset 0 -0\.125em 0\.125em rgba\(255,\s*255,\s*255,\s*0\.5\)/);
  assert.match(glassStyles, /@keyframes dc-compact-glass-window-stretch[\s\S]*?10%\s*\{[^}]*scale\(1\.1,\s*0\.9\)[\s\S]*?30%\s*\{[^}]*scale\(0\.9,\s*1\.1\)/);
  assert.match(glassStyles, /\.dc-compact-glass-window\[data-open="true"\][\s\S]*?animation:\s*dc-compact-glass-window-stretch/);
  assert.match(glassStyles, /html\[data-theme="light"\] \.dc-compact-glass-window/);
  assert.match(pdpStyles, /\.dc-pdp-share-menu\s*\{\s*--dc-compact-glass-window-border:\s*var\(--pdp-border\)/);
  assert.match(pdp, /className="dc-compact-glass-window dc-pdp-share-menu"/);
  assert.match(pdp, /data-open=\{shareOpen \? "true" : "false"\}/);
  assert.match(pdp, /aria-hidden=\{!shareOpen\}/);
  assert.match(pdp, /className="dc-pdp-share-action"/);
});

test("purchase ownership matches both public id and document id", () => {
  assert.match(catalog, /productDocumentId/);
  assert.match(pdp, /product\.documentId && ownedKeys\.has\(product\.documentId\)/);
});
