// src/nature3d/engine/mountainForest.ts
//
// THE REAL MOUNTAIN RING — the owner's uploaded model, planted 360° around
// the world's edge.
//
// SOURCE. `the-landscape-is-a-forest-in-the-mountains.zip` (repo root) — a
// Sketchfab "The landscape is a forest in the mountains" FBX, converted once
// at build time (FBX2glTF) and shipped as
// `sanctuary/models/mountain_forest.glb`: one authored diorama of a forested
// mountain — a painted terrain card, real pine trees with bark and needle
// materials, ~370 instanced background trees, fern and plant cutout cards —
// ~25 k triangles per diorama, ~3.4 MB with every texture embedded as
// STANDARD glTF images (JPEG/PNG only — WebP is not a required glTF mime and
// a failed decode on one image rejects the whole model on some WebViews).
//
// THE RING. One diorama is a single mountain; the world needs hills on
// every side of the compass. So the diorama is instanced around a circle of
// RING_RADIUS, each instance rotated to face the centre with a
// deterministic wiggle. Height: ~100 m of mountain above its seat. The cards
// overlap by several tens of metres, which
// hides the seams: from anywhere in the meadow the ring reads as one
// continuous forested mountain range standing on the world's own hills.
// The bay sector is skipped so the beach keeps its view of the sea.
//
// SEATED, NOT DROPPED. Each card is sunk into the LOWEST ground anywhere
// under its own 417 × 284 m footprint, and `terrain.ts` lifts an apron of
// high ground under the whole band, so the range grows out of the world
// instead of hanging over it. Both halves are measured and logged at build
// time; see `SINK`, `FOOTPRINT_SAMPLES` and `ringApron`.
//
// TWO BUGS THAT MADE THE FIRST RING INVISIBLE — both fixed here, and both
// worth writing down because they are glTF-loader universals, not typos:
//
//   1. SHARED GEOMETRIES. glTF instancing means MANY nodes reference ONE
//      BufferGeometry (the diorama's ~370 background trees all share a
//      single position array). Baking each node's world matrix into that
//      SHARED array transforms it again for every node — the positions end
//      up multiplied 370× into NaN mush. Every slice therefore CLONES the
//      attributes it points at before any matrix touches them.
//   2. NEGATIVE-SCALE MIRRORS. A mirrored instance flips triangle winding,
//      and FrontSide materials then cull every face — the mirrored half of
//      the ring simply vanished. Instances are never mirrored now; variety
//      comes from the yaw wiggle alone.
//
// PERFORMANCE. Every mesh that shares a material is merged into ONE
// geometry (BufferGeometryUtils.mergeGeometries) and drawn as ONE
// InstancedMesh — the whole 360° panorama costs ~10 draw calls. The
// background-tree instances are decimated by tier (they are the bulk of the
// triangles and, at 950 m, pure texture-scale detail), which keeps the ring
// between ~160 k triangles on the low tier and ~280 k on high.

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { QualityBudget } from "./quality";
import { BAY_AZIMUTH, MOUNTAIN_RING_RADIUS, mountainPassWeight, terrainHeight } from "./terrain";

const MODEL_URL = "sanctuary/models/mountain_forest.glb";

/**
 * Where the ring's chunk CENTRES sit, in metres from the origin.
 *
 * The world's mountain band runs from RIM_INNER (300 m) to past the full
 * band at 900 m (terrain.ts); the island's coast begins ~920 m out. 950 m
 * plants every card right on the crest line, with the card body (which
 * extends ~255 m inward at the ring's scale) filling the band behind it.
 *
 * The radius is PUBLISHED BY `terrain.ts` (`MOUNTAIN_RING_RADIUS`) because
 * the ground has to know where the ring stands: it lifts an apron under this
 * exact band so the cards are seated on high ground instead of hanging over
 * the arc's valleys. Two constants that must agree live in one place.
 */
const RING_RADIUS = MOUNTAIN_RING_RADIUS;

/**
 * Model units → metres. Sizes are applied EXACTLY ONCE — baked into the
 * merged geometry (see `worldScale` below); instance matrices stay unit.
 *
 *   horizontal ×12 — each card spans ~366 m of ring, so the ring stays one
 *   continuous overlapping forest wall on the boundary;
 *   vertical ×8 — the diorama's silhouette tops out at ~12.45 units, so
 *   the ring stands ~100 m: EXACTLY the old stone hills' height
 *   (MOUNTAIN_MAX_HEIGHT), as the owner asked ("iska height vaise hi karo
 *   jaise purana pathar hills ka size tha utna hi").
 */
const SCALE_XZ = 12;
const SCALE_Y = 8;

/**
 * MEASURED bounds of the diorama in MODEL units — read off the GLB's own
 * bounding box, not eyeballed, because the seating below depends on them:
 *
 *   X  -17.809 … 16.909   (×12 = 417 m across the ring)
 *   Y   -1.017 … 12.449   (×8  = the base dips 8.1 m BELOW the origin, the
 *                               crest stands 99.6 m above it)
 *   Z   -2.440 … 21.216   (×12 = 29 m outward, 255 m inward — local +Z is
 *                               rotated to point at the world centre)
 *
 * The negative Y is the useful half: the card already carries ~8 m of buried
 * skirt, so seating it a few metres into the ground hides the base plane
 * completely and the mountain appears to grow out of the world's own hill.
 */
const MODEL_MIN_X = -17.809;
const MODEL_MAX_X = 16.909;
const MODEL_MIN_Y = -1.017;
const MODEL_MAX_Y = 12.449;
const MODEL_MIN_Z = -2.44;
const MODEL_MAX_Z = 21.216;
/** The card's own buried skirt, in metres below its placement point. */
const SKIRT_BELOW_ORIGIN = -MODEL_MIN_Y * SCALE_Y;
/** How far the crest stands above the placement point, in metres. */
const CREST_ABOVE_ORIGIN = MODEL_MAX_Y * SCALE_Y;

/**
 * How deep each card is sunk into the ground, in metres — ON TOP of its own
 * 8.1 m skirt.
 *
 * The seat is (nearly) the LOWEST ground anywhere under the card's footprint
 * (see below), and the footprint is sampled on a ~90 m grid, so this is the
 * margin that covers a dip BETWEEN two samples: 6 m of sink + 8.1 m of skirt
 * = 14 m of burial at the lowest point, against relief whose finest octave in
 * the arc is ~65 m at a few metres of amplitude. Nothing can poke a gap under
 * the card, which is exactly the "pahad hawa mein tairte hue dikh rahe hain"
 * report this replaces.
 */
const SINK = 6;

/**
 * The most a single deep feature under a card may pull its seat down, in
 * metres below the footprint's MEDIAN ground.
 *
 * Seating on the strict lowest sample is right for ordinary relief — every
 * dip is buried — but three features in this world are holes, not dips, and
 * they would swallow a card whole:
 *
 *   • the RIVER, a 12 m-wide gorge cut to −5 m that runs the full length of
 *     the world and crosses the band at x ≈ 18 (measured: it dragged one
 *     card's seat 41 m down, burying the whole mountain in its own hills);
 *   • the BAY mouth, where the ground is deliberately at sea level so the
 *     beach keeps its view of the sea;
 *   • the MOUNTAIN PASS west, likewise kept open as the walk to the
 *     Highlands.
 *
 * A card may give way by this much and no more, so it stays planted on the
 * ground that actually surrounds it and floats, at worst, a few metres over
 * a narrow gorge that its own body hides — instead of disappearing into it.
 * The bay and the pass are handled by SKIPPING those chunks (below), so this
 * bound only ever has to absorb the river.
 */
const MAX_DIP = 35;

/**
 * Skip a chunk when the pass owns its centre. The card is 417 m across, so
 * one planted in the middle of the pass would wall off the walk to the
 * Highlands that `terrain.ts` deliberately keeps open; the terrain's own arc
 * is gated by the same corridor weight, so ring and range agree on where the
 * opening is. Chunks merely EDGING the pass stay — the bound above seats them
 * on the high ground beside it, and a mountain at a pass mouth is what a pass
 * mouth looks like.
 */
const PASS_CLEAR = 0.5;

/**
 * Chunks this close to the BAY's azimuth are SKIPPED. The bay (terrain.ts)
 * is the one sector where the mountain arc drops to dunes and the map sees
 * the ocean — the beach, the surf line and the horizon live there. A forest
 * wall across it would erase the coastline, so the ring opens there
 * instead: two forested headlands flanking a clear view of the sea.
 */
const BAY_SKIP = 0.3;

/** Ring density by tier — chunk count and how many background trees survive. */
const RING_BY_TIER: Record<string, { chunks: number; treeKeepEvery: number }> = {
  low: { chunks: 16, treeKeepEvery: 8 },
  medium: { chunks: 18, treeKeepEvery: 4 },
  high: { chunks: 20, treeKeepEvery: 3 },
};

export interface MountainForest {
  group: THREE.Group;
  /** Cutout plant/tree materials — registered for the backlit pass. */
  foliageMaterials: THREE.MeshStandardMaterial[];
  /** Opaque card/bark materials — registered for haze only. */
  solidMaterials: THREE.MeshStandardMaterial[];
  dispose(): void;
}

function loadGltf(url: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      resolve,
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}

/** Deterministic per-chunk jitter — identical ring on every machine. */
function chunkJitter(i: number): number {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 0.16;
}

/**
 * One (geometry, material) pair per primitive-group of a mesh, with CLONED
 * attributes. The clone is the load-bearing line: glTF nodes that instance
 * the same mesh share one BufferGeometry under the hood, and the matrix
 * bake below would otherwise transform that shared array once per node.
 */
function sliceMesh(mesh: THREE.Mesh): Array<{ geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }> {
  const src = mesh.geometry;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const index = src.index
    ? src.index
    : (() => {
        const n = src.attributes.position.count;
        const id = new Uint32Array(n);
        for (let i = 0; i < n; i += 1) id[i] = i;
        return new THREE.BufferAttribute(id, 1);
      })();
  const groups: ReadonlyArray<{ start: number; count: number; materialIndex?: number }> = src.groups.length
    ? src.groups
    : [{ start: 0, count: index.count, materialIndex: 0 }];
  const out: Array<{ geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }> = [];
  for (const g of groups) {
    const mat = mats[g.materialIndex ?? 0] as THREE.MeshStandardMaterial | undefined;
    if (!mat || g.count === 0) continue;
    const geo = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(src.attributes)) geo.setAttribute(name, attr.clone());
    const arr = (index.array as Uint16Array | Uint32Array).slice(g.start, g.start + g.count);
    geo.setIndex(new THREE.BufferAttribute(arr, 1));
    out.push({ geo, mat });
  }
  return out;
}

export async function createMountainForest(budget: QualityBudget): Promise<MountainForest> {
  const group = new THREE.Group();
  group.name = "mountain-forest-ring";
  const disposables: Array<{ dispose(): void }> = [];

  let gltf: GLTF;
  try {
    gltf = await loadGltf(MODEL_URL);
  } catch (err) {
    // A missing panorama is cosmetic — the terrain's own 150 m hills carry
    // the skyline. Never break the scene for it.
    console.warn("[sanctuary] mountain forest model failed to load:", err);
    return { group, foliageMaterials: [], solidMaterials: [], dispose() { /* nothing loaded */ } };
  }

  const ring = RING_BY_TIER[budget.tier] ?? RING_BY_TIER.high;

  const root = gltf.scene;
  root.updateMatrixWorld(true);

  // ── Merge the diorama into one geometry per material ─────────────────
  // Every instance of the ring draws the SAME merged geometry, so the
  // whole 360° range stays at ~one draw call per material. Shared source
  // geometries (the background trees) are counted as they pass so the
  // duplicates can be decimated deterministically instead of all baking
  // in (they are the bulk of the triangles).
  const byMaterial = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
  const seenGeometry = new Map<THREE.BufferGeometry, number>();
  const worldScale = new THREE.Matrix4().makeScale(SCALE_XZ, SCALE_Y, SCALE_XZ);
  let tris = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    // glTF instancing: the SAME BufferGeometry arrives once per node.
    const seen = seenGeometry.get(mesh.geometry) ?? 0;
    seenGeometry.set(mesh.geometry, seen + 1);
    const isSharedTree = seen > 0; // the diorama's instanced background trees
    if (isSharedTree && seen % ring.treeKeepEvery !== 0) return;
    for (const { geo: part, mat } of sliceMesh(mesh)) {
      // Merge needs identical attribute sets: keep the shared three.
      for (const name of Object.keys(part.attributes)) {
        if (name !== "position" && name !== "normal" && name !== "uv") part.deleteAttribute(name);
      }
      part.morphAttributes = {};
      // The card and the plants all sit in the diorama's own transform —
      // bake it (and the world scale) into the geometry so the
      // InstancedMesh matrices only carry the ring placement.
      part.applyMatrix4(worldScale.clone().multiply(mesh.matrixWorld));
      tris += (part.index?.count ?? 0) / 3;
      const list = byMaterial.get(mat) ?? [];
      list.push(part);
      byMaterial.set(mat, list);
    }
  });

  // Cutout foliage (alpha-blended plants, fern cards, needle clusters)
  // becomes alpha-TESTED: depth-written, sort-free, instancing-safe — the
  // standard mobile treatment for dense cutouts at distance. EVERY forest
  // material is DoubleSide: the ring is seen from grazing angles and from
  // the air, and (bug #2 above) any winding surprise then costs nothing.
  const foliageMaterials: THREE.MeshStandardMaterial[] = [];
  const solidMaterials: THREE.MeshStandardMaterial[] = [];

  // Which chunks the ring actually keeps. TWO openings stay clear, and both
  // are the terrain's own: the BAY to the south-east (the beach keeps its view
  // of the sea) and the mountain PASS west (the walk out to the Highlands).
  // `terrain.ts` gates its arc with the same two weights, so the planted range
  // and the ground it stands on agree about where the gaps are — and no card
  // is ever seated over ground that was deliberately dropped to sea level.
  const kept: Array<{ angle: number; chunk: number }> = [];
  let baySkips = 0;
  let passSkips = 0;
  for (let i = 0; i < ring.chunks; i += 1) {
    const a = (i / ring.chunks) * Math.PI * 2;
    let d = Math.abs(a - BAY_AZIMUTH);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d <= BAY_SKIP) {
      baySkips += 1;
      continue;
    }
    if (mountainPassWeight(Math.cos(a) * RING_RADIUS, Math.sin(a) * RING_RADIUS) < PASS_CLEAR) {
      passSkips += 1;
      continue;
    }
    kept.push({ angle: a, chunk: i });
  }

  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  /**
   * The card's footprint, sampled on a 5 × 5 grid in the card's OWN frame
   * (local metres, +Z inward). Derived from the measured model bounds and the
   * ring's scale, inset 6 % so the empty extreme corners of the diorama do not
   * drag the seat down on a slope they do not actually cover.
   */
  const FOOTPRINT_SAMPLES: ReadonlyArray<readonly [number, number]> = (() => {
    const x0 = MODEL_MIN_X * SCALE_XZ;
    const x1 = MODEL_MAX_X * SCALE_XZ;
    const z0 = MODEL_MIN_Z * SCALE_XZ;
    const z1 = MODEL_MAX_Z * SCALE_XZ;
    const ix = (x1 - x0) * 0.06;
    const iz = (z1 - z0) * 0.06;
    const out: Array<[number, number]> = [];
    for (let i = 0; i <= 4; i += 1) {
      for (let j = 0; j <= 4; j += 1) {
        out.push([
          x0 + ix + ((x1 - x0 - 2 * ix) * i) / 4,
          z0 + iz + ((z1 - z0 - 2 * iz) * j) / 4,
        ]);
      }
    }
    return out;
  })();

  // ── Seat the ring on the ground, ONCE ───────────────────────────────────
  //
  // Every material draws the same instances, so the seat is solved here and
  // reused instead of being re-sampled per material (20 chunks × 25 height
  // samples, not × 10 materials).
  //
  // THE SEAT IS THE LOWEST GROUND UNDER THE CARD, not the highest. Seating a
  // card on the highest of a few samples is what left it hanging over any dip
  // in front of it — the owner's "pahad hawa mein tairte hue dikh rahe hain",
  // measured at 20…57 m of open air under a card, because the terrain at this
  // radius swings from valley floor to 100 m crest inside one card's 417 m
  // width. Sinking to the LOWEST point makes a gap geometrically impossible:
  // the base plane and its own 8.1 m of skirt are underground everywhere on
  // the footprint, so all that is left above the surface is the mountain —
  // standing on the apron `terrain.ts` lifts under this same band, which is
  // the "jameen ko upar shift karke connect kar do" half of the fix.
  //
  // One bound on that: MAX_DIP. The river gorge is 12 m wide and 45 m deep
  // and it crosses this band, so a strict minimum would let one narrow slot
  // drag a whole mountain 41 m underground. See MAX_DIP for the rule.
  const seats: Array<{ x: number; y: number; z: number; yaw: number }> = [];
  let deepestBurial = 0;
  let worstFloat = 0;
  let leastClearance = Infinity;
  for (const { angle: a, chunk } of kept) {
    const px = Math.cos(a) * RING_RADIUS;
    const pz = Math.sin(a) * RING_RADIUS;
    // Face the centre: local +Z (where the diorama's mass sits) points at the
    // origin, with a deterministic wiggle so the ring never reads as stamped.
    // The wiggle is keyed to the ABSOLUTE chunk index, so one compass angle
    // keeps the same tilt at every quality tier. NO mirroring — a mirrored
    // instance flips winding and FrontSide faces get culled into invisibility
    // (see header, bug #2).
    const yaw = Math.atan2(-Math.cos(a), -Math.sin(a)) + chunkJitter(chunk);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const ground: number[] = [];
    for (const [fx, fz] of FOOTPRINT_SAMPLES) {
      // three's Y rotation: (cos·x + sin·z, ·, −sin·x + cos·z).
      ground.push(terrainHeight(px + cy * fx + sy * fz, pz - sy * fx + cy * fz));
    }
    if (ground.length === 0) continue;
    ground.sort((p, q) => p - q);
    const lowest = ground[0];
    const highest = ground[ground.length - 1];
    const median = ground[ground.length >> 1];
    const seat = Math.max(lowest, median - MAX_DIP) - SINK;
    // Diagnostics for the log below, and the three numbers that say whether
    // the ring reads as planted: how much ground swallows the card, how much
    // air is left under it (must stay gorge-width nothing), and how much of
    // the mountain still stands proud of the tallest ground beside it.
    deepestBurial = Math.max(deepestBurial, median - seat);
    worstFloat = Math.max(worstFloat, seat - lowest);
    leastClearance = Math.min(leastClearance, seat + CREST_ABOVE_ORIGIN - highest);
    seats.push({ x: px, y: seat, z: pz, yaw });
  }

  for (const [mat, geos] of byMaterial) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged || !merged.attributes.position || merged.attributes.position.count === 0) continue;
    disposables.push(merged);

    const cutout = mat.transparent;
    if (cutout) {
      mat.transparent = false;
      mat.alphaTest = 0.4;
    }
    mat.side = THREE.DoubleSide;
    mat.depthWrite = true;
    (cutout ? foliageMaterials : solidMaterials).push(mat);
    disposables.push(mat);

    const inst = new THREE.InstancedMesh(merged, mat, seats.length);
    inst.name = `mountain-forest/${mat.name || "material"}`;
    seats.forEach((seat, k) => {
      tmpPos.set(seat.x, seat.y, seat.z);
      tmpQuat.setFromAxisAngle(yAxis, seat.yaw);
      // Unit scale — THE SIZE IS ALREADY BAKED INTO THE GEOMETRY above.
      // (The first ring shipped with the scale in BOTH places: the two
      // matrices multiplied into x144 horizontally — 4.4 km cards that
      // wrapped the whole field and hid the sky. This line is unit on
      // purpose; do not put a scale back here.)
      tmpScale.set(1, 1, 1);
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      inst.setMatrixAt(k, tmpMat);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false; // the ring surrounds the camera by design
    inst.matrixAutoUpdate = false;
    disposables.push(inst);
    group.add(inst);
  }

  // One diagnosable line: if the ring is ever missing again, this says
  // whether it LOADED (and how much is in it) or never arrived. The three
  // seat figures are the anti-float check — `float` is open air left under a
  // card (must stay a few metres, over the river gorge only), `buried` is how
  // much the ground swallows (must stay well under the card's ~100 m), and
  // `clear` is how much mountain still stands above the tallest ground beside
  // it (must stay positive, or the range is being swallowed by its own hills).
  console.info(
    `[sanctuary] mountain forest ring: ${seats.length} chunks (${baySkips} bay, ${passSkips} pass skipped) · ${byMaterial.size} materials · ${Math.round(tris / 1000)}k tris · tier ${budget.tier} · seat float ≤${worstFloat.toFixed(1)} m, buried ≤${deepestBurial.toFixed(0)} m, crest clear ≥${leastClearance.toFixed(0)} m · skirt ${SKIRT_BELOW_ORIGIN.toFixed(1)} m + sink ${SINK} m`,
  );

  return {
    group,
    foliageMaterials,
    solidMaterials,
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}
