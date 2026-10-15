import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const checkout = fs.readFileSync("src/components/checkout/checkout-brand.css", "utf8");
const review = fs.readFileSync("src/components/checkout/CheckoutReviewStep.tsx", "utf8");
const settings = fs.readFileSync("src/settings/settings.css", "utf8");

test("desktop checkout has one centered content rail with room for review cards", () => {
  assert.match(checkout, /@media \(min-width: 1024px\)/);
  assert.match(checkout, /\[data-checkout-shell\][\s\S]*?max-width: 1280px/);
  assert.match(checkout, /\[data-checkout-content\][\s\S]*?max-width: 1120px/);
  assert.match(checkout, /\[data-checkout-review-step\] > \.dc-checkout-section[\s\S]*?width: 100%/);
});

test("desktop checkout buyer profile is a full-width responsive identity row", () => {
  assert.match(review, /data-checkout-buyer-profile/);
  assert.match(review, /data-checkout-buyer-header/);
  assert.match(review, /data-checkout-buyer-details/);
  assert.match(checkout, /\[data-checkout-buyer-profile\][\s\S]*?grid-template-columns: minmax\(170px, 0\.42fr\) minmax\(0, 1\.58fr\)/);
  assert.match(checkout, /\[data-checkout-buyer-details\][\s\S]*?repeat\(auto-fit, minmax\(150px, 1fr\)\)/);
});

test("desktop free-access action fits its label without truncation", () => {
  assert.match(checkout, /\.cu-pay\.uzp-pay[\s\S]*?width: 220px/);
  assert.match(checkout, /\.cu-pay \.uzp-pay__text[\s\S]*?white-space: nowrap/);
  assert.match(checkout, /\.cu-pay \.uzp-pay__text[\s\S]*?text-overflow: clip/);
});

test("desktop signed-out Settings uses a compact centered panel", () => {
  assert.match(settings, /@media \(min-width: 1024px\)[\s\S]*?\.settings-signed-out[\s\S]*?max-width: 52rem/);
  assert.match(settings, /\.settings-signed-out[\s\S]*?flex: 0 1 auto/);
  assert.match(settings, /\.settings-signed-out[\s\S]*?align-self: center/);
});


const studyCard = fs.readFileSync("src/personal-library/MyCourseCard.tsx", "utf8");
const studyCss = fs.readFileSync("src/personal-library/study-library-minimal.css", "utf8");
const homeCss = fs.readFileSync("src/home/home.css", "utf8");
const cardSharedCss = fs.readFileSync("src/components/marketplace-card-shared.css", "utf8");
const experimentCss = fs.readFileSync("src/personal-library/course-editor-minimal.css", "utf8");
const experimentEditor = fs.readFileSync("src/personal-library/MyCourseExperimentEditor.tsx", "utf8");

test("Study Library gets full-width horizontal course rows only above the mobile breakpoint", () => {
  assert.match(studyCard, /data-my-course-open=\{course\.id\}/);
  assert.match(studyCard, /<span>Open<\/span>/);
  assert.match(studyCss, /\.dc-study-open-action\s*\{\s*display:\s*none;/);
  assert.match(studyCss, /@media \(min-width: 768px\)\s*\{[\s\S]*?\.dc-study-course-row\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(studyCss, /@media \(min-width: 768px\) and \(max-width: 920px\)/);
  assert.match(studyCss, /\.dc-study-course-actions\s*\{[\s\S]*?justify-content:\s*flex-end/);
});

test("Home product cards use a restrained shadow and readable light-theme ownership badges", () => {
  // The card rules live in the shared marketplace-card sheet now, scoped to
  // the Home grid and the Store grids through one :is() group.
  assert.match(cardSharedCss, /:is\(\[data-home-content\] \[data-home-grid\], \[data-store-page\] \[data-store-grid\], \[data-store-page\] \[data-store-mixed\]\) \.dc-marketplace-card,\s*:is\(\[data-home-content\] \[data-home-grid\], \[data-store-page\] \[data-store-grid\], \[data-store-page\] \[data-store-mixed\]\) \.dc-marketplace-card:hover/);
  assert.match(cardSharedCss, /box-shadow:\s*0 2px 5px -4px rgba\(15, 23, 42, 0\.2\) !important/);
  assert.match(cardSharedCss, /\.dc-marketplace-status\[data-status="purchased"\],\s*html\[data-theme="light"\] :is\(\[data-home-content\] \[data-home-grid\], \[data-store-page\] \[data-store-grid\], \[data-store-page\] \[data-store-mixed\]\) \.dc-marketplace-card \.dc-marketplace-status\[data-status="free"\] \{[\s\S]*?color:\s*#176b50 !important/);
  assert.match(cardSharedCss, /\.dc-marketplace-status\[data-status="free"\][\s\S]*?color:\s*#176b50 !important/);
  assert.match(cardSharedCss, /@media \(min-width: 640px\)[\s\S]*?\.dc-marketplace-card\.is-large \.dc-marketplace-open/);
});

test("Light experiment templates, helper copy and run status retain readable contrast", () => {
  assert.match(experimentEditor, /data-my-experiment-health=\{errors\.length \? "blocked" : warnings\.length \? "warning" : "ready"\}/);
  assert.match(experimentCss, /\[data-my-experiment-template\][\s\S]*?color:\s*#16467f !important/);
  assert.match(experimentCss, /\[data-my-experiment-health="ready"\][\s\S]*?color:\s*#14532d !important/);
  assert.match(experimentCss, /\[data-my-experiment-health="warning"\][\s\S]*?color:\s*#854d0e !important/);
  assert.match(experimentCss, /\[data-my-experiment-health="blocked"\][\s\S]*?color:\s*#9f1239 !important/);
});
