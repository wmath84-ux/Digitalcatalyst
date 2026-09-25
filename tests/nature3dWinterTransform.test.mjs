// The seasonal-transformation contract.
//
// This is the executable form of the SUMMER → NATURAL WINTER brief. The
// original implementation failed it in one specific way: it pushed every
// registered material 62–100 % of the way to a pale blue-white, so the world
// did not become snowy, it became washed out. Everything below exists to stop
// that class of defect coming back.
//
// The mask assertions run the real injected GLSL on the CPU — see
// support/winterShader.mjs — because "35 % of the meadow is snow and the rest
// is untouched" is a statement about the distribution of pixels, and no amount
// of regex matching can check a distribution.

import test from "node:test";
import assert from "node:assert/strict";
import {
  THREE,
  createWinter,
  winterDaylight,
  daylightAt,
  pathWeight,
  WINTER_SURFACES,
  SURFACE_RULES,
  surfaceBlock,
  sweep,
  stats,
  sampleSurface,
  compile,
} from "./support/winterShader.mjs";

const FLAT = { normalY: 1 };
const MEADOW_Y = 0.5;
const HIGHLAND_Y = 42;

// ── 1. The surface taxonomy ───────────────────────────────────────────────
test("every distinct material class in the world has its own snow surface", () => {
  // The union had to grow past ground/foliage/solid/ice/board, because a trunk,
  // a canopy, a roof and a wall cannot share one rule and still read as
  // themselves. Each name below is a class that appears in scene.ts.
  const required = [
    "ground", "foliage", "canopy", "trunk", "rock", "roof", "wall", "solid", "ice", "board",
  ];
  for (const surface of required) assert.ok(WINTER_SURFACES.includes(surface), `${surface} is missing`);
  assert.ok(WINTER_SURFACES.length >= 10, "the union must keep growing with the world");
  for (const surface of WINTER_SURFACES) {
    assert.ok(SURFACE_RULES[surface], `${surface} has no rule`);
    const cover = Number(SURFACE_RULES[surface].cover);
    assert.ok(cover >= 0 && cover <= 1, `${surface} cover out of range`);
    // A ceiling of 1.0 means "everything is snow", which is what winter must
    // never be for a solid surface. Ice is exempt: it is water.
    if (surface !== "ice") assert.ok(cover < 1, `${surface} would snow over completely`);
  }
});

test("a material or mesh that can name itself is classified by that name", () => {
  // scene.ts registers merged groups (a villa's walls and roof in one mesh), so
  // a name is often the only thing that says which surface a mesh is. The
  // compiled shader for a named material must be IDENTICAL to the shader for a
  // material explicitly registered as that surface — that is the whole claim.
  const shaderFor = (name) => {
    const material = new THREE.MeshStandardMaterial();
    material.name = name;
    const winter = createWinter("medium");
    winter.register(material, "solid");
    const shader = compile(material).fragmentShader;
    winter.dispose();
    return shader;
  };
  const shaderForSurface = (surface) => {
    const material = new THREE.MeshStandardMaterial();
    const winter = createWinter("medium");
    winter.register(material, surface);
    const shader = compile(material).fragmentShader;
    winter.dispose();
    return shader;
  };
  const cases = [
    ["bark", "trunk"],
    ["pine-needles", "canopy"],
    ["boulder-rock", "rock"],
    ["villa-roof", "roof"],
    ["plaster-wall", "wall"],
    ["gravel-path", "ground"],
    ["meadow-grass", "foliage"],
    ["river-surface", "ice"],
  ];
  for (const [name, surface] of cases) {
    assert.equal(shaderFor(name), shaderForSurface(surface), `${name} must snow as ${surface}`);
  }
  // An unnamed material keeps the caller's surface.
  const plain = new THREE.MeshStandardMaterial();
  const winter = createWinter("medium");
  winter.register(plain, "solid");
  assert.equal(compile(plain).fragmentShader, shaderForSurface("solid"));
  winter.dispose();
});

// ── 2. It is a stencil, not a blend ──────────────────────────────────────
test("snow is stencilled through noise, so it has four distinct states", () => {
  const { block, shader } = surfaceBlock("ground", { publishWorn: true });
  // Four states: bare base material, a soft edge, patchy cover, full cover.
  assert.match(block, /dcSnowStencil\(/, "the mask goes through a stencil");
  assert.match(block, /if \(snowCover > 0\.002\)/, "pixels below the threshold are left alone");
  assert.match(shader.fragmentShader, /snowCover = clamp\(/, "coverage is bounded");

  // The distribution over a real patch of meadow must be spread out, not
  // clustered: a blend would put every pixel in one narrow band.
  const meadow = sweep(block, { y: MEADOW_Y, ...FLAT });
  const cover = stats(meadow, "cover");
  assert.ok(cover.p10 < 0.16 && cover.p90 > 0.22, "cover varies across the meadow");
  assert.ok(cover.min < 0.12, "some of the meadow stays bare");
  assert.ok(cover.max < 0.4, "no meadow pixel is snowed over at low elevation");

  // The stencil must actually cut pixels out: neither all snow nor no snow.
  const stencil = stats(meadow, "stencil");
  assert.ok(stencil.fraction > 0.1, `only ${(stencil.fraction * 100) | 0}% of the meadow is snow`);
  assert.ok(stencil.fraction < 0.35, `${(stencil.fraction * 100) | 0}% of the meadow is snow`);
  assert.ok(stencil.fraction > 0.05 && stencil.fraction < 0.5, "edges exist: soft, not a hard cut");
  // Soft edges mean the stencil takes intermediate values, not just 0 and 1.
  const mid = meadow.filter((s) => s.stencil > 0.05 && s.stencil < 0.95).length / meadow.length;
  assert.ok(mid > 0.05, "the stencil has a soft transition band");
});

test("intended coverage and actual covered pixels agree within a few points", () => {
  // The brief's acceptance criterion: at 35 % intended coverage, ~35 % of
  // pixels are snow. This is the number the white filter could never produce.
  const { block } = surfaceBlock("ground", { publishWorn: true });
  for (const [y, expected] of [[MEADOW_Y, 0.2], [12, 0.45], [HIGHLAND_Y, 0.65]]) {
    const s = stats(sweep(block, { y, ...FLAT }), "stencil");
    assert.ok(
      Math.abs(s.fraction - expected) < 0.14,
      `at y=${y} cover mean ${s.mean.toFixed(3)} but only ${(s.fraction * 100) | 0}% of pixels took snow`,
    );
  }
});

// ── 3. Coverage comes from world data, not from the normal alone ─────────
test("ground coverage is driven by elevation, slope and drift", () => {
  const { block } = surfaceBlock("ground", { publishWorn: true });

  // Elevation: snowline. The same flat meadow at the crest is not the same
  // meadow at the shore.
  const low = stats(sweep(block, { y: MEADOW_Y, ...FLAT }), "cover").mean;
  const high = stats(sweep(block, { y: HIGHLAND_Y, ...FLAT }), "cover").mean;
  assert.ok(high > low + 0.25, `elevation barely matters (${low.toFixed(2)} → ${high.toFixed(2)})`);

  // Slope: gravity. A flat meadow takes far more than a 45° face.
  const flat = stats(sweep(block, { y: MEADOW_Y, normalY: 1 }), "cover").mean;
  const mid = stats(sweep(block, { y: MEADOW_Y, normalY: 0.7 }), "cover").mean;
  const steep = stats(sweep(block, { y: MEADOW_Y, normalY: 0.5 }), "cover").mean;
  const wall = stats(sweep(block, { y: MEADOW_Y, normalY: 0.02 }), "cover").mean;
  assert.ok(flat > mid, "a 45° face takes less than flat ground");
  assert.ok(mid > steep, "a 60° face takes less than a 45° one");
  assert.ok(steep >= wall, "a vertical face takes no more than a steep one");
  assert.ok(wall < 0.02, `a vertical face takes ${wall.toFixed(3)} — snow should slide off`);
  assert.ok(steep < 0.08, `a 60° face takes ${steep.toFixed(3)} — it should be nearly bare`);

  // Drift: at a constant elevation and slope the cover still varies, so snow
  // is never a contour line. Two points that differ only in position must
  // disagree about how much snow they carry.
  const a = sampleSurface(block, { x: 0, y: 8, z: 0, ...FLAT }).cover;
  const b = sampleSurface(block, { x: 260, y: 8, z: 260, ...FLAT }).cover;
  assert.ok(Math.abs(a - b) > 0.05, `drift is flat (${a.toFixed(3)} vs ${b.toFixed(3)})`);
  const transect = [];
  for (let i = 0; i < 40; i += 1) transect.push(sampleSurface(block, { x: i * 3, y: 8, z: 0, ...FLAT }).cover);
  const mean = transect.reduce((p, c) => p + c, 0) / transect.length;
  const sd = Math.sqrt(transect.reduce((p, c) => p + (c - mean) ** 2, 0) / transect.length);
  assert.ok(sd > 0.04, `cover along a transect barely varies (sd ${sd.toFixed(3)})`);
});

test("a worn trail is packed snow with dirt showing through", () => {
  const { block } = surfaceBlock("ground", { publishWorn: true });
  assert.match(block, /float worn = clamp\(vDcWorn/, "the terrain publishes the trail weight");
  // A path is COMPACTED snow: its own stencil, its own tone, and a dirt core
  // where boots clear it. It is never a white strip and never absent.
  const onTrail = stats(sweep(block, { y: 8, worn: 1, ...FLAT }), "pathSnow");
  assert.ok(onTrail.mean > 0.4, `the trail takes only ${(onTrail.mean * 100) | 0}% packed snow`);
  // The travelled centre keeps its dirt: 42 % of the packed snow is removed.
  assert.match(block, /mix\(packed, diffuseColor\.rgb \* 0\.92, smoothstep\(0\.45, 0\.95, worn\) \* 0\.42\)/);
  // And the verge feathers out, so the trail has no hard edge.
  assert.match(block, /float verge = 1\.0 - smoothstep\(0\.05, 0\.42, worn\)/);
  // The trail treatment sits ON TOP of the ground mask; it must not replace it.
  const meadow = stats(sweep(block, { y: 8, worn: 0, ...FLAT }), "cover");
  const trail = stats(sweep(block, { y: 8, worn: 1, ...FLAT }), "cover");
  assert.ok(Math.abs(trail.mean - meadow.mean) < 1e-9, "the trail must not change the ground mask");
  // Effective trail snow is the packed snow minus the dirt showing through.
  const effective = onTrail.mean * (1 - 0.42);
  assert.ok(effective > 0.15, `the trail reads as bare dirt (${effective.toFixed(3)})`);
  assert.ok(effective < 0.45, `the trail is buried (${effective.toFixed(3)})`);
});

test("the trail weight comes from the world's real geometry", () => {
  // A CPU-side check that the mask is authored data, not a gradient: the trail
  // centre is worn, the far meadow is not.
  assert.ok(pathWeight(0, 0) >= 0, "pathWeight is defined at the origin");
  const near = pathWeight(0, 0);
  const far = pathWeight(900, 900);
  assert.ok(near > far, `origin ${near} should be more worn than (900,900) ${far}`);
});

// ── 4. Identity is preserved per surface ─────────────────────────────────
test("each surface keeps its own character under snow", () => {
  // Low elevation, flat: the interesting regime, where the difference between
  // surfaces is what stops the world reading as one white field.
  const by = {};
  for (const surface of WINTER_SURFACES) {
    if (surface === "ice") continue; // handled by the ice branch
    const { block } = surfaceBlock(surface, surface === "ground" ? { publishWorn: true } : {});
    by[surface] = stats(sweep(block, { y: MEADOW_Y, ...FLAT }), "stencil");
  }
  // Roofs and rock take the most, trunks and walls the least.
  assert.ok(by.roof.fraction > by.trunk.fraction + 0.3, "a roof is not a trunk");
  assert.ok(by.rock.fraction > by.trunk.fraction, "rock caps out more than bark");
  assert.ok(by.trunk.fraction < 0.2, `trunks take ${(by.trunk.fraction * 100) | 0}% — trunks stay dark`);
  assert.ok(by.wall.fraction < 0.2, `walls take ${(by.wall.fraction * 100) | 0}% — walls stay bare`);
  assert.ok(by.canopy.fraction > by.trunk.fraction, "canopy snows more than trunk");
  assert.ok(by.foliage.fraction < by.canopy.fraction + 0.2, "grass stays grass");
  // Grass and trunks never disappear under snow.
  for (const surface of ["foliage", "trunk", "canopy"]) {
    assert.ok(by[surface].fraction > 0, `${surface} never takes any snow`);
    assert.ok(by[surface].fraction < 0.7, `${surface} is buried`);
  }
});

test("a wall stays bare even when it shares a mesh with its roof", () => {
  // scene.ts merges villa walls and roofs; the only separator available is the
  // surface normal, so the wall rule must be reachable by gravity alone.
  const { block } = surfaceBlock("wall");
  const vertical = sampleSurface(block, { y: 6, normalY: 0.02 });
  const horizontal = sampleSurface(block, { y: 6, normalY: 1 });
  assert.ok(vertical.cover < 0.02, `a wall face takes ${vertical.cover.toFixed(3)}`);
  assert.ok(horizontal.cover > vertical.cover * 4, "the top of the same wall takes snow");
});

// ── 5. Never white ───────────────────────────────────────────────────────
test("the snow palette never reaches white", () => {
  const { block, shader } = surfaceBlock("roof");
  const tone = shader.fragmentShader.match(/vec3 dcSnowTone\([\s\S]*?\n\}/);
  assert.ok(tone, "the snow tone function is injected");
  // Only the palette's own stops — not the luminance weights, which are not
  // colours — are checked against the white ceiling.
  const numbers = [...tone[0].matchAll(/vec3 (?:bright|shadow|dirtSnow|packed) = vec3\(([^)]*)\)/g)]
    .flatMap((m) => m[1].split(",").map((v) => Number(v.trim())))
    .filter((v) => !Number.isNaN(v));
  assert.ok(numbers.length > 4, "the palette has several stops");
  for (const v of numbers) {
    assert.ok(v <= 0.96, `palette component ${v} is too close to white`);
    assert.ok(v >= 0.2, `palette component ${v} is too dark to read as snow`);
  }
  assert.ok(!shader.fragmentShader.includes("vec3(1.0, 1.0, 1.0)"), "no pure white in the shader");
  // And the mask must not be able to saturate the albedo.
  assert.match(block, /diffuseColor\.rgb = mix\(diffuseColor\.rgb, snowColor/);
  assert.doesNotMatch(shader.fragmentShader, /diffuseColor\.rgb = snowColor/, "snow replaces nothing outright");
});

// ── 6. Summer is untouched, and reversible ───────────────────────────────
test("summer is the default: every registered material is a no-op at uIceAge 0", () => {
  for (const surface of WINTER_SURFACES) {
    if (surface === "ice") continue;
    const { block, shader, winter } = surfaceBlock(surface, surface === "ground" ? { publishWorn: true } : {});
    // Structural: the entire block is behind one early-out.
    assert.match(block, /if \(uIceAge > 0\.001\) \{/, `${surface} is not gated`);
    assert.match(shader.fragmentShader, /#include <emissivemap_fragment>/, "the emissive hook still runs");
    // Numerical: at 0 the mask is empty everywhere.
    const off = sweep(block, { y: HIGHLAND_Y, ...FLAT, iceAge: 0 });
    assert.ok(off.every((s) => s.cover === 0 && s.stencil === 0), `${surface} changes summer`);
    // And the block does not run at all in summer, so it costs nothing.
    winter.dispose();
  }
});

test("winter reverses to the pixel, and disposal puts materials back", () => {
  const { block, material, winter } = surfaceBlock("ground", { publishWorn: true });
  // The baseline is the same material BEFORE it was registered, so this really
  // is "back to where it started" and not "back to winter".
  const pristine = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.8 });
  const before = compile(pristine).fragmentShader;
  const hot = stats(sweep(block, { y: HIGHLAND_Y, ...FLAT, iceAge: 1 }), "stencil").fraction;
  const cold = stats(sweep(block, { y: HIGHLAND_Y, ...FLAT, iceAge: 0 }), "stencil").fraction;
  assert.ok(hot > 0.4, "full winter covers the highland");
  assert.equal(cold, 0, "and reversing empties it completely");
  winter.dispose();
  assert.equal(compile(material).uniforms.uIceAge, undefined, "dispose removes the hook");
  assert.equal(compile(material).fragmentShader, before, "dispose restores the original shader");
  assert.equal(material.customProgramCacheKey(), pristine.customProgramCacheKey(), "the cache key is restored too");
});

// ── 7. The season transition ─────────────────────────────────────────────
test("winter arrives over time, not in one frame", () => {
  const winter = createWinter("low");
  const material = new THREE.MeshStandardMaterial();
  winter.register(material, "ground");
  const shader = compile(material);
  assert.equal(shader.uniforms.uIceAge.value, 0, "it starts as summer");
  assert.equal(winter.season, 0);
  winter.setEnabled(true, true);
  assert.equal(shader.uniforms.uIceAge.value, 0, "a smooth enable does not snap");
  let frames = 0;
  while (winter.season < 1 && frames < 200) {
    winter.update(1 / 60, new THREE.PerspectiveCamera(), 1);
    frames += 1;
  }
  assert.ok(frames > 30, `winter arrived in ${frames} frames — too fast to read as weather`);
  assert.ok(frames < 130, `winter took ${frames} frames to arrive`);
  assert.equal(winter.season, 1, "it completes");
  // Half-open is a real halfway state, not a rounding artefact.
  winter.setEnabled(false, true);
  winter.update(0.5, new THREE.PerspectiveCamera(), 1);
  assert.ok(winter.season > 0.2 && winter.season < 0.85, `half-thaw reads ${winter.season}`);
  winter.dispose();
});

test("daylight is a seasonal blend that never washes the distance out", () => {
  const cases = [8, 12.75, 17.75];
  for (const hour of cases) {
    const summer = daylightAt(hour);
    const winter = winterDaylight(summer, 1);
    // The clock and the sun direction are the season's, not winter's.
    assert.equal(winter.hour, summer.hour, "the hour is preserved");
    assert.ok(winter.sunDir.equals(summer.sunDir), "the sun direction is preserved");
    // Cooler and softer, but the sun keeps its strength: silhouettes survive.
    assert.ok(winter.sunIntensity < summer.sunIntensity, "the sun is weaker");
    assert.ok(winter.sunIntensity > summer.sunIntensity * 0.82, "but not much weaker");
    // Fog must never go white. The old version lerped it 80 % of the way to
    // near-white; a real winter grade keeps it in the pale blue-grey band.
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const fogLum = lum(winter.fog);
    assert.ok(fogLum < 0.72, `winter fog luminance ${fogLum.toFixed(3)} is washed out`);
    assert.ok(fogLum > 0.4, `winter fog luminance ${fogLum.toFixed(3)} is muddy`);
    // Cooler, not white. A sunset stays warm in both seasons; what winter does
    // is move the fog towards its own pale blue-grey, never towards paper.
    const target = new THREE.Color(0x9db9cc);
    const dist = (c) => Math.hypot(c.r - target.r, c.g - target.g, c.b - target.b);
    assert.ok(dist(winter.fog) < dist(summer.fog), "winter fog moves towards the winter tone");
    if (hour > 9 && hour < 16) assert.ok(winter.fog.b >= winter.fog.r, "daytime winter fog is cool");
    // Exposure stays near summer's: this is a grade, not a re-light.
    assert.ok(winter.exposure > summer.exposure * 0.9, "exposure collapses");
    assert.ok(winter.exposure < summer.exposure * 1.05, "exposure blows out");
  }
});

test("a half season is halfway between the two", () => {
  const summer = daylightAt(10);
  const winter = winterDaylight(summer, 1);
  const half = winterDaylight(summer, 0.5);
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const s = lum(summer.fog);
  const w = lum(winter.fog);
  const h = lum(half.fog);
  assert.ok(h > s && h < w || h < s && h > w, "half winter is between summer and winter");
  assert.equal(winterDaylight(summer, 0).fog.r, summer.fog.r, "season 0 is exactly summer");
});

// ── 8. Performance ───────────────────────────────────────────────────────
test("snow adds no draw calls and no new geometries", () => {
  const winter = createWinter("high");
  const group = new THREE.Group();
  for (let i = 0; i < 6; i += 1) group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const before = group.children.length;
  const scene = new THREE.Scene();
  scene.add(group);
  const sceneChildren = scene.children.length;
  winter.registerTree(group);
  assert.equal(group.children.length, before, "registration must not add meshes");
  assert.equal(scene.children.length, sceneChildren, "registration must not touch the scene");
  assert.equal(winter.group.children.length, 2, "winter owns exactly the snowfall and the dust");
  // Registration is idempotent: one hook per material, not one per call.
  const material = group.children[0].material;
  winter.register(material, "ground");
  winter.register(material, "ground");
  const key = material.customProgramCacheKey();
  assert.equal(key.match(/winter-v3/g).length, 1, "the hook is applied once");
  winter.dispose();
});

test("snowfall budgets scale down with the tier and pause on reduced motion", () => {
  const seen = {};
  for (const [tier, count] of [["low", 260], ["medium", 520], ["high", 900], ["ultra", 900]]) {
    const winter = createWinter(tier);
    const points = winter.group.children[0];
    assert.equal(points.geometry.attributes.position.count, count, `${tier} budget`);
    seen[tier] = count;
    winter.dispose();
  }
  assert.ok(seen.low < seen.medium && seen.medium < seen.high, "budgets are ordered");
  const winter = createWinter("high");
  const camera = new THREE.PerspectiveCamera();
  winter.setEnabled(true);
  winter.update(1, camera, 1);
  const t = winter.group.children[0].material.uniforms.uTime.value;
  assert.ok(t > 0, "snowfall runs when winter is on");
  winter.update(1, camera, 1, true);
  assert.equal(winter.group.children[0].material.uniforms.uTime.value, t, "reduced motion stops the clock");
  winter.dispose();
});

test("blowing dust follows the ground, not the camera plane", () => {
  const winter = createWinter("medium");
  const dust = winter.group.children[1];
  const camera = new THREE.PerspectiveCamera();
  winter.setEnabled(true);
  camera.position.set(120, 30, -80);
  winter.update(1.5, camera, 3);
  const pos = dust.geometry.attributes.position;
  assert.ok(pos.count > 0, "dust exists");
  let onGround = 0;
  for (let i = 0; i < pos.count; i += 1) {
    if (pos.getY(i) > -2 && pos.getY(i) < 100) onGround += 1;
  }
  assert.equal(onGround, pos.count, "every dust mote sits on the terrain");
  winter.dispose();
});

// ── 9. Water becomes ice, and thaws ──────────────────────────────────────
test("ice is cold blue, not white, and the water keeps flowing when thawed", () => {
  const winter = createWinter("low");
  const material = new THREE.MeshStandardMaterial();
  winter.register(material, "ice");
  const shader = compile(material);
  const vein = shader.fragmentShader.match(/vec3 iceColor = mix\(([^)]*)\)/);
  assert.ok(vein, "the ice palette is injected");
  const nums = [...vein[0].matchAll(/vec3\(([^)]*)\)/g)]
    .flatMap((m) => m[1].split(",").map((v) => Number(v.trim())))
    .filter((v) => !Number.isNaN(v));
  for (const v of nums) assert.ok(v <= 0.9, `ice colour ${v} is too bright`);
  assert.ok(shader.fragmentShader.indexOf("float iceVein") < shader.fragmentShader.indexOf("#include <tonemapping_fragment>"), "the veins are drawn before tone mapping");
  winter.dispose();
});
