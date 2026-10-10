// tests/coursePlayerGradientWavesContract.test.mjs
//
// Owner brief (2026-10-10): the Course Player gets the SAME animated React Bits
// Gradient Waves background as the landing page, driven by the existing
// Player settings → "Modern module listing" switch:
//
//   · ON  → Gradient Waves behind the player's content area;
//   · OFF → the legacy Course Player backdrop, untouched;
//   · default (new install / nothing saved) → ON, and a saved OFF is never
//     overwritten on startup;
//   · the layer never covers the header, footer, controls, text or overlays,
//     never intercepts input, and is cheap on Android / tablets.
//
// This file pins the wiring. The live behaviour (default, toggle, persistence,
// cleanup) is exercised in tests/coursePlayerGradientWavesRuntime.test.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const player = read("src/CoursePlayerApp.tsx");
const layer = read("src/course/CourseGradientWavesBackground.tsx");
const prefs = read("src/course/playerPreferences.tsx");
const panel = read("src/course/PlayerPanel.tsx");
const css = read("src/course/courseGradientWaves.css");
const waves = read("src/components/GradientWaves.tsx");
const landing = read("src/LandingApp.tsx");
const main = read("src/main.tsx");

test("the player reuses the landing page's Gradient Waves component — no approximation", () => {
  assert.match(layer, /import GradientWaves from "\.\.\/components\/GradientWaves";/);
  // Same component, documented defaults: only the pixel-ratio cap is passed.
  assert.match(layer, /<GradientWaves maxDpr=\{courseGradientWavesMaxDpr\(\)\} \/>/);
  assert.doesNotMatch(layer, /linear-gradient|radial-gradient/, "no static gradient stand-in");
  assert.doesNotMatch(layer, /\b(?:horizonColor|waveColor|crestColor|speed|amplitude)=/, "landing defaults, not a re-tuned copy");
});

test("the shared component keeps landing behaviour: maxDpr defaults to React Bits' cap of 2", () => {
  assert.match(waves, /maxDpr = 2\n\}\) => \{/);
  assert.match(waves, /dpr: Math\.min\(window\.devicePixelRatio \|\| 1, Math\.max\(0\.5, maxDprRef\.current\)\)/);
  // The renderer is still created once per mount (no per-render instances).
  assert.match(waves, /ctxMap\.set\(container, \{ renderer, program, mesh \}\);\n[\s\S]*?\}, \[\]\);/);
  // …and every GPU / listener resource is released on unmount.
  for (const cleanup of [
    /tryStop\(\);/,
    /ro\.disconnect\(\);/,
    /io\.disconnect\(\);/,
    /document\.removeEventListener\('visibilitychange', onVisibility\);/,
    /window\.removeEventListener\('pointermove', onPointerMove\);/,
    /document\.removeEventListener\('pointerleave', onPointerLeave\);/,
    /gl\.getExtension\('WEBGL_lose_context'\)\?\.loseContext\(\);/,
  ]) assert.match(waves, cleanup);
  // The landing page itself is untouched: it still mounts the bare component.
  assert.match(landing, /\{showWaves \? <GradientWaves \/> : null\}/);
});

test('"Modern module listing" defaults to ON and is only ever READ on startup', () => {
  assert.match(prefs, /export const DEFAULT_MODULE_LISTING_STYLE: ModuleListingStyle = "modern";/);
  assert.match(prefs, /export const isModernModuleListing = \(style: ModuleListingStyle\) => style === "modern";/);
  // The stored value wins whenever it is a valid choice (so a saved OFF stays OFF).
  assert.match(prefs, /return stored === "classic" \|\| stored === "modern" \? stored : fallback;/);
  // Persisting happens in the setter only — never in the load path / effects.
  const hook = prefs.slice(prefs.indexOf("export function useModuleListingStyle"));
  const writes = hook.match(/persistModuleListingStyle\(/g) ?? [];
  assert.equal(writes.length, 1, "exactly one write: inside setStyle");
  assert.match(hook, /const setStyle = useCallback\(\s*\(next: ModuleListingStyle\) => \{\s*setStyleState\(next\);\s*persistModuleListingStyle\(next, uid\);/);
  assert.match(player, /useModuleListingStyle\(user\?\.id \?\? null, DEFAULT_MODULE_LISTING_STYLE\)/);
  assert.doesNotMatch(player, /useModuleListingStyle\(user\?\.id \?\? null, "classic"\)/);
});

test("the switch drives the background live — one state, no reload", () => {
  assert.match(player, /const gradientWavesOn = isModernModuleListing\(moduleListingStyleCtl\.style\);/);
  assert.match(player, /\{gradientWavesOn \? <CourseGradientWavesBackground \/> : null\}/);
  assert.match(player, /data-course-waves=\{gradientWavesOn \? "on" : "off"\}/);
  // The Player settings row still flips the very same preference.
  assert.match(player, /onModuleListingStyleChange=\{moduleListingStyleCtl\.setStyle\}/);
  assert.match(panel, /settingsRow\("Modern module listing", moduleListingStyle === "modern", \(next\) => onModuleListingStyleChange\(next \? "modern" : "classic"\), "moduleStyle"\)/);
});

test("the layer sits behind the content area only, click-through, under every overlay", () => {
  // Mounted inside the stage (below the top rail), before the content section.
  assert.match(
    player,
    /data-course-stage>\n[\s\S]*?\{gradientWavesOn \? <CourseGradientWavesBackground \/> : null\}\n\s*<section\n\s*id="course-viewer"/,
  );
  const topRail = player.indexOf("data-course-top-progress\n");
  const stage = player.indexOf("data-course-stage>");
  assert.ok(topRail > 0 && stage > topRail, "the top rail stays outside (above) the waves' box");
  // Non-interactive, absolutely positioned, z-index -1 inside the fixed shell.
  assert.match(layer, /className="pointer-events-none absolute inset-0 z-\[-1\] overflow-hidden"/);
  assert.match(layer, /aria-hidden="true"/);
  // No z-index was added to the content section (would trap fixed overlays).
  assert.match(player, /<section\n\s*id="course-viewer"\n\s*className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"/);
});

test("the layer is memoised, WebGL2-guarded and fails soft", () => {
  assert.match(layer, /const CourseGradientWavesBackground = memo\(CourseGradientWavesBackgroundImpl\);/);
  assert.match(layer, /let webgl2Supported: boolean \| null = null;/, "probe cached once per session");
  assert.match(layer, /probe\.getContext\("webgl2"\)/);
  assert.match(layer, /class WavesErrorBoundary extends Component/);
  // Touch devices render at 1x; desktop at most 1.5x.
  assert.match(layer, /matchMedia\("\(pointer: coarse\)"\)\.matches \? 1 : 1\.5/);
});

test("pane scrims only exist while the waves are ON (OFF = legacy paint)", () => {
  assert.ok(main.indexOf('import "./course/courseGradientWaves.css";') > main.indexOf('import "./course/courseTheme.css";'));
  const selectors = css.match(/^[^\s/*@}][^{]*\{/gm) ?? [];
  assert.ok(selectors.length >= 6);
  for (const selector of selectors) {
    assert.match(selector, /\[data-course-waves="on"\]/, `scoped to waves ON: ${selector.trim()}`);
  }
  // Paint only — nothing that could move, stack or block anything.
  assert.doesNotMatch(css, /\b(?:z-index|pointer-events|position|width|height|margin|padding|display|transform)\s*:/);
  // Touch devices drop the live blur over the animated canvas.
  assert.match(css, /@media \(pointer: coarse\) \{[\s\S]*backdrop-filter: none !important;/);
});
