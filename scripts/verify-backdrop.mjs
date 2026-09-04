#!/usr/bin/env node
/**
 * Verify the shipped app background.
 *
 *   node scripts/verify-backdrop.mjs
 *
 * 2026-09-04 · owner direction: the universal Black Ice backdrop
 * (`.dc-backdrop`) and the classic/waves preference switch are GONE. The app
 * has exactly ONE background — the Winter Wonderland scene ported from the
 * pinned reference pen (codepen.io/Raed-Ennab/pen/PwNdKZj), defined in
 * `src/winter-background.css` and mounted by
 * `src/components/backgrounds/WinterScene.tsx`.
 *
 * So this script no longer samples a gradient stack. It asserts, against the
 * BUILT stylesheet (so a Lightning CSS rewrite is caught), that:
 *   1. the winter layer ships and is a real fixed layer: position fixed,
 *      inset 0, z-index -1, pointer-events none
 *   2. the pen's sky paint survived minification (the two aurora radials plus
 *      the vertical night gradient)
 *   3. every part of the scene ships — mountains, ground, lake, snowman, and
 *      the snow canvas
 *   4. the removed background is really removed: no `.dc-backdrop`, no
 *      `.dc-waves`, and no background preference module in the source
 *   5. the snowfall loop is unconditional — the component must not gate its
 *      requestAnimationFrame on visibility, focus or reduced motion
 *
 * No dependencies — node builtins only.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist", "index.html");
const SRC = path.join(ROOT, "src");

const failures = [];
const fail = (m) => failures.push(m);
const ok = [];

/* ── the built stylesheet ─────────────────────────────────────────────────── */

if (!existsSync(DIST)) {
  console.error("dist/index.html not found — run `npm run build` first.");
  process.exit(1);
}
const html = readFileSync(DIST, "utf8");
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
  .map((m) => m[1])
  .sort((a, b) => b.length - a.length)[0];
if (!css) {
  console.error("FAIL: no <style> block found in dist/index.html");
  process.exit(1);
}

function ruleBody(selector, source) {
  const re = new RegExp(`(^|[},;])${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{`, "g");
  const m = re.exec(source);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

/* ── 1. the layer's invariants ────────────────────────────────────────────── */

const body = ruleBody(".dc-winter", css);
if (body == null) {
  console.error("FAIL: .dc-winter rule is missing from the built CSS");
  process.exit(1);
}
const decl = (prop) => {
  const m = body.match(new RegExp(`(?:^|;)${prop}:([^;]*)`));
  return m ? m[1].trim() : null;
};

if (decl("position") !== "fixed") fail(`position is ${decl("position")}, expected fixed`);
if (decl("inset") !== "0" && decl("top") !== "0") fail("the layer must be pinned to inset: 0");
if (decl("z-index") !== "-1") fail(`z-index is ${decl("z-index")}, expected -1`);
if (decl("pointer-events") !== "none") fail(`pointer-events is ${decl("pointer-events")}, expected none`);
if (/!important/.test(body)) fail("the background layer must not use !important");
ok.push(".dc-winter is a fixed, non-interactive, z -1 layer");

/* ── 2. the pen's sky paint ───────────────────────────────────────────────── */

const skyImage = (decl("background-image") || "").replace(/\s+/g, " ");
for (const needle of ["#3b6dd1", "#8f5ee7", "20%", "80%"]) {
  if (!skyImage.includes(needle)) fail(`the aurora sky lost "${needle}" in the build`);
}
if (!/linear-gradient/.test(skyImage)) fail("the night gradient is missing from the sky paint");
const baseColor = decl("background-color");
if (baseColor && !/#040812|var\(--dc-winter-bg-bottom\)/.test(baseColor)) {
  fail(`background-color is ${baseColor}, expected the pen's #040812`);
}
ok.push("the pen's aurora sky + night gradient survived minification");

/* ── 3. every part of the scene ships ─────────────────────────────────────── */

for (const part of [
  "dc-winter__scene",
  "dc-winter__snow",
  "dc-winter__mountains",
  "dc-winter__mountain",
  "dc-winter__ground",
  "dc-winter__lake",
  "dc-winter__snowman",
  "dc-winter__snowman-hat",
]) {
  if (!css.includes(part)) fail(`${part} is missing from the built CSS`);
}
ok.push("mountains, ground, frozen lake, snowman and the snow canvas all ship");

/* ── 4. the removed background is really removed ──────────────────────────── */

if (/\.dc-backdrop[^-\w]/.test(css)) fail(".dc-backdrop still ships — the universal backdrop must be removed");
if (/\.dc-waves[^-\w]/.test(css)) fail(".dc-waves still ships — the waves background must be removed");
for (const gone of ["src/lib/background.ts", "src/components/backgrounds/WaveLines.tsx"]) {
  if (existsSync(path.join(ROOT, gone))) fail(`${gone} still exists — the background switch must be removed`);
}
ok.push("no universal backdrop, no waves layer, no background preference");

/* ── 5. the animation never stops ─────────────────────────────────────────── */

const scenePath = path.join(SRC, "components", "backgrounds", "WinterScene.tsx");
if (!existsSync(scenePath)) {
  fail("src/components/backgrounds/WinterScene.tsx is missing");
} else {
  const scene = readFileSync(scenePath, "utf8");
  if (!/requestAnimationFrame\(draw\)/.test(scene)) fail("the snowfall loop does not re-arm requestAnimationFrame");
  for (const gate of [/visibilitychange/, /prefers-reduced-motion/, /matchMedia/, /IntersectionObserver/]) {
    if (gate.test(scene)) fail(`the snowfall must not be gated on ${gate.source}`);
  }
  ok.push("the snowfall loop runs continuously — no visibility / focus / reduced-motion gate");
}

/* ── report ───────────────────────────────────────────────────────────────── */

for (const line of ok) console.log(`  ok   ${line}`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  console.error(`\nFAIL: ${failures.length} problem(s) with the app background.`);
  process.exit(1);
}
console.log("\nOK: the Winter Wonderland scene is the app's one background, animating without pause.");
