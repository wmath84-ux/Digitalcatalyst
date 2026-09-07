import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Part 17 — loading experience, task B: skeleton/shimmer loading states.
 *
 * Source-contract tests pinning (1) the reusable Skeleton primitive and
 * its shared CSS, and (2) the Home product-grid + continue-learning
 * wiring: skeletons render while catalog/progress data loads, use the
 * SAME grid + card geometry as the real content (zero layout shift), and
 * never replace the error state.
 */

const skeleton = fs.readFileSync("src/components/ui/Skeleton.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");
const homeApp = fs.readFileSync("src/home/App.tsx", "utf8");
const productSkeleton = fs.readFileSync("src/home/components/ProductCardSkeleton.tsx", "utf8");
const continueSkeleton = fs.readFileSync("src/home/components/ContinueLearningSkeleton.tsx", "utf8");
const storePage = fs.readFileSync("src/components/StorePage.tsx", "utf8");
const main = fs.readFileSync("src/main.tsx", "utf8");
const productCard = fs.readFileSync("src/home/components/ProductCard.tsx", "utf8");
const continueCard = fs.readFileSync("src/home/components/ContinueLearning.tsx", "utf8");

test("Skeleton primitive exists and renders the shared .dc-skeleton class", () => {
  assert.match(skeleton, /dc-skeleton/);
  assert.match(skeleton, /role="status"/);
  assert.match(skeleton, /aria-busy/);
  // Configurable dimensions/radius — no hard-coded geometry.
  assert.match(skeleton, /width\?:/);
  assert.match(skeleton, /height\?:/);
  assert.match(skeleton, /radius\?:/);
  // No heavy dependency: plain React + the repo's cn() class merge.
  assert.match(skeleton, /from "..\/..\/utils\/cn"/);
  assert.doesNotMatch(skeleton, /framer-motion|@radix/);
});

test("shimmer styles live in index.css and reuse the existing shimmer keyframe", () => {
  assert.match(css, /\.dc-skeleton\s*\{/);
  // Must reuse the app's one shimmer keyframe (defined beside it).
  assert.match(css, /animation:\s*shimmer/);
  assert.match(css, /@keyframes shimmer/);
  // Reduced motion keeps a static surface rather than vanishing.
  const reducedMotionBlock = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf(".dc-skeleton")));
  assert.match(reducedMotionBlock, /\.dc-skeleton/);
});

test("Home reads catalog loading + error state", () => {
  assert.match(homeApp, /loading:\s*catalogLoading/);
  assert.match(homeApp, /error:\s*catalogError/);
});

test("Home product grid shows dimension-matched skeleton cards while loading", () => {
  assert.match(homeApp, /ProductCardSkeleton/);
  assert.match(homeApp, /data-home-grid-loading/);
  assert.match(homeApp, /aria-busy="true"/);
  // Skeleton grid must carry the SAME grid classes as the real grid so
  // card width/columns/gaps are identical (zero layout shift). The class
  // string must therefore appear at least twice: once on the loading
  // grid, once on the real card grid.
  const gridClassMatches = homeApp.match(/grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4/g) || [];
  assert.ok(
    gridClassMatches.length >= 2,
    `expected the shared grid class string on both skeleton and real grids, found ${gridClassMatches.length}`,
  );
});

test("product skeleton card mirrors the real ProductCard geometry", () => {
  // Same glass material as the real card.
  for (const token of ["dc-scene-plate", "radius={24}", "tint={0.25}"]) {
    assert.match(productSkeleton, new RegExp(token.replace(/[{}]/g, "\\$&")));
    assert.match(productCard, new RegExp(token.replace(/[{}]/g, "\\$&")));
  }
  // Same artwork aspect + same text-block padding/title height.
  assert.match(productSkeleton, /aspect-\[4\/3\]/);
  assert.match(productCard, /aspect-\[4\/3\]/);
  assert.match(productSkeleton, /min-h-\[2\.5rem\]/);
  assert.match(productCard, /min-h-\[2\.5rem\]/);
  assert.match(productSkeleton, /p-3/);
});

test("continue-learning skeleton mirrors the Continue Learning card geometry", () => {
  assert.match(homeApp, /ContinueLearningSkeleton/);
  assert.match(homeApp, /data-home-continue-loading/);
  // Thumbnail, progress track and resume-pill placeholders match the
  // real card's h-16 w-16 thumb, h-1.5 track and Resume button.
  assert.match(continueSkeleton, /h-16 w-16/);
  assert.match(continueCard, /h-16 w-16/);
  assert.match(continueSkeleton, /h-1\.5/);
  assert.match(continueCard, /h-1\.5/);
  // Only signed-in learners with progress in flight see the placeholder.
  assert.match(homeApp, /progressLoading/);
});

test("error state still renders on Home — skeletons never mask failures", () => {
  assert.match(homeApp, /catalogError \?/);
  assert.match(homeApp, /border-rose-400\/30/);
});

test("Store page loading state uses skeleton geometry instead of pulse blocks", () => {
  assert.match(storePage, /Skeleton/);
  assert.match(storePage, /data-store-list-loading/);
  // The old fixed-height pulse placeholders are gone.
  assert.doesNotMatch(storePage, /h-72 animate-pulse/);
});

test("app shell is not gated behind catalog/auth data: Home paints its own skeletons", () => {
  // The installed-PWA cold start used to return a blank <main> while the
  // session restored; it must now render the Home shell directly.
  assert.match(main, /showHomeShellImmediately/);
  assert.doesNotMatch(main, /aria-label="Opening app" \/>/);
  // The admin exemption from learner catalog gating stays intact.
  assert.match(main, /user\.role !== "admin" && catalogLoading/);
});
