// src/nature3d/engine/hillGrass.ts
//
// GRASS ON EVERY HILL — the owner's directive, implemented whole:
//
//   "Sanctuary ki andar jitne bhi hills aur stones aur pahadiya hai sabhi
//    per ghas ... 360 degree all around har jagah dense grass dikhna chahie"
//
// The reference design is the blend scene the owner uploaded to the repo
// root — `pahadon ke upar gras replace hill.blend` (Blender 3.0): a terrain
// plane wearing a DENSE, WORLD-WIDE scatter of grass clumps
// (Grass_Basic_A / Grass_Basic_D spring-summer) with daisies mixed in,
// ~5 000 instanced plants covering the ground in EVERY direction — no bare
// rock band, no bare crest, no side of the hill left green-less. This module
// reproduces exactly that treatment on the sanctuary's height field:
//
//   • coverage is a FULL CIRCLE (360°) from the study clearing out past the
//     100 m mountain band to the island edge — every hill, every ridge,
//     every stone, on every side of the world;
//   • blades sit ON the terrain (the one shared `terrainHeight`) and lean
//     with the surface normal, so a 55° mountainside wears its grass flush
//     to the slope instead of sprouting vertical spikes;
//   • the high ground keeps the SAME dense sward as the meadow — the old
//     "rock band above 18 m, snowline above 52 m" bareness is gone from the
//     ground colour too (see `terrain.ts`), so hills read as grass mountains;
//   • wind animation is included ("agar animation hai to sab kuch implement
//     karo"): the same vertex-shader sway the meadow blades use, injected
//     with onBeforeCompile — one uTime uniform per frame, zero JS work;
//   • one InstancedMesh = one draw call for the entire mountain sward.
//
// How a world-sized field stays free on a low-end GPU (same discipline as
// `grass.ts`):
//
//   * ONE crossed pair of bent blade cards (8 triangles, alpha-tested) per
//     clump, shared by every instance. The CPU never touches a clump after
//     boot.
//   * Distance LOD by SIZE, not only by count: cards grow with radius the
//     way the meadow's far ring does, so the hills stay solid green all the
//     way to the arc without millions of instances. On the low tier the far
//     cards grow even bigger instead of multiplying.
//   * Wind is compiled OUT past ~240 m, where a card is a couple of pixels
//     and motion is pure shimmer (the amplitude simply smoothsteps to zero
//     in the shader — the program still costs one uniform, never a loop).
//   * No alpha blending anywhere: the cards are solid geometry, so there is
//     no sorting, no overdraw explosion — the classic mobile grass killer.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { QualityBudget } from "./quality";
import { insideRiver, terrainHeight, RIVER_CENTER_X, OCEAN_LEVEL, coastWeight } from "./terrain";
import { insideWarehouse } from "./warehouseSite";
import { GROUND_PALETTE } from "./palette";
import { groundColorAt } from "./environment";

export interface HillGrassField {
  group: THREE.Group;
  /**
   * The sward material, published so `scene.ts` registers it with the
   * atmosphere pass as FOLIAGE (backlit glow) and with the winter pass.
   */
  materials: THREE.Material[];
  update(time: number, windStrength: number): void;
  /**
   * Thermal fail-safe ladder, allocation-free like every other field:
   *   0 = full sward · 1 = 70 % · 2 = 45 %
   * The instance buffers stay allocated; trimming `count` is free.
   */
  setShed(level: number): void;
  dispose(): void;
}

/**
 * Coverage: a full circle from just outside the meadow's own dense blade
 * field out to the island edge. The world's ground falls away past
 * ISLAND_EDGE_IN (1 120 m, terrain.ts) into the sea, so the sward stops at
 * 1 150 m — the last grass stands right on the rim, exactly where the
 * blend reference keeps its scatter on the plane's own rim.
 */
const HILL_GRASS_IN = 34;
const HILL_GRASS_OUT = 1150;

/**
 * One clump: TWO crossed, bent blade cards (the reference blend's "2-3
 * alpha-tested blade cards per clump" recipe). The cross reads as volume
 * from EVERY bearing — the 360° requirement — instead of a single billboard
 * that disappears edge-on. Each card is a 1 m × 1 m plane with two height
 * segments (so the wind can BEND it, not just tilt it), rooted at the
 * origin, curled forward like a real blade. Unit sized: the instance scale
 * carries the metres.
 */
function hillBladeGeometry(): THREE.BufferGeometry {
  const bend = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    g.translate(0, 0.5, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const t = pos.getY(i); // 0 root … 1 tip (unit height)
      pos.setX(i, pos.getX(i) * (1 - t * 0.78)); // taper to a tip
      pos.setZ(i, pos.getZ(i) + t * t * 0.22); // natural forward curl
    }
    return g;
  };
  const a = bend(new THREE.PlaneGeometry(1, 1, 1, 2));
  const b = bend(new THREE.PlaneGeometry(1, 1, 1, 2));
  b.rotateY(Math.PI / 2); // crossed pair
  return mergeGeometries([a, b]);
}

export function createHillGrassField(
  /**
   * The engine's own blade texture (`textures.grassBlade`) — the SAME map
   * the meadow's blade field wears. Using the proven meadow material recipe
   * (map + alphaTest + instance colour) is what guarantees the hills render
   * the exact same living green as the field, never black.
   */
  bladeTex: THREE.Texture,
  budget: QualityBudget,
  /** Rock bases as (x, z, radius) triples — every stone gets a grass skirt. */
  skirtPoints?: Float32Array,
): HillGrassField {
  const group = new THREE.Group();
  group.name = "hill-grass-field";

  const geo = hillBladeGeometry();
  // The meadow's proven recipe, verbatim (see `grass.ts` buildRing): the
  // blade texture supplies the silhouette, alphaTest trims the empty texels
  // with no sorting/overdraw cost, and per-clump tint arrives via
  // `setColorAt` (instanceColor). The geometry carries no per-vertex colour
  // attribute, and `vertexColors: true` would multiply by an unbound
  // attribute — so it stays OFF; instance colours alone drive the tint.
  const material = new THREE.MeshLambertMaterial({
    map: bladeTex,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    transparent: false,
  });

  // ── Wind: the meadow's own idiom, ported to the hills ─────────────────
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

        float dcHillHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        `,
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>

        // Per-clump phase from the instance origin + travelling gust waves.
        vec3 dcRoot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float dcPhase = dcHillHash(dcRoot.xz) * 6.2831;

        // Unit-height geometry: transformed.y IS the 0..1 bend coordinate.
        float dcT = clamp(transformed.y, 0.0, 1.0);
        float dcBend = pow(dcT, 1.6);

        float dcTravel = dot(dcRoot.xz, uWindDir) * 0.22;
        float dcSwell  = sin(uTime * 1.15 + dcTravel + dcPhase) * 0.5 + 0.5;
        float dcGust   = sin(uTime * 0.31 + dcTravel * 0.4) * 0.5 + 0.5;
        float dcFlutter= sin(uTime * 6.1 + dcPhase * 2.3) * 0.14;

        // Distance cutoff: past ~240 m a card is a few pixels and sway reads
        // as shimmer. The fade costs one smoothstep and keeps the far hills
        // calm — motion lives where the learner actually sees it.
        vec4 dcView = modelViewMatrix * vec4(dcRoot, 1.0);
        float dcNear = 1.0 - smoothstep(70.0, 240.0, -dcView.z);

        float dcAmp = (0.10 + dcSwell * 0.22 + dcGust * 0.2 + dcFlutter) * uWind * dcBend * dcNear;

        transformed.x += uWindDir.x * dcAmp;
        transformed.z += uWindDir.y * dcAmp;
        transformed.y -= dcAmp * dcAmp * 0.5;
        `,
      );

    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => "dc-hill-grass";

  const count = budget.hillGrass;
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.frustumCulled = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = "hill-grass";

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const ground = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  // Hoisted scratch vectors for the slope alignment — the scatter loop runs
  // hundreds of thousands of times and must not allocate.
  const UP = new THREE.Vector3(0, 1, 0);
  const NORMAL = new THREE.Vector3();

  const span = HILL_GRASS_OUT - HILL_GRASS_IN;
  // On weak devices the far cards grow BIGGER instead of multiplying —
  // the same lushness, a fraction of the instances.
  const farBoost = budget.tier === "low" ? 1.5 : budget.tier === "medium" ? 1.18 : 1;

  /**
   * Does a clump belong here? The refusals are few ON PURPOSE — the brief is
   * grass on EVERY hill and stone, so the veto list is only the places where
   * grass physically cannot stand: moving water, the building pad, ground
   * under the sea, the beach itself and cliffs steeper than soil can hold
   * (~72°). Everything else — every altitude, every slope up to that, both
   * districts, the corridors, the bay headlands — grows the sward.
   */
  const acceptsClump = (x: number, z: number, y: number, ny: number): boolean => {
    if (insideRiver(x, z)) return false;
    if (insideWarehouse(x, z, 1.5)) return false;
    if (Math.abs(x - RIVER_CENTER_X) < 7.4 && Math.random() < 0.6) return false;
    if (y < OCEAN_LEVEL + 0.45) return false; // drowned shelf / sea floor
    // The beach keeps its sand; the upper dune thins to scattered tufts.
    if (coastWeight(x, z) > 0.05 && y - OCEAN_LEVEL < 2.2 && Math.random() < 0.85) return false;
    if (ny < 0.3) return false; // vertical cliff face — no soil, no grass
    return true;
  };

  /**
   * Plant one clump at (x, z): measure the ground, align the card to the
   * surface normal, size it by distance, tint it from the ground's own
   * colour — greened, because this field IS the grass layer.
   */
  const plant = (x: number, z: number, y: number, t: number): void => {
    // Slope from two cheap extra height samples (3 total per clump).
    const e = 1.4;
    const hx = terrainHeight(x + e, z) - y;
    const hz = terrainHeight(x, z + e) - y;
    NORMAL.set(-hx / e, 1, -hz / e).normalize();
    if (!acceptsClump(x, z, y, NORMAL.y)) return;

    const grow = Math.pow(t, 0.82); // 0 near … 1 at the rim
    dummy.position.set(x, y - 0.04, z);
    // Grass ON the hill: the card's up axis follows the terrain normal, so
    // the sward lies flush against 50° slopes instead of spiking off them.
    dummy.quaternion.setFromUnitVectors(UP, NORMAL);
    dummy.rotateY(Math.random() * Math.PI * 2);
    dummy.rotateX((Math.random() - 0.5) * 0.14);
    const hScale = (0.9 + Math.random() * 0.9) * (1 + grow * 4.2) * farBoost;
    const wScale = (0.22 + Math.random() * 0.16) * (1 + grow * 12) * farBoost;
    dummy.scale.set(wScale, hScale, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    // Colour: the SAME recipe the meadow's blade field wears (grass.ts —
    // the owner's "natural green" directive: base hue 0.30 ≈ true grass
    // ~108°, saturation floored so the sward stays vivid, lightness lifted
    // so blades catch the sun). The hills must read as that exact meadow
    // climbing, the fresh spring-summer green of the reference blend — not
    // a darker, browner biome. The ground sample only adds a whisper of
    // local variation; green always leads.
    groundColorAt(x, z, y, ground, GROUND_PALETTE, 1, 0);
    ground.getHSL(hsl);
    const patch = (Math.sin(x * 0.21) * Math.cos(z * 0.19) + 1) * 0.5;
    const hue = 0.3 + hsl.l * 0.02 + patch * 0.012 + (Math.random() - 0.5) * 0.03;
    const sat = 0.66 + hsl.s * 0.22 + patch * 0.08 + Math.random() * 0.08;
    const lit = 0.55 + hsl.l * 0.26 + Math.random() * 0.12 - patch * 0.03;
    color.setHSL(hue, Math.min(0.92, sat), Math.min(0.82, lit));
    mesh.setColorAt(placed, color);
    placed += 1;
  };

  let placed = 0;

  // ── STONES FIRST: a skirt of grass around every boulder ───────────────
  // "stones ... sabhi per ghas" — the rock kit publishes the base of each
  // boulder it placed, and the mountain sward grows a ring of clumps around
  // it, so no rock sits on the hillside like a dropped asset.
  if (skirtPoints && skirtPoints.length >= 3) {
    // Skirts may spend at most ~9 % of the budget; the remaining slots are
    // the world-wide sward below.
    const skirtBudget = Math.floor(count * 0.09);
    for (let i = 0; i + 2 < skirtPoints.length && placed < skirtBudget; i += 3) {
      const cx = skirtPoints[i];
      const cz = skirtPoints[i + 1];
      const radius = skirtPoints[i + 2];
      for (let b = 0; b < 9 && placed < count; b += 1) {
        const a = (b / 9) * Math.PI * 2 + Math.random() * 0.7;
        const rad = radius * (0.7 + Math.random() * 0.75);
        const x = cx + Math.cos(a) * rad;
        const z = cz + Math.sin(a) * rad;
        if (insideRiver(x, z) || insideWarehouse(x, z, 1.5)) continue;
        const y = terrainHeight(x, z);
        if (y < OCEAN_LEVEL + 0.45) continue;
        const t = Math.min(1, Math.max(0, (Math.hypot(x, z) - HILL_GRASS_IN) / span));
        plant(x, z, y, Math.max(t, 0.08));
      }
    }
  }

  // ── THE WORLD-WIDE SOWING — one full 360° circle ──────────────────────
  // Area-uniform annulus sampling: every square metre of hill has the same
  // chance of growing a clump, in every direction, the whole way round.
  const inner2 = HILL_GRASS_IN * HILL_GRASS_IN;
  const outer2 = HILL_GRASS_OUT * HILL_GRASS_OUT;
  let guard = 0;
  while (placed < count && guard < count * 6) {
    guard += 1;
    const r = Math.sqrt(inner2 + Math.random() * (outer2 - inner2));
    const a = Math.random() * Math.PI * 2; // 360° — every bearing
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = terrainHeight(x, z);
    const t = (r - HILL_GRASS_IN) / span;
    plant(x, z, y, t);
  }

  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  // Generous manual bounds: the wind shader displaces vertices, and the
  // field spans the whole world — cull it as one sphere.
  geo.computeBoundingSphere();
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), HILL_GRASS_OUT + 12);
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  group.add(mesh);

  const full = placed;

  return {
    group,
    materials: [material],
    setShed(level) {
      mesh.count = level <= 0 ? full : level === 1 ? Math.floor(full * 0.7) : Math.floor(full * 0.45);
    },
    update(time, windStrength) {
      const shader = material.userData.shader as
        | { uniforms: Record<string, { value: unknown }> }
        | undefined;
      if (!shader?.uniforms?.uTime || !shader?.uniforms?.uWind) return;
      shader.uniforms.uTime.value = time;
      shader.uniforms.uWind.value = windStrength;
    },
    dispose() {
      geo.dispose();
      material.dispose();
      mesh.dispose();
      group.clear();
    },
  };
}
