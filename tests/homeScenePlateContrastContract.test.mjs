// tests/homeScenePlateContrastContract.test.mjs
//
// Contract for the 2026-09-06 owner pass on #/home:
//
//   "home page per jo comment dikh rahe hain, vah glass component jyada sahi
//    dikh raha hai — uski sensitivity vahi home page per acche se apply karo
//    taki sab kuch clearly dikhe. Abhi maximum jagah ek hi tarah ki sensitivity
//    use ki ja rahi hai, jiski vajah se text clearly visible nahin hai."
//
// What the review/comment rail had that nothing else on Home had was NOT a
// different sensitivity — Home's header, hero frame, product tiles and category
// segment already ask for the pinned docs config (tint 0.25 · blur 0 ·
// radius 24, src/lib/glassDocs.ts). It was the CSS contrast plate that
// `.dc-glass-card` gets in src/glass.css: a dark translucent backing, a real
// rim, a lift off the scene and a lifted ink floor. Over the Winter Wonderland
// background — whose snow ground and lit lake are bright white across the
// bottom band of the viewport — a 10% tint leaves white ink unreadable.
//
// So the plate became a shared material with a second hook, and Home opted in:
//
//   .dc-glass-card        the app GlassCard wrapper (unchanged — this is the
//                         material the owner approved, so its numbers are
//                         pinned below and may not drift)
//   .dc-scene-plate       the same material on the pack surfaces that are not
//                         cards (hero frame, product tile, category segment,
//                         search-suggestions popover)
//   .dc-scene-plate--bar  full-bleed bar variant: paints the element's own box
//                         (the Home header's animated padding band + bottom
//                         radius live OUTSIDE the GlassSurface it wraps)
//   .dc-scene-field       the search pill's rim / placeholder ink inside a bar
//   .dc-scene-ink         copy with no surface under it at all (section
//                         headings, "View All", counters, empty states)
//
// Rules this contract holds the line on:
//   1. the material stays CSS in src/glass.css, gated on html[data-glass="on"]
//      — never a forked vendored component, so `?glass=off` restores the
//      published material byte-for-byte;
//   2. one sensitivity: no Home surface re-tunes tint/blur/radius to "fix"
//      contrast — the plate is the fix;
//   3. the vendored registry items stay byte-comparable (no edits in
//      src/components/ui/glass*.tsx);
//   4. the frozen footer dock stays frozen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const css = read("src/glass.css");
const header = read("src/home/components/Header.tsx");
const hero = read("src/home/components/HeroCarousel.tsx");
const tile = read("src/home/components/ProductCard.tsx");
const categories = read("src/home/components/CategoryNav.tsx");
const home = read("src/home/App.tsx");
const reviews = read("src/home/components/Reviews.tsx");
const continueLearning = read("src/home/components/ContinueLearning.tsx");

/* ------------------------------------------------------------------ */
/* 1. The plate is one shared material, declared once                  */
/* ------------------------------------------------------------------ */

test("the card plate and the scene plate are the same rules, not two copies", () => {
  // Every layer rule lists BOTH hooks, so the numbers cannot drift apart. The
  // card selector stays first and verbatim: Wave 3's contract greps for it.
  for (const layer of [
    /html\[data-glass="on"\] :where\(\.dc-glass-card\) > div\[aria-hidden\]:nth-of-type\(2\),\s*\nhtml\[data-glass="on"\] :where\(\.dc-scene-plate\) > div\[aria-hidden\]:nth-of-type\(2\)/,
    /html\[data-glass="on"\] :where\(\.dc-glass-card\) > div\[aria-hidden\]:nth-of-type\(3\),\s*\nhtml\[data-glass="on"\] :where\(\.dc-scene-plate\) > div\[aria-hidden\]:nth-of-type\(3\)/,
    /html\[data-glass="on"\] :where\(\.dc-glass-card\) > div\[aria-hidden\]:nth-of-type\(4\),\s*\nhtml\[data-glass="on"\] :where\(\.dc-scene-plate\) > div\[aria-hidden\]:nth-of-type\(4\)/,
    /html\[data-glass="on"\] :where\(\.dc-glass-card\),\s*\nhtml\[data-glass="on"\] :where\(\.dc-scene-plate\) \{\s*\n\s*box-shadow:/,
    /html\[data-glass="on"\] :where\(\.dc-glass-card\),\s*\nhtml\[data-glass="on"\] :where\(\.dc-scene-plate\) \{\s*\n\s*--dc-ink-1:/,
  ]) {
    assert.match(css, layer, `missing shared plate rule ${layer}`);
  }
  // The muted-ink lift is shared too (a /55 label must not sit under 4.5:1 on
  // either surface).
  assert.match(
    css,
    /:where\(\.dc-glass-card\) :where\(\.text-white\\\/50, \.text-white\\\/55, \.text-white\\\/60\),\s*\nhtml\[data-glass="on"\] :where\(\.dc-scene-plate\) :where\(\.text-white\\\/50/,
  );
});

test("the material the owner approved is pinned and may not drift", () => {
  // The review/comment card's plate: dark, slightly cool, translucent.
  assert.match(css, /rgba\(12, 20, 40, 0\.78\) 0%/);
  assert.match(css, /rgba\(8, 14, 30, 0\.72\) 55%/);
  assert.match(css, /rgba\(6, 11, 24, 0\.76\) 100%/);
  // its rim, its lift, and its ink floor.
  assert.match(css, /inset 0 1px 0 rgba\(255, 255, 255, 0\.34\)/);
  assert.match(css, /0 0 0 1px rgba\(4, 8, 18, 0\.55\) !important/);
  assert.match(css, /0 18px 44px -20px rgba\(2, 6, 16, 0\.85\)/);
  assert.match(css, /--dc-ink-1: rgba\(255, 255, 255, 0\.97\)/);
});

test("every plate rule sits inside the kill switch", () => {
  // Comments first — the block's own doc comment quotes the class names.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // A selector list splits on top-level commas only: `:where(.a, .b)` carries
  // its own.
  const splitSelectors = (list) => {
    const out = [];
    let depth = 0;
    let current = "";
    for (const ch of list) {
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) { out.push(current); current = ""; continue; }
      current += ch;
    }
    out.push(current);
    return out;
  };
  let checked = 0;
  for (const [, selectors] of bare.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    if (!/dc-scene-(plate|ink|field)/.test(selectors)) continue;
    for (const selector of splitSelectors(selectors)) {
      // A selector group can be preceded by the closing braces of the rule
      // before it (and by an `@media` opener, which never reaches here because
      // the block body contains braces) — trim those away.
      const trimmed = selector.replace(/^[\s}]+/, "").trim();
      if (!trimmed || trimmed.startsWith("@")) continue;
      if (!/dc-scene-(plate|ink|field)/.test(trimmed)) continue;
      checked += 1;
      assert.match(
        trimmed,
        /^html\[data-glass="on"\]/,
        `a scene-plate rule escaped the glass gate: ${trimmed.slice(0, 90)}`,
      );
    }
  }
  assert.ok(checked >= 12, `expected the plate rules to be found, saw ${checked}`);
  // Nothing painted from index.css — the material lives in one file.
  assert.doesNotMatch(read("src/index.css"), /dc-scene-plate/);
});

/* ------------------------------------------------------------------ */
/* 2. Home opted in — every surface that carries copy                  */
/* ------------------------------------------------------------------ */

test("Home's bar, hero frame, tiles, segment and popover wear the plate", () => {
  assert.match(header, /className="dc-scene-plate dc-scene-plate--bar relative z-30 text-white"/);
  assert.match(header, /className="dc-scene-plate dc-scene-plate--bar absolute left-0 right-0/);
  assert.match(hero, /className="dc-scene-plate select-none overflow-hidden touch-pan-y"/);
  assert.match(tile, /dc-scene-plate group relative overflow-hidden text-white/);
  assert.match(categories, /className="dc-segment dc-scene-plate shrink-0"/);
});

test("the search pill gets a rim and legible placeholder ink inside the bar", () => {
  assert.match(header, /className="dc-scene-field w-full/);
  assert.match(css, /:where\(\.dc-scene-field\) > div\[aria-hidden\]:nth-of-type\(4\)/);
  assert.match(css, /:where\(\.dc-scene-field\) input::placeholder/);
  // The tint layer is deliberately NOT repainted: the vendored input writes its
  // focus lift there as an inline background, and a stylesheet !important would
  // freeze the focus state.
  assert.doesNotMatch(css, /:where\(\.dc-scene-field\) > div\[aria-hidden\]:nth-of-type\(2\)/);
});

test("the bar variant paints the element, and never stacks or seams", () => {
  // The element paint (covers the header's animated padding band, and — for the
  // popover, which is a scroll container — does not scroll away with content).
  // 2026-09-06: the bar variant also serves the app's chrome strips, which
  // index.css paints with `--dc-chrome-glass` at !important from a
  // two-attribute selector — so the plate rule now carries `body` (extra
  // specificity, still a true ancestor of every bar) and !important paint.
  assert.match(css, /body \.dc-scene-plate--bar \{\s*\n\s*background-color: rgba\(8, 14, 30, 0\.74\) !important/);
  // On a surface it must not double up with the layer plate…
  assert.match(css, /:where\(\.dc-scene-plate--bar\) > div\[aria-hidden\]:nth-of-type\(2\) \{\s*\n\s*background: transparent !important/);
  // …and on a wrapper it must not let the inner surface draw a rounded hairline
  // 2rem above the bar's own bottom edge.
  assert.match(css, /:where\(\.dc-scene-plate--bar\) > \* > div\[aria-hidden\]:nth-of-type\(3\),\s*\nhtml\[data-glass="on"\] :where\(\.dc-scene-plate--bar\) > \* > div\[aria-hidden\]:nth-of-type\(4\)/);
  // A bar casts down only; it never lifts on hover (it is pinned chrome).
  assert.match(css, /:where\(\.dc-scene-plate:not\(\.dc-scene-plate--bar\)\):hover/);
});

test("copy with no surface under it carries the scene ink hook", () => {
  // Section headings + their meta/action labels sit straight on the Winter
  // scene; a per-glyph dark scrim is the only thing that keeps them legible
  // over the snow band at the bottom of the viewport.
  assert.match(css, /:where\(\.dc-scene-ink\) \{\s*\n\s*text-shadow:/);
  assert.match(home, /<h2 className="dc-scene-ink text-base font-bold text-white md:text-lg">/);
  assert.match(home, /dc-scene-ink text-xs font-semibold text-white\/55 hover:text-white\/85/);
  assert.match(home, /dc-scene-ink mt-1 text-xs text-white\/55/);
  assert.match(home, /dc-scene-ink mt-8 text-center text-sm text-white\/55/);
  assert.match(reviews, /<h2 className="dc-scene-ink text-base font-bold text-white">Loved by Learners<\/h2>/);
  assert.match(reviews, /dc-scene-ink text-xs font-semibold text-white\/55/);
  assert.match(continueLearning, /<h2 className="dc-scene-ink text-base font-bold text-white">Continue Learning<\/h2>/);
  // The single-item "% done" label used indigo-600 — under 2:1 on both the dark
  // plate and the night sky. The same label inside the card is indigo-300.
  assert.match(continueLearning, /dc-scene-ink text-xs font-semibold text-indigo-300/);
  assert.doesNotMatch(continueLearning, /text-indigo-600/);
  // The carousel's dot row paints straight onto the scene as well.
  assert.match(css, /:where\(\[data-home-hero\]\) button\[aria-label\^="Go to slide"\]/);
});

/* ------------------------------------------------------------------ */
/* 3. One sensitivity — the plate is the fix, not per-surface tuning    */
/* ------------------------------------------------------------------ */

test("no Home surface re-tunes the pinned docs sensitivity to gain contrast", () => {
  // GLASS_DOCS: radius 24 · tint 0.25 · blur 0 (owner override, no frost).
  assert.match(header, /radius=\{0\}\s*\n\s*tint=\{0\.25\}\s*\n\s*blur=\{0\}/);
  assert.match(header, /<GlassSurface radius=\{24\} tint=\{0\.25\} blur=\{0\}/);
  assert.match(hero, /radius=\{24\}\s*\n\s*tint=\{0\.25\}\s*\n\s*blur=\{0\}/);
  assert.match(tile, /radius=\{24\}\s*\n\s*tint=\{0\.25\}\s*\n\s*blur=\{0\}/);
  // Nothing on Home reaches for a hand-rolled frost or an opaque panel instead.
  for (const [name, src] of [["header", header], ["hero", hero], ["tile", tile], ["categories", categories]]) {
    assert.doesNotMatch(src, /backdrop-blur-/, `${name}: hand-rolled blur`);
    assert.doesNotMatch(src, /bg-\[#0[a-f0-9]{5}\]/, `${name}: hand-painted dark panel`);
  }
});

test("a plated surface keeps no live blur stage (owner override: blur 0)", () => {
  // GlassToggleGroup (tint 0.35) and GlassInput (tint 0.4) expose no blur prop,
  // so the pack's blur 14 default survived the app-wide removal on exactly
  // those two. The plate rule drops it — guarded so it can never out-rank the
  // flat tier's document-wide kill switch.
  assert.match(
    css,
    /html\[data-glass="on"\]:not\(\[data-glass-tier="flat"\]\) :where\(\.dc-scene-plate, \.dc-scene-field\) > div\[aria-hidden\]:nth-of-type\(1\) \{\s*\n\s*backdrop-filter: saturate\(1\.15\) !important/,
  );
});

/* ------------------------------------------------------------------ */
/* 4. Nothing vendored, frozen or off-route moved                      */
/* ------------------------------------------------------------------ */

test("the registry items are untouched — the material is CSS at the call sites", () => {
  for (const item of ["glass", "glass-card", "glass-input", "glass-toggle-group", "glass-button"]) {
    const src = read(`src/components/ui/${item}.tsx`);
    assert.doesNotMatch(src, /dc-scene-(plate|ink|field)/, `${item}.tsx must stay byte-comparable`);
  }
  // The app wrapper keeps pinning the docs sensitivity for every card.
  assert.match(read("src/components/ui/GlassCard.tsx"), /GLASS_DOCS\.tint/);
});

test("the footer dock's files and admin stay out of the JSX pass", () => {
  // Wave 1 froze the dock's files and `liquidGlassWaveOneContract` still guards
  // its imports. The owner has since asked for the bottom navigation bar to be
  // optimised (2026-09-06), and it is — but from src/glass.css, keyed off the
  // `[data-glass-dock]` hook the dock already ships, so these files stay
  // byte-comparable and the pinned docs sensitivity in TS never moves. The
  // dock's own contract is
  // tests/storeChromeDockDragScrollContract.test.mjs.
  for (const p of [
    "src/components/BottomNav.tsx",
    "src/components/glass-dock/GlassDock.tsx",
    "src/components/glass-dock/GlassMaterial.tsx",
    "src/components/glass-dock/DesktopPeekDock.tsx",
    "src/components/glass-dock/GlassSidebar.tsx",
  ]) {
    assert.doesNotMatch(read(p), /dc-scene-(plate|ink|field)/, `${p} must stay byte-comparable`);
  }
});

test("the review rail still renders through the app GlassCard wrapper", () => {
  // The component the owner pointed at must not be rebuilt as a raw surface.
  assert.match(reviews, /from "\.\.\/\.\.\/components\/ui\/GlassCard"/);
  assert.match(reviews, /<GlassCard/);
  assert.match(continueLearning, /from "\.\.\/\.\.\/components\/ui\/GlassCard"/);
});
