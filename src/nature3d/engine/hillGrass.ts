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
import { insideBeachHouse } from "./beachHouseSite";
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
  /**
   * WORLD STREAMING. Hides every cell further than `radius` metres from the
   * viewer, so resident vertex work is capped at a fixed radius no matter how
   * large the sward is. Safe visually because the terrain bakes TRUE GREEN
   * vertex colours (terrain.ts -> groundColorAt/GROUND_PALETTE), so a distant
   * hill still reads as a green hill with no grass cards on it at all.
   */
  stream(x: number, z: number, radius: number): void;
  /** Undo streaming: make every cell visible again (used on quality changes). */
  streamAll(): void;
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
// Exported so the verification harness can assert against the sward's real
// world scale instead of a duplicated magic number.
export const HILL_GRASS_OUT = 1150;

/**
 * Metres out to the four compass samples the baked ambient occlusion reads.
 * Deliberately small: a clump is ~1 m wide, so sampling further away would
 * measure the hillside's overall tilt (which the sun already shades) rather
 * than the local hollow the clump actually sits in.
 */
const AO_RADIUS = 2.4;

/** Deepest the baked term is allowed to darken a clump (0.62x at the floor). */
const AO_MAX_DARKEN = 0.38;

/**
 * BAKED AMBIENT OCCLUSION for one clump, solved once at sowing time.
 *
 * Reads the four compass points around the clump and measures how much HIGHER
 * the surrounding ground stands than the clump's own root. Walled-in ground
 * blocks sky light, so the clump is returned darker; a clump on flat or
 * convex ground is returned at full strength.
 *
 * Exported so the harness can assert the term against real terrain instead of
 * inferring it from final colours, where the sward's own per-clump random
 * hue/sat/light jitter makes an isolated measurement impossible.
 */
export function hillGrassOcclusion(x: number, z: number, y: number): number {
  let occ = 0;
  for (let s = 0; s < 4; s += 1) {
    const ax = x + Math.cos(s * 1.5707963) * AO_RADIUS;
    const az = z + Math.sin(s * 1.5707963) * AO_RADIUS;
    const rise = terrainHeight(ax, az) - y;
    if (rise > 0) occ += rise;
  }
  // A couple of metres of surrounding rise saturates the term, and the cap
  // keeps a deep gully from going black — which would read as a hole in the
  // sward, not as shade.
  return 1 - Math.min(AO_MAX_DARKEN, occ * 0.085);
}

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

/**
 * The DISTANT clump: the same crossed pair, but each card is a single quad
 * instead of two vertical segments — 4 triangles and 8 verts instead of 8 and
 * 12.
 *
 * The second segment exists so the wind shader can BEND a card rather than
 * just tilt it, which is what makes near grass read as alive. Past ~600 m a
 * clump is a few pixels of silhouette and the bend is sub-pixel, so the
 * segment buys literally nothing the eye can see while still costing a full
 * vertex-shader invocation per vert, every frame.
 *
 * This is the LOD half of the win, and it lands hard because of how the
 * annulus is shaped: the sward is split into 4 radial bands, and by area the
 * outer two hold ~74 % of every clump in the field (band area grows with
 * r²). Dropping just those from 12 verts to 8 removes about a quarter of the
 * sward's entire vertex load with no change to the near ground at all.
 */
/**
 * HIERARCHICAL LOD card. A single flat quad — 2 triangles / 4 vertices, a
 * third of the near card and half the "far" one.
 *
 * This is the coarsest rung of the ladder and it exists for one reason: when
 * world streaming has switched a sector's detailed cells OFF, the sward would
 * otherwise vanish at the streaming boundary and pop back in as the camera
 * closes. Instead the sector keeps drawing ONE coarse stand-on, which reads as
 * textured green ground at that distance and costs almost nothing.
 *
 * Deliberately NOT a crossed pair: a cross only earns its second card when the
 * silhouette is big enough for the viewer to notice the missing volume, and at
 * HLOD range it is not.
 */
function hillBladeGeometryHlod(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1, 1, 1);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const t = pos.getY(i);
    pos.setX(i, pos.getX(i) * (1 - t * 0.78));
    pos.setZ(i, pos.getZ(i) + t * t * 0.22);
  }
  return g;
}

function hillBladeGeometryFar(): THREE.BufferGeometry {
  const bend = (g: THREE.PlaneGeometry): THREE.PlaneGeometry => {
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const t = pos.getY(i);
      pos.setX(i, pos.getX(i) * (1 - t * 0.78));
      pos.setZ(i, pos.getZ(i) + t * t * 0.22);
    }
    return g;
  };
  const a = bend(new THREE.PlaneGeometry(1, 1, 1, 1));
  const b = bend(new THREE.PlaneGeometry(1, 1, 1, 1));
  b.rotateY(Math.PI / 2);
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

  // ── Distance-safe blade texture ────────────────────────────────────────
  // THE VANISHING-GRASS BUG the owner hit: with a MIPMAPPED alpha-tested map,
  // a clump that shrinks to a few pixels samples a low mip whose alpha is the
  // AVERAGE of blade + empty space — below the test threshold — so the GPU
  // discards it and the whole far sward simply disappears (grass only exists
  // while the camera is close). BGMI's rule is the opposite: everything stays
  // on screen at any distance; the far stuff just reads softer.
  //
  // So the hills wear their OWN clone of the meadow's blade texture with
  // mipmaps OFF (`LinearFilter`, `generateMipmaps=false`): every card, near or
  // 1 150 m out, samples the full-res silhouette, so alpha is 0-or-1 per texel
  // and blades never average away. The mild shimmer that costs is exactly the
  // "far = softer/blurrier" read the owner asked for, never invisibility.
  const tex = bladeTex.clone();
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  const geo = hillBladeGeometry();
  // Distant clumps wear the cheaper 4-triangle card. Which cells get it is
  // decided per cell below, from the cell's radial band.
  const geoFar = hillBladeGeometryFar();
  // The meadow's proven recipe (see `grass.ts` buildRing): the blade texture
  // supplies the silhouette, alphaTest trims the empty texels with no
  // sorting/overdraw cost, and per-clump tint arrives via `setColorAt`
  // (instanceColor). The geometry carries no per-vertex colour attribute, and
  // `vertexColors: true` would multiply by an unbound attribute — so it stays
  // OFF; instance colours alone drive the tint. The cutoff is kept gentle
  // (0.35, not 0.5) so thinned far texels still pass and the sward never
  // pops out with distance.
  const material = new THREE.MeshLambertMaterial({
    map: tex,
    alphaTest: 0.35,
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

  // ── CHUNKED SWARD — so frustum culling can actually fire ──────────────
  //
  // This field used to be ONE InstancedMesh whose bounding sphere was set by
  // hand to `Sphere(origin, HILL_GRASS_OUT + 12)` — a 2.3 km sphere centred on
  // the world origin. The comment at the time was honest about it ("the field
  // spans the whole world — cull it as one sphere"), and that is exactly the
  // problem: a sphere that large intersects the camera frustum from EVERY
  // angle, so three.js could never reject it. All 36 000 clumps — 432 000
  // vertices, 78 % of the scene's entire grass vertex load on the low tier —
  // went through the vertex shader every single frame no matter where the
  // learner was looking.
  //
  // The fix is the standard one for instanced foliage: split the field into
  // CELLS and give each cell its own InstancedMesh with a TIGHT bounding
  // sphere, so three.js' automatic per-object culling does the work for free
  // on the CPU and the GPU never sees a clump behind the camera.
  //
  // The cells are ANGULAR SECTORS × RADIAL BANDS rather than a square grid,
  // because the sward is an annulus — a grid would waste cells on the empty
  // middle and give ragged coverage at the rim. 12 sectors × 4 bands = 48
  // cells maximum. A 60° field of view spans ~2.7 sectors, so roughly 3/4 of
  // the sward is culled in a typical view: the same grass, the same density,
  // the same material (ONE shared material, so no extra shader variants and
  // no extra program switches), about a quarter of the vertex work.
  const SECTORS = 12;
  const BANDS = 4;
  const CELLS = SECTORS * BANDS;
  const sectorArc = (Math.PI * 2) / SECTORS;

  // Sowing is a single pass into scratch buffers (the placement uses
  // `Math.random()` throughout, so it cannot be replayed deterministically in
  // a second pass), then the clumps are bucketed into cells and each cell
  // allocates EXACTLY the instances it holds. Net memory is lower than
  // before: the old mesh over-allocated to the full budget even when the
  // scatter placed fewer, and the scratch buffers are dropped at the end.
  const matScratch = new Float32Array(count * 16);
  const colScratch = new Float32Array(count * 3);
  const cxScratch = new Float32Array(count);
  const czScratch = new Float32Array(count);
  const cyScratch = new Float32Array(count);
  const cellScratch = new Int32Array(count);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const ground = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  // Hoisted scratch vectors for the slope alignment — the scatter loop runs
  // hundreds of thousands of times and must not allocate.
  const UP = new THREE.Vector3(0, 1, 0);
  const NORMAL = new THREE.Vector3();
  // Reused while measuring each cell's bounds — no per-clump allocation.
  const SCRATCH_POINT = new THREE.Vector3();

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
  if (insideBeachHouse(x, z, 1.5)) return false;
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
    // Far cards grow BIG: a clump that holds 10+ pixels on screen keeps a
    // high enough mip that its alpha survives the test — size is the second
    // half of "always visible, far = softer" (the first half is the no-mip
    // texture above).
    const hScale = (0.9 + Math.random() * 0.9) * (1 + grow * 5.6) * farBoost;
    const wScale = (0.22 + Math.random() * 0.16) * (1 + grow * 16) * farBoost;
    dummy.scale.set(wScale, hScale, 1);
    dummy.updateMatrix();
    // Scratch write, not `mesh.setMatrixAt`: the clumps are bucketed into
    // sector×band cells after the sowing finishes, and each cell allocates
    // exactly the instances it holds. See the CHUNKED SWARD note above.
    matScratch.set(dummy.matrix.elements, placed * 16);

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

    // ── BAKED AMBIENT OCCLUSION ───────────────────────────────────────────
    //
    // A clump in a hollow is walled in by higher ground, so less sky reaches
    // it; a clump on a ridge is lit from every side. Sample four compass
    // offsets, measure how much HIGHER the surrounding ground stands than the
    // clump's own root, and darken accordingly.
    //
    // This is the lightmap idea in the only form a procedurally sown field can
    // wear: the light is solved ONCE, here, at sowing time, and frozen into the
    // instance colour the GPU already uploads. Per frame the card costs exactly
    // what it cost before — one multiply that now happens never instead of
    // once per fragment. Nothing is recomputed, and because the term is baked
    // into the colour the sward still responds to the real sun on top of it.
    const ao = hillGrassOcclusion(x, z, y);

    const o3 = placed * 3;
    colScratch[o3] = color.r * ao;
    colScratch[o3 + 1] = color.g * ao;
    colScratch[o3 + 2] = color.b * ao;

    // Which cell owns this clump: angular sector × radial band. Radius is
    // clamped into range because the boulder skirts can plant inside
    // HILL_GRASS_IN (a rock near the clearing), and `atan2` returns
    // (-π, π] which must be folded onto [0, 2π) before the sector index.
    const rr = Math.hypot(x, z);
    let ang = Math.atan2(z, x);
    if (ang < 0) ang += Math.PI * 2;
    const sector = Math.min(SECTORS - 1, (ang / sectorArc) | 0);
    const band = Math.min(BANDS - 1, Math.max(0, (((rr - HILL_GRASS_IN) / span) * BANDS) | 0));
    cellScratch[placed] = sector * BANDS + band;
    cxScratch[placed] = x;
    cyScratch[placed] = y;
    czScratch[placed] = z;
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
        if (insideRiver(x, z) || insideWarehouse(x, z, 1.5) || insideBeachHouse(x, z, 1.5)) continue;
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

  // ── Bucket the sown clumps into cells and build one mesh per cell ─────
  //
  // Each cell gets an InstancedMesh sized EXACTLY to the clumps it holds, a
  // TIGHT bounding sphere derived from those clumps (padded for the tallest
  // card and the wind displacement), and `frustumCulled = true` — which now
  // actually means something, because the sphere no longer covers the world.
  const perCell = new Int32Array(CELLS);
  for (let i = 0; i < placed; i += 1) perCell[cellScratch[i]] += 1;

  const cellMeshes: THREE.InstancedMesh[] = [];
  const cellFull: number[] = [];
  const cellCentre: number[] = [];
  const cursor = new Int32Array(CELLS);
  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();
  // Rim cards are enormous by design (hScale reaches ~18 m at the island
  // edge so a far clump still holds enough pixels to survive the alpha test)
  // and the wind shader displaces vertices on top of that. Pad the bounds by
  // the worst-case card so a clump is never culled while any part of it is
  // still on screen — over-culling grass is the visible bug, and a slightly
  // generous sphere costs nothing.
  const CARD_PAD = 22;

  for (let c = 0; c < CELLS; c += 1) {
    const n = perCell[c];
    if (n === 0) continue;

    // LOD by radial band: the outer two bands (~74 % of all clumps by area)
    // draw the 4-triangle card, the inner two keep the bendable 8-triangle one.
    const band = c % BANDS;
    const cellGeo = band >= BANDS - 2 ? geoFar : geo;
    const cellMesh = new THREE.InstancedMesh(cellGeo, material, n);
    cellMesh.frustumCulled = true;
    cellMesh.castShadow = false;
    cellMesh.receiveShadow = false;
    cellMesh.name = `hill-grass-cell-${c}`;

    // `InstancedMesh.instanceColor` stays NULL until the first `setColorAt`
    // call. The scratch path below writes the colour buffer directly, which
    // would silently leave it null and render the whole sward untinted — so
    // allocate it up front, white-filled exactly the way `setColorAt` would.
    cellMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(n * 3).fill(1),
      3,
    );

    box.makeEmpty();
    let sumX = 0;
    let sumZ = 0;
    for (let i = 0; i < placed; i += 1) {
      if (cellScratch[i] !== c) continue;
      sumX += cxScratch[i];
      sumZ += czScratch[i];
      const k = cursor[c]++;
      cellMesh.instanceMatrix.array.set(matScratch.subarray(i * 16, i * 16 + 16), k * 16);
      cellMesh.instanceColor.array.set(colScratch.subarray(i * 3, i * 3 + 3), k * 3);
      box.expandByPoint(SCRATCH_POINT.set(cxScratch[i], cyScratch[i], czScratch[i]));
    }
    cellMesh.count = n;
    cellMesh.instanceMatrix.needsUpdate = true;
    cellMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    cellMesh.instanceColor.needsUpdate = true;

    // A clump's own footprint is a point; the card it carries is not. Grow
    // the box by the card pad on every axis, then take the sphere of THAT.
    box.expandByScalar(CARD_PAD);
    box.getBoundingSphere(sphere);
    cellMesh.boundingSphere = sphere.clone();
    cellMesh.updateMatrix();
    cellMesh.matrixAutoUpdate = false;

    group.add(cellMesh);
    cellMeshes.push(cellMesh);
    cellFull.push(n);
    cellCentre.push(sumX / n, sumZ / n);
  }

  // ── HLOD layer: one coarse stand-in per sector ──────────────────────────────
  //
  // Each mesh holds every clump of that sector's two OUTER bands (the bands the
  // distance LOD already put on the cheap card), collapsed onto a 4-vertex quad.
  // They live in their own child group so a caller scanning `group.children` for
  // detail cells does not mistake them for one, and they start hidden — the
  // detail cells own the screen until streaming retires them.
  const geoHlod = hillBladeGeometryHlod();
  const hlodGroup = new THREE.Group();
  hlodGroup.name = "hill-grass-hlod";
  group.add(hlodGroup);
  const hlodMeshes: THREE.InstancedMesh[] = [];
  const hlodCentre: number[] = [];

  for (let sec = 0; sec < SECTORS; sec += 1) {
    const outer = [sec * BANDS + (BANDS - 2), sec * BANDS + (BANDS - 1)];
    let total = 0;
    for (const c of outer) total += perCell[c];
    if (total === 0) continue;

    const m = new THREE.InstancedMesh(geoHlod, material, total);
    m.frustumCulled = true;
    m.castShadow = false;
    m.receiveShadow = false;
    m.visible = false;
    m.name = `hill-grass-hlod-${sec}`;
    // Same rule as the detail cells: instanceColor is null until the first
    // setColorAt, so allocate it white-filled or the stand-in renders untinted.
    m.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(total * 3).fill(1),
      3,
    );

    box.makeEmpty();
    let k = 0;
    let sumX = 0;
    let sumZ = 0;
    for (const c of outer) {
      for (let i = 0; i < placed; i += 1) {
        if (cellScratch[i] !== c) continue;
        sumX += cxScratch[i];
        sumZ += czScratch[i];
        m.instanceMatrix.array.set(matScratch.subarray(i * 16, i * 16 + 16), k * 16);
        m.instanceColor.array.set(colScratch.subarray(i * 3, i * 3 + 3), k * 3);
        box.expandByPoint(SCRATCH_POINT.set(cxScratch[i], cyScratch[i], czScratch[i]));
        k += 1;
      }
    }
    m.count = k;
    m.instanceMatrix.needsUpdate = true;
    m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    m.instanceColor.needsUpdate = true;

    box.expandByScalar(CARD_PAD);
    box.getBoundingSphere(sphere);
    m.boundingSphere = sphere.clone();
    m.updateMatrix();
    m.matrixAutoUpdate = false;

    hlodGroup.add(m);
    hlodMeshes.push(m);
    hlodCentre.push(sumX / k, sumZ / k);
  }

  return {
    group,
    materials: [material],
    setShed(level) {
      // Every cell sheds the SAME proportion, so the sward thins evenly
      // instead of losing whole compass directions. Trimming `count` is free
      // — the instance buffers stay allocated, the GPU just draws fewer.
      //
      // Five rungs now, not three: the old ladder bottomed out at 45 %, which
      // still left ~266 k verts/frame on the low tier — roughly 4x a
      // comfortable mobile budget, so the thermal fail-safe could never
      // actually rescue a drowning frame. Levels 3 and 4 exist for exactly
      // that case. Chunked culling (§CHUNKED SWARD) does the heavy lifting in
      // normal operation; these rungs are the last resort.
      const k =
        level <= 0 ? 1 : level === 1 ? 0.7 : level === 2 ? 0.45 : level === 3 ? 0.28 : 0.16;
      for (let i = 0; i < cellMeshes.length; i += 1) {
        cellMeshes[i].count = Math.floor(cellFull[i] * k);
      }
    },
    update(time, windStrength) {
      const shader = material.userData.shader as
        | { uniforms: Record<string, { value: unknown }> }
        | undefined;
      if (!shader?.uniforms?.uTime || !shader?.uniforms?.uWind) return;
      shader.uniforms.uTime.value = time;
      shader.uniforms.uWind.value = windStrength;
    },
    stream(x, z, radius) {
      // Half a cell of slack stops a cell straddling the boundary from
      // blinking as the camera drifts a metre or two.
      const slack = 60;
      const r = radius + slack;
      const r2 = r * r;
      for (let i = 0; i < cellMeshes.length; i += 1) {
        const dx = cellCentre[i * 2] - x;
        const dz = cellCentre[i * 2 + 1] - z;
        const want = dx * dx + dz * dz <= r2;
        if (cellMeshes[i].visible !== want) cellMeshes[i].visible = want;
      }
      // HLOD is the exact inverse: a sector's coarse stand-in draws only where
      // its detailed cells have been retired, so the sward never shows a hole
      // at the streaming boundary.
      for (let h = 0; h < hlodMeshes.length; h += 1) {
        const dx = hlodCentre[h * 2] - x;
        const dz = hlodCentre[h * 2 + 1] - z;
        const want = dx * dx + dz * dz > r2;
        if (hlodMeshes[h].visible !== want) hlodMeshes[h].visible = want;
      }
    },
    streamAll() {
      for (let i = 0; i < cellMeshes.length; i += 1) cellMeshes[i].visible = true;
      // Every detailed cell is resident again, so no stand-in should show.
      for (const m of hlodMeshes) m.visible = false;
    },
    dispose() {
      geo.dispose();
      geoFar.dispose();
      geoHlod.dispose();
      for (const m of hlodMeshes) m.dispose();
      hlodGroup.clear();
      tex.dispose();
      material.dispose();
      for (const cellMesh of cellMeshes) cellMesh.dispose();
      group.clear();
    },
  };
}
