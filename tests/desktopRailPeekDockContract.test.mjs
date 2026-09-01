// tests/desktopRailPeekDockContract.test.mjs
//
// Desktop / tablet-landscape peek dock must sit on the PAGE column
// (not the full viewport), so an open left rail cannot make it look
// left-shifted. The rail has a glass toggle at its top-left; opening
// the dock hides the rail, pointer-leave shows it again.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/index.css", "utf8");
const shell = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");
const peek = fs.readFileSync("src/components/glass-dock/DesktopPeekDock.tsx", "utf8");

test("peek dock measures the page column instead of the full viewport", () => {
  assert.match(peek, /data-page-seat/);
  assert.match(peek, /\[data-desktop-content\] > main/);
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

test("peek dock reports open/close so the shell can hide the rail", () => {
  assert.match(peek, /onOpenChange/);
  assert.match(shell, /onOpenChange=\{setPeekOpen\}/);
  assert.match(shell, /data-peek-open/);
  assert.match(shell, /data-rail-hidden/);
  assert.match(shell, /railHidden = railCollapsed \|\| peekOpen/);
});

test("left rail has a glass toggle at its top-left to open and close", () => {
  assert.match(shell, /data-desktop-rail-toggle/);
  assert.match(shell, /RailGlassToggle/);
  assert.match(shell, /PanelLeftClose/);
  assert.match(shell, /Show side panel/);
  assert.match(shell, /Hide side panel/);
  assert.match(shell, /GlassMaterial/);
  assert.match(css, /\[data-desktop-rail-toggle\]/);
});

test("CSS collapses the rail when hidden and snaps it back after peek close", () => {
  assert.match(css, /\[data-rail-hidden="true"\] \[data-desktop-rail\]/);
  assert.match(css, /width:\s*0 !important/);
  assert.match(css, /\[data-peek-open="false"\]\[data-rail-collapsed="false"\] \[data-desktop-rail\]/);
  assert.match(css, /transition-duration:\s*0s/);
});

test("peek line width is a fraction of the page column, not 68vw", () => {
  const lineBlock = css.slice(css.lastIndexOf("[data-desktop-peek-line] {"));
  assert.match(lineBlock, /width:\s*min\(22rem,\s*68%\)/);
});
