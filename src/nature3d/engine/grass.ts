// src/nature3d/engine/grass.ts
//
// HYPER-REAL GRASS FIELD — up to 100 000 clumps in TWO draw calls.
//
// How it stays free on a low-end GPU:
//
//   * One `InstancedMesh` per LOD ring. All blades share one 3-triangle
//     geometry, one material, one draw call. The CPU never touches a blade
//     after boot.
//   * The wind is a VERTEX SHADER effect injected with `onBeforeCompile`, so
//     animating 100 k blades costs exactly one uniform update per frame
//     (`uTime`) — zero JS work, zero matrix rebuilds, no GC pressure.
//   * The near ring uses a 3-segment curved blade, the far ring uses a flat
//     2-triangle card. Blades also SHRINK to zero over the last few metres of
//     each ring, so LOD transitions have no popping.
//   * Alpha-test (not alpha-blend) so there is no sorting cost and no
//     overdraw explosion — the single biggest cause of grass jank on mobile
//     (research §4, §22, principle 35).
//
// ── What the research pass changed (and why) ───────────────────────────
//
//   CLUMPS, NOT BLADES (§4, principle 17). Grass does not grow as evenly
//   spaced individual blades; it grows in tufts that share a root system and
//   a microclimate. The scatter now seeds a CLUMP and fills it with 2–6
//   blades inside a 30 cm radius, which is what gives a meadow its volume —
//   the silhouette of the tuft, not of the blade, is what the eye reads.
//
//   THE GRASS WEARS THE GROUND'S COLOUR (§12, §27). Every clump samples the
//   same `groundColorAt` rule the terrain mesh uses and derives its own
//   colour from it, so the grass over wet soil comes out darker and greener
//   than the grass over dry ground — the field becomes a continuation of the
//   terrain instead of a green carpet laid over it.
//
//   WORN GROUND HAS NO GRASS (§8, §48). Trails and the trodden disc under
//   the chair are read from `pathWeight`; blades thin out across the shoulder
//   and stop entirely on the core. That is the visible proof of the level's
//   design — where the learner walks, the ground wears.
//
//   A SKIRT AROUND EVERY ROCK (principle 50). Each boulder in the rock kit
//   reports its base radius; the grass field grows a ring of blades around it,
//   so no rock ever sits on the ground as if it had been dropped there.

import * as THREE from "three";
import type { QualityBudget } from "./quality";
import { insideRiver, terrainHeight, RIVER_CENTER_X, OCEAN_LEVEL, coastWeight } from "./terrain";
import { GROUND_PALETTE } from "./palette";
import { groundColorAt, pathWeight } from "./environment";

export interface GrassField {
  group: THREE.Group;
  /**
   * The two ring materials. Exposed so `scene.ts` can register them with the
   * atmosphere pass as FOLIAGE — they get the sun transmission term that makes
   * a backlit field glow (research §4, principle 18), which a rock must not.
   */
  materials: THREE.Material[];
  update(time: number, windStrength: number): void;
  dispose(): void;
}

/** A curved blade built from `segments` quads, pivoting at the root. */
function bladeGeometry(segments: number, width: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, height, 1, segments);
  geo.translate(0, height / 2, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // Taper the blade towards the tip and add a natural forward curl.
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const t = y / height;
    pos.setX(i, pos.getX(i) * (1 - t * 0.82));
    pos.setZ(i, pos.getZ(i) + t * t * height * 0.16);
  }
  geo.computeVertexNormals();
  return geo;
}

interface RingOptions {
  count: number;
  innerRadius: number;
  outerRadius: number;
  segments: number;
  height: number;
  width: number;
  colorJitter: number;
  /**
   * How much bigger a blade gets at the rim of the ring. Sparse far grass
   * only reads as a continuous meadow if each clump covers more ground, so
   * the far ring grows its blades with distance instead of adding instances.
   */
  distanceGain?: number;
  /** Blades per tuft at the near edge … far edge of the ring. */
  clumpNear: number;
  clumpFar: number;
  /** Radius of one tuft, in metres. */
  clumpRadius: number;
  /** Rock bases to skirt, as (x, z, radius) triples. */
  skirt?: Float32Array;
}

function buildRing(
  bladeTex: THREE.Texture,
  opts: RingOptions,
  budget: QualityBudget,
): { mesh: THREE.InstancedMesh; material: THREE.MeshLambertMaterial } {
  const geo = bladeGeometry(opts.segments, opts.width, opts.height);

  const material = new THREE.MeshLambertMaterial({
    map: bladeTex,
    // A tighter cut than 0.42 trims the soft fringe off every blade card:
    // fewer surviving transparent texels, less overdraw, sharper silhouette
    // (principle 35 — the alpha card's empty pixels are pure cost).
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    transparent: false,
    vertexColors: true,
  });

  // ── Wind + view-space thickening, injected into the stock shader ──────
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

        // Cheap hash so every blade has its own phase without an extra attribute.
        float dcHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        `,
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>

        // Instance world origin → per-blade phase + travelling gust waves.
        vec3 dcRoot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float dcPhase = dcHash(dcRoot.xz) * 6.2831;

        // Height factor: the root never moves, the tip moves the most (t^1.7
        // approximates a real cantilever far better than a linear ramp).
        float dcT = clamp(transformed.y / ${opts.height.toFixed(3)}, 0.0, 1.0);
        float dcBend = pow(dcT, 1.7);

        // Two octaves: a slow ground swell + a fast flutter.
        float dcTravel = dot(dcRoot.xz, uWindDir) * 0.22;
        float dcSwell  = sin(uTime * 1.15 + dcTravel + dcPhase) * 0.5 + 0.5;
        float dcGust   = sin(uTime * 0.31 + dcTravel * 0.4) * 0.5 + 0.5;
        float dcFlutter= sin(uTime * 6.1 + dcPhase * 2.3) * 0.14;

        // DISTANCE CUTOFF. Past ~70 m a blade is a couple of pixels wide and
        // the sway is pure aliasing — it shimmers instead of waving. Fading
        // the amplitude out there costs one dot product and removes both the
        // shimmer and the wasted vertex work on the far ring.
        vec4 dcView = modelViewMatrix * vec4(dcRoot, 1.0);
        float dcNear = 1.0 - smoothstep(45.0, 95.0, -dcView.z);

        float dcAmp = (0.16 + dcSwell * 0.3 + dcGust * 0.26 + dcFlutter) * uWind * dcBend * dcNear;

        transformed.x += uWindDir.x * dcAmp;
        transformed.z += uWindDir.y * dcAmp;
        // Blades shorten slightly as they bend — keeps the tips from stretching.
        transformed.y -= dcAmp * dcAmp * 0.55;
        `,
      );

    material.userData.shader = shader;
  };
  // Distinct cache key per ring so the two rings do not share a compiled program.
  material.customProgramCacheKey = () => `dc-grass-${opts.segments}-${opts.height}`;

  const mesh = new THREE.InstancedMesh(geo, material, opts.count);
  mesh.frustumCulled = true;
  mesh.castShadow = false; // grass shadows are pure cost, the AO gradient sells it
  mesh.receiveShadow = budget.shadowMapSize > 0;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const ground = new THREE.Color();
  const span = opts.outerRadius - opts.innerRadius;
  let placed = 0;
  let guard = 0;

  /**
   * Does a blade belong here?
   *
   * The refusals are the environmental logic of research §8: no grass in the
   * moving water, on the bare shingle the river scours, under the chair, on
   * ground that feet have worn bare — and, for the tropical island, none on
   * the beach itself (Phase 9). The wet sand band is absolute; the dry upper
   * beach thins to scattered salt-tolerant tufts, which is exactly what a
   * real back-shore looks like and what keeps the sand reading as SAND.
   */
  const acceptsBlade = (x: number, z: number, y: number, worn: number): boolean => {
    if (insideRiver(x, z)) return false;
    if (Math.abs(x - RIVER_CENTER_X) < 8.6 && Math.random() < 0.72) return false;
    if (Math.hypot(x, z + 1.35) < 1.9) return false;
    if (y < -1.1) return false;
    // THE BEACH: no grass below the tide line + 1 m; the dry sand above it
    // keeps only ~1 blade in 4, and that inherits the sand colour from the
    // ground rule, so the tufts read as dune grass rather than as a sparse bug.
    const shoreUp = y - OCEAN_LEVEL;
    if (shoreUp < 1.0) return false;
    if (coastWeight(x, z) > 0.05 && shoreUp < 2.6 && Math.random() < 0.74) return false;
    // Thin across the shoulder, stop dead on the core: a trail's edge is
    // ragged in life, and a hard cutoff would draw a line along the path.
    if (worn > 0.62) return false;
    if (worn > 0.18 && Math.random() < worn * 1.45) return false;
    return true;
  };

  /**
   * One tuft: the ground colour it inherits, and the blades it carries.
   *
   * `cy` is the tuft's own ground height. It is reused for the blades that land
   * closest to the middle (where the surface is the same to a millimetre) and
   * only the outer blades pay for their own height sample — the build loop
   * samples this height field often enough that saving a third of the calls is
   * worth more than a centimetre of precision under a 50 cm blade.
   */
  const plantClump = (cx: number, cz: number, cy: number, blades: number, gain: number, fade: number) => {
    // One wear measurement and one ground sample per TUFT, not per blade: the
    // blades of a tuft share a root system and a patch of soil 30 cm across, so
    // measuring each one individually would triple the build cost to produce
    // the same answer.
    const worn = pathWeight(cx, cz);
    // The clump's colour is the GROUND's colour, greened. This is what makes
    // the field read as the terrain growing something rather than as a
    // separate object sitting on it (research §12, §27).
    groundColorAt(cx, cz, cy, ground, GROUND_PALETTE, 1, worn);
    const hsl = { h: 0, s: 0, l: 0 };
    ground.getHSL(hsl);
    const patch = (Math.sin(cx * 0.21) * Math.cos(cz * 0.19) + 1) * 0.5;

    for (let b = 0; b < blades; b += 1) {
      if (placed >= opts.count) return;
      const a = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * opts.clumpRadius;
      const x = cx + Math.cos(a) * rad;
      const z = cz + Math.sin(a) * rad;
      const y = rad < 0.06 ? cy : terrainHeight(x, z);
      if (!acceptsBlade(x, z, y, worn)) continue;

      const scale = (0.62 + Math.random() * 0.68) * fade * gain;
      dummy.position.set(x, y, z);
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.16,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.22,
      );
      dummy.scale.set((0.8 + Math.random() * 0.5) * gain, scale, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);

      // Hue drifts with the ground's own hue and lightness. USER DIRECTIVE
      // (natural green): base hue 0.30 is true grass (~108°), not the old
      // yellow-green 0.232 that read as straw. Saturation floor 0.64 so the
      // field stays vivid in afternoon sun; lightness is a touch higher so
      // the blades catch the light instead of sitting as a dark carpet.
      const hue = 0.30 + hsl.l * 0.02 + patch * 0.012 + (Math.random() - 0.5) * opts.colorJitter;
      const sat = 0.66 + hsl.s * 0.22 + patch * 0.08 + Math.random() * 0.08;
      const lit = 0.48 + hsl.l * 0.28 + Math.random() * 0.12 - patch * 0.03;
      color.setHSL(hue, sat, lit);
      mesh.setColorAt(placed, color);
      placed += 1;
    }
  };

  // SKIRTS FIRST. The ring's instance buffer is written from slot 0, so the
  // prop skirts take the first slots and the scenic scatter continues from
  // wherever they left off. Planting them last would overwrite real blades.
  if (opts.skirt && opts.skirt.length > 0) {
    placed = plantSkirt(mesh, opts.skirt, placed, Math.round(opts.count * 0.08));
  }

  while (placed < opts.count && guard < opts.count * 6) {
    guard += 1;
    // sqrt() keeps the disc sampling uniform instead of clumping at the centre.
    const r = Math.sqrt(Math.random()) * span + opts.innerRadius;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Cheap rejections FIRST, before the (expensive) height field is sampled:
    // most of the ring is rejected for being in the water or off the edge.
    const wornHere = pathWeight(x, z);
    if (wornHere > 0.62) continue;
    const y = terrainHeight(x, z);
    if (!acceptsBlade(x, z, y, wornHere)) continue;

    // Fade the blade height to zero across the last 12 % of the ring so the
    // LOD boundary is invisible.
    const fade = Math.min(1, Math.max(0.05, 1 - Math.max(0, (r - (opts.outerRadius - span * 0.12)) / (span * 0.12))));
    const gain = 1 + ((opts.distanceGain ?? 0) * (r - opts.innerRadius)) / Math.max(span, 1);
    const mix = span > 0 ? (r - opts.innerRadius) / span : 0;
    const perClump = opts.clumpNear + (opts.clumpFar - opts.clumpNear) * mix;
    const blades = Math.max(1, Math.round(perClump * (0.6 + Math.random() * 0.8)));
    plantClump(x, z, y, blades, gain, fade);
  }

  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  // A generous manual bounding sphere: the shader displaces vertices, so the
  // auto-computed bounds would clip blades at the screen edge.
  geo.computeBoundingSphere();
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), opts.outerRadius + 4);

  return { mesh, material };
}

/**
 * Grow a skirt of blades around a prop's base.
 *
 * Called for every boulder the rock kit placed. The blades sit in a ring just
 * outside the rock's own footprint, are slightly taller than the surrounding
 * turf (they are growing in the loose soil the rock traps) and lean away from
 * it — which is what makes the join between a hard-edged mesh and a soft
 * ground disappear (principle 50).
 *
 * It writes from `startIndex` and returns the next free slot, so the caller's
 * own scatter simply continues from there — no slot is ever overwritten.
 */
function plantSkirt(
  mesh: THREE.InstancedMesh,
  skirt: Float32Array,
  startIndex: number,
  limit: number,
): number {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = startIndex;
  for (let i = 0; i + 2 < skirt.length && placed < limit; i += 3) {
    const cx = skirt[i];
    const cz = skirt[i + 1];
    const radius = skirt[i + 2];
    const blades = 7;
    for (let b = 0; b < blades && placed < limit; b += 1) {
      const a = (b / blades) * Math.PI * 2 + Math.random() * 0.6;
      const rad = radius * (0.75 + Math.random() * 0.7);
      const x = cx + Math.cos(a) * rad;
      const z = cz + Math.sin(a) * rad;
      if (insideRiver(x, z)) continue;
      const y = terrainHeight(x, z);
      if (y < -1.1) continue;
      dummy.position.set(x, y, z);
      // Lean AWAY from the rock: grass growing against a boulder is pushed
      // outward, and a ring of blades all leaning out is what reads as turf
      // piling up against the stone.
      dummy.rotation.set(-Math.sin(a) * 0.2, Math.random() * Math.PI, Math.cos(a) * 0.2);
      const sc = 0.9 + Math.random() * 0.8;
      dummy.scale.set(1.05, sc, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      color.setHSL(0.30 + Math.random() * 0.025, 0.68 + Math.random() * 0.12, 0.46 + Math.random() * 0.12);
      mesh.setColorAt(placed, color);
      placed += 1;
    }
  }
  return placed;
}

export function createGrassField(
  bladeTex: THREE.Texture,
  budget: QualityBudget,
  /** Rock bases, as (x, z, radius) triples — see `rocks.ts`. */
  skirtPoints?: Float32Array,
): GrassField {
  const group = new THREE.Group();
  group.name = "grass-field";

  const near = buildRing(
    bladeTex,
    {
      count: budget.grassNear,
      innerRadius: 0,
      outerRadius: budget.grassNearRadius,
      segments: budget.tier === "low" ? 1 : 3,
      height: 0.52,
      width: 0.075,
      colorJitter: 0.03,
      // Dense tufts near the camera: 4–7 blades sharing a root.
      clumpNear: 5.5,
      clumpFar: 3.2,
      clumpRadius: 0.3,
      skirt: skirtPoints,
    },
    budget,
  );

  const far = buildRing(
    bladeTex,
    {
      count: budget.grassFar,
      innerRadius: budget.grassNearRadius - 3,
      outerRadius: budget.grassFarRadius,
      // Far blades are single-quad cards but noticeably wider + taller, which
      // is how a sparse far field still reads as a solid meadow to the horizon.
      segments: 1,
      height: 0.8,
      width: 0.2,
      colorJitter: 0.045,
      // Blades at the 400 m rim are ~4.5× the size of the ones at the inner
      // edge. That is what keeps the meadow solid all the way to the hills
      // without paying for millions of instances.
      distanceGain: 3.5,
      // Away from the camera a "tuft" is a wider, sparser grouping: the eye
      // can no longer resolve individual blades, only clumps of volume.
      clumpNear: 2.4,
      clumpFar: 1.6,
      clumpRadius: 0.55,
    },
    budget,
  );

  group.add(near.mesh, far.mesh);

  const materials = [near.material, far.material];

  return {
    group,
    materials,
    update(time, windStrength) {
      for (const mat of materials) {
        const shader = mat.userData.shader as { uniforms: Record<string, { value: unknown }> } | undefined;
        if (!shader) continue;
        shader.uniforms.uTime.value = time;
        shader.uniforms.uWind.value = windStrength;
      }
    },
    dispose() {
      for (const mesh of [near.mesh, far.mesh]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
    },
  };
}
