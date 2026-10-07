// tests/landingGradientWavesBackgroundContract.test.mjs
//
// Owner brief (2026-10-07): the landing page background must be the React Bits
// "Gradient Waves" component — https://reactbits.dev/c/backgrounds/gradient-waves
// — installed as shipped and applied across the WHOLE landing page.
//
// Contract:
//   1. `ogl` (the component's only dependency) is a real dependency.
//   2. `src/components/GradientWaves.tsx` IS the React Bits component:
//      ogl Renderer/Program/Mesh/Triangle, the WebGL2 `#version 300 es` shader
//      pair, the raymarched plasma, and the documented prop surface + defaults
//      (horizon #5227FF, wave #FF9FFC, crest #FFFFFF, detail tiers, grain,
//      cursor parallax).
//   3. `src/LandingApp.tsx` mounts it ONCE, page-wide (a fixed, full-viewport,
//      non-interactive layer behind the sections) — not as a short hero strip,
//      and never twice.
//   4. The page content still renders above it, and a device without WebGL2
//      still gets the whole landing page instead of a blank screen.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const waves = fs.readFileSync("src/components/GradientWaves.tsx", "utf8");
const landing = fs.readFileSync("src/LandingApp.tsx", "utf8");

test("the component's only dependency (ogl) is installed", () => {
  assert.ok(pkg.dependencies?.ogl, "ogl must be a dependency of the app");
  assert.match(String(pkg.dependencies.ogl), /^\^?1\./, "React Bits ships Gradient Waves against ogl 1.x");
});

test("GradientWaves.tsx is the React Bits component, unmodified in substance", () => {
  assert.match(waves, /import \{ Renderer, Program, Mesh, Triangle \} from 'ogl'/);
  // WebGL2 shader pair + raymarched plasma wave field.
  assert.match(waves, /const vertex = `#version 300 es/);
  assert.match(waves, /const fragment = `#version 300 es/);
  assert.match(waves, /float raymarch\(vec3 pos, vec3 dir, vec2 freq, vec4 tc\)/);
  assert.match(waves, /float plasma\(vec3 r, vec2 freq, vec4 tc\)/);
  assert.match(waves, /uSteps/);
  assert.match(waves, /hash21\(gl_FragCoord\.xy/);
  assert.match(waves, /export default GradientWaves;/);
});

test("every documented prop keeps its documented default", () => {
  const defaults = [
    ["horizonColor", "'#5227FF'"],
    ["waveColor", "'#FF9FFC'"],
    ["crestColor", "'#FFFFFF'"],
    ["speed", "0.4"],
    ["amplitude", "2.5"],
    ["waveScale", "0.6"],
    ["waveRatio", "0.9"],
    ["swell", "35"],
    ["turbulence", "20"],
    ["tilt", "1.11"],
    ["zoom", "1.0"],
    ["height", "5.5"],
    ["fogDepth", "15"],
    ["detail", "'medium'"],
    ["brightness", "1.0"],
    ["opacity", "1.0"],
    ["mouseInteraction", "true"],
    ["parallaxStrength", "0.5"],
    ["grain", "true"],
    ["grainIntensity", "0.05"],
    ["className", "''"],
  ];
  for (const [prop, value] of defaults) {
    // The last destructured default has no trailing comma, so the value is
    // allowed to be followed by a comma, whitespace or the closing brace.
    const literal = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      waves,
      new RegExp(`${prop} = ${literal}(?=[,\\s)])`),
      `${prop} default must stay ${value}`,
    );
  }
  assert.match(waves, /if \(detail === 'low'\) return 40\.0;/);
  assert.match(waves, /if \(detail === 'high'\) return 110\.0;/);
  assert.match(waves, /className=\{`relative h-full w-full overflow-hidden \$\{className\}`\.trim\(\)\}/);
});

test("landing mounts Gradient Waves once, page-wide, behind the content", () => {
  const mounts = landing.match(/<GradientWaves\b/g) ?? [];
  assert.equal(mounts.length, 1, "exactly one Gradient Waves layer on the landing page");
  // React Bits ships a self-sizing block, so the page-wide behaviour comes from
  // a fixed, full-viewport, non-interactive shell around it.
  assert.match(landing, /className="pointer-events-none fixed inset-0 z-0"/);
  assert.match(landing, /data-dc-landing-waves/);
  assert.match(landing, /<div className="relative z-10">/);
  // The old inline instance (opacity 0.15, non-fixed, hero-height container)
  // must not come back — it painted only the first screenful.
  assert.doesNotMatch(landing, /opacity=\{0\.15\}/);
});

test("all landing sections still render above the waves", () => {
  for (const section of ["Header", "Hero", "Features", "CtaBanner", "Footer", "LandingOverlays"]) {
    assert.match(landing, new RegExp(`<${section} />`), `${section} must stay on the landing page`);
  }
  assert.match(landing, /window\.location\.hash = HOME_HASH/);
});

test("a device without WebGL2 still gets the landing page", () => {
  // The shader is `#version 300 es`: without a guard, ogl's WebGL1 fallback
  // would throw while compiling it inside the mount effect.
  assert.match(landing, /function supportsWebgl2\(\)/);
  assert.match(landing, /probe\.getContext\("webgl2"\)/);
  assert.match(landing, /const \[showWaves\] = useState\(supportsWebgl2\)/);
  assert.match(landing, /\{showWaves \? <GradientWaves \/> : null\}/);
});
