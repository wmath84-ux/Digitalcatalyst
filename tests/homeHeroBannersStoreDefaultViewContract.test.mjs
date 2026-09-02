// tests/homeHeroBannersStoreDefaultViewContract.test.mjs
//
// Two user-facing contracts:
//
//   1. STORE PAGE — the product view-style dropdown (Grid / Cards / Mixed)
//      must default to the SECOND option ("Cards" / rectangular list view).
//
//   2. HOME HERO SLIDES — the sliding cards on the home page must be fully
//      admin-editable: text, image, colour, and a link target that either
//      opens a real product from the Products module or opens ONE specific
//      module inside a product (deep link via ?module=).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(rel, "utf8");

const storePage = read("src/components/StorePage.tsx");
const homeApp = read("src/home/App.tsx");
const heroCarousel = read("src/home/components/HeroCarousel.tsx");
const bannerTypes = read("src/home/types.ts");
const bannerGradients = read("src/home/data/bannerGradients.ts");
const homeBannerHook = read("src/home/hooks/useHomeBanners.ts");
const main = read("src/main.tsx");
const courseRouteGuard = read("src/components/CourseRouteGuard.tsx");
const coursePlayer = read("src/CoursePlayerApp.tsx");
const adminClient = read("src/lib/admin/client.ts");
const adminApp = read("src/admin/AdminApp.tsx");
const adminNav = read("src/components/admin/nav.ts");
const adminHomePage = read("src/admin/pages/HomePage.tsx");
const rules = read("firestore.rules");

/* ------------------------------------------------------------------ */
/* 1. Store page default view = second option (Cards / list)           */
/* ------------------------------------------------------------------ */

test("store view options order is Grid, Cards, Mixed", () => {
  // The dropdown renders VIEW_OPTIONS in declaration order.
  assert.match(storePage, /const VIEW_OPTIONS[\s\S]*?\{ mode: "grid"[\s\S]*?\{ mode: "list"[\s\S]*?\{ mode: "mixed"/);
});

test("store page defaults to the second view option (list / Cards)", () => {
  assert.match(storePage, /useState<ViewMode>\("list"\)/);
  // The old grid default must be gone.
  assert.doesNotMatch(storePage, /useState<ViewMode>\("grid"\)/);
});

/* ------------------------------------------------------------------ */
/* 2a. Shared model + live data path                                    */
/* ------------------------------------------------------------------ */

test("banner type carries admin link target (product / module)", () => {
  assert.match(bannerTypes, /export type BannerLinkType = "none" \| "product" \| "module"/);
  assert.match(bannerTypes, /linkType\?: BannerLinkType/);
  assert.match(bannerTypes, /productId\?: string/);
  assert.match(bannerTypes, /moduleId\?: string/);
});

test("banner accent presets live as literal class strings (Tailwind-compiled)", () => {
  assert.match(bannerGradients, /export const BANNER_GRADIENTS/);
  // Phase A7: the three built-in presets are single translucent accents over
  // the pack GlassSurface — the old three-stop gradients only survive as a
  // legacy map so previously saved banners keep their colour.
  assert.match(bannerGradients, /classes: "bg-violet-500\/30"/);
  assert.match(bannerGradients, /classes: "bg-orange-500\/30"/);
  assert.match(bannerGradients, /classes: "bg-sky-500\/30"/);
  assert.match(bannerGradients, /"from-violet-600 via-fuchsia-500 to-pink-500": "bg-violet-500\/30"/);
  assert.doesNotMatch(bannerGradients, /classes: "from-/);
  assert.match(heroCarousel, /<GlassSurface\s+ref=\{trackRef\}/);
  assert.doesNotMatch(heroCarousel, /bg-gradient-to-|blur-3xl|dc-glass\b/);
});

test("normalizeBanner degrades broken links to none", () => {
  assert.match(bannerGradients, /linkTypeRaw === "product" \|\| linkTypeRaw === "module"/);
  assert.match(bannerGradients, /linkType !== "none" && productId/);
  assert.match(bannerGradients, /linkType === "module" && productId && moduleId/);
});

test("home page loads live admin banners with built-in fallback", () => {
  assert.match(homeBannerHook, /export const HOME_BANNERS_DOC_ID = "homeBanners"/);
  assert.match(homeBannerHook, /onSnapshot\(/);
  assert.match(homeBannerHook, /builtInBanners/);
  assert.match(homeBannerHook, /normalizeBanner/);
  assert.match(homeApp, /import \{ useHomeBanners \} from "\.\/hooks\/useHomeBanners"/);
  assert.match(homeApp, /const \{ banners \} = useHomeBanners\(\)/);
  assert.match(homeApp, /<HeroCarousel banners=\{banners\} onOpen=\{handleBannerOpen\} \/>/);
});

test("home banner tap routes to product page or specific module", () => {
  assert.match(homeApp, /const handleBannerOpen = \(banner: Banner\)/);
  assert.match(homeApp, /if \(banner\.linkType === "product"\)/);
  assert.match(homeApp, /onNavigateToProduct\(mapped\)/);
  // Module deep link goes through the course route with ?module=.
  assert.match(homeApp, /#\/course\/\$\{encodeURIComponent\(catalogProduct\.id\)\}/);
  assert.match(homeApp, /module=\$\{encodeURIComponent\(moduleId\)\}/);
  // Stale product ids (removed from the catalog) are inert, never crash.
  assert.match(homeApp, /if \(!catalogProduct\) return/);
});

test("carousel fires tap only for linked slides and never after a swipe", () => {
  assert.match(heroCarousel, /onOpen\?: \(banner: Banner\) => void/);
  assert.match(heroCarousel, /banner\.linkType !== "none"/);
  assert.match(heroCarousel, /suppressTapRef\.current = true/);
  assert.match(heroCarousel, /if \(suppressTapRef\.current\)/);
  assert.match(heroCarousel, /data-banner-linked/);
});

/* ------------------------------------------------------------------ */
/* 2b. Course deep link (?module=) → player opens at that module       */
/* ------------------------------------------------------------------ */

test("course route parses the ?module= deep-link parameter", () => {
  assert.match(main, /const selectedCourseModuleId = useMemo\(/);
  assert.match(main, /new URLSearchParams\(query\)\.get\("module"\)/);
  assert.match(main, /initialModuleId=\{selectedCourseModuleId \|\| undefined\}/);
});

test("route guard forwards initialModuleId into the player", () => {
  assert.match(courseRouteGuard, /initialModuleId\?: string/);
  assert.match(courseRouteGuard, /<CoursePlayerApp[\s\S]*?initialModuleId=\{initialModuleId\}/);
});

test("course player starts at the linked module when accessible", () => {
  assert.match(coursePlayer, /initialModuleId\?: string/);
  assert.match(coursePlayer, /const findModuleById = /);
  assert.match(coursePlayer, /const firstAccessibleFileInModule = /);
  assert.match(coursePlayer, /const deepLinkFileId = useMemo\(/);
  // The deep link wins over "first lesson" and over the saved resume position
  // (the resume effect bails whenever a deep-link target is present, and the
  // first-lesson effect prefers the deep-linked file).
  assert.match(coursePlayer, /const deep = deepLinkFileId \? files\.find/);
  assert.match(coursePlayer, /if \(!lastOpenedFileId \|\| deepLinkFileId \|\| userSelectedRef\.current\) return/);
});

/* ------------------------------------------------------------------ */
/* 2c. Admin side — API, page, nav, storage                            */
/* ------------------------------------------------------------------ */

test("admin API exposes /api/admin/home/banners on settings/homeBanners", () => {
  assert.match(adminClient, /async function homeBannersRequest\(init\?:RequestInit\)/);
  assert.match(adminClient, /doc\(db,"settings","homeBanners"\)/);
  assert.match(adminClient, /isDefault:true/);
  assert.match(adminClient, /"\/api\/admin\/home\/banners"\)result=await homeBannersRequest\(init\)/);
});

test("admin app registers the home slides page and nav entry", () => {
  assert.match(adminApp, /import HomePage from "\.\/pages\/HomePage"/);
  assert.match(adminApp, /path === "\/admin\/home"\) return <HomePage \/>/);
  assert.match(adminNav, /href: "\/admin\/home", label: "Home · Hero Slides"/);
});

test("admin page edits every field and both link kinds", () => {
  assert.match(adminHomePage, /adminFetch<\{ banners: unknown\[\]; isDefault: boolean \}>\("\/api\/admin\/home\/banners"\)/);
  // Text + design fields.
  assert.match(adminHomePage, /Eyebrow \(small tag\)/);
  assert.match(adminHomePage, /label="Title"/);
  assert.match(adminHomePage, /label="Subtitle"/);
  assert.match(adminHomePage, /Button text \(CTA\)/);
  assert.match(adminHomePage, /label="Image URL"/);
  // The admin can upload their OWN image for a slide (same Cloudinary flow
  // as product images) — the hosted URL lands in the Image URL field.
  assert.match(adminHomePage, /CloudinaryImageUploadField/);
  assert.match(adminHomePage, /folder="home-hero-slides"/);
  assert.match(adminHomePage, /onUploaded=\{\(hostedUrl\) => patchBanner\(index, \{ image: hostedUrl \}\)\}/);
  assert.match(adminHomePage, /label="Colour"/);
  // Product + specific module pickers sourced from the Products module.
  assert.match(adminHomePage, /"\/api\/admin\/products"/);
  assert.match(adminHomePage, /Product \(from Products module\)/);
  assert.match(adminHomePage, /label="Module"/);
  assert.match(adminHomePage, /data-admin-banner-module/);
  // List management: add, remove, reorder, reset to built-in, save.
  assert.match(adminHomePage, /const addBanner = /);
  assert.match(adminHomePage, /const removeBanner = /);
  assert.match(adminHomePage, /const moveBanner = /);
  assert.match(adminHomePage, /Reset to built-in/);
  assert.match(adminHomePage, /method: "PATCH"/);
  // Saved output is sanitised (no undefined fields, no broken links).
  assert.match(adminHomePage, /const sanitizeBanner = /);
});

test("settings document stays public-read / admin-write in firestore.rules", () => {
  assert.match(rules, /match \/settings\/\{settingId\} \{[\s\S]*?allow read: if true;[\s\S]*?allow write: if isAdmin\(\);/);
});
