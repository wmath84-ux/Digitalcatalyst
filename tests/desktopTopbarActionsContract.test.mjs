import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/index.css", "utf8");
const shell = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");

test("small-tablet top bar: the ≤899px grow-all rule exists but must exclude the action buttons", () => {
  // The ≤899 px band stretches every direct child of the top-bar row so the
  // search input can take a full wrapped row. Verified on a 700–899 px
  // tablet landscape: the rule also stretched the actions cluster to half
  // the bar, and its left-aligned buttons drifted to the CENTRE of the
  // header. The cluster must be pinned back to its natural width so the
  // title pushes it flush RIGHT — matching phones, tablet portrait and
  // desktop.
  assert.match(
    css,
    /\.dc-desktop-shell \[data-desktop-topbar-row\] > \* \{\s*flex: 1 1 auto;/,
    "the ≤899px stretch rule should still exist for the title/search",
  );
  assert.match(
    css,
    /\.dc-desktop-shell \[data-desktop-topbar-actions\] \{\s*flex: 0 0 auto;/,
    "the top-bar action buttons must NOT grow — they stay pinned to the right end of the bar",
  );
});

test("the actions-pinning override is placed AFTER the grow-all rule so it wins", () => {
  const growAll = css.indexOf("[data-desktop-topbar-row] > * {");
  const pinBack = css.indexOf("[data-desktop-topbar-actions] {");
  assert.ok(growAll >= 0, "grow-all rule missing");
  assert.ok(pinBack > growAll, "the flex: 0 0 auto override must come after the grow-all rule");
});

test("the top bar keeps its title-first/actions-last row structure", () => {
  // Title takes the flexible slot, the actions cluster carries the icon
  // buttons — the pinning depends on this composition.
  assert.match(shell, /data-desktop-topbar-row/);
  const rowIndex = shell.indexOf("data-desktop-topbar-row");
  const titleIndex = shell.indexOf("min-w-0 flex-1", rowIndex);
  const actionsIndex = shell.indexOf("data-desktop-topbar-actions");
  assert.ok(titleIndex >= 0 && actionsIndex > titleIndex, "title must stay the flexible first item, actions the last");
});
