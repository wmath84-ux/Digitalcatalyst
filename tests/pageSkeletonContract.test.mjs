// tests/pageSkeletonContract.test.mjs
//
// Part 17 (loading experience) extension — page-level dummy layouts:
//
//   Every app page that loads data must show its own STRUCTURE (a dummy
//   layout of the page's components) the moment the learner switches to it,
//   instead of a blank screen or a bare spinner. The real content replaces
//   the skeleton when it finishes loading; an error state is never masked.
//
//   · a shared <PageSkeleton /> primitive renders header strip + hero/body
//     blocks + the footer dock clearance with the ONE Skeleton shimmer;
//   · main.tsx maps each route (home / store / product / my-day / revision /
//     subscription / profile / flowpath / notifications / search) to its own
//     variant, and uses it for the auth-restore path AND the course deep-link
//     catalog-wait path (the two places that used to show a bare spinner or
//     an error screen while data streamed in).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

const main = read("src/main.tsx");
const pageSkeleton = read("src/components/PageSkeleton.tsx");
const skeletonPrimitive = read("src/components/ui/Skeleton.tsx");
const css = read("src/index.css");

test("PageSkeleton reuses the ONE Skeleton primitive (shared shimmer)", () => {
  assert.match(pageSkeleton, /import Skeleton from "\.\/ui\/Skeleton"/);
  assert.match(pageSkeleton, /data-page-skeleton=""/);
  assert.match(pageSkeleton, /aria-busy="true"/);
  // It composes the existing primitive, never a bespoke pulse block.
  assert.doesNotMatch(pageSkeleton, /animate-pulse/);
  assert.match(skeletonPrimitive, /dc-skeleton/);
});

test("PageSkeleton mirrors the page anatomy: header, body blocks, footer dock", () => {
  // Header strip + body blocks are declarative.
  assert.match(pageSkeleton, /header\?: boolean/);
  assert.match(pageSkeleton, /footer\?: boolean/);
  assert.match(pageSkeleton, /hero\?: boolean/);
  assert.match(pageSkeleton, /blocks\?: PageSkeletonBlock\[\]/);
  // The footer placeholder reserves the always-visible dock's capsule.
  assert.match(pageSkeleton, /width=\{296\} height=\{64\} radius=\{999\}/);
});

test("every data page maps to its own skeleton variant in main.tsx", () => {
  for (const key of [
    "home",
    "store",
    "product",
    "myday",
    "revision",
    "subscription",
    "profile",
    "flowpath",
    "notifications",
    "search",
  ]) {
    assert.ok(
      new RegExp(`${key}: \\[`).test(main),
      `missing skeleton variant block for "${key}"`,
    );
  }
  // The route resolver picks the variant from the hash.
  assert.match(main, /const pageSkeletonVariant = \(hash: string\) => \{/);
  assert.match(main, /if \(hash\.startsWith\(PRODUCT_HASH\)\) return "product"/);
  assert.match(main, /if \(hash\.startsWith\(MY_DAY_HASH\)\) return "myday"/);
  assert.match(main, /if \(hash\.startsWith\(REVISION_HASH\)\) return "revision"/);
  assert.match(main, /if \(hash\.startsWith\(FLOWPATH_HASH\)\) return "flowpath"/);
});

test("the auth-restore path paints the page skeleton, not a bare spinner", () => {
  // The old `animate-spin` session screen is gone from the route tree.
  assert.doesNotMatch(main, /animate-spin rounded-full border-2 border-white\/20 border-t-violet-400/);
  // The skeleton renders for the requested page while the session restores.
  assert.match(main, /if \(protectedRoutePending\) \{/);
  assert.match(main, /pageSkeleton\(hash\)/);
});

test("the course deep-link waits for the catalog with a skeleton, then errors honestly", () => {
  // While the catalog streams in, the course route shows the skeleton…
  assert.match(main, /if \(catalogLoading\) return <main className="min-h-\[100dvh\] px-5 py-6">\{pageSkeleton\(hash\)\}<\/main>;/);
  // …and a genuinely unknown id still gets the explicit not-found screen.
  assert.match(main, /<InvalidCheckout onBack=\{\(\) => \{ window\.location\.hash = `\$\{STORE_HASH\}\/purchases`; \}\} \/>/);
});

test("skeleton shimmer styles still live once in index.css", () => {
  assert.match(css, /\.dc-skeleton\s*\{/);
  assert.match(css, /@keyframes shimmer/);
});
