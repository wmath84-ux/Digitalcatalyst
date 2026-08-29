// tests/tabletPageScrollContract.test.mjs
//
// Contract for the reported tablet bug: on a tablet the side rail swapped the
// pages fine, but no page could be scrolled at all.
//
// The pages are built like a phone — `[data-app-frame]` is a `flex flex-col`
// column with an inner `<main class="flex-1 overflow-y-auto">`, and Tailwind's
// `sm:overflow-hidden` clips the frame from 640 px up. Below 640 px the frame
// is pinned to `height: 100dvh`, so that `<main>` has a bounded height and a
// real scroll range. From 640 px up the tablet/desktop bands moved the frame to
// `height: auto; min-height: 100dvh`, so the `<main>` grew with its content and
// became a scroller with nothing to scroll. A mouse wheel chains out of that box
// (desktop kept working); a touch gesture does not — which is why the tablet was
// frozen. PR #486 fixed exactly this for Revision by re-binding it to the
// viewport; this contract keeps the same guarantee for the whole app:
//
//   1. Desktop shell (desktop, tablet landscape, viewport ≥ 960 px): the shell
//      is pinned to the viewport and `[data-desktop-content]` is THE scroller.
//      Pages inside it release the phone clipping so their content flows into
//      that single scroller — never a second competing one.
//   2. 640–959 px without the shell (tablet portrait): the frame is bound to
//      the viewport, so whichever box holds the overflow has a real range.
//   3. Below 640 px: the original phone model, untouched.
//   4. The scrollers show a scrollbar (the app-wide `::-webkit-scrollbar {
//      display: none }` hides every affordance, which is what made a
//      scrollable page look dead) and never narrow `touch-action`, because the
//      pages carry horizontal carousels an ancestor must not veto.
//
// Pure code-shape — no React, no DOM, no browser.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/index.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const shell = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every declaration block written for exactly `selector`, in source order. */
function blocksFor(selector) {
  const out = [];
  const re = new RegExp(`${escape(selector)}\\s*\\{([^}]*)\\}`, "g");
  let m;
  while ((m = re.exec(css))) out.push(m[1]);
  return out;
}

/** At least one block for `selector` declares every pattern in `sources`. */
function declares(selector, ...sources) {
  const blocks = blocksFor(selector);
  assert.ok(blocks.length, `expected at least one "${selector}" block`);
  for (const source of sources) {
    const hit = blocks.find((b) => new RegExp(source).test(b));
    assert.ok(hit, `"${selector}" must declare ${source} (saw: ${blocks.join(" | ")})`);
  }
}

const SHELL_FRAME = ".dc-desktop-shell [data-desktop-content] > main:not(:has([data-revision-app])) [data-app-frame]";
const SHELL_INNER = `${SHELL_FRAME} :is(main, [data-profile-content], [data-pdp-scroll])`;
const TABLET_FRAME =
  'html:not([data-tablet-landscape-desktop="true"]) body:not(:has(.dc-desktop-shell)) [data-app-frame]:not([data-revision-frame])';

test("the shell is pinned to the viewport so only its content scrolls", () => {
  declares(".dc-desktop-shell", "height:\\s*100dvh", "overflow:\\s*hidden");
  // The rail fills the pinned shell instead of adding a second 100dvh box.
  declares(".dc-desktop-shell [data-desktop-rail]", "height:\\s*100%");
});

test("the shell content row is a real touch scroller", () => {
  const selector = ".dc-desktop-shell [data-desktop-content]";
  declares(selector, "overflow-y:\\s*auto", "overscroll-behavior:\\s*contain", "-webkit-overflow-scrolling:\\s*touch", "scrollbar-gutter:\\s*stable");
  // `touch-action` on a shared scroller would veto horizontal panning for every
  // descendant: the hero carousel, the category chips, the PDP gallery.
  assert.ok(
    blocksFor(selector).every((b) => !/touch-action/.test(b)),
    "never narrow touch-action on the shell scroller",
  );
  // The CSS hangs off markup the shell actually renders.
  assert.match(shell, /data-desktop-content/);
  assert.match(shell, /flex min-h-0 flex-1/);
});

test("pages inside the shell release the phone clipping that froze the tablet", () => {
  declares(SHELL_FRAME, "overflow:\\s*visible\\s*!important", "height:\\s*auto\\s*!important", "min-height:\\s*0\\s*!important", "max-height:\\s*none\\s*!important");
  // …and so does the page's own scroller, which is what had the zero range.
  declares(SHELL_INNER, "overflow:\\s*visible\\s*!important", "min-height:\\s*0\\s*!important");
  // The `min-h-screen` + `sm:py-6` phone wrapper would otherwise add ~112 px of
  // phantom scroll (top bar + gutters) under the shell.
  declares(".dc-desktop-shell .dc-app-shell", "min-height:\\s*0", "padding:\\s*0");
  declares(".dc-desktop-shell [data-profile-page]", "min-height:\\s*0", "padding:\\s*0");
});

test("Revision keeps one scroller instead of getting a second one", () => {
  // The opt-out sits on the shell column, so the revision frame stays bounded
  // and `[data-revision-page-main]` remains the only surface it scrolls in.
  assert.match(css, /main:not\(:has\(\[data-revision-app\]\)\)\s*\[data-app-frame\]/, "the shell release must skip the revision app");
  assert.match(
    css,
    /\[data-app-frame\]:not\(\[data-revision-frame\]\)\s*\{[^}]*height:\s*100dvh/,
    "the tablet-portrait binding must skip the revision frame too",
  );
  // …and the feature fills the shell row instead of the raw viewport, so the
  // top bar + gutters cannot push its bottom edge (and a second scroller) in.
  const revision = ".dc-desktop-shell [data-desktop-content] > main > [data-revision-app]";
  declares(revision, "height:\\s*100%\\s*!important", "max-height:\\s*100%\\s*!important");
});

test("tablet portrait (640–959 px, no shell) binds the frame to the viewport", () => {
  const start = css.indexOf("@media (min-width: 640px) and (max-width: 959px)");
  assert.ok(start > 0, "expected a 640–959 px band for the frame binding");
  const band = css.slice(start);
  assert.match(
    band,
    /html:not\(\[data-tablet-landscape-desktop="true"\]\)\s+body:not\(:has\(\.dc-desktop-shell\)\)/,
    "the binding must step aside the moment the shell renders",
  );
  const block = new RegExp(`${escape(TABLET_FRAME)}\\s*\\{([^}]*)\\}`).exec(band)?.[1];
  assert.ok(block, "expected the tablet-portrait frame block");
  for (const source of [/height:\s*100dvh/, /max-height:\s*100dvh/, /min-height:\s*0/, /overflow-y:\s*auto/, /overscroll-behavior:\s*contain/, /-webkit-overflow-scrolling:\s*touch/]) {
    assert.match(block, source, `the tablet frame must declare ${source}`);
  }
  // The page's own scroller keeps working — it only ever lacked a bounded parent.
  assert.match(
    band,
    new RegExp(`${escape(TABLET_FRAME)} > main\\s*\\{[^}]*min-height:\\s*0`),
    "the inner main must be allowed to shrink so it scrolls",
  );
});

test("the scroll model below the tablet band is untouched", () => {
  // The phone band keeps its own pin — the new blocks extend it, they do not
  // replace it.
  const phone = css.slice(css.indexOf("@media (max-width: 639px)"));
  assert.match(phone, /\[data-app-frame\]\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/);
});

test("the scrollers are visible — a tablet page must look scrollable", () => {
  assert.match(css, /\.dc-desktop-shell \[data-desktop-content\]::-webkit-scrollbar\s*\{[^}]*display:\s*block/);
  assert.match(css, /\[data-app-frame\]:not\(\[data-revision-frame\]\)::-webkit-scrollbar\s*\{[^}]*display:\s*block/);
  // On these pages the frame's own <main> may be the surface that moves, so it
  // opts out of the reset too.
  assert.match(css, /\[data-app-frame\]:not\(\[data-revision-frame\]\) > main::-webkit-scrollbar\s*\{[^}]*display:\s*block/);
  // The app-wide reset stays: the overrides above are how the wide layouts
  // escape it, while phone pages keep the chrome-less look.
  assert.match(css, /::-webkit-scrollbar\s*\{\s*display:\s*none/);
});

test("rows that used to stick to the document are re-anchored to the shell", () => {
  // A page's sticky row now sticks to the shell's scrollport, which already
  // starts under the global top bar — so the phone's 68/72/80 px offsets must
  // release (search) or collapse to the new top edge (My Day's side rail).
  declares(".dc-desktop-shell [data-search-bar]", "position:\\s*static\\s*!important");
  declares(".dc-desktop-shell [data-myday-content] > aside", "top:\\s*0");
});

test("the new blocks win over the bands they replace (source order)", () => {
  const fix = css.indexOf(SHELL_FRAME);
  assert.ok(fix > 0, "expected the shell release block");
  // This band pins the profile frame to 100dvh with a clip; under the shell
  // that is exactly the dead scroller being removed, so it must come first.
  const profilePin = css.indexOf("[data-profile-page] [data-app-frame] { height: 100dvh");
  assert.ok(profilePin > 0, "expected the profile 100dvh pin");
  assert.ok(profilePin < fix, "the shell release must come after the profile pin");
  const revisionPin = css.indexOf(".dc-desktop-shell:has([data-revision-app]) {");
  assert.ok(revisionPin > 0 && revisionPin < fix, "and after the revision shell pin it must not fight");
});
