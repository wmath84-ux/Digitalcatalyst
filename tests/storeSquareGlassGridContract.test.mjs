// tests/storeSquareGlassGridContract.test.mjs
//
// Contract for the 2026-09-10 owner brief on the store page:
//
//   "store page per yah jo likha hai isko card mein pack karo, card ke
//    background mein add karo aur text ka size aur color ekadam badhiya select
//    karo … top rated ka text size badhao, ekadam heading jaisa dikhna chahiye,
//    aur card per bhi ek heading text hona chahiye bada sa … product ka by
//    default mobile, tablet aur desktop ke liye grid square card ratio set
//    karo, card ka ratio exact square hona chahiye, ek row mein do card mobile
//    aur tablet mein aur desktop mein 4-5-6, spacing bahut kam … transparent
//    glass card, background density blur 42 to 50%, color light blue, color
//    density 22 to 30% … footer navigation ka background 40% blur, color
//    ekadam bahut hi halka light blue, density 15 to 20% — flow path page per
//    bhi."
//
// Six guarantees, all of them numbers rather than vibes:
//
//   1. the hero copy is packed into ONE glass card that paints its own
//      background (nothing floats on the scene any more);
//   2. "Top rated" is heading-sized, and every product card carries a heading
//      that is the biggest type on that card;
//   3. every product card is an EXACT square (`aspect-ratio: 1/1`, and
//      `min-height: 0` so long copy can never stretch the track);
//   4. the grid is two-up on phones and tablets, 4–6 across on desktop, with
//      the tightest gaps the tap targets allow;
//   5. the store glass is the owner's material — blur 42–50% of the 40px
//      ceiling, light blue rgb(173,216,255) at 22–30%;
//   6. the footer navigation (the main app dock AND FlowPath's dock, which is
//      the same component) is the same light blue at 15–20% with a 40% blur.
//
// Pure code-shape — no React, no DOM, no browser.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const glassCss = read("src/glass.css");
const storeCss = read("src/store-glass.css");
const indexCss = read("src/index.css");
const hero = read("src/components/Hero.tsx");
const card = read("src/components/ProductCard.tsx");
const storePage = read("src/components/StorePage.tsx");
const dock = read("src/components/glass-dock/GlassDock.tsx");
const flowpathDock = read("src/components/flowpath/BottomDock.tsx");
const main = read("src/main.tsx");

/* ── helpers: read the pinned tokens back out of the CSS ──────────────────── */

const px = (css, name) => Number(new RegExp(`${name}:\\s*([\\d.]+)px`).exec(css)?.[1]);
const alpha = (css, name) => Number(new RegExp(`${name}:\\s*rgba\\(173, 216, 255, ([\\d.]+)\\)`).exec(css)?.[1]);

const BLUR_CEILING = px(glassCss, "--dc-glass-blur-ceiling");

/* ------------------------------------------------------------------ */
/* 5. The material tokens (checked first: everything else reads them)  */
/* ------------------------------------------------------------------ */

test("the owner's density vocabulary is pinned once, in CSS", () => {
  // 100% blur density = 40px, so every "NN%" in the brief is a px value here.
  assert.equal(BLUR_CEILING, 40);
  // One light blue for both materials.
  assert.match(glassCss, /--dc-glass-blue: 173, 216, 255;/);
  // The stylesheet that paints them loads AFTER glass.css, so it can out-rank
  // the navy plate glass.css puts on `.dc-glass-card`.
  const order = [main.indexOf('import "./glass.css";'), main.indexOf('import "./store-glass.css";')];
  assert.ok(order[0] >= 0 && order[1] > order[0], "store-glass.css must be imported after glass.css");
});

test("the store glass is blur 42–50% and light blue at 22–30%", () => {
  const blur = px(glassCss, "--dc-store-glass-blur");
  const tint = alpha(glassCss, "--dc-store-glass-tint");
  assert.ok(blur > 0, "--dc-store-glass-blur must be pinned in px");
  const density = blur / BLUR_CEILING;
  assert.ok(density >= 0.42 && density <= 0.5, `store blur density is ${(density * 100).toFixed(0)}%, brief says 42–50%`);
  assert.ok(tint >= 0.22 && tint <= 0.3, `store colour density is ${(tint * 100).toFixed(0)}%, brief says 22–30%`);
});

test("the store glass actually paints those numbers on the pack's layers", () => {
  // The pack GlassSurface tree is 1 frost · 2 tint · 3 sheen · 4 rim; the frost
  // and the tint are the two the brief is about, and both are !important
  // because the engine writes them inline.
  const frost = /:where\(\.dc-store-glass\) > div\[aria-hidden\]:nth-of-type\(1\) \{([^}]*)\}/.exec(storeCss)?.[1];
  assert.ok(frost, "expected the frost-layer rule");
  // Both spellings, prefixed first: Lightning CSS collapses the pair to the
  // LAST one written, so the unprefixed form (the only one Firefox reads) must
  // be the survivor.
  assert.match(
    frost,
    /-webkit-backdrop-filter: blur\(var\(--dc-store-glass-blur\)\) saturate\(1\.3\) !important;\s*\n\s*backdrop-filter: blur\(var\(--dc-store-glass-blur\)\) saturate\(1\.3\) !important;/,
  );

  const tint = /:where\(\.dc-store-glass\) > div\[aria-hidden\]:nth-of-type\(2\) \{([^}]*)\}/.exec(storeCss)?.[1];
  assert.ok(tint, "expected the tint-layer rule");
  assert.match(tint, /background: var\(--dc-store-glass-tint\) !important/);

  // `?glass=off` still rolls the store back to an opaque plate.
  assert.match(storeCss, /html\[data-glass="off"\] :where\(\.dc-store-glass\) > div\[aria-hidden\]:nth-of-type\(1\)/);
  assert.match(storeCss, /html\[data-glass="off"\] :where\(\.dc-store-glass\) > div\[aria-hidden\]:nth-of-type\(2\)/);
});

/* ------------------------------------------------------------------ */
/* 1. The hero copy is packed into a card                              */
/* ------------------------------------------------------------------ */

test("the store hero is one glass card with its own background", () => {
  assert.match(hero, /<GlassSurface\s*\n\s*data-store-hero-card/);
  assert.match(hero, /className="dc-store-glass dc-scene-ink"/);
  // The pack props mirror the CSS tokens (0.62 * 0.42 = 0.26 alpha of the
  // light blue), so the surface is right even before the stylesheet lands.
  assert.match(hero, /tint=\{0\.62\}/);
  assert.match(hero, /tintColor="173,216,255"/);

  // Every line the owner listed is INSIDE that card: the eyebrow, the
  // headline, the description, the three trust pills and the counter.
  const cardStart = hero.indexOf("data-store-hero-card");
  const surfaceEnd = hero.indexOf("</GlassSurface>");
  assert.ok(cardStart >= 0 && surfaceEnd > cardStart);
  const inside = hero.slice(cardStart, surfaceEnd);
  for (const copy of [
    "Learning marketplace",
    "Find the right",
    "resource, faster",
    "Search focused notes, courses, PDFs, and study tools by subject, class, or format.",
    "Instant download",
    "Secure checkout",
    "Lifetime access",
    "available",
  ]) {
    assert.ok(inside.includes(copy), `“${copy}” must sit inside the hero card`);
  }
});

test("the hero card's type scale is a headline, not a label", () => {
  assert.match(hero, /<h2 className="dc-store-hero-title mt-3\.5">/);
  assert.match(hero, /<p className="dc-store-hero-body mt-3 max-w-xl">/);
  assert.match(hero, /dc-store-hero-eyebrow/);
  assert.match(hero, /dc-store-hero-chip/);
  assert.match(hero, /dc-store-hero-count/);

  const title = /\.dc-store-hero-title \{([^}]*)\}/.exec(storeCss)?.[1];
  assert.ok(title, "expected the hero title rule");
  assert.match(title, /font-size: clamp\(1\.7rem, 7vw, 2\.75rem\)/);
  assert.match(title, /font-weight: 800/);
  // The body copy steps up with it and stays near-white on the lens.
  const body = /\.dc-store-hero-body \{([^}]*)\}/.exec(storeCss)?.[1];
  assert.match(body, /font-size: clamp\(0\.875rem, 3\.6vw, 1\.0625rem\)/);
  assert.match(body, /color: rgba\(255, 255, 255, 0\.94\)/);
});

/* ------------------------------------------------------------------ */
/* 2. "Top rated" is a heading; the card has a heading too             */
/* ------------------------------------------------------------------ */

test("“Top rated” is heading-sized", () => {
  // It is an <h2> now, not a 10px eyebrow, and it still carries the scene ink
  // scrim because it is the one store heading that sits on the raw scene.
  assert.match(storePage, /<h2 className="dc-scene-ink dc-store-section-title px-3 sm:px-4">Top rated<\/h2>/);
  assert.doesNotMatch(storePage, /dc-section-label px-4">Top rated/);

  const title = /\.dc-store-section-title \{([^}]*)\}/.exec(storeCss)?.[1];
  assert.ok(title, "expected the section-title rule");
  assert.match(title, /font-size: clamp\(1\.5rem, 6vw, 2\.375rem\)/);
  assert.match(title, /font-weight: 800/);
  assert.match(title, /text-transform: none/);
  // The desktop shell zeroes the heading's own gutter.
  assert.match(indexCss, /\.dc-desktop-shell \[data-store-top-rated\] :where\(\.dc-section-label, \.dc-store-section-title\) \{/);
});

test("every product card carries a heading that is its biggest type", () => {
  assert.match(card, /<h3 className="dc-store-card-title line-clamp-2">\{product\.title\}<\/h3>/);
  const title = /\.dc-store-card-title \{([^}]*)\}/.exec(storeCss)?.[1];
  assert.ok(title, "expected the card-title rule");
  assert.match(title, /font-size: clamp\(0\.8rem, 3\.5vw, 1\.1875rem\)/);
  assert.match(title, /font-weight: 800/);
  // Everything else on the card is smaller than the heading's floor (0.8rem =
  // 12.8px): the meta line is 11px, the kicker 9.5px, and the two price classes
  // it reuses are 12px and 18px — the 18px hero price is `sm:` and up, where
  // the heading is already at its 1.1875rem ceiling.
  const meta = /\.dc-store-card-meta \{([^}]*)\}/.exec(storeCss)?.[1];
  assert.match(meta, /font-size: 11px/);
  const kicker = /\.dc-store-card-kicker \{([^}]*)\}/.exec(storeCss)?.[1];
  assert.match(kicker, /font-size: 9\.5px/);
  // Two lines, so a long title can never push the price or the CTA out.
  assert.match(card, /line-clamp-2/);
});

/* ------------------------------------------------------------------ */
/* 3. The cards are exact squares                                      */
/* ------------------------------------------------------------------ */

test("every product card is an exact square", () => {
  // aspect-ratio 1/1, and min-height:0 so the grid item's automatic minimum
  // size cannot let long copy stretch the row and break the ratio.
  assert.match(card, /dc-store-glass dc-scene-ink group relative flex aspect-square w-full min-h-0 flex-col overflow-hidden/);
  // The artwork is a flex item sized off the square, and the <img> is
  // absolutely positioned so index.css's unlayered `img { height: auto }`
  // (640–1366px) cannot stretch it out of the crop.
  assert.match(card, /className="relative w-full basis-\[40%\] min-h-0 grow shrink overflow-hidden sm:basis-\[46%\]"/);
  assert.match(card, /className="absolute inset-0 h-full w-full object-cover/);
  // The loading placeholders are the same square in the same grid.
  assert.match(storePage, /dc-store-glass flex aspect-square w-full min-h-0 flex-col overflow-hidden/);
});

test("the card's flex column reaches its children, so the CTA sits at the bottom", () => {
  // Regression (2026-09-10, owner: "add to my cart button upar center me ho
  // gaya hai"): GlassSurface puts a content wrapper between the card root and
  // the card's real children, and that wrapper ships as `display: block`. A
  // flex column on the ROOT therefore never reached the artwork / copy — so
  // `flex-1` and `mt-auto` did nothing and the CTA floated up under the title.
  // The wrapper is promoted to the flex column from the root's class list,
  // which keeps `contentClassName="p-0"` (edge-to-edge artwork) intact.
  for (const source of [card, storePage]) {
    assert.match(source, /\[&>div:last-child\]:flex \[&>div:last-child\]:min-h-0 \[&>div:last-child\]:flex-col/);
  }
  assert.match(card, /contentClassName="p-0"/, "the artwork stays edge-to-edge");
  // The copy block never compresses — the artwork is what gives way on a tight
  // square, so no line of copy can be clipped by the card's overflow-hidden.
  assert.match(card, /className="relative z-20 flex shrink-0 flex-col gap-1 px-1\.5 pb-1\.5 pt-2 sm:gap-1\.5 sm:px-3 sm:pb-3 sm:pt-2\.5"/);
  // Comments are stripped first: the fix is documented in a comment that
  // quotes the old class.
  const bareCard = card.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(bareCard, /mt-auto/, "nothing floats on auto margins in a block box any more");
  assert.doesNotMatch(bareCard, /flex-1/, "no leftover flex-1 that the block wrapper would ignore");
  // Between JSX children a bare slash-star comment is literal TEXT — it painted
  // the comment onto the card. The copy block's comment must stay braced.
  assert.match(card, /\{\/\* `shrink-0`: the copy never compresses/);
  assert.doesNotMatch(card, /\n\s*\/\* `shrink-0`/);
});

test("the price is on the card at every breakpoint, not only from sm:", () => {
  // The phone card used to hide the whole price row (`hidden … sm:flex`), which
  // is what read as "text dikh nahi raha" on mobile. It is now always visible;
  // only the save pill (the bulkiest chip) waits for `sm:`.
  assert.match(card, /<div className="flex flex-wrap items-baseline gap-x-1\.5">/);
  assert.match(card, /<span className="text-\[13px\] dc-hero-price sm:text-lg">₹\{product\.price\}<\/span>/);
  assert.match(card, /<span className="text-\[10px\] dc-anchor-price sm:text-\[12px\]">₹\{product\.originalPrice\}<\/span>/);
  // The pill is hidden via a WRAPPER: `.dc-save-pill` sets `display:
  // inline-flex` in unlayered CSS, which beats a `hidden` utility on itself.
  assert.match(card, /<span className="hidden sm:inline-flex">\s*\n\s*<span className="dc-save-pill">/);
  // The byline stays the one `sm:`-only line — a 145px card cannot carry it.
  assert.match(card, /<p className="dc-store-card-meta hidden truncate sm:block">by \{product\.instructor\}<\/p>/);
});

/* ------------------------------------------------------------------ */
/* 4. Two-up on phone + tablet, 4–6 on desktop, minimal spacing        */
/* ------------------------------------------------------------------ */

test("the store grid is two-up below the desktop shell", () => {
  // Base (phones): two equal tracks.
  const base = /\n\[data-store-grid\] \{([^}]*)\}/.exec(indexCss)?.[1];
  assert.ok(base, "expected the base [data-store-grid] rule");
  assert.match(base, /display: grid/);
  assert.match(base, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(base, /gap: 6px/);

  // Tablets: still exactly two, restated later in the file with !important so
  // the older tablet auto-fill rules (180px / clamp(160px,18vw,220px)) cannot
  // tile the store into 3–8 columns.
  const tabletBlock = /@media \(min-width: 640px\) and \(max-width: 959px\) \{\s*\n\s*\[data-store-grid\] \{([^}]*)\}/.exec(indexCss)?.[1];
  assert.ok(tabletBlock, "expected the 640–959 [data-store-grid] rule");
  assert.match(tabletBlock, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(tabletBlock, /gap: 8px !important/);

  // And the cards are no longer shrunk inside their track on tablets, which is
  // what left dead space around every square.
  const scale = /\[data-home-grid\] > \*,\n\s*\[data-pdp-grid\] > \* \{\s*\n\s*transform: scale\(var\(--tablet-scale\)\)/.exec(indexCss);
  assert.ok(scale, "expected the tablet card-scale rule without [data-store-grid]");
});

test("the store grid auto-fills 4–6 across on desktop", () => {
  const desktop = /@media \(min-width: 960px\) \{\s*\n\s*\[data-store-grid\] \{([^}]*)\}/.exec(indexCss)?.[1];
  assert.ok(desktop, "expected the desktop [data-store-grid] rule");
  assert.match(desktop, /grid-template-columns: repeat\(auto-fill, minmax\(clamp\(150px, 14vw, 260px\), 1fr\)\) !important/);
  assert.match(desktop, /gap: 8px !important/);

  // The column count the track maths actually produces for a desktop shell
  // (content = viewport − rail − gutters): 4 at 960, 5 in the middle of the
  // range, 6 on a 1920 screen — the owner's "4-5-6 jitna adjust ho jaaye".
  const columnsAt = (viewport, rail) => {
    const content = viewport - rail - 48; // shell padding both sides
    const min = Math.min(260, Math.max(150, viewport * 0.14));
    return Math.floor((content + 8) / (min + 8));
  };
  assert.equal(columnsAt(960, 220), 4);
  assert.equal(columnsAt(1280, 280), 5);
  assert.equal(columnsAt(1600, 320), 5);
  assert.equal(columnsAt(1920, 320), 5);
  for (const viewport of [960, 1024, 1280, 1440, 1600, 1920]) {
    const n = columnsAt(viewport, viewport >= 1280 ? 320 : 220);
    assert.ok(n >= 4 && n <= 6, `${viewport}px yields ${n} columns, outside the 4–6 band`);
  }
});

test("the store's spacing stays minimal everywhere", () => {
  // No store grid rule may exceed an 8px gap.
  for (const [, body] of indexCss.matchAll(/\[data-store-grid\] \{([^}]*)\}/g)) {
    const gap = /gap: (\d+)px/.exec(body)?.[1];
    if (gap) assert.ok(Number(gap) <= 8, `a store grid gap is ${gap}px, the brief says minimal`);
  }
  // The containers carry the same tight gutters in the JSX (zeroed inside the
  // desktop shell by [data-store-gutter]).
  for (const hook of ["data-store-grid", "data-store-mixed", "data-store-list"]) {
    assert.match(storePage, new RegExp(`${hook} className="[^"]*gap-(1\\.5|2) px-3`), `${hook} keeps the tight gap + gutter`);
  }
});

test("the store opens on the square grid, and the skeleton matches it", () => {
  assert.match(storePage, /useState<ViewMode>\("grid"\)/);
  assert.match(storePage, /data-store-grid-loading/);
  // The three layouts are all still one tap away in the dropdown.
  assert.match(storePage, /const VIEW_OPTIONS[\s\S]*?\{ mode: "grid"[\s\S]*?\{ mode: "list"[\s\S]*?\{ mode: "mixed"/);
});

/* ------------------------------------------------------------------ */
/* 6. The footer navigation — main app and FlowPath                    */
/* ------------------------------------------------------------------ */

test("the footer nav is light blue at 15–20% with a 40% blur", () => {
  const blur = px(glassCss, "--dc-footer-nav-blur");
  const tint = alpha(glassCss, "--dc-footer-nav-tint");
  const density = blur / BLUR_CEILING;
  assert.ok(Math.abs(density - 0.4) < 0.001, `footer blur density is ${(density * 100).toFixed(0)}%, brief says 40%`);
  assert.ok(tint >= 0.15 && tint <= 0.2, `footer colour density is ${(tint * 100).toFixed(0)}%, brief says 15–20%`);

  // The dock paints the tint on its panel and the frost on its own material
  // layer — never both, or the two would stack past the brief.
  const panel = /html\[data-glass="on"\] :where\(\[data-glass-dock\]\) \{([^}]*)\}/.exec(glassCss)?.[1];
  assert.match(panel, /background-color: var\(--dc-footer-nav-tint\) !important/);
  const lens = /html\[data-glass="on"\] :where\(\[data-glass-dock\]\) > \[aria-hidden\] > div \{([^}]*)\}/.exec(glassCss)?.[1];
  assert.match(lens, /background: transparent !important/);
  assert.match(
    lens,
    /-webkit-backdrop-filter: blur\(var\(--dc-footer-nav-blur\)\) saturate\(1\.25\) !important;\s*\n\s*backdrop-filter: blur\(var\(--dc-footer-nav-blur\)\) saturate\(1\.25\) !important;/,
  );
});

test("FlowPath's footer dock is the same component, so it wears the same material", () => {
  // The main footer (Home / Store / Revision / …) and FlowPath's dock both
  // render GlassDock, which is what carries the `[data-glass-dock]` hook the
  // material is keyed off — so the FlowPath nav changes with the app's.
  assert.match(dock, /data-glass-dock=""/);
  assert.match(flowpathDock, /<GlassDock\s*\n?\s*items=\{items\}/);
  // …and it paints no background of its own that could cover the material.
  assert.doesNotMatch(flowpathDock, /data-fp-dock className="[^"]*bg-/);
});
