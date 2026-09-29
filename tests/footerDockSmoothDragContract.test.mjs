// tests/footerDockSmoothDragContract.test.mjs
//
// Owner brief, 2026-09-28:
//
//   "Home page per footer navigation drag-scroll left-right karne per lag
//    karta hai, animation lag dikhta hai — jabki course player ke andar, My
//    Day per, aur baaki jagah jo bhi footer navigation hai vah lag nahin
//    karte. Difference analyse karo aur vaise hi footer navigation ko bhi
//    design karo taki super smooth scroll animation ho."
//
// Every footer in the app already mounts the SAME component
// (SiteFooterNav → GlassDock), so the difference was never a design
// difference — it was what one frame of the magnification wave cost, and
// that cost is multiplied by the page it sits on. Home is the longest,
// busiest document in the app, so three per-frame costs that My Day and the
// course player absorb silently were visible there:
//
//   1. the plates animated `width` / `height`, so every spring tick ran a
//      layout pass, resized the `w-max` capsule, resized GlassMaterial, and
//      fired its ResizeObserver into a lens-map rebuild — a 220×220 pixel
//      loop plus a blocking `toDataURL()` PNG encode plus a React
//      re-render — once per distinct capsule size;
//   2. each plate measured itself (`getBoundingClientRect`) inside the
//      pointer transform, so one move forced eight synchronous layouts;
//   3. every one of those inline-style writes woke footerNavSpace's
//      body-wide MutationObserver, which re-measured the footer and — because
//      the capsule's height changes mid-wave — rewrote `--dc-footer-nav-h` on
//      <html>: a document-wide style recalculation, plus a resize of every
//      page scroller's `::after` clearance, once per frame.
//
// The wave is now transform-only (plates keep a fixed box; the capsule grows
// through its own padding), centres are measured once per gesture, pointer
// moves are coalesced to one per frame, and the gesture publishes
// `data-dc-dock-gesture` so footerNavSpace holds its root write until the
// dock has settled.
//
// These assertions hold that design in place — including the one that
// matters most: the new wave is GEOMETRICALLY the old one, recomputed here
// from both models and compared plate by plate.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const dock = read("src/components/glass-dock/GlassDock.tsx");
/** The same file with prose stripped, for assertions about CODE only — the
 * header comment quotes the old `whileTap` / `getBoundingClientRect` shape on
 * purpose, to explain what changed. */
const dockCode = dock
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const material = read("src/components/glass-dock/GlassMaterial.tsx");
const footerSpace = read("src/utils/footerNavSpace.ts");

/* ------------------------------------------------------------------ */
/* 1. The wave is geometry-preserving                                 */
/* ------------------------------------------------------------------ */

/**
 * Both models, evaluated for the same mid-gesture state.
 *
 * OLD: a centred `w-max` flex row whose plates animate `width`/`height`.
 * NEW: fixed plates that translate/scale, inside a capsule whose padding
 *      animates instead.
 *
 * `navW` is the footer wrapper the capsule is centred in, `padX`/`padTop`/
 * `padBottom` the capsule's resting padding, `gap` the row gap.
 */
function models({ navW, padX, padTop, padBottom, gap, growths, lifts }) {
  const plate = 44;
  const n = growths.length;

  // ── old ────────────────────────────────────────────────────────────────
  const oldContentW = growths.reduce((sum, g) => sum + plate + g, 0) + (n - 1) * gap;
  const oldCapsuleW = oldContentW + 2 * padX;
  const oldCapsuleLeft = (navW - oldCapsuleW) / 2;
  const oldCentres = [];
  let cursor = oldCapsuleLeft + padX;
  growths.forEach((g, i) => {
    oldCentres.push(cursor + (plate + g) / 2);
    cursor += plate + g + gap;
  });
  const oldGrowthMax = Math.max(...growths);
  const oldCapsuleH = plate + oldGrowthMax + padTop + padBottom;
  // Bottom-aligned row: the content box is as tall as the largest plate.
  const oldTops = growths.map(
    (g, i) => padTop + (plate + oldGrowthMax - (plate + g)) - lifts[i],
  );

  // ── new ────────────────────────────────────────────────────────────────
  const growthTotal = growths.reduce((sum, g) => sum + g, 0);
  const newContentW = n * plate + (n - 1) * gap;
  const newPadX = padX + growthTotal / 2;
  const newCapsuleW = newContentW + 2 * newPadX;
  const newCapsuleLeft = (navW - newCapsuleW) / 2;
  const restCentres = [];
  let restCursor = newCapsuleLeft + newPadX;
  for (let i = 0; i < n; i += 1) {
    restCentres.push(restCursor + plate / 2);
    restCursor += plate + gap;
  }
  // GlassDock's `pushFor`: half the growth to the item's left minus half the
  // growth to its right — the shift a centred flex row produces on its own.
  const pushes = growths.map((_, i) => {
    let left = 0;
    let right = 0;
    growths.forEach((g, j) => {
      if (j < i) left += g;
      else if (j > i) right += g;
    });
    return (left - right) / 2;
  });
  const newCentres = restCentres.map((c, i) => c + pushes[i]);
  const newPadTop = padTop + oldGrowthMax;
  const newCapsuleH = plate + newPadTop + padBottom;
  // Scale about the plate's bottom edge, then the same −12px lift.
  const newTops = growths.map((g, i) => newPadTop + plate - (plate + g) - lifts[i]);

  return {
    old: { capsuleW: oldCapsuleW, capsuleLeft: oldCapsuleLeft, capsuleH: oldCapsuleH, centres: oldCentres, tops: oldTops },
    new: { capsuleW: newCapsuleW, capsuleLeft: newCapsuleLeft, capsuleH: newCapsuleH, centres: newCentres, tops: newTops },
  };
}

test("the transform-only wave draws the SAME dock the layout wave drew", () => {
  const cases = [
    // pointer on the first plate: the row is shoved right
    { growths: [24.2, 12.1, 3.3, 0, 0, 0, 0, 0], lifts: [12, 6, 1.6, 0, 0, 0, 0, 0] },
    // pointer in the middle of the eight-tab Home dock
    { growths: [0, 2.2, 14.5, 24.2, 9.8, 1.1, 0, 0], lifts: [0, 1.1, 7.2, 12, 4.9, 0.5, 0, 0] },
    // pointer on the last plate
    { growths: [0, 0, 0, 0, 4.4, 15.6, 24.2, 8.8], lifts: [0, 0, 0, 0, 2.2, 7.7, 12, 4.4] },
    // a fractional, everywhere-at-once state
    { growths: [7.13, 7.13, 7.13, 7.13, 7.13, 7.13, 7.13, 7.13], lifts: [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5] },
  ];

  for (const [index, { growths, lifts }] of cases.entries()) {
    const { old, new: next } = models({
      navW: 390,
      padX: 16,
      padTop: 12,
      padBottom: 12,
      gap: 8,
      growths,
      lifts,
    });

    assert.ok(
      Math.abs(old.capsuleW - next.capsuleW) < 1e-9,
      `case ${index}: capsule width ${next.capsuleW} != ${old.capsuleW}`,
    );
    assert.ok(
      Math.abs(old.capsuleLeft - next.capsuleLeft) < 1e-9,
      `case ${index}: capsule left edge ${next.capsuleLeft} != ${old.capsuleLeft}`,
    );
    assert.ok(
      Math.abs(old.capsuleH - next.capsuleH) < 1e-9,
      `case ${index}: capsule height ${next.capsuleH} != ${old.capsuleH}`,
    );

    old.centres.forEach((centre, i) => {
      assert.ok(
        Math.abs(centre - next.centres[i]) < 1e-9,
        `case ${index}: plate ${i} centre ${next.centres[i]} != ${centre}`,
      );
    });
    old.tops.forEach((top, i) => {
      assert.ok(
        Math.abs(top - next.tops[i]) < 1e-9,
        `case ${index}: plate ${i} top edge ${next.tops[i]} != ${top}`,
      );
    });
  }
});

/* ------------------------------------------------------------------ */
/* 2. What the dock may and may not do per frame                      */
/* ------------------------------------------------------------------ */

test("the plates keep a fixed box — no layout property is animated on an item", () => {
  // The old wave drove `width: size` / `height: size` off the spring; both are
  // gone, and the plate's box is the constant tap target instead.
  assert.doesNotMatch(dock, /width:\s*size\b/);
  assert.doesNotMatch(dock, /height:\s*size\b/);
  assert.match(dock, /width: plateSize,\s*\n\s*height: plateSize,/);
  // …and everything the wave does is a transform slot.
  assert.match(dock, /y: lift,\s*\n\s*scale,/);
  assert.match(dock, /style=\{\{ x: push \}\}/);
  // Growing from the plate's own baseline reproduces the bottom-aligned row.
  assert.match(dock, /transformOrigin: '50% 100%'/);
  // The neighbour push is the flex row's arithmetic, not a layout change.
  assert.match(dock, /push \+= centre > otherCentre \? growth : -growth/);
  assert.match(dock, /return push \/ 2/);
  // Tap feedback survives as a spring multiplied into the wave, because a
  // `whileTap` scale would fight `style={{scale}}` for the same slot.
  assert.match(dockCode, /const TAP_SCALE = 0\.82/);
  assert.match(dockCode, /useTransform\(\[magnify, press\]/);
  assert.doesNotMatch(dockCode, /whileTap=/);
});

test("the capsule carries the whole envelope change, on one element", () => {
  assert.match(dock, /paddingTop: padTop,/);
  assert.match(dock, /paddingInline: padInline,/);
  // One spring config drives plate, lift, push and padding, so the glass and
  // the plates can never drift apart mid-gesture.
  assert.match(dock, /const WAVE_SPRING = \{ stiffness: 300, damping: 22, mass: 0\.5 \} as const/);
  assert.equal(
    dockCode.match(/useSpring\(raw\w+, WAVE_SPRING\)/g)?.length,
    4,
    "plate scale, neighbour push, capsule growX, capsule growY",
  );
  assert.equal(dockCode.match(/useSpring\(/g)?.length, 5, "the four above + the press spring");
  // …and the wave's layout work stays inside the dock instead of dirtying the
  // page it floats over.
  assert.match(dock, /contain: 'layout style'/);
});

test("the pinned geometry of the dock is untouched", () => {
  assert.match(dock, /export const ICON_SIZE = 44/);
  assert.match(dock, /export const COMPACT_ICON_SIZE = 38/);
  assert.match(dock, /export const DENSE_ICON_SIZE = 34/);
  assert.match(dock, /export const MAG_RANGE = 120/);
  assert.match(dock, /export const MAG_SCALE = 1\.55/);
  assert.match(dock, /export const MAG_LIFT = 12/);
  assert.match(dock, /data-glass-dock=""/);
  assert.match(dock, /data-glass-dock-item=\{id\}/);
  // The swipe-to-select path other contracts pin is intact.
  assert.match(dock, /const id = idFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(dock, /skipClickRef\.current = true/);
  assert.match(dock, /touchAction: 'none'/);
});

test("centres are measured once per gesture, never once per frame", () => {
  // Exactly one `getBoundingClientRect` in the file, and it is inside the
  // measure() pass — not inside a pointer transform.
  const reads = dockCode.match(/getBoundingClientRect\(\)/g) || [];
  assert.equal(reads.length, 1, "one layout read, in measure()");
  const measureBody = dockCode.slice(
    dockCode.indexOf("const measureNow = useCallback"),
    dockCode.indexOf("useLayoutEffect(() =>"),
  );
  assert.ok(measureBody.length > 0, "measure() must precede the layout effect");
  assert.match(measureBody, /getBoundingClientRect\(\)/);
  // …and it refuses to run mid-spring: getComputedStyle reports the capsule's
  // ANIMATED padding, so measuring a magnified dock would take it for the
  // resting one and grow the footer a little further on every gesture.
  assert.match(dockCode, /if \(atRest\(\)\) \{\s*\n\s*measureNow\(\)/);
  // 0.05 px, not the old 0.5: the stricter threshold is the deliberate fix
  // for the FlowPath "footer area keeps growing" report (see atRest's own
  // comment) — a settled dock must measure again the moment it is settled.
  assert.match(dockCode, /const atRest = \(\) => Math\.abs\(growX\.get\(\)\) < 0\.05 && Math\.abs\(growY\.get\(\)\) < 0\.05/);
  assert.match(dockCode, /retryRef\.current = window\.setTimeout/);
  // The transforms read the cached layout instead.
  assert.match(dock, /const centre = layoutRef\.current\.centres\[id\]/);
  // …and the pass runs on mount, on resize, and on pointerdown — the three
  // moments the resting layout can actually differ.
  assert.match(dock, /useLayoutEffect\(\(\) => \{\s*measure\(\)/);
  assert.match(dockCode, /window\.addEventListener\(['"]resize['"], onResize\)/);
  assert.match(dock, /onPointerDown=\{\(event\) => \{\s*\n\s*\/\/ One read per gesture[\s\S]{0,120}measure\(\)/);
});

test("pointer moves are coalesced to one wave update per frame", () => {
  assert.match(dock, /frameRef\.current = window\.requestAnimationFrame\(flush\)/);
  assert.match(dock, /mouseX\.set\(next\)/);
  // A high-Hz panel fires several moves per frame; only the last is applied.
  assert.match(dock, /pendingX\.current = clientX/);
});

test("the gesture publishes one flag, so the footer height is not re-published mid-drag", () => {
  assert.match(dock, /document\.documentElement\.dataset\.dcDockGesture = 'true'/);
  assert.match(dock, /delete document\.documentElement\.dataset\.dcDockGesture/);
  assert.match(dock, /const GESTURE_SETTLE_MS = \d+/);
});

/* ------------------------------------------------------------------ */
/* 3. GlassMaterial: no lens rebuild storm                            */
/* ------------------------------------------------------------------ */

test("the refraction lens is bucketed and coalesced, not rebuilt per capsule size", () => {
  assert.match(material, /const LENS_W_STEP = 32/);
  assert.match(material, /const LENS_H_STEP = 24/);
  assert.match(material, /bucket\(el\.clientWidth, LENS_W_STEP\)/);
  assert.match(material, /bucket\(el\.clientHeight, LENS_H_STEP\)/);
  assert.match(material, /if \(key === lastKey\) return/);
  assert.match(material, /const ro = new ResizeObserver\(schedule\)/);
  // The pinned sensitivity never moved to buy the smoothness.
  assert.match(material, /GLASS_DOCS_SURFACE\.tintAlpha/);
  assert.match(material, /DOCK_PANEL_BG = `rgba\(\$\{GLASS_TINT_RGB\},\$\{GLASS_DOCS_SURFACE\.tintAlpha\}\)`/);
});

/* ------------------------------------------------------------------ */
/* 4. footerNavSpace: off the animation path                          */
/* ------------------------------------------------------------------ */

test("footerNavSpace watches footers, not every style write in the app", () => {
  // The body-wide attribute observer was what turned a drag into a
  // per-frame document measurement + root custom-property write.
  assert.doesNotMatch(footerSpace, /attributeFilter: \["class", "style"/);
  assert.match(footerSpace, /mo\.observe\(document\.body, \{ childList: true, subtree: true \}\)/);
  assert.match(footerSpace, /ro\.observe\(nav\)/);
  // Mid-gesture the capsule is mid-spring: nothing is published until the
  // dock settles, and the gesture flag flipping off is the cue.
  assert.match(footerSpace, /if \(gestureActive\(\)\) return/);
  assert.match(footerSpace, /dataset\.dcDockGesture === "true"/);
  assert.match(footerSpace, /attributeFilter: \["data-dc-dock-gesture"\]/);
  // The published variable, and the pages that consume it, are unchanged.
  assert.match(footerSpace, /setProperty\("--dc-footer-nav-h", `\$\{next\}px`\)/);
  assert.match(footerSpace, /Math\.max\(\.\.\.navs\.map\(\(nav\) => nav\.getBoundingClientRect\(\)\.height\)\) \+ 12/);
});

test("every footer still renders the ONE shared capsule (so the fix reaches all of them)", () => {
  for (const file of [
    "src/components/BottomNav.tsx",
    "src/components/myday/BottomNav.tsx",
    "src/revision/components/BottomNav.tsx",
    "src/cartWishlist/components/BottomNav.tsx",
  ]) {
    assert.match(read(file), /<SiteFooterNav/, `${file} must keep the shared footer`);
  }
  assert.match(read("src/components/SiteFooterNav.tsx"), /<GlassDock siteFooter/);
  // The course player's peek dock mounts the same GlassDock, so its drag gets
  // the same transform-only wave.
  assert.match(read("src/course/CoursePeekDock.tsx"), /<GlassDock compact items=\{items\} onSelect=\{handleSelect\} pointerX=\{pointerX\} \/>/);
});

/* ------------------------------------------------------------------ */
/* 5. The clamp-aware squeeze, and the filled dock's transform wave    */
/* ------------------------------------------------------------------ */

// "Track scroll animation keval ek side sahi se hota hai — left side drag
// per footer expand hota hai, right side sahi se nahin." The wave's math was
// always symmetric; the asymmetry was the `max-w-full` clamp. A width-filled
// dock (Home: the capsule already spans the nav at rest) cannot grow past
// it, so the symmetric padding ask degraded one-sided — the content box
// shrank, the fixed row overflowed right, dead space pooled left. The wave
// now grows only what fits: the measure pass records the free pixels per
// side, and capsule padding + neighbour push take the same squeezed share,
// so a filled dock squeezes symmetrically instead of spilling right.
//
// OWNER BRIEF, later the same day (2026-09-29): "Home page ka footer
// navigation use tarike se animate nahin karta jaise dusre dock jaise My Day
// ke karte hain drag scroll left right karne per." The squeeze fixed the
// spill — and froze Home's wave: the fill leaves ~2 px of headroom, so the
// push share resolved to ~0 and the row stopped rippling. On a FILLED dock
// the wave is now TRANSFORM-ONLY: the plates take the full neighbour push
// and the capsule asks for no horizontal layout growth — the clamp is
// unreachable, so symmetry is guaranteed by construction and the squeeze
// keeps governing every dock that still has room to grow into.
test("a width-filled dock rides a transform-only wave; roomy docks keep the squeeze", () => {
  // Headroom is measured in the same once-per-gesture pass — from the SAME
  // rects as the centres, so the file still holds exactly one layout read.
  assert.match(dockCode, /headroom = Number\.POSITIVE_INFINITY/);
  assert.match(dockCode, /closest\?\.\('\[data-site-footer-nav\]'\)/);
  assert.match(dockCode, /nav\.clientWidth - capsuleWidth/);
  // The squeeze is 1 while the growth fits, shrinking toward 0 past it…
  assert.match(dockCode, /const squeezeX = useTransform\(growX/);
  assert.match(dockCode, /return growth <= room \? 1 : Math\.max\(0, room \/ growth\)/);
  // …the capsule padding takes the squeezed share on a roomy dock, and NO
  // share at all on a filled one (there the glass never grows horizontally)…
  assert.match(dockCode, /\[growX, padInlineBase, squeezeX\]/);
  assert.match(dockCode, /filled \|\| layoutRef\.current\.spread \? 0 : \(growth \* sq\) \/ 2/);
  // …and the neighbour push runs at FULL strength on a filled dock (the
  // ripple is the point of the brief) while the squeeze still owns it
  // everywhere else. The push arithmetic itself is untouched (section 2).
  assert.match(dockCode, /const pushSpring = useSpring\(rawPush, WAVE_SPRING\)/);
  assert.match(dockCode, /const filled = fill !== null/);
  assert.match(dockCode, /const pushShare = useTransform\(squeezeX, \(sq: number\) => \(filled \? 1 : sq\)\)/);
  assert.match(dockCode, /const push = useTransform\(\[pushSpring, pushShare\], \(\[p, share\]: number\[\]\) => p \* share\)/);
  assert.match(dockCode, /pushShare=\{pushShare\}/);
  // The lift-to-select hit-test fails soft on a DOM without
  // `elementsFromPoint` (jsdom, old WebViews) instead of throwing mid-gesture.
  assert.match(dockCode, /typeof document\.elementsFromPoint !== 'function'/);
});
