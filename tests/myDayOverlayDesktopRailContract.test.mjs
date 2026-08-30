import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const overlayBounds = fs.readFileSync("src/components/ui/overlayBounds.tsx", "utf8");
const modal = fs.readFileSync("src/components/ui/Modal.tsx", "utf8");
const confirmDialog = fs.readFileSync("src/components/ui/ConfirmDialog.tsx", "utf8");
const desktopShell = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");

test("overlay scoping engages whenever the desktop shell rail is on screen, not only >=768px", () => {
  // The desktop shell's left rail renders on tablets in landscape from
  // 640 px up — a full 640–767 px band BELOW the 768 px media query. On
  // that band a full-window My Day overlay slides UNDER the rail (the
  // rail is z-40 at the root stacking level, page overlays live in the
  // lower .dc-app-shell stacking context). Scoping must therefore also
  // fire when the bounds element sits inside `[data-desktop-shell]`.
  assert.match(
    overlayBounds,
    /el\.closest\("\[data-desktop-shell\]"\)/,
    "overlayBounds must detect when the content column lives inside the desktop shell",
  );
  assert.match(
    overlayBounds,
    /if \(!wide && !insideDesktopRail\(boundsRef\)\)/,
    "scoping must fall back to the full-window sheet only when NEITHER >=768px NOR the shell rail applies",
  );
});

test("the desktop shell actually marks its root with [data-desktop-shell]", () => {
  // The closest() selector above is only as good as the attribute on the
  // shell root — pin the contract both sides of the boundary.
  assert.match(desktopShell, /data-desktop-shell/);
});

test("phone-mode fallback is preserved when no rail exists", () => {
  // Below 768 px without the shell (phones, tablet portrait), overlays
  // stay full-window bottom sheets — the measure must clear the box.
  assert.match(overlayBounds, /const OVERLAY_SCOPED_MIN_WIDTH = 768/);
  assert.match(overlayBounds, /matchMedia\(`\(min-width: \$\{OVERLAY_SCOPED_MIN_WIDTH\}px\)`\)/);
});

test("both My Day overlays consume the shared scoping hook", () => {
  // TaskModal / ScheduleModal wrap Modal, and delete confirmations wrap
  // ConfirmDialog — both must keep going through useOverlayBox so the
  // rail-aware fix reaches every create/edit/confirm overlay at once.
  assert.match(modal, /useOverlayBox\(open, resolvedBounds\)/);
  assert.match(confirmDialog, /useOverlayBox\(open, boundsRef\)/);
});

test("scoped state derives from a measured box, not from the raw width flag", () => {
  // scoped === "we actually positioned against the column". Returning
  // `open && box` keeps Modal/ConfirmDialog in the scoped branch exactly
  // when the measure produced a rectangle (width flag alone used to
  // suppress it under 768 px even when the rail was on screen).
  assert.match(overlayBounds, /return \{ scoped: Boolean\(open && box\), box \}/);
});
