// tests/chromeOverlayHeaderContract.test.mjs
//
// Headers overlay the page the same way the MAG footer does: they leave
// the flow so content can scroll under the frost. Every page keeps a
// transparent top pad equal to the expanded header height so the first
// content is not hidden, and that pad never paints a white strip.
//
// Gated like the footer overlay pad — a display:none site header on
// desktop must not stack leftover padding. Home overlay pad is the
// expanded header, never --home-collapse (header shrink + pad shrink
// would double-move the page). Phone Revision still pads even when a
// hidden `.dc-page-tabs` sibling sits in the DOM.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/index.css", "utf8");
const overlay = css.slice(css.lastIndexOf("CHROME OVERLAY"));
const desktop = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");
const homeHeader = fs.readFileSync("src/home/components/Header.tsx", "utf8");
const sharedHeader = fs.readFileSync("src/components/Header.tsx", "utf8");

test("overlay CSS is gated so display:none chrome cannot stack leftover pad", () => {
  assert.match(css, /CHROME OVERLAY/);
  assert.match(overlay, /@media \(max-width: 959px\)/);
  assert.match(overlay, /html:not\(\[data-tablet-landscape-desktop="true"\]\) body:not\(:has\(\.dc-desktop-shell\)\)/);
  assert.match(overlay, /--dc-site-header-seat:\s*4\.25rem/);
  assert.match(overlay, /--dc-site-header-seat:\s*5rem/);
});

test("phone and tablet-portrait site headers leave the flow", () => {
  assert.match(overlay, /\[data-app-frame\] > \[data-site-header\]/);
  assert.match(overlay, /position:\s*absolute/);
  assert.match(overlay, /z-index:\s*30/);
  // Shared header keeps sticky + glass classes so the glow contract still
  // reads the JSX; unlayered overlay CSS is what actually overlays.
  assert.match(sharedHeader, /sticky top-0/);
  assert.match(sharedHeader, /bg-white\/75/);
  assert.match(sharedHeader, /backdrop-blur-xl/);
});

test("scroller pads are transparent and equal the header seat", () => {
  assert.match(
    overlay,
    /\[data-app-frame\]:has\(> \[data-site-header\]:not\(\[data-home-header\]\)\):not\(:has\(> \[data-search-bar\]\)\) > main/,
  );
  assert.match(overlay, /padding-top:\s*var\(--dc-site-header-seat\)/);
  assert.match(overlay, /background-color:\s*transparent/);
  // Search seats the bar, not an extra main pad (the bar is already between
  // the overlay header and the results).
  assert.match(overlay, /> \[data-search-bar\] \{\s*margin-top:\s*var\(--dc-site-header-seat\)/);
  assert.match(overlay, /> \[data-myday-content\] \{\s*padding-top:\s*calc\(var\(--dc-site-header-seat\) \+ 1\.5rem\)/);
});

test("Home overlay pad is the expanded header, never the collapse", () => {
  assert.match(overlay, /\[data-app-frame\]:has\(> \[data-home-header\]\) > main/);
  assert.match(overlay, /var\(--dc-home-header-seat, 12\.5rem\)/);
  assert.doesNotMatch(overlay, /--home-collapse/);
  assert.match(homeHeader, /setProperty\("--dc-home-header-seat"/);
  assert.match(homeHeader, /setProperty\("--home-collapse", "0"\)/);
});

test("phone Revision pads even when a hidden page-tabs sibling exists", () => {
  // `hidden md:block` leaves `.dc-page-tabs` in the DOM on phone tab routes.
  // The always-on pad must live inside a max-width 767 gate so tablet
  // portrait (visible tabs) does not also inherit it.
  const phonePad = overlay.slice(
    overlay.indexOf("Always pad"),
    overlay.indexOf("@media (min-width: 768px) and (max-width: 959px)"),
  );
  assert.match(phonePad, /@media \(max-width: 767px\)/);
  assert.match(phonePad, /> \[data-revision-content\] \{\s*padding-top:\s*var\(--dc-site-header-seat\)/);
  assert.doesNotMatch(phonePad, /:not\(:has\(> \.dc-page-tabs\)\)/);

  const tabletPad = overlay.slice(overlay.indexOf("@media (min-width: 768px) and (max-width: 959px)"));
  assert.match(tabletPad, /> \.dc-page-tabs \{\s*margin-top:\s*var\(--dc-site-header-seat\)/);
  assert.match(tabletPad, /:not\(:has\(> \.dc-page-tabs\)\) > \[data-revision-content\]/);
});

test("desktop top bar overlays the shell scroller", () => {
  assert.match(desktop, /data-desktop-main/);
  assert.match(desktop, /data-desktop-topbar/);
  assert.match(desktop, /className="relative flex min-w-0 flex-1 flex-col"/);
  assert.match(desktop, /className="absolute inset-x-0 top-0 z-30/);
  assert.match(overlay, /\.dc-desktop-shell \[data-desktop-topbar\] \{\s*position:\s*absolute/);
  assert.match(
    overlay,
    /\.dc-desktop-shell \[data-desktop-content\] \{\s*padding-top:\s*calc\(var\(--desktop-topbar-height\) \+ 1\.5rem\) !important/,
  );
  assert.match(
    overlay,
    /\[data-desktop-topbar\]\[data-topbar-tabs\] ~ \[data-desktop-content\] \{\s*padding-top:\s*calc\(var\(--desktop-topbar-height\) \+ 2\.75rem \+ 1\.5rem\) !important/,
  );
  assert.match(
    overlay,
    /\[data-desktop-content\]:has\(> main \[data-revision-app\]\) \{\s*padding-top:\s*var\(--desktop-topbar-height\) !important;\s*padding-bottom:\s*0 !important/,
  );
});

test("overlay padding-top !important outranks the tablet-landscape clamp", () => {
  const clampAt = css.indexOf(".dc-desktop-shell [data-desktop-content] {\n    padding: clamp(12px, 1.5vw, 24px) !important");
  const overlayPadAt = css.lastIndexOf("padding-top: calc(var(--desktop-topbar-height) + 1.5rem) !important");
  assert.ok(clampAt >= 0, "expected the tablet-landscape clamp padding");
  assert.ok(overlayPadAt > clampAt, "overlay padding-top !important must come after the clamp rule");
});
