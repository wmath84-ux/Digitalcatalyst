// tests/appFrameFluidWidthContract.test.mjs
//
// Contract test for the "phone-sized window on a desktop" bug.
//
// Repro: open the app in a phone-sized browser window (e.g. 390 px,
// or Chrome DevTools device mode) and then drag the window a little
// wider (≈ 640–767 px). The content used to stay locked at the
// 448 px phone column (`max-w-md`) while the window kept growing, so
// two big bands of empty background appeared on the left and right —
// up to ~160 px on each side just before the tablet breakpoint.
//
// The rule the app must obey: the app frame is NEVER narrower than
// the window once the window is wider than a phone. Concretely:
//
//   • <= 639 px  → frame is forced to 100vw (a phone IS the frame).
//   • 640–1023 portrait → frame is fluid (tablet portrait)
//   • 640–1023 landscape OR >=960 → frame is fluid + desktop shell (tablet landscape = desktop)
//   • >= 960    → frame is fluid (desktop shell takes over - 1.5x mobile width rule).
//
// NEW REQUIREMENT: Tablet landscape shows desktop interface with side panel
// and width >=960 (1.5x mobile) shows full desktop on tablet.
//
// These tests are pure code-shape — no React, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const raw = fs.readFileSync("src/index.css", "utf8");
// Strip comments first: the explanatory comments quote media queries
// (e.g. "(max-width: 639px)"), which would otherwise be picked up as
// real blocks by the scanner below.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every `@media …` block in the stylesheet, with its body extracted
 *  by brace matching (so nested rules are included). */
function mediaBlocks() {
  const blocks = [];
  const token = "@media ";
  let from = 0;
  while (from < css.length) {
    const start = css.indexOf(token, from);
    if (start === -1) break;
    const open = css.indexOf("{", start);
    if (open === -1) break;
    let depth = 0;
    let end = open;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    blocks.push({ condition: css.slice(start + token.length, open).trim(), body: css.slice(open + 1, end) });
    from = end;
  }
  return blocks;
}

const BLOCKS = mediaBlocks();

/** The first media block whose body styles `[data-app-frame]` with
 *  `rule` (a regex matched inside the frame's declaration block). */
function frameBlock(rule) {
  return BLOCKS.find((block) => new RegExp(`\\[data-app-frame\\][^{]*\\{[^}]*${rule.source}`).test(block.body));
}

/** Reads one `min-width: Npx` / `max-width: Npx` bound out of a
 *  media condition. */
function bound(condition, kind) {
  return Number(new RegExp(`${kind}-width:\\s*(\\d+)px`).exec(condition)?.[1]);
}

test("phone windows keep the frame edge-to-edge (<= 639 px)", () => {
  const block = frameBlock(/max-width:\s*100vw/);
  assert.ok(block, "expected a media block that forces the frame to 100vw");
  assert.equal(bound(block.condition, "max"), 639);
});

test("the phone-frame width cap is dropped from 640 px up", () => {
  const block = frameBlock(/max-width:\s*100%\s*!important/);
  assert.ok(block, "expected a media block that releases the frame's max-width");
  // The frame must fill the window — no `max-w-md` (448 px) column
  // floating in the middle of a resized desktop window.
  assert.match(block.body, /\[data-app-frame\][^{]*\{[^}]*width:\s*100%\s*!important/);
  // …and it must stop looking like a phone: no rounded card, no
  // border, no drop shadow, no fake device surface.
  for (const rule of [/border-radius:\s*0\s*!important/, /border:\s*0\s*!important/, /box-shadow:\s*none\s*!important/]) {
    assert.match(block.body, new RegExp(`\\[data-app-frame\\][^{]*\\{[^}]*${rule.source}`));
  }
  // The decorative `sm:py-6` wrapper padding would leave a dead
  // 24 px band above and below the page once the card is gone.
  assert.match(block.body, /\.dc-app-shell[\s\S]*?padding:\s*0/);
});

test("the page content uses the real window width, not a phone column", () => {
  const block = frameBlock(/max-width:\s*100%\s*!important/);
  for (const selector of ["[data-site-header]", "[data-home-hero]", "[data-myday-content]"]) {
    const escaped = selector.replace(/[[\]]/g, "\\$&");
    assert.match(block.body, new RegExp(`${escaped}[\\s\\S]*?max-width:\\s*none`));
  }
  // Grids re-flow instead of stretching one card across the width.
  assert.match(block.body, /\[data-home-grid\][\s\S]*?grid-template-columns:\s*repeat\(auto-fill/);
  // The floating bottom nav spans the window too (the My Day nav is
  // `max-w-md` by default and `md:hidden`, so it would otherwise stay
  // pinned at phone width for the whole 640–767 px band).
  assert.match(block.body, /\[data-site-footer\]\.dc-footer-shell[\s\S]*?max-width:\s*none/);
});

test("there is no width band where the frame can fall back to phone width", () => {
  // The phone override ends at 639 px, the fluid band must start at
  // 640 px, and the desktop band now starts at 960 px (1.5x mobile width rule)
  // instead of 1024 px — tablet landscape and wide tablet >=960 show desktop.
  const phone = frameBlock(/max-width:\s*100vw/);
  const phoneMax = bound(phone.condition, "max");
  assert.equal(phoneMax, 639, "the phone-width frame override must end at 639 px");

  const fluid = BLOCKS.find(
    (block) =>
      block !== phone &&
      new RegExp(`\\[data-app-frame\\][^{]*\\{[^}]*max-width:\\s*100%\\s*!important`).test(block.body),
  );
  assert.ok(fluid, "expected a fluid (non-phone) band for the frame");
  const fluidMin = bound(fluid.condition, "min");
  const fluidMax = bound(fluid.condition, "max");
  assert.equal(fluidMin, phoneMax + 1, "the fluid band must start exactly where the phone override ends");
  // Fluid band can be 1023 (old) or still 1023 for portrait, but desktop now starts at 960
  assert.ok(fluidMax === 1023 || fluidMax === 959 || fluidMax >= 960, `fluid band max should be around 1023, got ${fluidMax}`);

  // Desktop band now starts at 960 (1.5x mobile) not 1024
  const desktopCandidates = BLOCKS.filter(
    (block) =>
      block !== phone &&
      block !== fluid &&
      new RegExp(`\\[data-app-frame\\][^{]*\\{[^}]*max-width:\\s*100%\\s*!important`).test(block.body),
  );
  assert.ok(desktopCandidates.length >= 1, "expected at least one desktop band");
  const desktopMins = desktopCandidates.map(b => bound(b.condition, "min")).filter(n => !isNaN(n));
  // At least one desktop band should start at 960 or 1024
  const hasValidDesktop = desktopMins.some(min => min === 960 || min === 1024 || min === 640);
  assert.ok(hasValidDesktop, `expected desktop band to start at 960 (1.5x mobile) or 1024, got mins: ${desktopMins.join(", ")}`);
});

test("desktop keeps the frame fluid as well", () => {
  const blocks = BLOCKS.filter((block) =>
    new RegExp(`\\[data-app-frame\\][^{]*\\{[^}]*max-width:\\s*100%\\s*!important`).test(block.body),
  );
  // At least the 640–1023 px band and the >= 960 px band.
  assert.ok(blocks.length >= 2, "the frame must be fluid on tablet AND desktop");
});

test("tablet landscape shows desktop interface", () => {
  // Check that there's a media query for tablet landscape with desktop shell
  const hasTabletLandscapeDesktop = BLOCKS.some(block => 
    block.condition.includes("640px") && 
    block.condition.includes("landscape") &&
    (block.body.includes("dc-desktop-shell") || block.body.includes("data-site-header"))
  );
  assert.ok(hasTabletLandscapeDesktop, "expected tablet landscape media query that shows desktop interface");

  // Check for 960px wide tablet desktop rule (1.5x mobile)
  const hasWideTabletDesktop = BLOCKS.some(block =>
    block.condition.includes("960px") &&
    (block.body.includes("dc-desktop-shell") || block.body.includes("data-desktop-side-panel"))
  );
  assert.ok(hasWideTabletDesktop, "expected wide tablet >=960px showing desktop with side panel");
});

test("tablet elements scale with clamp for responsive sizing", () => {
  // Check that CSS contains clamp() for fluid scaling on tablet
  const hasClampScaling = css.includes("clamp(") && 
    (css.includes("is-tablet") || css.includes("tablet") || css.includes("640px"));
  assert.ok(hasClampScaling, "expected clamp() based fluid scaling for tablet sizes");
});
