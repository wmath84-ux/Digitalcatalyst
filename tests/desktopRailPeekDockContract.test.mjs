// tests/desktopRailPeekDockContract.test.mjs
//
// Desktop / tablet-landscape peek dock must sit on the PAGE column
// (`[data-desktop-main]`), not the full viewport including the left
// rail. There is no rail-hide toggle and the dock does not collapse
// the side panel when it opens.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/index.css", "utf8");
const shell = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");
const peek = fs.readFileSync("src/components/glass-dock/DesktopPeekDock.tsx", "utf8");

test("peek dock measures the page column instead of the full viewport", () => {
  assert.match(peek, /data-page-seat/);
  assert.match(peek, /\[data-desktop-main\]/);
  assert.match(peek, /getBoundingClientRect/);
  assert.match(peek, /ResizeObserver/);
  assert.match(peek, /host\.style\.left/);
  assert.match(peek, /host\.style\.width/);
  assert.doesNotMatch(
    peek,
    /className="fixed inset-x-0 bottom-0/,
    "must not centre on the full viewport",
  );
});

test("the side panel has no hide button and the dock does not collapse it", () => {
  assert.doesNotMatch(shell, /data-desktop-rail-toggle/);
  assert.doesNotMatch(shell, /RailGlassToggle/);
  assert.doesNotMatch(shell, /railCollapsed/);
  assert.doesNotMatch(shell, /railHidden/);
  assert.doesNotMatch(shell, /setPeekOpen/);
  // The wide-band rail is the static <aside>; the compact (<=1023 px) band
  // uses the pack GlassSidebar with a controlled expand state instead
  // (see liquidGlassWaveTwoContract for the pin on that).
  assert.match(shell, /<aside\s+data-desktop-rail/);
  assert.doesNotMatch(peek, /onOpenChange/);
  assert.doesNotMatch(css, /\[data-desktop-rail-toggle\]/);
  assert.doesNotMatch(css, /\[data-rail-hidden="true"\]/);
});

test("peek line width is a fraction of the page column, not 68vw", () => {
  const lineBlock = css.slice(css.lastIndexOf("[data-desktop-peek-line] {"));
  assert.match(lineBlock, /width:\s*min\(22rem,\s*68%\)/);
  assert.doesNotMatch(css, /68vw/);
});
