// tests/revisionSlideDeckContract.test.mjs
//
// The Revision Dashboard's hero is the AI Canvas Slide Deck, ported verbatim:
//
//     https://aicanvas.me/components/slide-deck
//
// Its published remix spec (the reference's own numbers, read line by line)
// is what this file pins — so a later pass cannot quietly turn the deck into
// "visually similar" while losing the mechanics the owner asked for:
//
//   · the stack: STACK [ y 0 / 11 / 20, scale 1 / 0.962 / 0.926, opacity 1 ],
//     OFFSCREEN { y 30, scale 0.88, opacity 0 }, offset = (id - current) % n;
//   · forward = the departing card FLIES OUT left (xTarget −380, zIndex 15),
//     backward = the arriving card SLIDES IN from the right (x 380, opacity 0,
//     scale 0.88, zIndex 20), both cleared in onAnimationComplete;
//   · spring { stiffness: 300, damping: 28 }; dots-only navigation with a
//     6 → 24 px width animation on { stiffness: 400, damping: 30 };
//   · drag on the front card only: x-axis, dragElastic 0.5, dismiss at
//     |offset.x| > 60 or |velocity.x| > 400;
//   · the four editorial themes with their exact palette and shapes, the
//     geometry of each decoration, the live dark-mode read;
//   · the card's own typography and padding: 10 / 11 / 26 / 88 px, weights
//     700 / 800 / 900, the counter `XX / NN` top-right, the numeral + title
//     pinned to the bottom;
//   · NO GLASS — the reference is flat painted cards.
//
// tests/revisionSlideDeckRuntime.test.mjs drives the same component in a real
// DOM (the ring, the swipe, the dots, the tap, the sizing on three devices).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const deck = fs.readFileSync("src/revision/components/PlanSlideDeck.tsx", "utf8");
const dashboard = fs.readFileSync("src/revision/pages/DashboardPage.tsx", "utf8");

test("the reference's card box and stack numbers are ported verbatim", () => {
  assert.match(deck, /const CARD_W = 260;/);
  assert.match(deck, /const CARD_H = 300;/);
  assert.match(deck, /const CARD_RADIUS = 20;/);
  // The three visible layers, exactly the reference's y / scale / opacity.
  assert.match(deck, /\{ x: 0, y: 0, scale: 1\.0, opacity: 1 \}/);
  assert.match(deck, /\{ x: 0, y: 11, scale: 0\.962, opacity: 1 \}/);
  assert.match(deck, /\{ x: 0, y: 20, scale: 0\.926, opacity: 1 \}/);
  assert.match(deck, /const OFFSCREEN = \{ x: 0, y: 30, scale: 0\.88, opacity: 0 \}/);
  // The ring: offsets 0/1/2 take STACK, everything deeper is offscreen.
  assert.match(deck, /const offset = \(index - current \+ count\) % count;/);
  assert.match(deck, /: offset <= 2\s*\n\s*\? STACK\[offset\]\s*\n\s*: OFFSCREEN;/);
  // …and the reference's z-order.
  assert.match(deck, /const zIndex = isEnteringFromRight \? 20 : isExiting \? 15 : offset === 0 \? 10 : offset === 1 \? 6 : offset === 2 \? 2 : 0;/);
});

test("forward flies the card out, backward slides the new one in", () => {
  // Forward: the departing front card is the one whose slideId is in exitInfo,
  // it flies to the negative xTarget over the stack it is leaving.
  assert.match(deck, /const EXIT_X = -380;/);
  assert.match(deck, /const isExiting = exitInfo\?\.slideId === slide\.id && offset === count - 1;/);
  assert.match(deck, /setExitInfo\(\{ slideId: slides\[current\]\.id, xTarget: exitX \}\);/);
  assert.match(deck, /\? \{ x: exitInfo \? exitInfo\.xTarget : exitX, y: 0, scale: 0\.88, opacity: 0 \}/);
  // Backward: no exit — the arriving card is keyed `${id}-right` and starts off
  // screen right.
  assert.match(deck, /const ENTER_X = 380;/);
  assert.match(deck, /setEnterFromRight\(slides\[next\]\.id\);/);
  assert.match(deck, /key=\{isEnteringFromRight \? `\$\{slide\.id\}-right` : slide\.id\}/);
  assert.match(deck, /initial=\{isEnteringFromRight \? \{ x: enterX, opacity: 0, scale: 0\.88, y: 0 \} : false\}/);
  // Both flags are cleared in onAnimationComplete with functional setState.
  assert.match(deck, /onAnimationComplete=\{\(\) => \{/);
  assert.match(deck, /setExitInfo\(\(info\) => \(info && info\.slideId === slide\.id \? null : info\)\);/);
  assert.match(deck, /setEnterFromRight\(\(id\) => \(id === slide\.id \? null : id\)\);/);
  // One spring for the slot / exit motion, the reference's numbers.
  assert.match(deck, /const SPRING = \{ type: "spring", stiffness: 300, damping: 28 \}/);
});

test("the swipe is the reference's: front card only, x-axis, 60 px / 400 px", () => {
  assert.match(deck, /drag=\{isFront && count > 1 \? "x" : false\}/);
  assert.match(deck, /dragElastic=\{0\.5\}/);
  assert.match(deck, /dragConstraints=\{isFront && count > 1 \? \{ left: 0, right: 0 \} : undefined\}/);
  assert.match(deck, /const DISMISS_OFFSET = 60;/);
  assert.match(deck, /const DISMISS_VELOCITY = 400;/);
  assert.match(deck, /if \(info\.offset\.x <= -DISMISS_OFFSET \|\| info\.velocity\.x <= -DISMISS_VELOCITY\) go\(1\);/);
  assert.match(deck, /else if \(info\.offset\.x >= DISMISS_OFFSET \|\| info\.velocity\.x >= DISMISS_VELOCITY\) go\(-1\);/);
  // A drag is never a tap — the same rule the repo's useDragScroll applies.
  assert.match(deck, /const TAP_SLOP = 8;/);
  assert.match(deck, /if \(Math\.abs\(info\.offset\.x\) > TAP_SLOP\) draggedRef\.current = true;/);
  assert.match(deck, /if \(draggedRef\.current\) \{\s*\n\s*draggedRef\.current = false;\s*\n\s*return;/);
  // `pan-y`: the swipe owns the horizontal axis, the dashboard keeps its scroll.
  assert.match(deck, /touchAction: "pan-y"/);
});

test("navigation is dots only, with the reference's dot spring", () => {
  assert.match(deck, /const DOT_SPRING = \{ type: "spring", stiffness: 400, damping: 30 \}/);
  assert.match(deck, /animate=\{\{ width: active \? 24 : 6 \}\}/);
  assert.match(deck, /background: active \? "#E55A2B" : isDark \? DOT_INACTIVE_DARK : DOT_INACTIVE_LIGHT/);
  assert.match(deck, /const DOT_INACTIVE_DARK = "rgba\(255,255,255,0\.18\)";/);
  assert.match(deck, /const DOT_INACTIVE_LIGHT = "rgba\(0,0,0,0\.15\)";/);
  // Dots only — no arrows anywhere in the deck.
  assert.doesNotMatch(deck, /ChevronLeft|ChevronRight|Previous|Next test|aria-label="Next/);
  assert.match(deck, /data-plan-slide-dot=\{slide\.id\}/);
  assert.match(deck, /data-rev-plan-dots/);
});

test("the reference's four editorial themes, palette and shapes are ported verbatim", () => {
  const themes = [
    ['{ accent: "#E55A2B", bg: "#111111", textPrimary: "#FFFFFF", textMuted: "rgba(255,255,255,0.35)", shape: "circle" }'],
    ['{ accent: "#E55A2B", bg: "#F0EDEA", textPrimary: "#111111", textMuted: "rgba(0,0,0,0.35)", shape: "square" }'],
    ['{ accent: "#111111", bg: "#E55A2B", textPrimary: "#FFFFFF", textMuted: "rgba(255,255,255,0.5)", shape: "line" }'],
    ['{ accent: "#E55A2B", bg: "#2A2A2A", textPrimary: "#F0EDEA", textMuted: "rgba(240,237,234,0.4)", shape: "triangle" }'],
  ];
  for (const [theme] of themes) assert.ok(deck.includes(theme), `the theme is missing: ${theme}`);
  // cycle by slide index: every saved test gets the next theme
  assert.match(deck, /const theme = SLIDE_THEMES\[index % SLIDE_THEMES\.length\];/);
  // The decoration geometry, exactly: circle 128 / -32, square 60 / 15° / 20/30,
  // the two vertical rules at right 28 (2 px, 0.1) and 38 (1 px, 0.06), the
  // triangle's own SVG box and polygon.
  assert.match(deck, /right: -32 \* s,\s*\n\s*top: -32 \* s,\s*\n\s*width: 128 \* s,\s*\n\s*height: 128 \* s,/);
  assert.match(deck, /right: 20 \* s,\s*\n\s*top: 30 \* s,\s*\n\s*width: 60 \* s,\s*\n\s*height: 60 \* s,/);
  assert.match(deck, /transform: "rotate\(15deg\)",/);
  assert.match(deck, /right: 28 \* s, top: 0, bottom: 0, width: 2 \* s, background: ink, opacity: 0\.1/);
  assert.match(deck, /right: 38 \* s, top: 0, bottom: 0, width: 1 \* s, background: ink, opacity: 0\.06/);
  assert.match(deck, /width=\{126 \* s\}\s*\n\s*height=\{112 \* s\}\s*\n\s*viewBox="0 0 180 160"/);
  assert.match(deck, /<polygon points="90,12 172,148 8,148"/);
  assert.match(deck, /strokeLinejoin="round"/);
  // The live dark-mode read drives the inactive dot and the card shadow.
  assert.match(deck, /new MutationObserver\(sync\)/);
  assert.match(deck, /observer\.observe\(document\.documentElement, \{ attributes: true, attributeFilter: \["class"\] \}\)/);
  assert.match(deck, /const STAGE_DARK = "#1A1A19";/);
  assert.match(deck, /const STAGE_LIGHT = "#E8E8DF";/);
});

test("the card's content layout is the reference's, with the owner's mapping", () => {
  // Two-part editorial block: label + counter on top, the rest pinned low.
  assert.match(deck, /justifyContent: "space-between"/);
  assert.match(deck, /padding: `\$\{24 \* s\}px \$\{28 \* s\}px \$\{28 \* s\}px`/);
  // Top row: 10 px / 700 / 0.12em label + the `XX / NN` counter at 11 px / 700.
  assert.match(deck, /fontSize: Math\.round\(10 \* s \* 10\) \/ 10,\s*\n\s*fontWeight: 700,\s*\n\s*letterSpacing: "0\.12em",\s*\n\s*textTransform: "uppercase",/);
  assert.match(deck, /fontSize: Math\.round\(11 \* s \* 10\) \/ 10,\s*\n\s*fontWeight: 700,/);
  assert.match(deck, /\{pad2\(slide\.position\)\} \/ \{pad2\(slide\.total\)\}/);
  // The numeral: 88 px / 900 / lineHeight 0.85 / −0.05em in the accent colour.
  assert.match(deck, /fontSize: Math\.round\(88 \* s\),\s*\n\s*fontWeight: 900,\s*\n\s*lineHeight: 0\.85,\s*\n\s*letterSpacing: "-0\.05em",\s*\n\s*color: theme\.accent,/);
  // The title: 26 px / 800 / 1.15 / −0.03em.
  assert.match(deck, /fontSize: Math\.round\(26 \* s\),\s*\n\s*fontWeight: 800,\s*\n\s*lineHeight: 1\.15,\s*\n\s*letterSpacing: "-0\.03em",/);
  // …and the owner's four lines, each with its own hook.
  assert.match(deck, /data-slide-subject/);
  assert.match(deck, /data-slide-counter/);
  assert.match(deck, /data-slide-count/);
  assert.match(deck, /data-slide-title/);
  assert.match(deck, /data-slide-chapter/);
});

test("the deck is flat painted — the reference has no glass", () => {
  assert.doesNotMatch(deck, /backdrop-filter|backdropFilter/i, "no glass on the deck");
  assert.doesNotMatch(deck, /GlassSurface|GlassButton|GlassCard/, "the deck never mounts a glass surface");
  assert.doesNotMatch(deck, /blur\(/i, "no blur anywhere in the deck");
  assert.match(deck, /background: theme\.bg,/, "each card is a solid painted surface");
  // The stage is the reference's own container colour (no translucency).
  assert.match(deck, /background: isDark \? STAGE_DARK : STAGE_LIGHT,/);
});

test("the deck is sized from the visible area, never from the viewport", () => {
  // Measured against the Revision page's own scroller, scroll-independently.
  assert.match(deck, /const main = el\.closest\("\[data-revision-page-main\]"\) as HTMLElement \| null;/);
  assert.match(deck, /const innerTop = rect\.top - mainRect\.top \+ main\.scrollTop;/);
  assert.match(deck, /available = main\.clientHeight - innerTop - BOTTOM_RESERVE;/);
  assert.match(deck, /const BOTTOM_RESERVE = 12;/);
  assert.doesNotMatch(deck, /100vh|100dvh/, "no viewport units anywhere");
  // The viewport is only the guarded fallback for a deck rendered outside the
  // Revision page's scroller — the scroller branch stays primary.
  assert.match(
    deck,
    /if \(main\) \{\s*\n\s*const mainRect = main\.getBoundingClientRect\(\);\s*\n\s*const innerTop = rect\.top - mainRect\.top \+ main\.scrollTop;\s*\n\s*available = main\.clientHeight - innerTop - BOTTOM_RESERVE;\s*\n\s*\} else \{\s*\n\s*available = window\.innerHeight - rect\.top - 96;/,
  );
  assert.match(deck, /const height = Math\.max\(MIN_STAGE_HEIGHT, Math\.round\(available\)\);/);
  assert.match(deck, /observer\.observe\(main\)/, "the scroller is observed too");
  // Both axes are capped and the stage clips what flies out of it.
  assert.match(deck, /const scale = clamp\(\s*\n\s*Math\.min\(\(stageW - 28\) \/ CARD_W, Math\.max\(CARD_H \* MIN_SCALE, stageH - CHROME_BELOW_CARD\) \/ CARD_H\),\s*\n\s*MIN_SCALE,\s*\n\s*MAX_SCALE,\s*\n\s*\);/);
  assert.match(deck, /const MIN_SCALE = 0\.8;/);
  assert.match(deck, /const MAX_SCALE = 1\.8;/);
  assert.match(deck, /overflow-hidden rounded-\[28px\]/);
  // The dashboard puts the whole page under it: hero first, everything else
  // below the fold.
  assert.match(dashboard, /data-rev-panel="primary" className="flex flex-col gap-4 lg:gap-3"/);
  const heroAt = dashboard.indexOf('data-rev-panel="primary"');
  const statsAt = dashboard.indexOf("data-rev-stat-grid");
  const secondaryAt = dashboard.indexOf('data-rev-panel="secondary"');
  assert.ok(heroAt > -1 && statsAt > heroAt && secondaryAt > statsAt, "the deck is the dashboard's first surface");
});
