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
  assert.match(v, /toast\.info\(/);
  assert.match(v, /from "\.\.\/ui\/glass-toast"/);
  // one host for every route, mounted next to the palette in the same provider tree
  const main = read("src/main.tsx");
  assert.match(main, /<ToastViewport \/>/);
  assert.match(main, /<GlassCommandPalette \/>/);
});

test("revision and My Day pickers use the pack's selectable components", () => {
  const bank = read("src/revision/pages/RevisionBankPage.tsx");
  assert.match(bank, /<GlassToggleGroup/);
  assert.match(bank, /data-rev-bank-view-switch/);
  assert.doesNotMatch(bank, /dc-glass-soft grid grid-cols-2/, "the hand-rolled switch is back");
  assert.doesNotMatch(bank, /setView\("tests"\)/);

  const gen = read("src/revision/pages/AiGeneratePage.tsx");
  assert.match(gen, /<GlassTile/);
  assert.match(gen, /data-rev-question-mode-grid/);
  assert.doesNotMatch(gen, /aria-pressed=\{questionMode/, "selected state must come from the pack");

  const cfg = read("src/revision/components/AiConfigForm.tsx");
  assert.match(cfg, /<GlassTile/);
  assert.match(cfg, /selected=\{selected\}/);
  // per-provider identity ring survives the swap
  assert.match(cfg, /selected \? meta\.ring : ""/);

  const notes = read("src/components/myday/QuickNotes.tsx");
  assert.match(notes, /from "\.\.\/ui\/glass-tooltip"/);
  // Phase A5: the tooltip runs on the pack's own default tint (0.55) — no
  // app-side 0.85 white wash, and the label inherits the pack's white ink.
  assert.match(notes, /<TooltipContent side="top">/);
  assert.doesNotMatch(notes, /<TooltipContent[^>]*tint=/, "tooltip must use the pack's own tint");
  assert.doesNotMatch(notes, /title="[^"]*"/, "a native title bubble is still shipping");
  // the pinned editor hooks survive
  assert.match(notes, /data-myday-note-editor-cancel/);
  assert.match(notes, /data-myday-note-save/);
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

test("revision cards ARE the pack surface (Phase A4)", () => {
  // Phase A4 reversed the earlier "stable painted surface" decision on the
  // owner's direction: every element is a websiteglass component. `Card` renders
  // GlassSurface at Glass Card's values; `.rev-card` stays as a sizing hook only.
  const ui = read("src/revision/components/ui.tsx");
  const cardFn = ui.slice(ui.indexOf("export function Card"), ui.indexOf("export function PrimaryButton"));
  assert.ok(cardFn.length > 40, "Card/PrimaryButton order changed — update this contract");
  assert.match(cardFn, /<GlassSurface tint=\{0\.4\} radius=\{20\} className=\{`rev-card p-4 text-white/);
  assert.doesNotMatch(cardFn, /dc-glass/);
});

test("My Day's Create menu keeps its pinned drop-up instead of the pack popover", () => {
  // tests/myDayCreateMenuDropdownContract.test.mjs pins the anchored drop-up,
  // the staggered item animation and dismissal on scroll/touchmove/wheel — all
  // three differ from `glass-popover` (bottom side, outside-mousedown + Escape,
  // re-place on scroll). Swapping it would regress documented behaviour, so
  // Wave 4 vendored the popover for new surfaces and left this one alone.
  const m = read("src/components/myday/CreateMenu.tsx");
  assert.match(m, /dc-create-menu-anchor/);
  assert.match(m, /bottom: "calc\(100% \+ 0\.9rem\)"/);
  assert.match(m, /role="menu"/);
  assert.match(m, /role="menuitem"/);
  assert.doesNotMatch(m, /from "\.\.\/ui\/glass-popover"/);
});

test("the Save hint that a revision contract pins stays a native title", () => {
  const pinned = 'title={kind === "edit" ? "Save note & close editor" : "Save note & close"}';
  assert.ok(read("src/components/myday/QuickNotes.tsx").includes(pinned));
  assert.match(
    read("tests/myDayQuickNotesBigEditorContract.test.mjs"),
    /Save note & close editor/,
    "if that pin moved, the tooltip conversion above must move with it",
  );
});
