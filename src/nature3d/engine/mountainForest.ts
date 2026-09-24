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
// deterministic wiggle. Height: ~60 m (the owner's revised size). The cards overlap by several tens of metres, which
// hides the seams: from anywhere in the meadow the ring reads as one
// continuous forested mountain range standing on the world's own hills.
// The bay sector is skipped so the beach keeps its view of the sea.
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
import { BAY_AZIMUTH, terrainHeight } from "./terrain";

const MODEL_URL = "sanctuary/models/mountain_forest.glb";

/**
 * Where the ring's chunk CENTRES sit, in metres from the origin.
 *
 * The world's mountain band runs from RIM_INNER (300 m) to past the full
 * band at 900 m (terrain.ts); the island's coast begins ~920 m out. 950 m
 * plants every card right on the crest line, with the card body (which
 * extends ~240 m inward at the ring's scale) filling the band behind it.
 */
const RING_RADIUS = 950;

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

/** How deep each card is sunk into the ground, in metres. */
const SINK = 2.4;

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

  // How many chunks the ring actually keeps (the bay opens the south-east).
  const angles: number[] = [];
  for (let i = 0; i < ring.chunks; i += 1) {
    const a = (i / ring.chunks) * Math.PI * 2;
    let d = Math.abs(a - BAY_AZIMUTH);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d > BAY_SKIP) angles.push(a);
  }

  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const SAMPLES: ReadonlyArray<readonly [number, number]> = [
    [0, 0], [140, 0], [-140, 0], [0, 115], [0, -230],
  ];

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

    const inst = new THREE.InstancedMesh(merged, mat, angles.length);
    inst.name = `mountain-forest/${mat.name || "material"}`;
    angles.forEach((a, k) => {
      const px = Math.cos(a) * RING_RADIUS;
      const pz = Math.sin(a) * RING_RADIUS;
      // Snap onto the real ground: the highest of five samples under the
      // card, minus a small sink, so no slope ever pokes through the card
      // and no card ever floats above its hill.
      let ground = -Infinity;
      for (const [sx, sz] of SAMPLES) {
        const h = terrainHeight(px + sx, pz + sz);
        if (h > ground) ground = h;
      }
      // Face the centre: local +Z (where the diorama's mass sits) points at
      // the origin, with a deterministic wiggle so the ring never reads as
      // stamped. NO mirroring — a mirrored instance flips winding and
      // FrontSide faces get culled into invisibility (see header, bug #2).
      const yaw = Math.atan2(-Math.cos(a), -Math.sin(a)) + chunkJitter(k);
      tmpPos.set(px, ground - SINK, pz);
      tmpQuat.setFromAxisAngle(yAxis, yaw);
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
  // whether it LOADED (and how much is in it) or never arrived.
  console.info(
    `[sanctuary] mountain forest ring: ${angles.length} chunks · ${byMaterial.size} materials · ${Math.round(tris / 1000)}k tris · tier ${budget.tier}`,
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
