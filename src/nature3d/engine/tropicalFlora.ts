// src/nature3d/engine/tropicalFlora.ts
//
// THE TROPICAL JUNGLE FIELD — the owner's low-poly tropical plant set,
// scattered over the WHOLE sanctuary world — the study meadow, the plains,
// the trek district and the mountain ring — so the land reads as one full
// jungle, not a carpet around the boards.
//
//   "pure jameen per failao … jitne bhi area hai sab jagah failao …
//    pure world mein pahadon per jameenon per sab jagah failao, add karo
//    more than hundred" — the field now covers the full island (to the
//    mountain band at ~1.2 km radius, the ocean shelf does the rest) and
//   every tier carries 150+ plants MORE than the first pass did.
//
// ASSET SOURCE
//   "Lowpoly tropical plant set" — six low-poly alpha-card plants the owner
//   uploaded as `Lowpoly+plants+tropical+blend.rar` (Blender file + six RGBA
//   cutout PNGs). The set was converted to glTF (one GLB per variant,
//   textures embedded, alphaMode MASK, double-sided) and ships in
//   `public/sanctuary/models/tropical/` — the same OFFLINE-FIRST convention
//   as the sorrel/grass/moss kit in `public/sanctuary/models/`.
//
//   Each variant is a single flat card (28–80 quads). Two cards crossed at
//   90° are baked into every GLB, so the silhouette reads from any angle —
//   the classic billboard-forestry trick, with none of the billboard cost:
//   one geometry, one InstancedMesh per variant per ring.
//
// ── GROUNDING ────────────────────────────────────────────────────────────
//   The owner's cards ship with TRANSPARENT PADDING inside the frame — the
//   palm's art starts 8.8 % up from the card's bottom edge, the broad
//   green leaf (leaf_b) a full 22.3 %. Placed naively, a 20 m palm stood
//   with ~1.7 m of empty air under it: "jameen se juda dikh nahin rahe,
//   hawa mein flow kar rahi hain". The GLB's real frame is therefore
//   measured once per variant (gapB/gapT below) and the geometry is
//   translated at load so the ARTWORK'S base — not the frame's — sits at
//   y = 0, and every scale is computed from the artwork's height (artH),
//   so a "20 m palm" is 20 m of visible fronds. The padding below the base
//   bites invisibly into the ground; the plants now read as planted.
//
// THE SIX VARIANTS (all of them are used — "sabko add karna hai")
//   tropical_palm    — fan palm frond on a stem          (the palm TREE)
//   tropical_banana  — full banana leaf with splits      (the banana TREE)
//   tropical_fern    — tall fern frond                   (the tall fern)
//   tropical_leaf_a  — broad yellow-green leaf           (undergrowth)
//   tropical_leaf_b  — broad green leaf with stem        (undergrowth)
//   tropical_leaf_c  — variegated prayer-plant leaf      (undergrowth)
//
// SIZES (owner directive)
//   "minimum size 7 meter and maximum size 20 meter — ped ka size 20 meter,
//   ped paudhon ka size 10 meter, aise samajh lo" — EVERY VISIBLE plant
//   lands between 7 m and 20 m of artwork:
//
//     palm     13 – 20 m   (trees reach the 20 m ceiling)
//     banana   12 – 19 m
//     fern      9 – 15 m
//     leaves    7 – 11 m   (the "paudhe" sit around the 10 m mark)
//
// COUNT (owner directives, pass 2)
//   Every tier keeps 150+ and now carries WELL over a hundred more than
//   pass 1, spread across three rings out to the mountains:
//
//                    near ≤130 m   mid ≤640 m   far ≤1180 m   total
//     low            80            130          100          310  (+150)
//     medium         170           230          170          570  (+270)
//     high           270           330          250          850  (+370)
//     ultra          370           440          320         1130  (+480)
//   (low-tier radii: 120 / 440 / 820 m.) Plus the hand-placed VILLA CLUSTER
//   below — six plants at the rusty-roof villa's foundation ("uske niche 5
//   se 6 paudhe"). The ultra total sits at the same order the sorrel field
//   already spends (1120 on ultra), so the no-lag contract holds.
//
// ── Cost model ──────────────────────────────────────────────────────────
//   * One InstancedMesh per variant per ring → at most 18 draw calls.
//   * 112–320 triangles per plant: the 1130-plant ultra field is ~300 k
//     triangles of double-sided alpha-tested cards — the same order the
//     1120-plant sorrel ultra field spends, on a cheaper per-fragment
//     material (one texture fetch; the diet tier swaps PBR for Lambert).
//   * Alpha-TEST (MASK, cutoff 0.5 from the glTF), not alpha-blend: no
//     sorting, no overdraw explosion (principle 35). The far ring projects
//     to a few pixels per card past ~700 m, so its fill cost stays small.
//   * Wind is a VERTEX-SHADER injection (the grass/sorrel idiom): one
//     uTime/uWind uniform pair per frame, artwork-base-anchored t² bend in
//     local space (the instance scale multiplies it for free), distance
//     fade past ~110 m. The base never moves — the plants are PLANTED.
//   * Foliage never casts shadows (the sorrel rule).
//
// ── Where plants may NOT grow ───────────────────────────────────────────
//   The river channel, the open beach, the worn trail, the study zone
//   (34 m around the chair — the 26 m board arc must stay readable), the
//   lesson board's hill, and the villa's footprint (the six foundation
//   plants are placed BY HAND, not by the scatter). Slope tolerance
//   LOOSENS OUTWARD on purpose: 28° at the meadow, 40° on the plains,
//   52° on the mountain ring — "pahadon per failao" is an explicit
//   directive, and a world-vertical card on a steep facet is the standard
//   low-poly mountain-forest look.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { QualityBudget } from "./quality";
import {
  coastWeight,
  insideRiver,
  OCEAN_LEVEL,
  RIVER_CENTER_X,
  terrainHeight,
} from "./terrain";
import { insideWarehouse, WAREHOUSE_X, WAREHOUSE_Z } from "./warehouseSite";
import {
  createSite,
  pathWeight,
  siteAt,
  type Site,
} from "./environment";
import { noise } from "./simplex";

export interface TropicalField {
  group: THREE.Group;
  /**
   * The plant materials, published so `scene.ts` can register them with
   * the atmosphere pass as FOLIAGE (the backlit transmission term) and
   * with the winter pass — exactly like the other plant fields.
   */
  materials: THREE.Material[];
  /** Total instances actually placed (debug/HUD). */
  count: number;
  update(time: number, windStrength: number): void;
  /**
   * Thermal fail-safe: 0 = full jungle · 1 = far ring hidden ·
   * 2 = far hidden, near trimmed to 60 %, mid to 50 %.
   * Allocation-free (trimming `count`).
   */
  setShed(level: number): void;
  dispose(): void;
}

const MODEL_DIR = "sanctuary/models/tropical/";

/**
 * One row of the variant table.
 *
 * `nativeHeight` — the GLB's frame height in metres (bounding box, base at
 *   y = 0, Y-up). `gapB`/`gapT` — the TRANSPARENT PADDING inside that
 *   frame, measured in the same metres from the six card textures (rows of
 *   alpha < 16 at the 3D bottom edge / top edge). The artwork therefore
 *   spans `artH = nativeHeight − gapB − gapT`, and it is the ARTWORK that
 *   gets scaled to 7–20 m and anchored to the ground.
 * `weight` is the relative share of placements (the undergrowth is more
 *   numerous; the trees are the landmarks between them).
 */
interface Variant {
  url: string;
  nativeHeight: number;
  gapB: number;
  gapT: number;
  artH: number;
  minH: number;
  maxH: number;
  weight: number;
}

const VARIANTS: Variant[] = [
  { url: "tropical_palm.glb",   nativeHeight: 2.841, gapB: 0.25, gapT: 0.35, artH: 2.24,  minH: 13, maxH: 20, weight: 0.24 },
  { url: "tropical_banana.glb", nativeHeight: 1.715, gapB: 0.0,  gapT: 0.07, artH: 1.64,  minH: 12, maxH: 19, weight: 0.2 },
  { url: "tropical_fern.glb",   nativeHeight: 1.328, gapB: 0.0,  gapT: 0.02, artH: 1.31,  minH: 9,  maxH: 15, weight: 0.2 },
  { url: "tropical_leaf_a.glb", nativeHeight: 0.982, gapB: 0.08, gapT: 0.05, artH: 0.85,  minH: 7,  maxH: 11, weight: 0.12 },
  { url: "tropical_leaf_b.glb", nativeHeight: 1.205, gapB: 0.27, gapT: 0.28, artH: 0.66,  minH: 7,  maxH: 11, weight: 0.12 },
  { url: "tropical_leaf_c.glb", nativeHeight: 0.591, gapB: 0.03, gapT: 0.04, artH: 0.52,  minH: 7,  maxH: 10, weight: 0.12 },
];

/** Cumulative weights for a fast weighted pick (no allocation per draw). */
const CUM_WEIGHT: number[] = (() => {
  const out: number[] = [];
  let sum = 0;
  for (const v of VARIANTS) {
    sum += v.weight;
    out.push(sum);
  }
  return out;
})();

const TOTAL_WEIGHT = CUM_WEIGHT[CUM_WEIGHT.length - 1];

function pickVariant(r: number): number {
  const t = r * TOTAL_WEIGHT;
  for (let i = 0; i < CUM_WEIGHT.length; i += 1) {
    if (t <= CUM_WEIGHT[i]) return i;
  }
  return CUM_WEIGHT.length - 1;
}

type Ring = "near" | "mid" | "far";

/**
 * Per-tier instance counts: [near, mid, far].
 *
 * Every tier is 150+ over the first pass ("add karo more than hundred"),
 * and the extra volume goes to the rings the first pass never reached —
 * the plains, the trek district, the mountain ring.
 */
function tropicalCounts(budget: QualityBudget): [number, number, number] {
  switch (budget.tier) {
    case "low": return [80, 130, 100];
    case "medium": return [170, 230, 170];
    case "high": return [270, 330, 250];
    case "ultra": return [370, 440, 320];
  }
}

/**
 * [near outer, mid outer, far outer] in metres. The far ring runs to the
 * mountain band (the island edge falls below OCEAN_LEVEL past ~1.2 km, so
 * the tide gate below does the world's boundary for free).
 */
function tropicalRadii(budget: QualityBudget): [number, number, number] {
  if (budget.tier === "low") return [120, 440, 820];
  return [130, 640, 1180];
}

/**
 * Per-ring scatter policy. The near ring keeps pass 1's character (the
 * owner liked what stood around the boards); the mid and far rings are
 * deliberately UNIFORM — "jitne bhi area hai sab jagah failao" means the
 * gap-thinning patch field only keeps its rhythm where it is seen up
 * close, and the mountains get their own slope/soil tolerance.
 */
const RING_CFG: Record<Ring, {
  patchT: number;   // reject below this patch density
  baseP: number;    // base accept probability
  fall: number;     // radial density falloff (0 = none)
  slopeDeg: number; // steepest slope a card will sit on
  soil: number;     // driest soil that still takes a plant
  crowd: number;    // thinning under a closed canopy (probability)
  sizeGain: number; // far plants lean bigger to read continuous
}> = {
  near: { patchT: -0.5, baseP: 0.82, fall: 0.42, slopeDeg: 28, soil: 0.15, crowd: 0.35, sizeGain: 1.0 },
  mid: { patchT: -0.15, baseP: 0.72, fall: 0.3, slopeDeg: 40, soil: 0.15, crowd: 0.45, sizeGain: 1.06 },
  far: { patchT: -0.05, baseP: 0.68, fall: 0.25, slopeDeg: 52, soil: 0.08, crowd: 0.6, sizeGain: 1.12 },
};

/** The lesson board's hillside spot (see `board.ts`) — keep it clear. */
const BOARD_HILL_X = -268.7;
const BOARD_HILL_Z = -266.1;
/** Board + posts + the approach, at the board's 8× scale. */
const BOARD_HILL_CLEAR = 42;

/**
 * Does a jungle plant belong at (x, z, y)?
 *
 * Cheap rejections run FIRST (the same ordering the grass/sorrel fields
 * use); the expensive site query is reached only by survivors.
 */
function acceptsPlant(
  x: number, z: number, y: number,
  worn: number, site: Site, ring: Ring,
): boolean {
  if (insideRiver(x, z)) return false;
  // The villa is 30 m of geometry a 20 m card would stand inside. (The six
  // foundation plants are placed by hand — see the cluster below.)
  if (insideWarehouse(x, z, 9)) return false;
  // The STUDY ZONE: the three 30 m boards stand on a 26 m arc around the
  // chair (lectern.ts, LECTERN_RADIUS/PIVOT). This field's plants grow to
  // 20 m — twice a board's height — so a plant inside the arc would sit
  // between the seated learner and a board face. 34 m clears the 1× arc,
  // the board depth and a margin (the other fields keep out only 4.5 m
  // because their plants are under 8 m).
  if (Math.hypot(x, z - 2.6) < 34) return false;
  // The lesson board on the hill: the learner reads it from the chair,
  // so nothing may stand between the seat and the face.
  if (Math.hypot(x - BOARD_HILL_X, z - BOARD_HILL_Z) < BOARD_HILL_CLEAR) return false;
  // The river scours a shingle band along its edge — thin it out, keep a
  // few stragglers so the bank is ragged, not drawn (mirrors sorrel).
  if (Math.abs(x - RIVER_CENTER_X) < 8.6 && Math.random() < 0.7) return false;
  // No plant below the tide line + 1 m; the upper beach keeps one in five.
  // This is also the WORLD boundary: past the mountain band the island
  // falls below OCEAN_LEVEL, so the ocean owns the rim.
  const shoreUp = y - OCEAN_LEVEL;
  if (shoreUp < 1.0) return false;
  if (coastWeight(x, z) > 0.05 && shoreUp < 3.0 && Math.random() < 0.8) return false;
  // Worn ground: no plant on the trail core, thin across its shoulder.
  if (worn > 0.25) return false;
  if (worn > 0.1 && Math.random() < worn * 1.4) return false;
  // The site query is the expensive part — only survivors reach it.
  const cfg = RING_CFG[ring];
  if (site.slopeDeg > cfg.slopeDeg) return false; // see RING_CFG: the far
  // ring is allowed onto the mountain ring on purpose.
  if (site.soil < cfg.soil) return false;
  if (site.wetness > 0.78 && Math.random() < 0.85) return false; // channel
  // A closed canopy starves the floor of light — the outer rings thin
  // harder (research §1, §5: competition is geography).
  if (site.crowding > 0.8 && Math.random() < cfg.crowd) return false;
  return true;
}

/**
 * The PATCH FIELD: where the jungle runs thick and where it thins.
 *
 * Two octaves — a broad ~30 m grove rhythm plus a ~9 m clump rhythm. Only
 * the near ring applies it hard; the mid/far rings use it almost as a
 * uniform field, because pass 2's brief is "sab jagah failao" — the gaps
 * the first pass left are the complaint, not the feature.
 */
function patchDensity(x: number, z: number): number {
  return noise.noise2D(x * 0.033, z * 0.033) * 0.55
    + noise.noise2D(x * 0.11 + 31.7, z * 0.11 - 13.9) * 0.45;
}

/** One loaded variant: the merged card geometry + its glTF material. */
interface LoadedVariant {
  geometry: THREE.BufferGeometry;
  gltfMaterial: THREE.Material | null;
}

function loadVariant(loader: GLTFLoader, v: Variant): Promise<LoadedVariant> {
  return new Promise<LoadedVariant>((resolve, reject) => {
    loader.load(
      MODEL_DIR + v.url,
      (gltf) => {
        let geometry: THREE.BufferGeometry | null = null;
        let gltfMaterial: THREE.Material | null = null;
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && !geometry) {
            geometry = mesh.geometry;
            const mat = mesh.material;
            gltfMaterial = Array.isArray(mat) ? mat[0] ?? null : mat ?? null;
          }
        });
        if (!geometry) {
          reject(new Error(`tropical: ${v.url} contains no meshes`));
          return;
        }
        const geo = geometry as THREE.BufferGeometry;
        // GROUNDING: drop the card so the ARTWORK'S base (not the frame's
        // bottom edge) is at y = 0. The transparent padding below the
        // artwork now bites invisibly into the ground instead of standing
        // in the air under the plant (see the GROUNDING block above).
        geo.translate(0, -v.gapB, 0);
        resolve({ geometry: geo, gltfMaterial });
      },
      undefined,
      (err) => {
        console.warn(`tropical: ${v.url} failed to load`, err);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export function createTropicalField(budget: QualityBudget, anisotropy: number): Promise<TropicalField> {
  const group = new THREE.Group();
  group.name = "tropical-flora";

  const loader = new GLTFLoader();
  const shadows = budget.shadowMapSize > 0;
  const site: Site = createSite();

  return Promise.all(VARIANTS.map((v) => loadVariant(loader, v)))
    .then((loaded) => {
      // ── One material per variant (6 compiled programs total, the same
      //    order the moss bank's 12 sits at) ────────────────────────────
      const materials = loaded.map((l, i) =>
        makeMaterial(l.gltfMaterial, VARIANTS[i], budget, anisotropy),
      );

      const [nearCount, midCount, farCount] = tropicalCounts(budget);
      const [nearRadius, midRadius, farRadius] = tropicalRadii(budget);

      // ── The scatter ──────────────────────────────────────────────────
      // All three rings are walked in one pass, bucketing placements by
      // variant, so the variant mix (weights) is identical across the
      // whole world.
      type Placed = {
        x: number; z: number; y: number;
        yaw: number;
        sx: number; sy: number; sz: number;
        tint: THREE.Color;
      };
      // Per-ring instance lists, parallel to the variant table.
      const nearBucket = VARIANTS.map(() => [] as Placed[]);
      const midBucket = VARIANTS.map(() => [] as Placed[]);
      const farBucket = VARIANTS.map(() => [] as Placed[]);
      const ringLen: Record<Ring, () => number> = {
        near: () => nearBucket.reduce((a, b) => a + b.length, 0),
        mid: () => midBucket.reduce((a, b) => a + b.length, 0),
        far: () => farBucket.reduce((a, b) => a + b.length, 0),
      };

      const buckets: Record<Ring, Placed[][]> = {
        near: nearBucket, mid: midBucket, far: farBucket,
      };
      const radii: Record<Ring, number> = {
        near: nearRadius, mid: midRadius, far: farRadius,
      };
      const targets: Record<Ring, number> = {
        near: nearCount, mid: midCount, far: farCount,
      };
      const ringKeys: Ring[] = ["near", "mid", "far"];

      const dummy = new THREE.Object3D();
      let guard = 0;
      const total = nearCount + midCount + farCount;
      while (guard < total * 40) {
        guard += 1;
        // Pick a ring that is still behind, weighted by its remaining
        // share, so the three finish together instead of in sequence.
        let rem = 0;
        for (const k of ringKeys) rem += Math.max(0, targets[k] - ringLen[k]());
        if (rem === 0) break;
        let pick = Math.random() * rem;
        let ring: Ring = "near";
        for (const k of ringKeys) {
          const left = Math.max(0, targets[k] - ringLen[k]());
          if (pick <= left) { ring = k; break; }
          pick -= left;
        }
        const outer = radii[ring];
        const inner = ring === "near" ? 0 : ring === "mid" ? nearRadius : midRadius;

        // sqrt keeps the annulus uniform; the rest carves it.
        const r = Math.sqrt(Math.random()) * (outer - inner) + inner;
        const a = Math.random() * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;

        // The patch field (see RING_CFG.patchT for how lenient each ring
        // is), then the radial falloff.
        const cfg = RING_CFG[ring];
        const d = patchDensity(x, z);
        if (d < cfg.patchT) continue;
        const richness = Math.min(1, Math.max(0, (d + 1) / 2));
        const radFall = 1 - cfg.fall * (r / outer) * (r / outer);
        const acceptP = cfg.baseP * (0.55 + 0.45 * richness) * radFall;
        if (Math.random() > acceptP) continue;

        const worn = pathWeight(x, z);
        if (worn > 0.25) continue;
        const y = terrainHeight(x, z);
        siteAt(x, z, site);
        if (!acceptsPlant(x, z, y, worn, site, ring)) continue;

        // ── Transform: no two plants are clones ────────────────────────
        // Full 2π yaw, a small lean, and INDEPENDENT axis scales.
        const vi = pickVariant(Math.random());
        let target =
          VARIANTS[vi].minH + Math.random() * (VARIANTS[vi].maxH - VARIANTS[vi].minH);
        // The outer rings lean slightly bigger — a sparse volume layer
        // only reads continuous if each plant covers more ground. The
        // gain is folded in and the result clamped so the OWNER'S 7–20 m
        // CONTRACT holds after the per-axis jitter below (jitter can
        // stretch ±12 %). `target` is the VISIBLE artwork height (artH
        // is the artwork, not the padded frame).
        target = Math.min(20, Math.max(7, target * cfg.sizeGain));
        const jMax = Math.min(1.12, 20 / target);
        const jMin = Math.max(0.88, 7 / target);
        const s = target / VARIANTS[vi].artH;
        // Tint: mostly a lightness wobble around a near-white base so the
        // authored texture keeps its own green (a strong tint would dye it
        // — the sorrel rule, even more subtle for these saturated cards).
        const tint = new THREE.Color().setHSL(
          0.31 + (Math.random() - 0.5) * 0.03,
          0.1 + Math.random() * 0.12,
          0.86 + (Math.random() - 0.5) * 0.1,
        );
        const placed: Placed = {
          x, z, y,
          yaw: Math.random() * Math.PI * 2,
          sx: s * (jMin + Math.random() * (jMax - jMin)),
          sy: s * (jMin + Math.random() * (jMax - jMin)),
          sz: s * (jMin + Math.random() * (jMax - jMin)),
          tint,
        };
        buckets[ring][vi].push(placed);
      }

      // ── THE VILLA CLUSTER — "ek jo villa hai uske niche 5 se 6 paudhe" ─
      // Six hand-placed plants at the rusty-roof villa's foundation: the
      // tall palm on the chair-facing side, a row down the west flank, one
      // at the back and one on the river side. (The front-right of the
      // villa is inside the 34 m study zone, so the flank takes the second
      // tree.) They are NOT part of the scatter (the scatter
      // keeps out of the villa on purpose) — they are a composed group,
      // planted a few metres off the walls so the silhouette frames the
      // villa instead of clipping it. Fixed sizes (all inside the
      // variant's 7–20 m range) and small fixed yaws: deliberate, not
      // random. Joined to the near ring's meshes, so they share its
      // materials, wind and draw calls.
      const VILLA_CLUSTER: Array<{ lx: number; lz: number; v: number; h: number }> = [
        { lx: -12, lz: -29, v: 0, h: 17 }, // palm, front-west
        { lx: -26, lz: -12, v: 1, h: 14 }, // banana, west flank
        { lx: -25, lz: 8, v: 2, h: 11 }, // fern, west flank
        { lx: -24, lz: 27, v: 4, h: 9 }, // leaf_b, back-west corner
        { lx: 10, lz: 30, v: 1, h: 13 }, // banana, behind
        { lx: 23, lz: 4, v: 3, h: 8 }, // leaf_a, river side
      ];
      for (let ci = 0; ci < VILLA_CLUSTER.length; ci += 1) {
        const c = VILLA_CLUSTER[ci];
        const x = WAREHOUSE_X + c.lx;
        const z = WAREHOUSE_Z + c.lz;
        if (insideRiver(x, z)) continue; // the river side wins if it moves
        const y = terrainHeight(x, z);
        if (y - OCEAN_LEVEL < 1.0) continue;
        const v = VARIANTS[c.v];
        const target = Math.min(v.maxH, Math.max(v.minH, c.h));
        const s = (target / v.artH) * (0.97 + 0.06 * (ci % 3) * 0.37);
        const tint = new THREE.Color().setHSL(0.31, 0.14, 0.88);
        // Face the villa centre, with a little asymmetry so the group
        // reads planted-by-hand rather than stamped.
        const yaw = Math.atan2(WAREHOUSE_X - x, WAREHOUSE_Z - z) + (ci % 2 ? 0.3 : -0.35);
        nearBucket[c.v].push({
          x, z, y,
          yaw,
          sx: s, sy: s, sz: s,
          tint,
        });
      }

      // ── One InstancedMesh per (variant, ring) ─────────────────────────
      const meshes: THREE.InstancedMesh[] = [];
      const nearMeshes: THREE.InstancedMesh[] = [];
      const midMeshes: THREE.InstancedMesh[] = [];
      const farMeshes: THREE.InstancedMesh[] = [];
      let placedTotal = 0;

      for (let vi = 0; vi < VARIANTS.length; vi += 1) {
        const geo = loaded[vi].geometry;
        const rings: Array<[Ring, Placed[], number]> = [
          ["near", nearBucket[vi], nearRadius],
          ["mid", midBucket[vi], midRadius],
          ["far", farBucket[vi], farRadius],
        ];
        for (const [ring, placedList, outerR] of rings) {
          if (placedList.length === 0) continue;
          const mesh = new THREE.InstancedMesh(geo, materials[vi], placedList.length);
          // Foliage never casts (the sorrel/grass rule).
          mesh.castShadow = false;
          mesh.receiveShadow = shadows;
          mesh.frustumCulled = true;
          mesh.name = `tropical-${ring}-${vi}`;
          for (let i = 0; i < placedList.length; i += 1) {
            const p = placedList[i];
            dummy.position.set(p.x, p.y - 0.05, p.z);
            dummy.rotation.set(
              (Math.random() - 0.5) * 0.1,
              p.yaw,
              (Math.random() - 0.5) * 0.1,
            );
            dummy.scale.set(p.sx, p.sy, p.sz);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, p.tint);
          }
          mesh.instanceMatrix.needsUpdate = true;
          mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          // The wind pushes vertices past the computed bounds, so the ring
          // gets a generous manual sphere (the sorrel/grass rule) — and
          // the far ring's sphere also covers the mountain relief its
          // plants stand on (up to 100 m of peak).
          geo.computeBoundingSphere();
          mesh.boundingSphere = new THREE.Sphere(
            new THREE.Vector3(0, 0, 0),
            outerR + (ring === "far" ? 120 : 30),
          );
          meshes.push(mesh);
          if (ring === "near") nearMeshes.push(mesh);
          else if (ring === "mid") midMeshes.push(mesh);
          else farMeshes.push(mesh);
          group.add(mesh);
          placedTotal += placedList.length;
        }
      }

      // Thermal fail-safe ladder: hiding a ring or trimming instance
      // counts is allocation-free, so shedding costs no hitch (the grass
      // rule).
      const nearFull = nearMeshes.map((m) => m.count);
      const midFull = midMeshes.map((m) => m.count);
      const applyShed = (level: number) => {
        for (const m of farMeshes) m.visible = level < 1;
        for (let i = 0; i < nearMeshes.length; i += 1) {
          nearMeshes[i].count = level >= 2 ? Math.floor(nearFull[i] * 0.6) : nearFull[i];
        }
        for (let i = 0; i < midMeshes.length; i += 1) {
          midMeshes[i].count = level >= 2 ? Math.floor(midFull[i] * 0.5) : midFull[i];
        }
      };

      return {
        group,
        materials,
        count: placedTotal,
        setShed: applyShed,
        update(time: number, windStrength: number) {
          for (const m of materials) {
            const shader = m.userData.shader as
              { uniforms: Record<string, { value: unknown }> } | undefined;
            if (shader) {
              shader.uniforms.uTime.value = time;
              shader.uniforms.uWind.value = windStrength;
            }
          }
        },
        dispose() {
          for (const mesh of meshes) mesh.dispose();
          for (const l of loaded) l.geometry.dispose();
          for (const material of materials) {
            material.dispose();
            const mat = material as THREE.MeshStandardMaterial;
            for (const tex of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap]) {
              (tex as THREE.Texture | null)?.dispose?.();
            }
          }
          group.clear();
        },
      } as TropicalField;
    });
}

/**
 * Build the field's material for one variant.
 *
 * The glTF ships PBR + MASK; the diet tier swaps to Lambert with only the
 * diffuse map (the sorrel rule — one less lighting chain over tens of
 * thousands of alpha-tested leaf pixels on a tile GPU).
 */
function makeMaterial(
  gltfMat: THREE.Material | null,
  v: Variant,
  budget: QualityBudget,
  anisotropy: number,
): THREE.Material {
  let map: THREE.Texture | null = null;
  if (gltfMat instanceof THREE.MeshStandardMaterial) {
    map = gltfMat.map;
  }
  let material: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  if (budget.cheapPlants || !map) {
    material = new THREE.MeshLambertMaterial({
      map: map ?? new THREE.Texture(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    // The PBR sibling is never used on the diet tier: keep the shared
    // diffuse map (Lambert reuses it) and let the rest GC.
    if (gltfMat instanceof THREE.MeshStandardMaterial) {
      for (const tex of [gltfMat.normalMap, gltfMat.roughnessMap, gltfMat.metalnessMap]) {
        (tex as THREE.Texture | null)?.dispose?.();
      }
      gltfMat.dispose();
    }
  } else {
    // `map` is only set from a MeshStandardMaterial, so this cannot be
    // anything else by the time we get here.
    material = gltfMat as THREE.MeshStandardMaterial;
    // GLTFLoader already applied the MASK mode (alphaTest 0.5); force the
    // field's contract regardless of what a re-export ships.
    material.alphaTest = 0.5;
    material.side = THREE.DoubleSide;
  }
  if (map) map.anisotropy = anisotropy;

  // ── Wind: the onBeforeCompile idiom, shared by the grass and sorrel ──
  // The bend lives in LOCAL space (before the instance matrix), so the
  // instance scale multiplies it for free — a 20 m palm sways visibly
  // more than a 7 m leaf with no extra uniform. The normaliser is the
  // ARTWORK height (the frame was translated so the artwork base is at
  // y = 0), so t = 0 exactly at the GROUND and the base never moves:
  // the plants are planted, not hovering. Amplitudes are a few percent of
  // the variant's own height, not metres. Past ~110 m the sway is
  // sub-pixel and switches off instead of shimmering.
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
        float dcTHash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }
        `,
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        vec3 dcTRoot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float dcTPhase = dcTHash(dcTRoot) * 6.2831;
        // The base never moves; only the crown sways (t^2 — a leaf is
        // stiffer than a grass blade). t is measured from the GROUND.
        float dcTT = clamp(transformed.y / ${v.artH.toFixed(3)}, 0.0, 1.0);
        float dcTBend = dcTT * dcTT;
        vec4 dcTView = modelViewMatrix * vec4(dcTRoot, 1.0);
        float dcTNear = 1.0 - smoothstep(60.0, 110.0, -dcTView.z);
        float dcTTravel = dot(dcTRoot.xz, uWindDir) * 0.15;
        float dcTSwell  = sin(uTime * 1.1 + dcTTravel + dcTPhase) * 0.5 + 0.5;
        float dcTGust   = sin(uTime * 0.31 + dcTTravel * 0.4 + dcTPhase * 0.5) * 0.5 + 0.5;
        float dcTAmp = (0.02 + dcTSwell * 0.03 + dcTGust * 0.02) * uWind * dcTBend * dcTNear;
        transformed.x += uWindDir.x * dcTAmp;
        transformed.z += uWindDir.y * dcTAmp;
        transformed.y -= dcTAmp * dcTAmp * 0.3;
        `,
      );
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () =>
    `dc-tropical-${v.url}-${budget.cheapPlants ? "diet" : "pbr"}`;

  return material;
}
