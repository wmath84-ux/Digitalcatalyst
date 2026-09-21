// Run with: bash scripts/verify-nature3d.sh   (needs esbuild + three, both already in devDeps)
//
// Engine verification harness — kept in the repo on purpose. It caught a real
// GLSL redefinition bug in the waterfall shader that no source-shape test could
// see, so it is part of the project now, not a throwaway.
//
// Bundles the real engine modules and replays their shader injections against
// three's REAL ShaderLib sources, then resolves the `#include <chunk>` graph the
// way WebGLProgram does. That gives us the actual GLSL three would compile, so
// we can assert the things a browser would otherwise only tell us by failing:
//
//   * every anchor a `.replace()` targets actually exists (a missed anchor is a
//     silent no-op, i.e. a feature that just does not happen);
//   * no varying is declared twice (hard compile error);
//   * no fragment `in` exists without a matching vertex `out` (link error under
//     GLSL ES 3.00 — this is what a MeshBasicMaterial would cause);
//   * the emitted GLSL contains the features we think it does.

import * as THREE from "three";
import { createAtmosphere } from "../src/nature3d/engine/atmosphere";
import { createWeathering } from "../src/nature3d/engine/weathering";
import { budgetFor } from "../src/nature3d/engine/quality";
import { createWater } from "../src/nature3d/engine/water";

interface ShaderLike {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

function resolveIncludes(src: string): string {
  let out = src;
  for (let i = 0; i < 8 && out.includes("#include <"); i += 1) {
    out = out.replace(/#include <(\w+)>/g, (_m, name: string) => {
      const chunk = (THREE.ShaderChunk as Record<string, string>)[name];
      if (chunk === undefined) throw new Error(`unknown chunk ${name}`);
      return chunk;
    });
  }
  return out;
}

type Lib = "standard" | "lambert" | "basic" | "points";

function makeShader(lib: Lib): ShaderLike {
  const src = THREE.ShaderLib[lib] as unknown as { vertexShader: string; fragmentShader: string };
  return { uniforms: {}, vertexShader: src.vertexShader, fragmentShader: src.fragmentShader };
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const budget = budgetFor("high");
const atmosphere = createAtmosphere(budget);
const weathering = createWeathering(new THREE.Texture(), budget.tier);

/** Run a material's own onBeforeCompile chain exactly as three would. */
function compile(material: THREE.Material): { vs: string; fs: string; lib: Lib } {
  const lib: Lib =
    material.type === "MeshLambertMaterial"
      ? "lambert"
      : material.type === "MeshBasicMaterial"
        ? "basic"
        : material.type === "PointsMaterial"
          ? "points"
          : "standard";
  const shader = makeShader(lib);
  material.onBeforeCompile(shader as never, {} as never);
  return {
    vs: resolveIncludes(shader.vertexShader),
    fs: resolveIncludes(shader.fragmentShader),
    lib,
  };
}

function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

/**
 * Drop GLSL comments.
 *
 * The checks below count declarations, and these shaders carry long explanatory
 * comments that NAME the declarations they talk about — counting those too
 * would fail the very injection that fixed the bug (which it did, on the first
 * run: the comment saying "no uniform sampler2D map here" tripped the check).
 */
function stripComments(glsl: string): string {
  return glsl.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

// ── 1. Rock material: weathering + atmosphere ─────────────────────────
const rockMat = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
weathering.apply(rockMat, { attrib: "aDcWeather" });
atmosphere.register(rockMat);
const rock = compile(rockMat);

check("rock: world position varying declared once", count(rock.fs, "varying vec3 vDcWorldPos;") === 1);
check("rock: world normal varying declared once", count(rock.fs, "varying vec3 vDcWorldNormal;") === 1);
check("rock: vertex declares the normal too", count(rock.vs, "varying vec3 vDcWorldNormal;") === 1);
check("rock: world normal is written in the vertex stage", /vDcWorldNormal\s*=\s*normalize/.test(rock.vs));
check("rock: mvPosition still drives gl_Position", /gl_Position = projectionMatrix \* mvPosition;/.test(rock.vs));
check("rock: project_vertex anchor consumed", !rock.vs.includes("#include <project_vertex>"));
check("rock: fog chunk consumed", !rock.fs.includes("#include <fog_fragment>"));
check("rock: haze uniforms present", rock.fs.includes("uDcHazeColor") && rock.fs.includes("uDcHazeHeight"));
check("rock: height-aware fog present", rock.fs.includes("dcHazeFall"));
check("rock: aerial perspective present", rock.fs.includes("dcToward"));
check("rock: tri-planar weathering present", rock.fs.includes("dcDetail") && count(rock.fs, "texture2D( uDcWeatherMap") === 3);
check("rock: moss uses the shade axis", rock.fs.includes("uDcShadeAxis"));
check("rock: wet surfaces darken albedo", rock.fs.includes("mix( 1.0, 0.62,"));
check("rock: roughness is modulated", /roughnessFactor = mix\( roughnessFactor, uDcWetRoughness/.test(rock.fs));
check("rock: curvature bake attribute consumed", rock.vs.includes("aDcBake") && rock.fs.includes("vDcBake"));
check("rock: instance weathering attribute consumed", rock.vs.includes("attribute vec3 aDcWeather;"));
// The uniform is declared everywhere (it lives in the shared block), but the
// transmission CODE must only exist on foliage.
check("rock: NO transmission code on stone", !rock.fs.includes("dcThru"));
check("rock: uniform count is sane", Object.keys(rockMat.userData.dcShader?.uniforms ?? {}).length > 10);

// ── 2. Grass / leaf material: wind + FOLIAGE atmosphere ───────────────
const leafMat = new THREE.MeshLambertMaterial({ map: new THREE.Texture(), alphaTest: 0.5 });
// Mimic the wind injection's anchors so the chain test is honest.
leafMat.onBeforeCompile = (shader: unknown) => {
  const s = shader as ShaderLike;
  s.uniforms.uTime = { value: 0 };
  s.vertexShader = s.vertexShader
    .replace("#include <common>", "#include <common>\nuniform float uTime;\n")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.x += sin(uTime) * 0.1;\n");
};
atmosphere.register(leafMat, { foliage: true });
const leaf = compile(leafMat);
check("leaf: the material's own wind injection survives", leaf.vs.includes("uniform float uTime;") && leaf.vs.includes("sin(uTime)"));
check("leaf: transmission term added", leaf.fs.includes("uDcTransmitColor") && leaf.fs.includes("dcThru"));
check("leaf: transmission reads the sun direction", /dot\( dcViewDir, uDcSunDir \)/.test(leaf.fs));
check("leaf: opaque_fragment anchor consumed", count(leaf.fs, "#include <opaque_fragment>") === 0);
check("leaf: alpha test survives", leaf.fs.includes("USE_ALPHATEST"));
check(
  "leaf: exactly one fog implementation (the custom one)",
  count(leaf.fs, "1.0 - exp( ") === 1 && !leaf.fs.includes("fogFactor"),
);

// ── 3. Contact decal (MeshBasicMaterial): must not break ──────────────
const decalMat = new THREE.MeshBasicMaterial({ map: new THREE.Texture(), transparent: true });
atmosphere.register(decalMat);
const decal = compile(decalMat);
// Basic normals only exist when USE_ENVMAP or USE_SKINNING is enabled.
// A plain decal must not reference them outside that preprocessor guard.
check("decal: no unconditional world normal", !decal.vs.includes("vDcWorldNormal") && !decal.fs.includes("vDcWorldNormal"));
check("decal: world position IS published", count(decal.fs, "varying vec3 vDcWorldPos;") === 1 && decal.vs.includes("vDcWorldPos ="));

// ── 4. Terrain: the landscape shader's anchors ────────────────────────
const terrainMat = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), vertexColors: true });
terrainMat.onBeforeCompile = (shader: unknown) => {
  // Same body as terrain.ts (kept in sync by hand; the file is asserted by the
  // contract test as well) — including the per-pixel SHORELINE treatment.
  const s = shader as ShaderLike;
  s.uniforms.uDcSunSide = { value: new THREE.Vector2(0, -1) };
  s.uniforms.uDcOceanLevel = { value: -2.6 };
  s.fragmentShader = s.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform vec2 uDcSunSide;\nuniform float uDcOceanLevel;\n")
    .replace(
      "#include <map_fragment>",
      "#include <map_fragment>\nvec3 dcMacro = texture2D( map, vMapUv * 0.0625 ).rgb;\nfloat dcShore = vDcWorldPos.y - uDcOceanLevel;\nfloat dcFacing = dot( normalize(vDcWorldNormal.xz + vec2(1e-4)), normalize(uDcSunSide) );\n",
    );
};
atmosphere.register(terrainMat);
const terrain = compile(terrainMat);
check("terrain: macro variation resolves", terrain.fs.includes("dcMacro") && terrain.fs.includes("* 0.0625"));
check("terrain: vMapUv exists in the resolved map chunk", terrain.fs.includes("texture2D( map, vMapUv )"));
check("terrain: aspect tint present", terrain.fs.includes("dcFacing"));
check("terrain: shoreline distance compiles", terrain.fs.includes("dcShore") && terrain.fs.includes("uDcOceanLevel"));
check("terrain: no duplicate varyings after both passes", count(terrain.fs, "varying vec3 vDcWorldPos;") === 1);
check("terrain: sphere-style normal transform is NOT applied", !terrain.vs.includes("instanceMatrix * mat3( modelMatrix )"));

// ── 5. Water: river, waterfall sheet and spray ────────────────────────
const fakeTex = () => new THREE.Texture();
const textureSet = {
  bark: fakeTex(), barkNormal: fakeTex(), leaf: fakeTex(), grassBlade: fakeTex(),
  ground: fakeTex(), rock: fakeTex(), rockNormal: fakeTex(), rockORM: fakeTex(),
  weather: fakeTex(), contact: fakeTex(), canopy: fakeTex(),
  water: fakeTex(), waterNormal: fakeTex(), fur: fakeTex(), cloud: fakeTex(),
  feather: fakeTex(), frond: fakeTex(), palmBark: fakeTex(), palmCanopy: fakeTex(),
  dispose() {},
} as unknown as Parameters<typeof createWater>[0];

const water = createWater(textureSet, budget, new THREE.Vector3(0.62, 0.34, -0.7).normalize(), {
  sky: atmosphere.uniforms.uDcHazeColor.value,
  sun: atmosphere.uniforms.uDcSunColor.value,
});
// Exactly as scene.ts does it.
water.materials.forEach((m) => atmosphere.register(m));

const riverMat = water.materials[0] as THREE.MeshStandardMaterial;
const fallMat = water.materials[3] as THREE.MeshStandardMaterial;
const sprayMat = water.materials[4] as THREE.PointsMaterial;
const river = compile(riverMat);
const fall = compile(fallMat);
const spray = compile(sprayMat);

check("water: the river reflects the live sky colours", river.fs.includes("uWsky") && river.fs.includes("uWsun"));
check("water: it borrows the atmosphere values, not new ones", atmosphere.uniforms.uDcHazeColor.value === (riverMat.userData.dcShader?.uniforms.uWsky as { value: unknown })?.value);
check("water: dual-phase flow survives", river.fs.includes("dcPhase0") && count(river.fs, "texture2D(uFlowMap") === 2);
check("water: Fresnel is present", river.fs.includes("dcFres") && river.fs.includes("pow(1.0 - dcCos, 5.0)"));
check("water: shoreline foam is present", river.fs.includes("dcBank") && river.fs.includes("dcFoam"));
check("water: the grade lands in LINEAR light, before the haze", 
  river.fs.indexOf("vec3 dcCol = mix(dcBody, dcSky, dcFres)") > 0 &&
  river.fs.indexOf("vec3 dcCol = mix(dcBody, dcSky, dcFres)") < river.fs.indexOf("dcHazeFall"));
check("water: haze still runs on the river", river.fs.includes("dcHazeFall") && river.fs.includes("dcFres"));
check("water: opaque_fragment anchor consumed on the river", count(river.fs, "#include <opaque_fragment>") === 0);
check(
  "water: the fall does NOT redeclare three's map uniform",
  count(stripComments(fall.fs), "uniform sampler2D map;") === 1,
);
check("water: the fall is graded in linear light too", fall.fs.indexOf("vec3 dcCol = mix(dcClear") < fall.fs.indexOf("dcHazeFall"));
check("water: the spray is hazed like the rest of the air", spray.fs.includes("dcHazeFall"));
check("water: the spray never got the transmission term", !spray.fs.includes("dcThru"));

// ── 5b. The ocean (tropical) ──────────────────────────────────────────
const oceanMat = water.materials[5] as THREE.MeshStandardMaterial;
check("ocean: the material is published (appended after the pinned indices)", !!oceanMat && oceanMat.type === "MeshStandardMaterial");
const ocean = compile(oceanMat);
check("ocean: flood mask attribute consumed in the vertex stage", ocean.vs.includes("attribute float aDcDepth") && ocean.vs.includes("aDcDepth < 0.0"));
check("ocean: dry verts collapse below the terrain", ocean.vs.includes("transformed.y -= 90.0"));
check("ocean: depth varying published", ocean.vs.includes("vDcDepth = aDcDepth") && ocean.fs.includes("varying float vDcDepth"));
check("ocean: dual-phase flow regenerates (no sliding texture)", ocean.fs.includes("dcPhase0 = fract") && ocean.fs.includes("mix( dcN0, dcN1, dcMix )"));
check("ocean: Fresnel is Schlick with water's F0", ocean.fs.includes("0.02 + 0.98 * pow( 1.0 - dcCos, 5.0 )"));
check("ocean: depth ramp runs turquoise → deep", ocean.fs.includes("dcShallowC") && ocean.fs.includes("dcDeepC") && ocean.fs.includes("smoothstep( 6.0, 13.0, dcD )"));
check("ocean: shoreline surf band present", ocean.fs.includes("dcFoam") && ocean.fs.includes("dcLine"));
check("ocean: glint tracks the SHARED sun vector", ocean.fs.includes("uSunDir") && !/uSunDir = \{ value: new/.test(stripComments(ocean.fs)));
check("ocean: no orphaned inputs", (() => {
  const fi = new Set([...varyings(ocean.fs, "varying"), ...varyings(ocean.fs, "in")]);
  const vo = new Set([...varyings(ocean.vs, "varying"), ...varyings(ocean.vs, "out")]);
  return [...fi].filter((v) => v.startsWith("vDc") && !vo.has(v)).length === 0;
})());

// ── 6. Every fragment input has a vertex output ───────────────────────
function varyings(glsl: string, kw: "varying" | "out" | "in"): Set<string> {
  const set = new Set<string>();
  const re = new RegExp(`^\\s*${kw} (\\w+)\\s+(\\w+)\\s*;`, "gm");
  let m: RegExpExecArray | null;
  while ((m = re.exec(glsl))) set.add(m[2]);
  return set;
}
for (const [name, pair] of Object.entries({ rock, leaf, decal, terrain, river, fall, spray })) {
  const fragmentIns = new Set([...varyings(pair.fs, "varying"), ...varyings(pair.fs, "in")]);
  const vertexOuts = new Set([...varyings(pair.vs, "varying"), ...varyings(pair.vs, "out")]);
  const orphan = [...fragmentIns].filter((v) => v.startsWith("vDc") && !vertexOuts.has(v));
  check(`${name}: no orphaned fragment inputs`, orphan.length === 0, orphan.join(", "));
}

// ── 7. No declaration is emitted twice in one stage ───────────────────
//
// A redeclared uniform or varying is a hard GLSL compile error, and it is the
// ONE class of bug that a resolved-source check catches but eyeballing the
// injection sites never does: two independent systems each adding a plausible
// line. This check is what found the waterfall's redeclared `map`.
function duplicateDeclarations(glsl: string): string[] {
  const seen = new Map<string, number>();
  const re = /^\s*uniform\s+\w+\s+(\w+)\s*(?:\[[^\]]*\])?\s*;/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(glsl))) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  const reV = /^\s*varying\s+\w+\s+(\w+)\s*;/gm;
  while ((m = reV.exec(glsl))) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([n]) => n);
}

// The comparison is against the SAME lib's stock source. Three's own chunks
// declare `vColor` (vec3 / vec4) and `envMap` (2D / cube) inside mutually
// exclusive `#ifdef` branches, so a naive scan reports stock shaders as broken.
// What matters is that nothing WE add is declared twice.
// Self-test first: a checker that never fires is not evidence. This is the
// exact shape of the waterfall bug (a uniform three had already declared).
check(
  "harness self-test: a redeclared uniform IS detected",
  duplicateDeclarations("uniform sampler2D map;\nuniform sampler2D map;").includes("map"),
);

const baseline = new Map<string, { fs: Set<string>; vs: Set<string> }>();
for (const [name, pair] of Object.entries({ rock, leaf, decal, terrain, river, fall, spray })) {
  if (!baseline.has(pair.lib)) {
    const stock = THREE.ShaderLib[pair.lib] as unknown as { vertexShader: string; fragmentShader: string };
    baseline.set(pair.lib, {
      fs: new Set(duplicateDeclarations(resolveIncludes(stock.fragmentShader))),
      vs: new Set(duplicateDeclarations(resolveIncludes(stock.vertexShader))),
    });
  }
  const base = baseline.get(pair.lib)!;
  const newFs = duplicateDeclarations(pair.fs).filter((d) => !base.fs.has(d));
  const newVs = duplicateDeclarations(pair.vs).filter((d) => !base.vs.has(d));
  check(
    `${name}: our injections add no duplicate declaration`,
    newFs.length === 0 && newVs.length === 0,
    [...newFs.map((d) => `frag:${d}`), ...newVs.map((d) => `vert:${d}`)].join(", "),
  );
}

// ── 8. Injections are ADDITIVE: stock definitions survive ──────────────
//
// Every injection in this engine appends AFTER `#include <common>` — it must
// never REPLACE it. The common chunk defines PI, RECIPROCAL_PI, saturate,
// pow2 and BRDF_Lambert, and the standard/lambert pipelines USE all of them.
// Dropping that one include line is therefore not a subtle visual bug: it is
// four guaranteed GLSL compile errors, the program fails to link, and three.js
// renders NOTHING for the material. That is exactly how the whole ground
// (plus grass, trees, rocks and water — everything atmosphere-registered)
// once went invisible while all 58 checks above stayed green: nothing here
// asserted that load-bearing chunks SURVIVE. This section is that assertion.
//
// The check is general, not pinned to one chunk: every top-level `#define`
// and every top-level function the STOCK lib resolves must still resolve
// after our injections. The chunks we intentionally replace (fog_fragment,
// project_vertex, opaque/map/roughness/begin_vertex) carry only main()-scoped
// code, so a correct injection can never trip this.
function topLevelDefs(glsl: string): Set<string> {
  const defs = new Set<string>();
  let m: RegExpExecArray | null;
  const reD = /^\s*#define\s+(\w+)/gm;
  while ((m = reD.exec(glsl))) defs.add(m[1]);
  const reF = /^\s*(?:float|vec[234]|mat[234]|int|uint|bool|void)\s+(\w+)\s*\(/gm;
  while ((m = reF.exec(glsl))) defs.add(m[1]);
  return defs;
}

function missingDefs(stock: string, injected: string): string[] {
  const want = topLevelDefs(stock);
  const have = topLevelDefs(injected);
  return [...want].filter((d) => !have.has(d));
}

// Self-test first: a checker that never fires is not evidence. This simulates
// the exact bug — the resolved common chunk deleted from a stock shader.
{
  const stockStd = THREE.ShaderLib.standard as unknown as { vertexShader: string; fragmentShader: string };
  const stockFs = resolveIncludes(stockStd.fragmentShader);
  const sabotaged = stockFs.replace(resolveIncludes("#include <common>"), "");
  const caught = missingDefs(stockFs, sabotaged);
  check(
    "harness self-test: a dropped chunk IS detected",
    caught.includes("BRDF_Lambert") && caught.includes("RECIPROCAL_PI") && caught.includes("saturate"),
    caught.slice(0, 6).join(", "),
  );
}

for (const [name, pair] of Object.entries({ rock, leaf, decal, terrain, river, fall, spray })) {
  const stock = THREE.ShaderLib[pair.lib] as unknown as { vertexShader: string; fragmentShader: string };
  const missFs = missingDefs(resolveIncludes(stock.fragmentShader), pair.fs);
  const missVs = missingDefs(resolveIncludes(stock.vertexShader), pair.vs);
  check(
    `${name}: stock definitions survive our injections`,
    missFs.length === 0 && missVs.length === 0,
    [...missFs.map((d) => `frag:${d}`), ...missVs.map((d) => `vert:${d}`)].slice(0, 8).join(", "),
  );
}

console.log(failures === 0 ? "\nALL SHADER CHECKS PASSED" : `\n${failures} SHADER CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
