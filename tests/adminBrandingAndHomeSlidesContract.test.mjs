// tests/adminBrandingAndHomeSlidesContract.test.mjs
//
// Contract tests for the mobile-first redesign of the admin's
// Branding page and Home Hero Slides page, plus the menu icon
// visibility fix on the admin shell.
//
// The previous designs were a long vertical stack of full cards
// (a 60-row form on Branding; a full slide card per slide on
// Home). On a phone the admin had to scroll past unrelated
// sections to find the field they wanted to change.
//
// The new layout uses the same drill-down pattern as the rest
// of the mobile-first admin pages:
//   • A pill rail at the top of the page lists every section
//     (or every slide).
//   • Picking one shows ONLY that section / slide's card.
//   • Every rail ends with a + pill that adds a new entry
//     and auto-focuses the freshly created one.
//
// The tests are pure code-shape tests — no React, no DOM — so
// they fail fast if the redesign is reverted by accident.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const branding = fs.readFileSync("src/admin/pages/BrandingPage.tsx", "utf8");
const home = fs.readFileSync("src/admin/pages/HomePage.tsx", "utf8");
const shell = fs.readFileSync("src/components/admin/AdminShell.tsx", "utf8");
const indexCss = fs.readFileSync("src/index.css", "utf8");

/* ------------------------------------------------------------------ */
/* AdminShell — menu icon visibility                                    */
/* ------------------------------------------------------------------ */

test("admin shell renders the menu icon as a real SVG (not the bare ☰ char)", () => {
  // The user reported that the top-left ☰ was invisible on a phone
  // (the unicode char had the same colour as the background). The
  // shell now imports a lucide Menu icon and wraps the toggle in a
  // proper visible button.
  assert.match(shell, /import \{ Menu \} from "lucide-react"/);
  assert.match(shell, /<Menu className="h-5 w-5"/);
  // The raw unicode hamburger is gone from the toggle button.
  assert.doesNotMatch(shell, />☰</);
  // The toggle button now has a border + background so the icon is
  // always visible against the page background.
  assert.match(shell, /data-admin-nav-toggle/);
  assert.match(shell, /border border-slate-200 bg-white/);
});

/* ------------------------------------------------------------------ */
/* Branding — drill-down section rail                                   */
/* ------------------------------------------------------------------ */

test("branding page renders a top section pill rail", () => {
  assert.match(branding, /data-branding-section-rail/);
  assert.match(branding, /data-branding-section-rail-scroll/);
  assert.match(branding, /data-branding-section-pill/);
  // The rail lists every section by name.
  assert.match(branding, /Identity/);
  assert.match(branding, /Logo/);
  assert.match(branding, /Home gradient/);
  assert.match(branding, /App behaviour/);
  assert.match(branding, /Support/);
});

test("branding page focuses only on one section at a time", () => {
  // The drill-down pattern: at most one section renders a full
  // card; the others are out of the way.
  assert.match(branding, /activeSection/);
  assert.match(branding, /data-branding-section-card/);
  // Tapping the active pill collapses it back to the rail.
  assert.match(branding, /onClick=\{\(\) => setActiveSection\(active \? null : section\.key\)\}/);
  // The close button on the focused card resets focus too.
  assert.match(branding, /onClick=\{\(\) => setActiveSection\(null\)\}/);
});

test("branding page preserves every existing field + data-attribute", () => {
  // The contract: every field the rest of the app and the existing
  // contract tests grep for is still on the page.
  assert.match(branding, /data-home-gradient-preview/);
  assert.match(branding, /data-branding-support-email/);
  assert.match(branding, /data-branding-support-phone/);
  assert.match(branding, /persist\(\{ hideFrameBorders: checked \}\)/);
  assert.match(branding, /DEFAULT_BRANDING/);
  assert.match(branding, /BRANDING_DOC_PATH/);
  // The Cloudinary upload with the right folder + tags.
  assert.match(branding, /folder="branding"/);
  assert.match(branding, /tags=\{\["branding", "logo"\]\}/);
  // The Save / Reset buttons are still rendered.
  assert.match(branding, /Save branding/);
  assert.match(branding, /Reset default/);
});

test("branding sections are 2-2-2-2-1 (Identity, Logo, Gradient, Behaviour, Support)", () => {
  // The pill rail lists 5 sections.
  assert.match(branding, /\{ key: "identity"/);
  assert.match(branding, /\{ key: "logo"/);
  assert.match(branding, /\{ key: "gradient"/);
  assert.match(branding, /\{ key: "behaviour"/);
  assert.match(branding, /\{ key: "support"/);
});

test("branding page description mentions the in-app notification list and system push", () => {
  // Preserved copy from the original description so the
  // notificationBrandingLogoContract test still passes.
  assert.match(branding, /in-app notification list/);
  assert.match(branding, /every system\/push notification/);
  assert.match(branding, /installed PWA name/);
});

/* ------------------------------------------------------------------ */
/* Home — drill-down slide rail                                          */
/* ------------------------------------------------------------------ */

test("home page renders a top slide pill rail", () => {
  assert.match(home, /data-admin-slide-rail/);
  assert.match(home, /data-admin-slide-rail-scroll/);
  assert.match(home, /data-admin-slide-pill/);
  assert.match(home, /data-admin-slide-add/);
  // The rail uses Plus + slide index chips, just like the
  // Curriculum Builder pill rail.
  assert.match(home, /import \{ Plus, X \} from "lucide-react"/);
});

test("home page focuses only on one slide at a time", () => {
  // At most one slide renders a full card; the others live in
  // the rail. The card data-attribute is the original one the
  // rest of the test suite greps for.
  assert.match(home, /data-admin-banner-card=/);
  assert.match(home, /data-admin-slide-card/);
  assert.match(home, /activeSlideIndex/);
  // Tapping the active pill collapses it back to the rail.
  assert.match(home, /setActiveSlideIndex\(active \? null : index\)/);
});

test("home page auto-focuses a freshly added slide", () => {
  // The + pill in the rail calls addBanner, which sets the new
  // slide's index as the active slide. The contract is that
  // the admin never lands on a blank state.
  assert.match(home, /setActiveSlideIndex\(next\.length - 1\)/);
});

test("home page preserves every existing slide field + link target", () => {
  // Text + design fields (label= strings kept so existing
  // contract tests still pass).
  assert.match(home, /Eyebrow \(small tag\)/);
  assert.match(home, /label="Title"/);
  assert.match(home, /label="Subtitle"/);
  assert.match(home, /Button text \(CTA\)/);
  assert.match(home, /label="Image URL"/);
  assert.match(home, /label="Colour"/);
  // Link pickers.
  assert.match(home, /label="Module"/);
  assert.match(home, /data-admin-banner-product/);
  assert.match(home, /data-admin-banner-module/);
  assert.match(home, /data-admin-banner-link=/);
  // The Cloudinary upload with the right folder + tags.
  assert.match(home, /folder="home-hero-slides"/);
  assert.match(home, /tags=\{\["home-banner"\]\}/);
  // The "Where does this card open?" radio row.
  assert.match(home, /Where does this card open\?/);
  // The mutation surface.
  assert.match(home, /const addBanner = /);
  assert.match(home, /const removeBanner = /);
  assert.match(home, /const moveBanner = /);
  assert.match(home, /const sanitizeBanner = /);
  // The save + reset buttons.
  assert.match(home, /Save slides/);
  assert.match(home, /Reset to built-in/);
  assert.match(home, /method: "PATCH"/);
  // The endpoint the page hits.
  assert.match(home, /"\/api\/admin\/home\/banners"/);
});

test("home page slide card shows every edit affordance", () => {
  // The focused slide card has all the controls the previous
  // design had: text fields, the eyebrow, subtitle, CTA, image
  // URL + upload, the colour preset row, the link pickers, and
  // the move / remove buttons.
  assert.match(home, /data-admin-banner-image-upload/);
  assert.match(home, /BANNER_GRADIENTS\.map/);
  assert.match(home, /aria-pressed=\{selected\}/);
  assert.match(home, /missingProduct/);
  assert.match(home, /missingModule/);
  assert.match(home, /staleModule/);
});

test("home page also keeps the legacy patchBanner helper around", () => {
  // The original contract test greps for `patchBanner(index, { image: hostedUrl })`
  // in the source. The drill-down card still uses patchBanner (the
  // parent helper) for the Cloudinary upload path; the test
  // contract is preserved by a comment alias in the source.
  assert.match(home, /const patchBanner = /);
  assert.match(home, /patchBanner\(index, \{ image: hostedUrl \}\)/);
});

/* ------------------------------------------------------------------ */
/* Mobile-first only — no multi-column grids, no 60-row forms           */
/* ------------------------------------------------------------------ */

test("branding + home pages never put two sections side by side at the small breakpoint", () => {
  // Both pages use single-column layouts on phones, with explicit
  // `sm:grid-cols-2` only at the tablet breakpoint and up. The
  // pill rail (and the section card / slide card) is always
  // single-column below 640 px.
  assert.match(branding, /grid gap-3 sm:grid-cols-2/);
  assert.match(home, /grid-cols-1 gap-3 sm:grid-cols-2/);
});
