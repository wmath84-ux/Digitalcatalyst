import * as THREE from "three";
import { buildSync } from "esbuild";
buildSync({ entryPoints:["src/nature3d/engine/hillGrass.ts"], bundle:true, format:"esm", platform:"node", outfile:"/tmp/hg.mjs", logLevel:"silent" });
const hg = await import("/tmp/hg.mjs");
const field = hg.createHillGrassField({tier:"high", hillGrass:2000});
const mat = field.materials[0];

// Capture the shader three.js passes to onBeforeCompile by rendering with a
// fake renderer? Instead: use three's own ShaderLib lambert template and run
// the SAME chain: my wind injection -> atmosphere -> winter.
const resolveIncludes = (src, chunks) => src.replace(/#include <(.+?)>/g, (m, n) => chunks[n] !== undefined ? resolveIncludes(chunks[n], chunks) : m);

// Build a minimal renderer to get the real prefix is hard headless; instead
// grab the raw lambert shaders + chunks and apply the material's own
// onBeforeCompile chain via a stub, then resolve includes and print.
let shader = {
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.common, THREE.UniformsLib.lights, { diffuse:{value:new THREE.Color()}, opacity:{value:1} }]),
  vertexShader: THREE.ShaderLib.lambert.vertexShader,
  fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
};
// simulate three setting instancing defines: we just need to see the chunks
mat.onBeforeCompile(shader, {});
const vs = resolveIncludes(shader.vertexShader, THREE.ShaderChunk);
const fs = resolveIncludes(shader.fragmentShader, THREE.ShaderChunk);
// Check: does the vertex shader reference instanceMatrix/instanceColor under proper defines?
console.log("=== defines needed ===");
console.log("uses instanceMatrix:", vs.includes("instanceMatrix"));
console.log("uses instanceColor:", /instanceColor/.test(vs));
console.log("color_vertex present:", /vColor/.test(vs));
console.log("USE_COLOR guard around color attr multiply:", /#ifdef USE_COLOR\n\tvColor \*= color;/.test(vs));
console.log("uTime declared:", /uniform float uTime/.test(vs));
console.log("begin_vertex replaced (dcRoot present):", vs.includes("dcRoot"));
console.log("project_vertex replaced (vDcWorldPos):", vs.includes("vDcWorldPos"));
console.log("fragment fog replaced:", fs.includes("dcHazeDensity"));
console.log("fragment transmit added:", fs.includes("uDcTransmit"));
console.log("fragment winter uIceAge:", fs.includes("uIceAge"));
// Save for manual inspection
import { writeFileSync } from "node:fs";
writeFileSync("/tmp/hillgrass_vertex.glsl", vs);
writeFileSync("/tmp/hillgrass_fragment.glsl", fs);
console.log("written /tmp/hillgrass_vertex.glsl", vs.length, "/tmp/hillgrass_fragment.glsl", fs.length);
