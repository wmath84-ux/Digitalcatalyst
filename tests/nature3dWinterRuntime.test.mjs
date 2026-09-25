import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Exercise real material hooks against Three's actual shader sources, not mocks.
const temp = mkdtempSync(path.join(tmpdir(), "sanctuary-winter-"));
const bundle = path.join(temp, "winter.mjs");
buildSync({
  stdin: {
    contents: `
      export * as THREE from "three";
      export { createWinter, winterDaylight } from "./src/nature3d/engine/winter";
      export { createAtmosphere } from "./src/nature3d/engine/atmosphere";
      export { createWater } from "./src/nature3d/engine/water";
      export { daylightAt } from "./src/nature3d/engine/daylight";
      export { budgetFor } from "./src/nature3d/engine/quality";
      export { terrainHeight } from "./src/nature3d/engine/terrain";
      export { createStudent } from "./src/nature3d/engine/student";
      export { createDesk } from "./src/nature3d/engine/lectern";
      export { REGIONS } from "./src/nature3d/engine/regions";
    `,
    resolveDir: process.cwd(),
  },
  bundle: true, platform: "node", format: "esm", outfile: bundle, logLevel: "silent",
});
const { THREE, createWinter, winterDaylight, createAtmosphere, createWater, daylightAt, budgetFor, REGIONS, terrainHeight, createStudent, createDesk } = await import(pathToFileURL(bundle));
rmSync(temp, { recursive: true, force: true });

function compile(material) {
  const lib = material.isPointsMaterial ? "points" : material.isMeshBasicMaterial ? "basic" : material.isMeshLambertMaterial ? "lambert" : "standard";
  const shader = { ...THREE.ShaderLib[lib], uniforms: {} };
  material.onBeforeCompile(shader, {});
  return shader;
}

test("only Sanctuary and Highlands are active regions", () => {
  assert.deepEqual(REGIONS.map((r) => r.id).sort(), ["sanctuary", "trek"]);
});

test("snow composes with atmosphere and wind; shared uniforms reverse without altering materials", () => {
  const winter = createWinter("low");
  const atmosphere = createAtmosphere(budgetFor("low"));
  const ground = new THREE.MeshStandardMaterial({ color: 0x217923, roughness: 0.7 });
  const foliage = new THREE.MeshLambertMaterial({ color: 0x357622 });
  const original = ground.color.clone();
  const wind = { value: 2 };
  foliage.onBeforeCompile = (shader) => { shader.uniforms.uTestWind = wind; };
  atmosphere.register(ground);
  atmosphere.register(foliage, { foliage: true });
  winter.register(ground, "ground");
  winter.register(foliage, "foliage");
  const cacheKey = ground.customProgramCacheKey();
  winter.register(ground, "ground"); // Idempotent: never duplicate the shader layer.
  const g = compile(ground);
  const f = compile(foliage);
  assert.equal(f.uniforms.uTestWind, wind);
  assert.equal(g.uniforms.uIceAge, f.uniforms.uIceAge);
  assert.equal(g.uniforms.uDcHazeColor, atmosphere.uniforms.uDcHazeColor);
  for (const shader of [g, f]) {
    assert.equal(shader.fragmentShader.split("uniform float uIceAge;").length - 1, 1);
    assert.equal(shader.fragmentShader.split("varying vec3 vDcWorldPos;").length - 1, 1);
    assert.match(shader.vertexShader, /varying vec3 vDcWorldNormal/);
    assert.match(shader.fragmentShader, /diffuseColor.rgb = mix\(diffuseColor.rgb, snowColor/);
    assert.ok(shader.fragmentShader.indexOf("float snowCover") < shader.fragmentShader.indexOf("#include <lights_fragment_begin>"));
  }
  for (let i = 0; i < 5; i += 1) {
    winter.setEnabled(true);
    assert.equal(g.uniforms.uIceAge.value, 1);
    assert.equal(winter.group.visible, true);
    winter.setEnabled(false);
    assert.equal(g.uniforms.uIceAge.value, 0);
    assert.equal(winter.group.visible, false);
  }
  assert.equal(ground.customProgramCacheKey(), cacheKey);
  assert.ok(ground.color.equals(original));
  assert.equal(ground.roughness, 0.7);
  winter.dispose(); atmosphere.dispose(); ground.dispose(); foliage.dispose();
});

test("winter preserves daylight hours and sun arc for every preset", () => {
  for (const hour of [6, 9, 12.5, 17, 18.5]) {
    const summer = daylightAt(hour);
    const winter = winterDaylight(daylightAt(hour));
    assert.equal(winter.hour, summer.hour);
    assert.ok(winter.sunDir.equals(summer.sunDir));
    assert.notEqual(winter.fog.getHex(), summer.fog.getHex());
    assert.ok(winter.exposure > 0.7);
    assert.ok(daylightAt(hour).fog.equals(summer.fog), "next summer state is unchanged");
  }
});

test("icy river/ocean/waterfall stop flowing and restore on thaw", () => {
  const textures = new Proxy({}, { get: (target, key) => target[key] ??= new THREE.Texture() });
  const water = createWater(textures, budgetFor("low"), new THREE.Vector3(0, 1, 0));
  const winter = createWinter("low");
  const shaders = water.iceMaterials.map((material) => {
    winter.register(material, "ice");
    const shader = compile(material);
    assert.ok(shader.fragmentShader.indexOf("float iceVein") < shader.fragmentShader.indexOf("#include <tonemapping_fragment>"));
    return shader;
  });
  assert.equal(shaders.length, 3);
  water.update(0.016, 10);
  assert.ok(shaders.every((shader) => shader.uniforms.uTime.value === 10));
  water.setFrozen(true);
  winter.setEnabled(true);
  water.update(0.016, 20);
  assert.ok(shaders.every((shader) => shader.uniforms.uTime.value === 10));
  assert.ok(shaders.every((shader) => shader.uniforms.uIceAge.value === 1));
  water.setFrozen(false);
  water.update(0.016, 30);
  assert.ok(shaders.every((shader) => shader.uniforms.uTime.value === 30));
  winter.dispose(); water.dispose();
});

test("snowfall uses tier budgets, follows the viewer, respects reduced motion and disposes", () => {
  // The old version ran a full blizzard (450/900/1600/1600). Snow now has to
  // read as weather, not as a wall of white, and it must fit the budget.
  for (const [tier, count] of [["low", 260], ["medium", 520], ["high", 900], ["ultra", 900]]) {
    const winter = createWinter(tier);
    const camera = new THREE.PerspectiveCamera();
    const points = winter.group.children[0];
    const uniforms = points.material.uniforms;
    assert.equal(points.geometry.attributes.position.count, count);
    winter.update(1, camera, 1);
    assert.equal(uniforms.uTime.value, 0, "no work when disabled");
    winter.setEnabled(true);
    camera.position.set(-700, 80, 40);
    winter.update(1, camera, 2);
    assert.ok(uniforms.uCenter.value.equals(camera.position));
    assert.equal(uniforms.uTime.value, 1);
    winter.update(1, camera, 2, true);
    assert.equal(uniforms.uTime.value, 1, "reduced-motion snowfall stays still");
    let disposed = 0;
    points.geometry.addEventListener("dispose", () => disposed++);
    points.material.addEventListener("dispose", () => disposed++);
    winter.dispose();
    assert.equal(disposed, 2);
    assert.equal(winter.group.children.length, 0);
  }
});


test("plain contact decals do not reference conditional basic-material normals", () => {
  const atmosphere = createAtmosphere(budgetFor("low"));
  const decal = new THREE.MeshBasicMaterial({ transparent: true });
  atmosphere.register(decal);
  const shader = compile(decal);
  assert.doesNotMatch(shader.vertexShader, /vDcWorldNormal/);
  assert.doesNotMatch(shader.fragmentShader, /vDcWorldNormal/);
  assert.match(shader.vertexShader, /vDcWorldPos =/);
  atmosphere.dispose(); decal.dispose();
});


test("chair and desk freeze independently from the student and restore without mutation", () => {
  const student = createStudent(budgetFor("low"));
  const desk = createDesk(false);
  const winter = createWinter("low");
  winter.registerTree(student.chair);
  winter.registerTree(desk);
  const shaders = [];
  for (const root of [student.chair, desk]) root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const shader = compile(mesh.material);
    // Furniture is gravity-driven with a LOW ceiling: a vertical chair leg takes
    // almost nothing, which is what stops props reading as white props.
    assert.match(shader.fragmentShader, /mix\(0\.10, 1\.0, snowUp\)/, "prop surfaces get the low furniture ceiling");
    assert.doesNotMatch(shader.fragmentShader, /mix\(0\.62, 1\.0, snowUp\)/);
    assert.doesNotMatch(shader.fragmentShader, /vec2 frostEdge/, "props use gravity, not the board's UV-edge mask");
    shaders.push(shader);
  });
  assert.ok(shaders.length >= 4, "both the chair and the desk are props");
  student.group.traverse((mesh) => {
    if (!mesh.isMesh || mesh.parent === student.chair) return;
    assert.equal(compile(mesh.material).uniforms.uIceAge, undefined, "the learner is not frozen");
  });
  winter.setEnabled(true);
  assert.ok(shaders.every((s) => s.uniforms.uIceAge.value === 1));
  winter.setEnabled(false);
  assert.ok(shaders.every((s) => s.uniforms.uIceAge.value === 0));
  student.dispose(); winter.dispose();
  // Disposal must undo the hook, not leave a dangling uniform behind.
  desk.traverse((mesh) => {
    if (!mesh.isMesh) return;
    assert.equal(compile(mesh.material).uniforms.uIceAge, undefined, "dispose removes the winter hook");
  });
  desk.traverse((mesh) => { mesh.geometry?.dispose(); mesh.material?.dispose(); });
});

test("lesson frost is UV-edge-only, including physical-material boards", () => {
  const winter = createWinter("high");
  const face = new THREE.MeshPhysicalMaterial({ map: new THREE.Texture(), clearcoat: 1 });
  const frame = new THREE.MeshStandardMaterial();
  winter.register(face, "board");
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), [frame, face]));
  winter.registerTree(group); // General registration must not replace the edge mask.
  const shader = compile(face);
  assert.match(shader.fragmentShader, /vec2 frostEdge = min\(vMapUv, 1.0 - vMapUv\)/);
  assert.match(shader.fragmentShader, /snowCover \*= 1.0 - smoothstep/);
  assert.doesNotMatch(compile(frame).fragmentShader, /vec2 frostEdge/);
  assert.match(compile(frame).fragmentShader, /mix\(0\.10, 1\.0, snowUp\)/);
  winter.dispose(); face.map.dispose(); face.dispose(); frame.dispose();
  group.children[0].geometry.dispose();
});

test("blowing snow dust follows hills, responds to wind, pauses and releases resources", () => {
  const winter = createWinter("medium");
  const dust = winter.group.getObjectByName("wind-blown-snow-dust");
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(-700, 80, 50);
  winter.setEnabled(true);
  winter.update(0.1, camera, 0.45);
  const attr = dust.geometry.attributes.position;
  assert.equal(attr.count, 128);
  function aboveGround() {
    for (let i = 0; i < attr.count; i++) {
      const gap = attr.getY(i) - terrainHeight(attr.getX(i), attr.getZ(i));
      assert.ok(gap >= 0.09 && gap <= 1.61, `powder must skim terrain, got ${gap}`);
    }
  }
  aboveGround();
  const initial = attr.array.slice();
  winter.update(0.1, camera, 2.2);
  assert.notDeepEqual(attr.array, initial);
  aboveGround();
  const paused = attr.array.slice();
  winter.update(1, camera, 2.2, true);
  assert.deepEqual(attr.array, paused, "reduced motion stops the powder as well as snowfall");
  winter.setEnabled(false);
  winter.update(1, camera, 2.2);
  assert.deepEqual(attr.array, paused);
  const shader = compile(dust.material);
  assert.match(shader.fragmentShader, /gl_PointCoord/);
  assert.match(shader.vertexShader, /varying float vPowderFade/);
  assert.match(shader.fragmentShader, /varying float vPowderFade/);
  let disposed = 0;
  dust.geometry.addEventListener("dispose", () => disposed++);
  dust.material.addEventListener("dispose", () => disposed++);
  winter.dispose();
  assert.equal(disposed, 2);
});
