// src/nature3d/engine/moss.ts
//
// THE MOSS BANK — the river's green edge.
//
// "Moss 01" by Rico Cilliers, Poly Haven (CC0 — free of all known copyright
// restrictions, no credit required; the URL is kept so the asset can be
// traced to its source):
//   https://polyhaven.com/a/moss_01
//
// The model ships as TWELVE authored variants — twelve differently shaped
// mossy clumps (the two "tall" ones included) sharing one material, 204
// triangles between them. The brief: line BOTH banks of the straight river
// that runs down the middle of the field (x = RIVER_CENTER_X), at least one
// clump per metre of bank, every variant in use. This module does exactly
// that, on top of the grass + sorrel fields.
//
// ── Cost model ──────────────────────────────────────────────────────────
//
//   * One InstancedMesh PER VARIANT → twelve draw calls, one material, one
//     compiled program. A whole kilometre of mossy bank is a couple of
//     thousand instances of a ~17-triangle clump — the cheapest layer in
//     the scene; its cost is fill rate, and the clumps are tiny.
//   * The variants are normalised to UNIT HEIGHT at boot (base at the
//     origin), so one instance scale in metres sizes any clump and the wind
//     bend reads the same normalised height for all twelve.
//   * Wind: the same onBeforeCompile idiom as the grass, gentler — a mossy
//     stem is stiffer than a blade.
//   * Alpha-TEST (not blend, despite the glTF saying BLEND): the stems are
//     solid in the alpha map, a 0.35 cut keeps most of the soft edge, and
//     the engine's no-sorting rule (principle 35) stays unbroken.
//
// ── The bank scatter ────────────────────────────────────────────────────
//
//   The river is a straight gorge at x = 18 running the whole length of the
//   world, so the scatter is a 1-D walk along the banks, not a disc:
//
//     • anchors every ~0.9 m of river (more often on higher tiers);
//     • the WATER'S EDGE is measured per anchor by walking outward from the
//       channel until the terrain rises above WATER_LEVEL — the gorge is
//       much wider than the channel: the waterline sits 7–23 m out along
//       the z-axis, so a fixed offset would plant half the bank underwater;
//     • at each anchor, EACH bank plants 1–3 clumps in the first 0.15–4 m
//       of dry ground above the waterline (moss colonises the damp line
//       first, a few outliers stray further up the bank);
//     • jitter on z so no anchor ever reads as a metred-out row;
//     • the veto keeps the trampled bank path bare and thins the estuary
//       where the bank turns to sand.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TextureLoader } from "three";
import type { QualityBudget } from "./quality";
import { terrainHeight, RIVER_CENTER_X, RIVER_HALF_WIDTH, WATER_LEVEL, coastWeight } from "./terrain";
import { pathWeight } from "./environment";

export interface MossBank {
  group: THREE.Group;
  /** The shared moss material, published for the atmosphere + winter passes. */
  materials: THREE.Material[];
  update(time: number, windStrength: number): void;
  dispose(): void;
}

const MODEL_URL = "sanctuary/models/moss_01.gltf";
const ALPHA_URL = "sanctuary/models/textures/moss_01_alpha_1k.png";

/** Anchor spacing along the bank, per tier — "at least one per metre". */
function bankDensity(budget: QualityBudget): number {
  switch (budget.tier) {
    case "low": return 1.5; // one anchor per 1.5 m — still ≥1 clump/m/bank
    case "medium": return 1.2;
    case "high": return 0.9;
    case "ultra": return 0.7;
  }
}

export function createMossBank(budget: QualityBudget, anisotropy: number): Promise<MossBank> {
  const group = new THREE.Group();
  group.name = "moss-bank";
  const loader = new GLTFLoader();
  const shadows = budget.shadowMapSize > 0;

  return new Promise<MossBank>((resolve, reject) => {
    loader.load(
      MODEL_URL,
      (gltf) => {
        // ── Split the twelve variants, normalise each ─────────────────
        //
        // Every node is one authored clump sitting around the origin. Each
        // is re-based (base → origin, centred) and scaled to UNIT HEIGHT so
        // the twelve share one wind curve and one scale convention.
        const variants: THREE.BufferGeometry[] = [];
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const g = mesh.geometry as THREE.BufferGeometry;
          g.computeBoundingBox();
          const box = g.boundingBox!;
          const h = Math.max(1e-4, box.max.y - box.min.y);
          g.translate(
            -box.min.x - (box.max.x - box.min.x) / 2,
            -box.min.y,
            -box.min.z - (box.max.z - box.min.z) / 2,
          );
          g.scale(1 / h, 1 / h, 1 / h);
          variants.push(g);
        });
        if (variants.length === 0) {
          reject(new Error("moss: glTF contains no meshes"));
          return;
        }

        // ── Material: the glTF says BLEND; we cut instead (principle 35) ─
        const material = new THREE.MeshStandardMaterial({
          map: new TextureLoader().load("sanctuary/models/textures/moss_01_diff_1k.jpg"),
          normalMap: new TextureLoader().load("sanctuary/models/textures/moss_01_nor_gl_1k.jpg"),
          roughnessMap: new TextureLoader().load("sanctuary/models/textures/moss_01_arm_1k.jpg"),
          metalnessMap: new TextureLoader().load("sanctuary/models/textures/moss_01_arm_1k.jpg"),
          alphaMap: new TextureLoader().load(ALPHA_URL),
          alphaTest: 0.35, // the glTF's soft BLEND edge, kept mostly intact
          side: THREE.DoubleSide,
          metalness: 0,
        });
        material.normalScale.set(2, 2); // the glTF authored normalScale 2
        material.aoMap = material.metalnessMap;
        if (material.aoMap) material.aoMapIntensity = 0.7;
        for (const tex of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap, material.alphaMap]) {
          if (tex) tex.anisotropy = anisotropy;
        }

        // ── Wind: a stiffer, smaller sway than the grass tufts ─────────
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uTime = { value: 0 };
          shader.uniforms.uWind = { value: 1 };
          shader.uniforms.uWindDir = { value: new THREE.Vector2(0.86, 0.5) };
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              /* glsl */ `
              #include <common>
              uniform float uTime;
              uniform float uWind;
              uniform vec2  uWindDir;
              float dcMHash(vec3 p) {
                return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
              }
              `,
            )
            .replace(
              "#include <begin_vertex>",
              /* glsl */ `
              #include <begin_vertex>
              vec3 dcRoot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
              float dcPhase = dcMHash(dcRoot) * 6.2831;
              float dcT = clamp(transformed.y, 0.0, 1.0);
              float dcBend = dcT * dcT;
              vec4 dcView = modelViewMatrix * vec4(dcRoot, 1.0);
              float dcNear = 1.0 - smoothstep(40.0, 90.0, -dcView.z);
              float dcTravel = dot(dcRoot.xz, uWindDir) * 0.2;
              float dcSwell  = sin(uTime * 1.1 + dcTravel + dcPhase) * 0.5 + 0.5;
              float dcGust   = sin(uTime * 0.3 + dcTravel * 0.4) * 0.5 + 0.5;
              float dcAmp = (0.015 + dcSwell * 0.02 + dcGust * 0.015) * uWind * dcBend * dcNear;
              transformed.x += uWindDir.x * dcAmp;
              transformed.z += uWindDir.y * dcAmp;
              transformed.y -= dcAmp * dcAmp * 0.4;
              `,
            );
          material.userData.shader = shader;
        };
        material.customProgramCacheKey = () => "dc-moss";

        // ── The bank walk ──────────────────────────────────────────────
        //
        // How far the moss follows the river: out to the far edge of the
        // grass field (past that the bank is beach/mountain and the moss
        // would be the only green there — wrong).
        const reach = budget.grassFarRadius;
        const step = bankDensity(budget);
        const zMin = -reach + 8;
        const zMax = reach - 8;
        const anchors: number[] = [];
        for (let z = zMin; z <= zMax; z += step) anchors.push(z);

        // Capacity per variant: anchors × 2 banks × ~1.9 clumps / 12 variants,
        // with headroom so the rejection rolls never starve a buffer.
        const capacity = Math.ceil((anchors.length * 2 * 2.4 * 1.4) / variants.length) + 4;
        const meshes = variants.map((g) => {
          const mesh = new THREE.InstancedMesh(g, material, capacity);
          mesh.castShadow = shadows;
          mesh.receiveShadow = shadows;
          mesh.frustumCulled = true;
          mesh.count = 0;
          return mesh;
        });

        const dummy = new THREE.Object3D();
        const color = new THREE.Color();
        let guard = 0;

        for (let ai = 0; ai < anchors.length && guard < anchors.length * 8; ai += 1) {
          guard += 1;
          const bankZ = anchors[ai] + (Math.random() - 0.5) * step * 0.8;
          for (const side of [-1, 1] as const) {
            // Measure THIS anchor's waterline: walk outward from the channel
            // edge until the ground rises above the water. The gorge is
            // wider than the channel (the waterline sits 7–23 m out along z)
            // — a fixed offset would plant half the bank underwater.
            let edgeX: number | null = null;
            for (let lat = RIVER_HALF_WIDTH + 0.2; lat <= 40; lat += 0.5) {
              const x = RIVER_CENTER_X + side * lat;
              if (terrainHeight(x, anchors[ai]) > WATER_LEVEL) {
                edgeX = x;
                break;
              }
            }
            if (edgeX === null) continue; // no dry bank within 40 m: skip
            // 1–3 clumps per anchor per bank: a base clump, one more 75 % of
            // the time, an occasional third — "at least one per metre".
            const n = 1 + (Math.random() < 0.75 ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0);
            for (let k = 0; k < n; k += 1) {
              // Bias to the waterline: r² pushes most clumps into the first
              // metre of dry ground, a few stray up to ~4 m up the bank.
              const lat = 0.15 + Math.random() * Math.random() * 3.85;
              const x = edgeX + side * lat;
              const z = bankZ + (Math.random() - 0.5) * 0.6;
              const y = terrainHeight(x, z);
              // The waterline shifted under the jitter — skip anything the
              // tide of the height field put under water.
              if (y < WATER_LEVEL + 0.1) continue;
              // The trampled bank path (the trail down to the water) stays
              // worn; moss does not grow on a footpath.
              const worn = pathWeight(x, z);
              if (worn > 0.5) continue;
              if (worn > 0.28 && Math.random() < 0.6) continue;
              // The estuary: where the bank turns to sand, thin hard.
              if (coastWeight(x, z) > 0.05 && Math.random() < 0.85) continue;

              const mesh = meshes[(ai * 7 + k * 5 + (side + 1) * 3) % variants.length];
              const slot = mesh.count;
              if (slot >= mesh.instanceMatrix.count) continue; // buffer full: skip
              // Mossy stems stand 1.8–3.9 m (6× the original 0.3–0.65 m per
              // the owner's directive); the two "tall" variants carry the
              // tallest reach on their own.
              const s = 1.8 + Math.random() * 2.1;
              dummy.position.set(x, y - 0.02, z);
              dummy.rotation.set(
                (Math.random() - 0.5) * 0.16,
                Math.random() * Math.PI * 2,
                (Math.random() - 0.5) * 0.16,
              );
              dummy.scale.set(s * (0.85 + Math.random() * 0.3), s, s * (0.85 + Math.random() * 0.3));
              dummy.updateMatrix();
              mesh.setMatrixAt(slot, dummy.matrix);
              // Damp, darker, deeper green than the meadow — moss lives in
              // shade and moisture, so it reads COOLER than the turf.
              const hue = 0.33 + (Math.random() - 0.5) * 0.03;
              const sat = 0.42 + Math.random() * 0.16;
              const lit = 0.3 + Math.random() * 0.12;
              color.setHSL(hue, sat, lit);
              mesh.setColorAt(slot, color);
              mesh.count = slot + 1;
            }
          }
        }

        for (const m of meshes) {
          m.instanceMatrix.needsUpdate = true;
          m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
          m.boundingSphere = new THREE.Sphere(new THREE.Vector3(RIVER_CENTER_X, 0, 0), reach + 12);
        }
        group.add(...meshes);

        resolve({
          group,
          materials: [material],
          update(time, windStrength) {
            const shader = material.userData.shader as
              { uniforms: Record<string, { value: unknown }> } | undefined;
            if (!shader) return;
            shader.uniforms.uTime.value = time;
            shader.uniforms.uWind.value = windStrength;
          },
          dispose() {
            for (const m of meshes) m.dispose();
            variants.forEach((g) => g.dispose());
            material.dispose();
            for (const tex of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap, material.alphaMap]) {
              (tex as THREE.Texture | null)?.dispose?.();
            }
            group.clear();
          },
        });
      },
      undefined,
      (err) => {
        console.warn("moss: model failed to load, continuing without the moss bank", err);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
