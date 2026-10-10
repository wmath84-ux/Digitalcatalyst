// tests/liquidGlassWaveFourContract.test.mjs
//
// Contract for Wave 4 of the website-glass rollout (docs/liquid-glass-rollout-plan.md):
// the learning surfaces — My Day, FlowPath and the revision app — plus the last
// three interactive registry items (`glass-switch`, `glass-slider`,
// `glass-popover`) that those surfaces needed.
//
// Same philosophy as the Wave 1/2/3 contracts: app-facing behaviour, data hooks
// and pinned class strings survive untouched; the vendored items stay
// byte-comparable to the registry (modulo the documented type-only
// adaptations); and every light-theme correction is CSS in src/glass.css, never
// a forked component, so `?glass=off` restores the published material.
//
// The last three tests are deliberately about what Wave 4 did *not* touch, so a
// later wave cannot "helpfully" swap them and break a pinned contract.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** strip comments so a note *about* a removed class cannot satisfy an assertion */
const code = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
const exists = (p) => fs.existsSync(new URL(`../${p}`, import.meta.url));

test("Wave 4 installs the last three interactive registry items", () => {
  const trio = [
    "src/components/ui/glass-switch.tsx",
    "src/components/ui/glass-slider.tsx",
    "src/components/ui/glass-popover.tsx",
  ];
  for (const f of trio) assert.ok(exists(f), `missing ${f}`);

  const sw = read("src/components/ui/glass-switch.tsx");
  assert.match(sw, /role="switch"/);
  assert.match(sw, /aria-checked=\{on\}/);
  assert.match(sw, /<GlassLens/);
  assert.match(sw, /components\/ui\/glass-motion/);

  const sl = read("src/components/ui/glass-slider.tsx");
  assert.match(sl, /role="slider"/);
  assert.match(sl, /aria-valuenow=\{val\}/);
  assert.match(sl, /case "Home"/);
  assert.match(sl, /case "End"/);

  const po = read("src/components/ui/glass-popover.tsx");
  assert.match(po, /createPortal\(/);
  assert.match(po, /addEventListener\("scroll", place, true\)/);
  assert.match(po, /<GlassSurface tint=\{tint\} radius=\{20\}/);

  // This tsconfig exposes no global `React` namespace: the vendored copies must
  // keep the documented type-only adaptation and never regress to `React.X`.
  for (const f of trio) assert.doesNotMatch(read(f), /: React\./);
});

test("the fidelity checker knows about the Wave 4 adaptations", () => {
  const script = read("scripts/verify-glass-registry.mjs");
  for (const name of ["glass-switch.tsx", "glass-slider.tsx", "glass-popover.tsx"]) {
    assert.match(script, new RegExp(`"${name}": \\[`), `${name} not declared`);
  }
  assert.match(script, /type PointerEvent as ReactPointerEvent,/);
});

test("FlowPath's native range inputs became the registry slider", () => {
  for (const f of [
    "src/components/flowpath/CurveSettingsModal.tsx",
    "src/components/flowpath/CreateModal.tsx",
  ]) {
    const s = read(f);
    assert.match(s, /<GlassSlider/, `${f} has no slider`);
    assert.match(s, /from "\.\.\/ui\/glass-slider"/);
    assert.doesNotMatch(code(s), /type="range"/, `${f} still renders a native range`);
    // Wave 6 correction, asserted here so it cannot silently come back: FlowPath
    // must NOT force the dark palette. `flowpath/hooks/useTheme.ts` writes
    // `data-theme` on <html> (dark default, removed on unmount), so the pack's
    // own `useGlassDark()` already picks the right ink — and an `!important`
    // dark rule would have broken FlowPath's *light* theme. The class now belongs
    // to the course player, which has no theme attribute at all.
    assert.doesNotMatch(code(s), /dc-slider-on-dark/);
  }
  // the dark-canvas correction (course player) is CSS, so it disappears with
  // the kill switch
  const css = read("src/glass.css");
  assert.match(css, /course player's seek bar/);  // (the sentence wraps in the file)
  assert.match(css, /html\[data-glass="on"\] \.dc-slider-on-dark > span:first-child/);
  assert.match(css, /dc-slider-on-dark > span:nth-child\(2\)/);
});

test("FlowPath's inline toast became the shared glass toast host", () => {
  const v = read("src/components/flowpath/FlowPathView.tsx");
  assert.doesNotMatch(v, /setToast/, "FlowPath still owns toast state");
  assert.match(v, /toast\.success\(/);
  // (toast.info was only the unused "coming soon" dock stub, removed with the dock's dead props.)
  assert.match(v, /from "\.\.\/ui\/glass-toast"/);
  // one host for every route, mounted next to the palette in the same provider tree
  const main = read("src/main.tsx");
  assert.match(main, /<GlassToaster position="bottom-right" \/>/);
  assert.match(main, /<GlassCommandPalette \/>/);
});

test("revision and My Day pickers use the pack's selectable components", () => {
  const bank = read("src/revision/pages/RevisionBankPage.tsx");
  assert.match(bank, /<GlassToggleGroup/);
  assert.match(bank, /data-rev-bank-view-switch/);
  assert.doesNotMatch(bank, /dc-glass-soft grid grid-cols-2/, "the hand-rolled switch is back");
  assert.doesNotMatch(bank, /setView\("tests"\)/);

  const gen = read("src/revision/pages/AiGeneratePage.tsx");
  // GlassTile was removed from the UI; the mode grid is plain buttons whose
  // selected state is the border/fill class keyed on questionMode.
  assert.match(gen, /data-rev-question-mode-grid/);
  assert.match(gen, /questionMode === m\.value\s*\?\s*"border-indigo-400 bg-indigo-500\/15"/);

  const cfg = read("src/revision/components/AiConfigForm.tsx");
  assert.match(cfg, /<GlassTile/);
  assert.match(cfg, /selected=\{selected\}/);
  // per-provider identity ring survives the swap
  assert.match(cfg, /selected \? meta\.ring : ""/);

  // The planner's Quick Notes surface went with the planner (the personal
  // workspace is the Joplin workspace now, with Joplin's own editor chrome),
  // so the only "selectable component" consumer left here is Revision.
});

test("the light-theme tile ink keeps the pack's unselected look intact", () => {
  const css = read("src/glass.css");
  assert.match(css, /:where\(\.dc-tile\)\[data-selected\]/);
  assert.match(css, /:where\(\.dc-tile\):not\(\[data-selected\]\)/);
  assert.match(css, /:where\(\.dc-segment\)\[data-stretch\] > div\[role="group"\]/);
});

test("Wave 4 is exercised in the glass preview page", () => {
  const preview = read("src/GlassPreview.tsx");
  assert.match(preview, /Wave 4 · learning surfaces/);
  for (const tag of ["<GlassSwitch", "<GlassSlider", "<GlassTile", "<PopoverContent"]) {
    assert.ok(preview.includes(tag), `preview never renders ${tag}`);
  }
});

/* ── deliberate non-changes, pinned so nobody "fixes" them ───────────────── */

test("active Revision cards use Recall's scoped surface system", () => {
  const revisionApp = read("src/revision/RevisionApp.tsx");
  const recallUi = read("src/revision/components/recall-ui.tsx");
  const dashboard = read("src/revision/recall/components/dashboard.tsx");
  assert.match(revisionApp, /data-recall-root/);
  assert.match(revisionApp, /bg-background/);
  assert.match(recallUi, /export function RecallCard/);
  assert.match(recallUi, /cardSurface\(/);
  assert.match(dashboard, /cardSurface\(/);
  assert.doesNotMatch(revisionApp, /dc-scene-plate/);
});


