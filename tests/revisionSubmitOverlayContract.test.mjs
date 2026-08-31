// tests/revisionSubmitOverlayContract.test.mjs
//
// Contract for the reported revision-page bug: the "Submit your test?"
// confirmation overlay rendered at an excessively large size on tablets
// and desktops, spilling below the app column and over the persistent
// side panel.
//
// Requirements locked down here:
//   1. The overlay resolves its bounds column reliably (re-queried on
//      mount, retried one frame later) so it can scope itself to the
//      revision content column instead of falling back to a full-window
//      overlay on tablet/desktop.
//   2. The overlay box is clamped to the visible viewport — it can never
//      extend below the screen or require scrolling.
//   3. The dialog is height-capped with a 100vh fallback (upgraded to
//      100dvh only inside @supports) and scrolls internally when capped,
//      so the actions can never be pushed off-screen on short viewports.
//   4. The overlay keeps a high z-index above page chrome.
//
// Pure code-shape — no React, no DOM, no browser.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const player = fs.readFileSync("src/revision/pages/TestPlayerPage.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

test("the submit overlay re-resolves its bounds column on mount", () => {
  // The bounds element is resolved from the page scroller, falling back to
  // the revision content column, and re-queried on every mount.
  assert.match(player, /document\.querySelector<HTMLElement>\("\[data-revision-page-main\]"\)/);
  assert.match(player, /document\.querySelector<HTMLElement>\("\[data-revision-content\]"\)/);
  // If the page shell has not committed its <main> yet, resolution is
  // retried one frame later instead of silently downgrading the overlay.
  assert.match(player, /requestAnimationFrame/);
  assert.match(player, /setBoundsReady\(true\)/);
});

test("the overlay is clamped to the visible viewport", () => {
  // Even a stale/degenerate measurement can never push the overlay below
  // the viewport bottom.
  assert.match(
    player,
    /Math\.max\(0, Math\.min\(box\.height, window\.innerHeight - box\.top\)\)/,
    "the overlay height must be clamped to the visible viewport",
  );
  // The scoped branch positions against the measured box.
  assert.match(player, /\{ top: box\.top, left: box\.left, width: box\.width, height: overlayHeight \}/);
});

test("the dialog is height-capped with a universal 100vh fallback and internal scroll", () => {
  // Base cap at 100vh (universal support) — a bare 100dvh declaration
  // would drop on engines without dynamic-viewport units, leaving the
  // dialog uncapped and overflowing below the screen.
  const base = /\[data-rev-submit-dialog\]\s*\{([^}]*)\}/.exec(css)?.[1];
  assert.ok(base, "expected a [data-rev-submit-dialog] rule in index.css");
  assert.match(base, /max-height:\s*min\(100vh - 2rem, 28rem\)/);
  assert.match(base, /overflow-y:\s*auto/, "capped content must scroll inside the card");
  // The dvh upgrade lives inside @supports only.
  assert.match(
    css,
    /@supports \(height:\s*100dvh\)[\s\S]*?\[data-rev-submit-dialog\][\s\S]*?max-height:\s*min\(100dvh - 2rem, 28rem\)/,
    "the 100dvh cap must be gated behind @supports",
  );
  // The dialog element opts into the cap (data attribute) and the scoped
  // mode overrides it with the measured column's height.
  assert.match(player, /data-rev-submit-dialog/);
  assert.match(player, /maxHeight: isScoped && box \? "100%" : undefined/);
});

test("the overlay keeps a high z-index above page chrome", () => {
  // Both the scoped and the full-window variants stay at z-[90], above the
  // site header (z-30), the rail (z-40) and every page card.
  assert.match(player, /fixed z-\[90\] flex items-center justify-center p-3 sm:p-4/);
  assert.match(player, /fixed inset-0 z-\[90\] flex items-end justify-center sm:items-center sm:p-4/);
});

test("phone-mode fallback stays a bottom sheet, tablet/desktop centering is preserved", () => {
  // Below sm the fallback docks to the bottom edge (bottom-sheet model);
  // from sm up it centers — never a full-bleed sheet on wide screens.
  assert.match(player, /items-end justify-center sm:items-center sm:p-4/);
});
