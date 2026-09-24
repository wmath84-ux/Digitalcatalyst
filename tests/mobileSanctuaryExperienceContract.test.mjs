// Mobile Sanctuary entry + fit/clarity regression contract (2026-09-24).
//
// Owner brief:
//   • Home's phone footer gets a dinosaur-PNG Sanctuary button immediately
//     after FlowPath and opens the 3D world;
//   • Desk / Reading / Notes / Mind map fit zooms must respond to mobile
//     viewport/HUD changes (including the bottom-right eye toggle);
//   • low-tier environment clarity improves without removing the existing
//     30 fps pacing, adaptive resolution or thermal shedding safeguards.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const bottomNav = read("src/components/BottomNav.tsx");
const home = read("src/home/App.tsx");
const footer = read("src/components/SiteFooterNav.tsx");
const dock = read("src/components/glass-dock/GlassDock.tsx");
const css = read("src/index.css");
const page = read("src/nature3d/NatureStudioPage.tsx");
const scene = read("src/nature3d/engine/scene.ts");
const quality = read("src/nature3d/engine/quality.ts");

test("Home alone opts into the dinosaur Sanctuary footer destination", () => {
  assert.ok(existsSync(new URL("../public/icons/sanctuary-dinosaur.png", import.meta.url)));
  assert.match(bottomNav, /src="\/icons\/sanctuary-dinosaur\.png"/);
  assert.match(bottomNav, /showSanctuary\?: boolean/);
  assert.match(home, /<BottomNav[\s\S]{0,180}showSanctuary/);
  assert.match(bottomNav, /\.\.\.TABS,[\s\S]{0,220}key: "sanctuary"/);
  assert.ok(
    bottomNav.indexOf('key: "sanctuary"') > bottomNav.indexOf('key: "flowpath"'),
    "Sanctuary must be immediately appended beside the right-most FlowPath tab",
  );
  assert.match(bottomNav, /key === "sanctuary"\) window\.location\.hash = "#\/nature-studio"/);
});

test("the eight-tab mobile dock fits without clipping its last destination", () => {
  assert.match(footer, /EIGHT_TAB_COMPACT_FIT_QUERY = "\(max-width: 479px\)"/);
  assert.match(footer, /EIGHT_TAB_DENSE_FIT_QUERY = "\(max-width: 349px\)"/);
  assert.match(dock, /export const DENSE_ICON_SIZE = 34/);
  assert.match(footer, /dense=\{dense\}/);
  for (const width of ["479px", "379px", "349px", "319px"]) {
    assert.match(css, new RegExp(`@media \\(max-width: ${width}\\)[\\s\\S]{0,500}data-dock-count="8"`));
  }
});

test("each mobile study camera owns a projection-aware fit", () => {
  assert.match(scene, /private fittedStudyPreset: "student" \| LecternSlot \| null/);
  assert.match(scene, /if \(changed && this\.fittedStudyPreset\) this\.focus\(this\.fittedStudyPreset\)/);
  assert.match(scene, /if \(this\.fittedStudyPreset\) this\.focus\(this\.fittedStudyPreset\)/);
  assert.match(scene, /const mobileFit: Record<LecternSlot, number>/);
  assert.match(scene, /reading: 1,[\s\S]*notes: 1\.06,[\s\S]*mindmap: 1\.12/);

  const desk = scene.slice(scene.indexOf("private focusStudentDesk()"), scene.indexOf("resize(width: number"));
  assert.match(desk, /const ins = this\.hudInsets/);
  assert.match(desk, /limitH/);
  assert.match(desk, /limitW/);
  assert.match(page, /window\.visualViewport\?\.addEventListener\("resize"/);
  assert.match(page, /focusStudyView/);
});

test("low-tier clarity rises while smoothness safeguards remain active", () => {
  const low = quality.slice(quality.indexOf("low: {"), quality.indexOf("medium: {"));
  assert.match(low, /maxPixelRatio: 1\.05/);
  assert.match(low, /minPixelRatio: 0\.65/);
  assert.match(low, /maxAniso: 2/);
  assert.match(low, /fpsCap: 30/);
  assert.match(low, /shadowMapSize: 0/);
  assert.match(low, /antialias: false/);
  assert.match(quality, /class AdaptiveResolution/);
  assert.match(scene, /consumeThermalHot\(\)/);
  assert.match(scene, /this\.shedOneLevel\(\)/);
});
