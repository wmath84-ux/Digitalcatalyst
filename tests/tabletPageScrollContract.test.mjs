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
//   2. 640–959 px without the shell (tablet portrait): the phone model is kept
//      honest — a frame with a direct `<main>` is clipped so the header + pill
//      stay pinned and that `<main>` scrolls; a frame with no direct `<main>`
//      (My Day) scrolls itself. The pin has a `100vh` fallback (written via
//      `@supports (height: 100dvh)` so lightningcss does not delete it).
//   3. Below 640 px: the original phone model, untouched.
//   4. The scrollers show a scrollbar (the app-wide `::-webkit-scrollbar {
//      display: none }` hides every affordance, which is what made a
//      scrollable page look dead) and never narrow `touch-action`, because the
//      pages carry horizontal carousels an ancestor must not veto.
//   Additionally: the landscape phone freeze and the "rotate your phone"
//   overlay are gated on `data-phone-device` (see appOrientation.ts), so a
//   tablet window in the narrow landscape band keeps normal panning; and there
//   is no non-passive document-level `touchmove` listener (disablePageZoom.ts)
//   that would make touch scrolling wait on the main thread.
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
  const revision = ".dc-desktop-shell [data-desktop-content] > main [data-revision-app]";
  declares(revision, "height:\\s*100%\\s*!important", "max-height:\\s*100%\\s*!important");
});

test("tablet portrait (640–959 px, no shell) keeps the phone model: <main> scrolls, header + pill stay pinned", () => {
  const start = css.indexOf("@media (min-width: 640px) and (max-width: 959px)");
  assert.ok(start > 0, "expected a 640–959 px band for the frame binding");
  const band = css.slice(start);
  assert.match(
    band,
    /html:not\(\[data-tablet-landscape-desktop="true"\]\)\s+body:not\(:has\(\.dc-desktop-shell\)\)/,
    "the binding must step aside the moment the shell renders",
  );

  // Frame WITH a direct <main> (Home, Store, PDP, Search, Profile, …): the
  // frame is clipped so the phone header and the bottom nav pill (both
  // children of the frame) stay pinned, and that <main> becomes the scroller.
  const hasMain = TABLET_FRAME + ":has(> main)";
  const frameBlock = new RegExp(`${escape(hasMain)}\\s*\\{([^}]*)\\}`).exec(band)?.[1];
  assert.ok(frameBlock, "expected the :has(> main) frame block");
  assert.match(frameBlock, /overflow:\s*hidden/, "the :has(> main) frame must clip so header + pill stay pinned");
  assert.match(frameBlock, /min-height:\s*0/);

  // …and the page's own scroller is what moves (it only lacked a bounded parent).
  const mainScroller = new RegExp(`${escape(hasMain)} > main\\s*\\{([^}]*)\\}`).exec(band)?.[1];
  assert.ok(mainScroller, "expected the :has(> main) > main scroller block");
  for (const source of [/overflow-y:\s*auto/, /min-height:\s*0/, /overscroll-behavior:\s*contain/, /-webkit-overflow-scrolling:\s*touch/]) {
    assert.match(mainScroller, source, `the inner <main> scroller must declare ${source}`);
  }

  // Frame WITHOUT a direct <main> (e.g. My Day, whose main is nested inside
  // `[data-myday-content]`): the frame itself scrolls.
  const noMain = TABLET_FRAME + ":not(:has(> main))";
  const noMainBlock = new RegExp(`${escape(noMain)}\\s*\\{([^}]*)\\}`).exec(band)?.[1];
  assert.ok(noMainBlock, "expected the :not(:has(> main)) frame block");
  assert.match(noMainBlock, /overflow-y:\s*auto/, "the no-<main> frame must be the scroller");
  assert.match(noMainBlock, /min-height:\s*0/);
});

test("the tablet portrait pin has a 100vh fallback for engines without dvh", () => {
  // Every pin is written at 100vh and upgraded to 100dvh only inside
  // `@supports (height: 100dvh)` — a bare `height: 100dvh` would drop on
  // engines without dynamic-viewport units, leaving the frame `height: auto`
  // and resurrecting the zero-range dead scroller.
  assert.match(css, /@supports \(height:\s*100dvh\)/);
  // The base (no-dvh) frame pin keeps a plain 100vh height/max-height.
  const hasMain = TABLET_FRAME + ":has(> main)";
  const frameBlock = new RegExp(`${escape(hasMain)}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  assert.ok(frameBlock, "expected the :has(> main) frame block");
  assert.match(frameBlock, /height:\s*100vh/, "the frame must declare a 100vh height fallback");
  assert.match(frameBlock, /max-height:\s*100vh/, "the frame must declare a 100vh max-height fallback");
  // The dvh upgrade inside @supports re-pins the same frame selectors.
  assert.match(
    css,
    /@supports \(height:\s*100dvh\)[^{]*\{[^}]*@media[^}]*:has\(> main\)[^}]*height:\s*100dvh/,
    "the @supports block must upgrade the frame pin to 100dvh",
  );
  // The desktop shell pin gets the same fallback.
  assert.match(css, /\.dc-desktop-shell\s*\{\s*height:\s*100vh/);
  assert.match(css, /@supports \(height:\s*100dvh\)[^{]*\{[^}]*\.dc-desktop-shell[^}]*height:\s*100dvh/);
});

test("the scroll model below the tablet band is untouched", () => {
  // The phone band keeps its own pin — the new blocks extend it, they do not
  // replace it.
  const phone = css.slice(css.indexOf("@media (max-width: 639px)"));
  assert.match(phone, /\[data-app-frame\]\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/);
});

test("the scrollers are visible — a tablet page must look scrollable", () => {
  assert.match(css, /\.dc-desktop-shell \[data-desktop-content\]::-webkit-scrollbar\s*\{[^}]*display:\s*block/);
  // On the tablet-portrait pages the frame's own <main> is the surface that
  // moves, so it opts out of the reset — both the direct-<main> scroller and
  // the frame-as-scroller (My Day) variant.
  assert.match(css, /\[data-app-frame\]:not\(\[data-revision-frame\]\):has\(> main\) > main::-webkit-scrollbar\s*\{[^}]*display:\s*block/);
  assert.match(css, /\[data-app-frame\]:not\(\[data-revision-frame\]\):not\(:has\(> main\)\)::-webkit-scrollbar\s*\{[^}]*display:\s*block/);
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

test("the landscape touch freeze is gated on data-phone-device, so a tablet window never freezes", () => {
  // The width-gated phone lock must NOT freeze a tablet window: `touch-action`
  // intersects down the ancestor chain, so an ungated `body { touch-action:
  // none }` would kill every scroller the tablet model creates.
  assert.match(css, /html\[data-phone-device="true"\]:not\(\[data-course-player-active="true"\]\) body\s*\{\s*touch-action:\s*none/);
  // …and a tablet window in the same narrow landscape band keeps normal panning.
  assert.match(css, /html:not\(\[data-phone-device="true"\]\) body\s*\{\s*touch-action:\s*auto/);
  // The signal comes from appOrientation.ts (publishes data-phone-device).
  const orientation = fs.readFileSync("src/utils/appOrientation.ts", "utf8");
  assert.match(orientation, /setAttribute\("data-phone-device", "true"\)/);
  assert.match(orientation, /removeAttribute\("data-phone-device"\)/);
});

test("no non-passive document-level touchmove competes with the scrollers", () => {
  // A non-passive document touchmove makes every scroll wait on the main thread
  // and, with `touches.length >= 2`, swallows the gesture — competing with the
  // compositor-driven touch scroll of `[data-desktop-content]` and the tablet
  // <main> scrollers.
  const zoom = fs.readFileSync("src/utils/disablePageZoom.ts", "utf8");
  assert.doesNotMatch(zoom, /addEventListener\("touchmove"/);
  assert.doesNotMatch(zoom, /removeEventListener\("touchmove"/);
  // The opt-out surface for image viewers survives.
  assert.match(zoom, /data-pinch-zoom=\\"enabled\\"/);
  // Pinch-zoom is still blocked app-wide by the root touch-action.
  assert.match(css, /#root\s*\{\s*[^}]*touch-action:\s*pan-x pan-y/);
});

test("the horizontal overflow guard lives on body only, never on the root", () => {
  // `overflow-x: hidden` on html forces the root's overflow-y to auto (no `clip`
  // fallback), turning the document into a competing scroll container. The guard
  // is therefore on body, and html is left `overflow-y: visible`.
  assert.match(css, /body\s*\{\s*overflow-x:\s*hidden;\s*overflow-x:\s*clip/);
  assert.match(css, /html\s*\{\s*overflow-y:\s*visible/);
  assert.doesNotMatch(css, /html,\s*body\s*\{\s*overflow-x:\s*hidden/);
});

test("the phone band gives My Day's nested <main> a real scroller", () => {
  // My Day's <main> sits inside `[data-myday-content]`, NOT directly under
  // the frame, so the direct-child binding (`[data-app-frame] > main`) never
  // reached it: on a phone the frame's `overflow: hidden` clip left the
  // whole page with no scroll container — the reported "My Day cannot
  // scroll on mobile". The phone band must bind the content row to the
  // pinned frame and scroll its nested <main>, matching the phone model of
  // every other page (site header + bottom pill pinned, body scrolls).
  const phone = css.slice(css.indexOf("@media (max-width: 639px)"));

  // The content row stops reserving its intrinsic (unbounded) height.
  assert.match(
    phone,
    /\[data-app-frame\] \[data-myday-content\]\s*\{\s*min-height:\s*0/,
    "the My Day content row must be height-bounded inside the pinned frame",
  );

  // The nested <main> becomes the touch scroller.
  const scrollerBlock = new RegExp(
    `${escape("[data-app-frame] [data-myday-content] > main")}\\s*\\{([^}]*)\\}`,
  ).exec(phone)?.[1];
  assert.ok(scrollerBlock, "expected a [data-app-frame] [data-myday-content] > main block in the phone band");
  for (const source of [
    /overflow-y:\s*auto/,
    /min-height:\s*0/,
    /overscroll-behavior:\s*contain/,
    /-webkit-overflow-scrolling:\s*touch/,
  ]) {
    assert.match(scrollerBlock, source, `the My Day phone scroller must declare ${source}`);
  }

  // The phone model's original frame pin is untouched (this band extends it).
  assert.match(phone, /\[data-app-frame\]\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/);
});
