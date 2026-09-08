// tests/flowpathFirstPaintContract.test.mjs
//
// Contract for the FlowPath "white flash on navigation" fix:
//
//   1. Nothing in FlowPath publishes a theme any more — the app is dark
//      only, so the hook that wrote `data-theme` on <html> is deleted and
//      the first frame can never be painted in the wrong scheme.
//   2. No FlowPath surface mounts invisible: the header, activity cards,
//      empty state and plus nodes all use `initial={false}` so the very
//      first painted frame already shows the UI instead of a ~0.7s blank.
//   3. The ribbon's container width is measured in `useLayoutEffect`
//      (pre-paint), so the ribbon and row layout are correct on frame one
//      instead of popping in after a ResizeObserver tick.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const flowPathView = fs.readFileSync("src/components/flowpath/FlowPathView.tsx", "utf8");
// FlowPath's dedicated header component was retired — the page now opens
// with the shared home greeting header (see src/FlowPathApp.tsx).
const flowPathApp = fs.readFileSync("src/FlowPathApp.tsx", "utf8");
const header = fs.readFileSync("src/home/components/Header.tsx", "utf8");
const emptyState = fs.readFileSync("src/components/flowpath/EmptyState.tsx", "utf8");
const activityCard = fs.readFileSync("src/components/flowpath/ActivityCard.tsx", "utf8");
const plusNode = fs.readFileSync("src/components/flowpath/PlusNode.tsx", "utf8");

test("FlowPath publishes no theme — the app is dark only", () => {
  // The pre-paint `data-theme` write is gone with the light theme: there is
  // one scheme, so nothing can flash the wrong one on the first frame.
  assert.ok(!fs.existsSync("src/flowpath/hooks/useTheme.ts"), "the theme hook is deleted");
  assert.doesNotMatch(flowPathView, /useTheme/);
  assert.doesNotMatch(flowPathView, /data-theme/);
  // …and the app-level scheme writer pins dark, never light.
  const scheme = fs.readFileSync("src/lib/glassScheme.ts", "utf8");
  assert.match(scheme, /classList\.add\("dark"\)/);
  assert.doesNotMatch(scheme, /classList\.toggle\("light"/);
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
