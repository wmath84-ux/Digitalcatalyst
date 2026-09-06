// tests/flowpathFirstPaintContract.test.mjs
//
// Contract for the FlowPath "white flash on navigation" fix:
//
//   1. The theme attribute is applied to <html> SYNCHRONOUSLY (inside the
//      state initializer, i.e. before React commits / before first paint),
//      not only in a post-paint `useEffect`.
//   2. No FlowPath surface mounts invisible: the header, activity cards,
//      empty state and plus nodes all use `initial={false}` so the very
//      first painted frame already shows the UI instead of a ~0.7s blank.
//   3. The ribbon's container width is measured in `useLayoutEffect`
//      (pre-paint), so the ribbon and row layout are correct on frame one
//      instead of popping in after a ResizeObserver tick.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const useTheme = fs.readFileSync("src/flowpath/hooks/useTheme.ts", "utf8");
const flowPathView = fs.readFileSync("src/components/flowpath/FlowPathView.tsx", "utf8");
// FlowPath's dedicated header component was retired — the page now opens
// with the shared home greeting header (see src/FlowPathApp.tsx).
const flowPathApp = fs.readFileSync("src/FlowPathApp.tsx", "utf8");
const header = fs.readFileSync("src/home/components/Header.tsx", "utf8");
const emptyState = fs.readFileSync("src/components/flowpath/EmptyState.tsx", "utf8");
const activityCard = fs.readFileSync("src/components/flowpath/ActivityCard.tsx", "utf8");
const plusNode = fs.readFileSync("src/components/flowpath/PlusNode.tsx", "utf8");

test("FlowPath theme is applied to <html> synchronously, before the first paint", () => {
  // The attribute write must live in a shared helper used by the state
  // initializer (runs during render, pre-commit) — not only inside effects.
  assert.match(useTheme, /applyThemeAttribute/);
  // The initializer itself must call it, so the first painted frame already
  // carries the stored theme.
  assert.match(useTheme, /useState<"dark" \| "light">\(\(\) => \{[\s\S]*?applyThemeAttribute\(resolvedNow\)/);
  // The attribute is set on documentElement.
  assert.match(useTheme, /document\.documentElement\.setAttribute\("data-theme", resolved\)/);
});

test("no FlowPath surface mounts invisible (no opacity-0 entrance dead time)", () => {
  // The shared home header is plain static markup (no motion import at all),
  // so its first frame is never blank — FlowPathApp must keep using it.
  assert.match(flowPathApp, /import Header from "\.\/home\/components\/Header"/);
  assert.match(flowPathApp, /<Header\b/);
  assert.doesNotMatch(header, /from "framer-motion"/);
  // Empty state, activity cards and plus nodes must start at their final
  // values (`initial={false}`), so the first frame is never blank.
  assert.match(emptyState, /initial=\{false\}/);
  assert.match(activityCard, /initial=\{false\}/);
  assert.match(plusNode, /initial=\{false\}/);
  // And none of them may reintroduce an opacity-0 mount.
  assert.doesNotMatch(header, /initial=\{\{ opacity: 0/);
  assert.doesNotMatch(emptyState, /initial=\{\{ opacity: 0/);
  assert.doesNotMatch(activityCard, /initial=\{\{ opacity: 0/);
  assert.doesNotMatch(plusNode, /initial=\{\{ opacity: 0/);
});

test("the ribbon container width is measured before the first paint", () => {
  // useLayoutEffect runs synchronously after DOM mutation but before the
  // browser paints, so `width > 0` — and therefore the Ribbon — is already
  // correct on frame one instead of waiting for a ResizeObserver tick.
  assert.match(flowPathView, /import \{[^}]*useLayoutEffect[^}]*\} from "react"/);
  assert.match(flowPathView, /useLayoutEffect\(\(\) => \{[\s\S]*?new ResizeObserver/);
});
