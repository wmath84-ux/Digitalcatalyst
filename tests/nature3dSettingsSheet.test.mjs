// tests/nature3dSettingsSheet.test.mjs
//
// Contract for the gear-icon SETTINGS sheet.
//
// The bottom tray's fifth button used to be a ⋮ dropdown: a 19 rem popover
// that could show five rows at a time and scrolled for the rest. The owner
// asked for a gear that opens a FULL-SCREEN settings panel in the battle-royale
// idiom (2026-09-25), so this file pins three things:
//
//   1. the ICON changed (gear, not kebab) and it opens a full-screen sheet;
//   2. the sheet's SHAPE is the one asked for — tab strip across the top,
//      grouped label-left/control-right rows, preset cards for the graphics
//      styles, a pinned action bar at the bottom;
//   3. every control in it REACHES THE ENGINE. A settings row that only
//      mutates React state is the classic lie; each of the engine methods it
//      calls must exist and must actually change the live scene.
//
// The engine half is asserted against source (the scene needs a real GPU), the
// UI half against the JSX. Together they mean the panel cannot become decoration.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGE = read("src/nature3d/NatureStudioPage.tsx");
const SETTINGS = read("src/nature3d/SanctuarySettings.tsx");
const SCENE = code(read("src/nature3d/engine/scene.ts"));
const QUALITY = code(read("src/nature3d/engine/quality.ts"));

// ── 1. The trigger ─────────────────────────────────────────────────────

test("the tray's fifth button is a gear that opens the sheet", () => {
  assert.match(PAGE, /^  Settings,$/m, "lucide gear is imported");
  assert.match(PAGE, /<Settings className="h-5 w-5" \/>/, "the tray draws the gear");
  assert.match(PAGE, /onClick=\{\(\) => setSettingsOpen\(\(v\) => !v\)\}/, "the gear toggles the sheet");
  assert.match(PAGE, /aria-label=\{settingsOpen \? "Close settings" : "Open settings"\}/);
  // The old popover is gone for good.
  assert.ok(!code(PAGE).includes("MoreVertical"), "the kebab icon is still imported");
  assert.ok(!code(PAGE).includes("MenuItem"), "the dropdown row component is still there");
  assert.ok(!code(PAGE).includes("MenuSection"), "the dropdown section component is still there");
  // ...and the sheet is mounted by the page, full-screen, above the tray.
  assert.match(PAGE, /<SanctuarySettings/, "the page mounts the sheet");
  assert.match(PAGE, /open=\{settingsOpen\}/, "the page drives the sheet");
});

// ── 2. The panel's shape ───────────────────────────────────────────────

test("the sheet is a full-screen modal with a tab strip", () => {
  assert.match(SETTINGS, /className="absolute inset-0 z-\[100\]/, "it covers the whole viewport");
  assert.match(SETTINGS, /role="dialog"/);
  assert.match(SETTINGS, /aria-modal="true"/);
  assert.match(SETTINGS, /role="tablist"/, "categories are tabs, like a game settings screen");
  assert.match(SETTINGS, /role="tab"/);
  assert.match(SETTINGS, /aria-selected=\{active\}/);
  for (const tab of ["graphics", "light", "boards", "views"]) {
    assert.ok(SETTINGS.includes(`"${tab}"`), `the ${tab} category is missing`);
  }
});

test("the graphics tab carries the preset cards and the genre's vocabulary", () => {
  // The research: PUBG's graphics tab is a row of named presets (Smooth /
  // Balanced / HD / HDR) plus a frame-rate row, drawn as label-left cards.
  assert.match(SETTINGS, /const PROFILES: QualityProfile\[\] = \["smooth", "balanced", "hd", "hdr"\]/);
  assert.match(SETTINGS, /Graphics style/);
  assert.match(SETTINGS, /Frame rate/);
  assert.match(SETTINGS, /const FRAME_CAPS = \[30, 60, 0\]/);
  assert.match(SETTINGS, /label: c === 0 \? "Unlimited" : `\$\{c\} fps`/);
  // Preset cards: the active one is the orange one.
  assert.match(SETTINGS, /aria-pressed=\{active\}/);
  assert.match(SETTINGS, /border-\[#ff8a1f\] bg-\[#ff8a1f\]\/15/);
});

test("rows are label-left / control-right, and the action bar is pinned", () => {
  assert.match(SETTINGS, /function Group\(/, "grouped sections with a title");
  assert.match(SETTINGS, /function Segmented</, "segmented pickers for discrete choices");
  assert.match(SETTINGS, /function Toggle\(/, "on/off switches with role=switch");
  assert.match(SETTINGS, /role="switch"/);
  assert.match(SETTINGS, /aria-checked=\{on\}/);
  assert.match(SETTINGS, /type="range"/, "the brightness row is a slider");
  assert.match(SETTINGS, /min=\{0\.75\}/);
  assert.match(SETTINGS, /max=\{1\.25\}/);
  // The bottom bar is part of the flex column, so it never scrolls away.
  assert.match(SETTINGS, /Reset defaults/);
  assert.match(SETTINGS, /function SheetRow\(/, "label-left rows with a right-hand readout");
});

test("Esc closes the sheet", () => {
  assert.match(SETTINGS, /if \(e\.key === "Escape"\)/, "the one key every settings screen honours");
  assert.match(SETTINGS, /onClose\(\)/);
});

// ── 3. Every control reaches the engine ────────────────────────────────

test("the sheet wires each control to a real engine method", () => {
  const wiring = [
    [/engine\?\.setQualityProfile\(next\)/, "graphics style"],
    [/engine\?\.setFrameCap\(next\)/, "frame rate"],
    [/engine\?\.setShadows\(next\)/, "shadows"],
    [/engine\?\.setBrightness\(next\)/, "brightness"],
  ];
  for (const [re, what] of wiring) {
    assert.match(SETTINGS, re, `the ${what} control never reaches the engine`);
  }
  // The page-owned controls go through props the page binds to the engine.
  assert.match(PAGE, /engineRef\.current\?\.setIceAge\(on\)/, "Ice Age reaches the engine");
  assert.match(PAGE, /engineRef\.current\?\.setDaylightMode\(mode\)/, "daylight reaches the engine");
  assert.match(PAGE, /engineRef\.current\?\.setWind\(step\.mult\)/, "wind reaches the engine");
  assert.match(PAGE, /engineRef\.current\?\.setBoardScale\(scale\)/, "board size reaches the engine");
  assert.match(PAGE, /engineRef\.current\?\.setAutoOrbit\(on\)/, "auto orbit reaches the engine");
});

test("the panel opens on what the engine is actually running", () => {
  // Reading the live values on open is what stops the sheet from advertising a
  // style the renderer is not using.
  assert.match(SETTINGS, /setProfile\(engine\.getQualityProfile\(\)\)/);
  // ...and RESET DEFAULTS returns to the boot default, not to the current pick.
  assert.match(SETTINGS, /applyProfile\(engine\?\.getDefaultProfile\(\) \?\? "balanced"\)/);
  assert.match(SETTINGS, /setFrameCap\(engine\.getFrameCap\(\)\)/);
  assert.match(SETTINGS, /setShadows\(engine\.getShadows\(\)\)/);
  assert.match(SETTINGS, /setBrightness\(engine\.getBrightness\(\)\)/);
  assert.match(SETTINGS, /engine\.shadowsAvailable/, "an unavailable shadow row is disabled, not dead");
});

// ── 4. The engine honours them ─────────────────────────────────────────

test("the engine exposes the four runtime knobs the sheet drives", () => {
  for (const signature of [
    "setQualityProfile(profile: QualityProfile)",
    "getQualityProfile(): QualityProfile",
    "getDefaultProfile(): QualityProfile",
    "setFrameCap(fps: number)",
    "getFrameCap(): number",
    "setShadows(on: boolean)",
    "getShadows(): boolean",
    "get shadowsAvailable()",
    "setBrightness(multiplier: number)",
    "getBrightness(): number",
  ]) {
    assert.ok(SCENE.includes(signature), `the engine is missing ${signature}`);
  }
});

test("the graphics style moves the resolution ceiling, not the world budget", () => {
  // The tier's grass/tree counts are allocation-time; rebuilding them mid
  // session is a stall. The style is the DRS ceiling the scaler may climb to.
  assert.match(SCENE, /const ratio = this\.adaptive\.setCeiling\(ceiling\);/);
  assert.match(SCENE, /this\.renderer\.setPixelRatio\(ratio\)/);
  assert.match(QUALITY, /setCeiling\(ratio: number\): number \| null/);
  assert.match(QUALITY, /this\.max = Math\.min\(this\.deviceMax, Math\.max\(this\.min, ratio\)\)/);
  // The four presets exist as data, and the detected tier picks the honest one.
  assert.match(QUALITY, /smooth: \{ label: "Smooth", ceiling: 0\.75/);
  assert.match(QUALITY, /balanced: \{ label: "Balanced", ceiling: 1/);
  assert.match(QUALITY, /hd: \{ label: "HD", ceiling: 1\.3/);
  assert.match(QUALITY, /hdr: \{ label: "HDR", ceiling: 1\.6/);
  assert.match(QUALITY, /export function profileForTier\(tier: QualityTier\): QualityProfile/);
  assert.match(SCENE, /this\.qualityProfile = profileForTier\(this\.budget\.tier\);/);
});

test("the frame cap paces the render loop", () => {
  assert.match(SCENE, /const cap = this\.frameCap > 0 \? this\.frameCap : this\.budget\.fpsCap;/);
  assert.match(SCENE, /this\.paceNext = Math\.max\(frameStart, this\.paceNext\) \+ 1000 \/ cap;/);
  // 0 means "follow the tier", so the reset is a real reset.
  assert.match(SCENE, /setFrameCap\(fps: number\) \{\s*\n\s*this\.frameCap = fps;\s*\n\s*this\.paceNext = 0;/);
});

test("toggling shadows recompiles the scene's materials", () => {
  // three.js needs every program rebuilt when the shadow map is enabled or
  // disabled — without the traverse the toggle silently does nothing.
  assert.match(SCENE, /this\.renderer\.shadowMap\.enabled = on && canShadow;/);
  assert.match(SCENE, /this\.scene\.traverse\(\(o\) => \{/);
  assert.match(SCENE, /for \(const one of Array\.isArray\(m\) \? m : \[m\]\) one\.needsUpdate = true;/);
  assert.match(SCENE, /if \(this\.renderer\.shadowMap\.enabled\) this\.requestShadowRefresh\(\);/);
});

test("brightness scales the daylight grade instead of replacing it", () => {
  // The per-hour curve is contract-fixed; the slider is a multiplier on the
  // +52 % grade the owner asked for, and it must not fight the underwater
  // grade either.
  assert.match(SCENE, /this\.gradeExposure = 1\.52 \* multiplier;/);
  assert.match(SCENE, /this\.submerged\s*\n?\s*\? 0\.78\s*\n?\s*: this\.daylight\.exposure \* this\.gradeExposure/);
});

test("the stats the sheet shows are mirrored without re-rendering the HUD", () => {
  // The HUD badge is a direct DOM write (locked frame rate); the sheet reads
  // the same numbers through a ref and only copies them into state while open.
  assert.match(PAGE, /statsLatest\.current = \{/);
  assert.match(PAGE, /if \(!settingsOpen\) return undefined;/);
  assert.match(PAGE, /setInterval\(\(\) => setStats\(statsLatest\.current\), 1000\)/);
});
