// src/nature3d/engine/wildlife.ts
//
// THE LIVING HERD.
//
// A procedural quadruped factory builds buffalo, cows, deer, sheep, goats and
// their calves/lambs/fawns from one parameterised template, then a lightweight
// behaviour state machine (GRAZE → WALK → LOOK_UP → PLAY) drives them around
// the meadow. Babies stay near their mother and play-bounce far more often.
//
// Performance model (this is why 50+ animals cost almost nothing):
//
//   * GEOMETRY IS SHARED. Every animal of a species reuses the same cached
//     geometries + materials, so the GPU state changes are minimal and memory
//     is flat regardless of head-count.
//   * ANIMATION IS LOD'd BY DISTANCE. Only animals inside ~28 m get full limb
//     animation. Between 28–60 m they get body bob + head dip only. Past that
//     the animation loop skips them entirely (they are 6 px tall — nobody can
//     tell) and they simply keep walking their path.
//   * The behaviour machine runs on a STAGGERED TIMER: each animal re-thinks
//     on its own schedule, so the per-frame CPU cost is a handful of adds.
//   * Distant animals drop their shadow casting, and low tier disables limb
//     rigs entirely.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { QualityBudget } from "./quality";
import { insideRiver, terrainHeight } from "./terrain";

export type Species = "buffalo" | "cow" | "deer" | "sheep" | "goat";

interface SpeciesSpec {
  bodyLength: number;
  bodyRadius: number;
  legLength: number;
  legRadius: number;
  neckLength: number;
  headSize: number;
  coat: number;
  coatAlt: number;
  horns: "buffalo" | "cow" | "antler" | "goat" | "none";
  humped: boolean;
  woolly: boolean;
  walkSpeed: number;
  /** Chance the species is standing in a tight herd. */
  herdTightness: number;
}

const SPECS: Record<Species, SpeciesSpec> = {
  buffalo: {
    bodyLength: 2.0, bodyRadius: 0.62, legLength: 0.92, legRadius: 0.1,
    neckLength: 0.5, headSize: 0.42, coat: 0x2f2b2a, coatAlt: 0x413b38,
    horns: "buffalo", humped: true, woolly: false, walkSpeed: 0.42, herdTightness: 0.75,
  },
  cow: {
    bodyLength: 1.75, bodyRadius: 0.52, legLength: 0.86, legRadius: 0.085,
    neckLength: 0.48, headSize: 0.34, coat: 0xd8cdc0, coatAlt: 0x5b4334,
    horns: "cow", humped: false, woolly: false, walkSpeed: 0.46, herdTightness: 0.6,
  },
  deer: {
    bodyLength: 1.25, bodyRadius: 0.3, legLength: 0.82, legRadius: 0.045,
    neckLength: 0.6, headSize: 0.22, coat: 0x9a6136, coatAlt: 0xc59a6a,
    horns: "antler", humped: false, woolly: false, walkSpeed: 0.7, herdTightness: 0.5,
  },
  sheep: {
    bodyLength: 1.0, bodyRadius: 0.4, legLength: 0.42, legRadius: 0.05,
    neckLength: 0.24, headSize: 0.2, coat: 0xf0ebe0, coatAlt: 0x2b2926,
    horns: "none", humped: false, woolly: true, walkSpeed: 0.38, herdTightness: 0.85,
  },
  goat: {
    bodyLength: 1.0, bodyRadius: 0.32, legLength: 0.56, legRadius: 0.048,
    neckLength: 0.3, headSize: 0.2, coat: 0xbdae99, coatAlt: 0x6f5c46,
    horns: "goat", humped: false, woolly: false, walkSpeed: 0.62, herdTightness: 0.55,
  },
};

type Behaviour = "graze" | "walk" | "look" | "play";

interface Animal {
  group: THREE.Group;
  species: Species;
  spec: SpeciesSpec;
  baby: boolean;
  scale: number;
  /** Rig handles — null when the LOD build skipped them. */
  neck: THREE.Object3D | null;
  head: THREE.Object3D | null;
  tail: THREE.Object3D | null;
  /** Retained for shape compatibility; ears are merged into the head mesh. */
  ears: THREE.Object3D[];
  legs: THREE.Object3D[];
  body: THREE.Object3D;
  behaviour: Behaviour;
  timer: number;
  phase: number;
  heading: number;
  speed: number;
  homeX: number;
  homeZ: number;
  motherIndex: number;
  bounce: number;
  distance: number;
}

export interface Wildlife {
  group: THREE.Group;
  update(dt: number, time: number, cameraPos: THREE.Vector3): void;
  dispose(): void;
}

/**
 * Per-species geometry bank.
 *
 * A quadruped is split into exactly FIVE rigid pieces — body, neck+head,
 * tail, and the four legs (all four share one geometry). Each piece is built
 * ONCE per species/LOD and every animal of that species reuses the same
 * BufferGeometry object, so 58 animals allocate 5 geometries, not 290.
 *
 * Within a piece the sub-parts (hump, horns, ears, muzzle, eyes, hooves,
 * wool clumps) are MERGED into that one geometry with baked vertex colours.
 * That is the trick that collapses the herd from ~1000 draw calls to ~6 per
 * species: a whole buffalo is 3 meshes (body, head, tail) + 4 leg instances,
 * all sharing a single vertex-coloured material.
 */
class SpeciesBank {
  private pieces = new Map<string, AnimalPieces>();
  private materials = new Map<string, THREE.Material>();

  constructor(private furTex: THREE.Texture) {}

  material(woolly: boolean): THREE.Material {
    const key = woolly ? "wool" : "plain";
    let m = this.materials.get(key);
    if (!m) {
      // EVERY animal gets the hide texture, not just the woolly ones. With a
      // bare vertex colour the body is a single flat tone and the eye reads
      // it as a smooth plastic prop; the coat grain is what makes it skin.
      // Woolly species tile it tighter so the fleece grain is finer.
      const map = this.furTex.clone();
      map.needsUpdate = true;
      map.repeat.set(woolly ? 5 : 2.4, woolly ? 5 : 2.4);
      m = new THREE.MeshLambertMaterial({
        vertexColors: true,
        map,
      });
      this.materials.set(key, m);
    }
    return m;
  }

  pieceSet(species: Species, baby: boolean, lod: Lod): AnimalPieces {
    const key = `${species}-${baby ? "b" : "a"}-${lod}`;
    let p = this.pieces.get(key);
    if (!p) {
      p = buildPieces(SPECS[species], baby, lod);
      this.pieces.set(key, p);
    }
    return p;
  }

  dispose() {
    this.pieces.forEach((p) => {
      p.body.dispose();
      p.head.dispose();
      p.leg?.dispose();
      p.tail?.dispose();
    });
    this.materials.forEach((m) => m.dispose());
    this.pieces.clear();
    this.materials.clear();
  }
}

/** Distance bands the herd is built and animated in. */
type Lod = "near" | "mid" | "far";

interface AnimalPieces {
  /** Body + hump + wool, pivot at the animal's feet. */
  body: THREE.BufferGeometry;
  /** Neck + skull + muzzle + ears + horns, pivot at the shoulder joint. */
  head: THREE.BufferGeometry;
  /** One leg, pivot at the hip. Null on the far LOD (legs are baked in). */
  leg: THREE.BufferGeometry | null;
  /** Tail, pivot at the rump. Null below the near LOD. */
  tail: THREE.BufferGeometry | null;
}

/** Paint a geometry a flat colour so merged parts keep their own tint. */
function tint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Place a tinted part into a merge list. */
function part(
  list: THREE.BufferGeometry[],
  geo: THREE.BufferGeometry,
  color: number,
  px = 0, py = 0, pz = 0,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = 1, sz = 1,
) {
  _p.set(px, py, pz);
  _q.setFromEuler(_e.set(rx, ry, rz));
  _s.set(sx, sy, sz);
  _m4.compose(_p, _q, _s);
  list.push(tint(geo.applyMatrix4(_m4), color));
}

function mergeOrEmpty(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(list, false) ?? new THREE.BufferGeometry();
  list.forEach((g) => g.dispose());
  return merged;
}

/** Build the five rigid pieces for one species at one LOD. */
function buildPieces(spec: SpeciesSpec, baby: boolean, lod: Lod): AnimalPieces {
  const near = lod === "near";
  const far = lod === "far";
  // Ring counts collapse hard with distance — a 60 m animal is ~8 px tall.
  const ring = far ? 5 : near ? 16 : 10;
  const hipY = spec.legLength;
  const bodyY = hipY + spec.bodyRadius * 0.86;

  // ── Body ────────────────────────────────────────────────────────────
  //
  // A single capsule is what made these read as "legs and a head attached to
  // a pill". A quadruped's torso is not a tube: it is a deep rib cage at the
  // front, a narrow waist, and a broad muscular rump, with the shoulder and
  // haunch masses standing proud of the barrel. Building those four masses
  // costs four more merged geometries — still ONE draw call per animal —
  // and it is the difference between a prop and a body.
  const bodyParts: THREE.BufferGeometry[] = [];
  const R = spec.bodyRadius;
  const L = spec.bodyLength;

  // Barrel: the underlying rib-cage-to-waist tube, tapered in Y and Z so the
  // cross-section is an oval (deeper than it is wide), like a real animal.
  const barrel = new THREE.CapsuleGeometry(R, L - R * 2, 3, ring);
  barrel.rotateZ(Math.PI / 2);
  part(bodyParts, barrel, spec.coat, 0, bodyY, 0, 0, 0, 0, 1, 0.94, 0.82);

  if (!far) {
    // Chest / rib cage — the deepest part of the torso, just behind the
    // forelegs, and where the body is widest.
    part(
      bodyParts, new THREE.SphereGeometry(R * 1.02, ring, ring - 2), spec.coat,
      L * 0.26, bodyY - R * 0.06, 0, 0, 0, 0, 0.92, 1.04, 0.94,
    );
    // Rump / hindquarters — broad and high, carrying the drive of the animal.
    part(
      bodyParts, new THREE.SphereGeometry(R * 0.98, ring, ring - 2), spec.coat,
      -L * 0.3, bodyY + R * 0.06, 0, 0, 0, 0, 1.0, 1.0, 0.96,
    );
    // Belly — sags slightly below the barrel between the limbs.
    part(
      bodyParts, new THREE.SphereGeometry(R * 0.8, ring - 2, ring - 3), spec.coatAlt,
      -L * 0.02, bodyY - R * 0.5, 0, 0, 0, 0, 1.7, 0.6, 0.86,
    );
    // Shoulder and haunch muscles, proud of the barrel on both flanks.
    for (const side of [1, -1]) {
      part(
        bodyParts, new THREE.SphereGeometry(R * 0.52, ring - 3, ring - 4), spec.coat,
        L * 0.24, bodyY - R * 0.12, side * R * 0.72, 0, 0, 0, 1.1, 1.15, 0.7,
      );
      part(
        bodyParts, new THREE.SphereGeometry(R * 0.56, ring - 3, ring - 4), spec.coat,
        -L * 0.27, bodyY - R * 0.04, side * R * 0.74, 0, 0, 0, 1.15, 1.2, 0.7,
      );
    }
    // Tail, dropping off the back of the rump.
    const tail = new THREE.CylinderGeometry(R * 0.07, R * 0.15, R * 1.5, 4);
    tail.translate(0, -R * 0.75, 0);
    part(bodyParts, tail, spec.coatAlt, -L * 0.48, bodyY + R * 0.4, 0, 0, 0, -0.45);
  }

  if (spec.humped && !far) {
    part(
      bodyParts, new THREE.SphereGeometry(spec.bodyRadius * 0.78, ring, ring - 2), spec.coat,
      spec.bodyLength * 0.24, bodyY + spec.bodyRadius * 0.52, 0, 0, 0, 0, 1.3, 0.72, 0.92,
    );
  }
  if (spec.woolly && !far) {
    for (let i = 0; i < 5; i += 1) {
      part(
        bodyParts, new THREE.SphereGeometry(spec.bodyRadius * 0.55, ring - 3, ring - 4), spec.coat,
        (i / 4 - 0.5) * spec.bodyLength * 0.8,
        bodyY + spec.bodyRadius * 0.45,
        ((i % 2) - 0.5) * spec.bodyRadius * 0.7,
      );
    }
  }
  // The far LOD bakes four stubby legs straight into the body: no leg meshes,
  // no leg animation, and the silhouette still reads as a standing animal.
  if (far) {
    const stub = new THREE.CylinderGeometry(spec.legRadius * 1.1, spec.legRadius, spec.legLength, 3);
    for (const [sx, sz] of [
      [spec.bodyLength * 0.32, spec.bodyRadius * 0.66],
      [spec.bodyLength * 0.32, -spec.bodyRadius * 0.66],
      [-spec.bodyLength * 0.32, spec.bodyRadius * 0.66],
      [-spec.bodyLength * 0.32, -spec.bodyRadius * 0.66],
    ] as const) {
      part(bodyParts, stub.clone(), spec.woolly ? spec.coatAlt : spec.coat, sx, hipY * 0.5, sz);
    }
    stub.dispose();
  }

  // ── Head (pivot at the shoulder, so one rotation grazes the whole neck) ──
  const headParts: THREE.BufferGeometry[] = [];
  const neck = new THREE.CylinderGeometry(spec.headSize * 0.62, spec.headSize * 0.82, spec.neckLength, ring);
  neck.translate(0, -spec.neckLength / 2, 0);
  part(headParts, neck, spec.coat, 0, 0, 0, 0, 0, -Math.PI / 2.6);

  const hx = spec.neckLength * 0.62;
  const hy = -spec.neckLength * 0.56;
  part(
    headParts, new THREE.SphereGeometry(spec.headSize, ring, ring - 2), spec.coat,
    hx, hy, 0, 0, 0, 0, 1.42, 0.92, 0.88,
  );

  if (!far) {
    part(
      headParts, new THREE.SphereGeometry(spec.headSize * 0.56, ring - 2, ring - 3), spec.coatAlt,
      hx + spec.headSize * 1.14, hy - spec.headSize * 0.16, 0, 0, 0, 0, 1.1, 0.8, 0.9,
    );
    for (const side of [1, -1]) {
      part(
        headParts, new THREE.SphereGeometry(spec.headSize * 0.42, ring - 4, ring - 5), spec.coat,
        hx - spec.headSize * 0.1, hy + spec.headSize * 0.42, side * spec.headSize * 0.86,
        side * 0.5, 0, 0, 0.5, 1, 1.5,
      );
    }
  }
  if (near) {
    for (const side of [1, -1]) {
      part(
        headParts, new THREE.SphereGeometry(spec.headSize * 0.14, 6, 5), 0x120e0c,
        hx + spec.headSize * 0.62, hy + spec.headSize * 0.24, side * spec.headSize * 0.62,
      );
    }
  }

  // Horns / antlers — adults only, and never on the far LOD.
  if (!far && !baby) {
    const HORN = 0xd8cdb4;
    if (spec.horns === "buffalo") {
      for (const side of [1, -1]) {
        part(
          headParts, new THREE.TorusGeometry(0.26, 0.055, 5, near ? 10 : 6, Math.PI * 1.05), HORN,
          hx - spec.headSize * 0.1, hy + spec.headSize * 0.5, side * spec.headSize * 0.5,
          Math.PI / 2, 0, side * 0.5,
        );
      }
    } else if (spec.horns === "cow" || spec.horns === "goat") {
      const goat = spec.horns === "goat";
      for (const side of [1, -1]) {
        const cone = new THREE.ConeGeometry(goat ? 0.035 : 0.05, goat ? 0.34 : 0.3, 5);
        cone.translate(0, goat ? 0.17 : 0.15, 0);
        part(
          headParts, cone, HORN,
          hx - spec.headSize * (goat ? 0.2 : 0.05),
          hy + spec.headSize * (goat ? 0.6 : 0.62),
          side * spec.headSize * (goat ? 0.32 : 0.44),
          goat ? -0.9 : 0, 0, goat ? side * 0.18 : side * -0.75,
        );
      }
    } else if (spec.horns === "antler") {
      for (const side of [1, -1]) {
        const beam = new THREE.CylinderGeometry(0.018, 0.026, 0.4, 4);
        beam.translate(0, 0.2, 0);
        const rootX = hx - spec.headSize * 0.15;
        const rootY = hy + spec.headSize * 0.6;
        const rootZ = side * spec.headSize * 0.42;
        part(headParts, beam, HORN, rootX, rootY, rootZ, 0, 0, side * -0.32);
        if (near) {
          for (const [ty, tr] of [[0.16, 0.6], [0.3, 0.95]] as const) {
            const tine = new THREE.CylinderGeometry(0.012, 0.018, 0.22, 4);
            tine.translate(0, 0.11, 0);
            part(headParts, tine, HORN, rootX, rootY + ty, rootZ, 0, 0, side * -(0.32 + tr));
          }
        }
      }
    }
  }

  // ── Leg (one geometry, reused by all four) ──────────────────────────
  let leg: THREE.BufferGeometry | null = null;
  if (!far) {
    const legParts: THREE.BufferGeometry[] = [];
    const shank = new THREE.CylinderGeometry(spec.legRadius * 0.72, spec.legRadius, spec.legLength, near ? 7 : 4);
    shank.translate(0, -spec.legLength / 2, 0);
    part(legParts, shank, spec.woolly ? spec.coatAlt : spec.coat);
    if (near) {
      part(
        legParts,
        new THREE.CylinderGeometry(spec.legRadius * 1.05, spec.legRadius * 0.95, spec.legLength * 0.12, 6),
        0x2b2725, 0, -spec.legLength, 0,
      );
    }
    leg = mergeOrEmpty(legParts);
  }

  // ── Tail (near only — invisible past ~28 m) ─────────────────────────
  let tail: THREE.BufferGeometry | null = null;
  if (near) {
    const tailParts: THREE.BufferGeometry[] = [];
    const rope = new THREE.CylinderGeometry(0.022, 0.032, spec.bodyRadius * 1.5, 5);
    rope.translate(0, -spec.bodyRadius * 0.75, 0);
    part(tailParts, rope, spec.coatAlt);
    part(tailParts, new THREE.SphereGeometry(0.06, 6, 5), spec.coatAlt, 0, -spec.bodyRadius * 1.5, 0, 0, 0, 0, 1, 1.5, 1);
    tail = mergeOrEmpty(tailParts);
  }

  return {
    body: mergeOrEmpty(bodyParts),
    head: mergeOrEmpty(headParts),
    leg,
    tail,
  };
}

/**
 * Assemble one animal from the shared piece bank.
 *
 * Draw-call cost per animal: 1 (body) + 1 (head) + 4 (legs) + 1 (tail) at the
 * near LOD, 2 + 4 at mid, and exactly 2 at far. All of them share a single
 * vertex-coloured material per species family, so the GPU never rebinds.
 */
function buildAnimal(
  species: Species,
  baby: boolean,
  lod: Lod,
  bank: SpeciesBank,
  shadows: boolean,
): Omit<Animal, "behaviour" | "timer" | "phase" | "heading" | "speed" | "homeX" | "homeZ" | "motherIndex" | "bounce" | "distance"> {
  const spec = SPECS[species];
  const scale = baby ? 0.46 + Math.random() * 0.1 : 0.92 + Math.random() * 0.18;
  const group = new THREE.Group();
  const pieces = bank.pieceSet(species, baby, lod);
  const mat = bank.material(spec.woolly);

  const body = new THREE.Mesh(pieces.body, mat);
  body.castShadow = shadows;
  group.add(body);

  // The head pivots at the shoulder joint; grazing is one rotation on it.
  const neck = new THREE.Group();
  neck.position.set(spec.bodyLength * 0.46, spec.legLength + spec.bodyRadius * 1.1, 0);
  const headMesh = new THREE.Mesh(pieces.head, mat);
  headMesh.castShadow = shadows;
  neck.add(headMesh);
  group.add(neck);

  const legs: THREE.Object3D[] = [];
  if (pieces.leg) {
    const lx = spec.bodyLength * 0.32;
    const lz = spec.bodyRadius * 0.66;
    for (const [sx, sz] of [[lx, lz], [lx, -lz], [-lx, lz], [-lx, -lz]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(sx, spec.legLength, sz);
      const mesh = new THREE.Mesh(pieces.leg, mat);
      mesh.castShadow = shadows;
      pivot.add(mesh);
      group.add(pivot);
      legs.push(pivot);
    }
  }

  let tail: THREE.Object3D | null = null;
  if (pieces.tail) {
    tail = new THREE.Group();
    tail.position.set(-spec.bodyLength * 0.48, spec.legLength + spec.bodyRadius * 1.26, 0);
    tail.add(new THREE.Mesh(pieces.tail, mat));
    group.add(tail);
  }

  group.scale.setScalar(scale);

  return {
    group,
    species,
    spec,
    baby,
    scale,
    neck: lod === "far" ? null : neck,
    head: lod === "far" ? null : headMesh,
    tail,
    // Ears are merged into the head geometry now — the flick animation is
    // dropped in favour of the far cheaper head flick, which reads the same
    // at the distances an ear is even visible.
    ears: [],
    legs,
    body,
  };
}

/**
 * Scatter herds across the meadow.
 *
 * Herds are placed on rings at increasing distance so the eye always sees
 * animals "दूर-दूर तक" — near the clearing, mid-meadow and tiny silhouettes
 * out by the treeline.
 */
export function createWildlife(budget: QualityBudget, furTex: THREE.Texture): Wildlife {
  const bank = new SpeciesBank(furTex);
  const group = new THREE.Group();
  group.name = "wildlife";
  const animals: Animal[] = [];
  const shadows = budget.shadowMapSize > 0;

  // Herds now spread across the whole kilometre, in bands. Near herds are
  // readable in detail; the distant ones are what make the valley feel
  // populated all the way to the hills.
  const plan: Array<{ species: Species; herds: number; perHerd: number; radius: [number, number] }> = [
    { species: "cow", herds: 3, perHerd: 4, radius: [10, 40] },
    { species: "sheep", herds: 2, perHerd: 6, radius: [8, 34] },
    { species: "goat", herds: 2, perHerd: 3, radius: [9, 36] },
    { species: "buffalo", herds: 3, perHerd: 5, radius: [22, 70] },
    { species: "deer", herds: 3, perHerd: 4, radius: [18, 80] },
    { species: "buffalo", herds: 3, perHerd: 6, radius: [80, 190] },
    { species: "cow", herds: 3, perHerd: 5, radius: [70, 170] },
    { species: "deer", herds: 3, perHerd: 5, radius: [90, 210] },
    { species: "sheep", herds: 2, perHerd: 8, radius: [110, 230] },
    { species: "buffalo", herds: 2, perHerd: 6, radius: [200, 330] },
    { species: "cow", herds: 2, perHerd: 6, radius: [190, 310] },
    { species: "deer", herds: 2, perHerd: 6, radius: [220, 360] },
  ];

  let spawned = 0;
  outer: for (const entry of plan) {
    for (let h = 0; h < entry.herds; h += 1) {
      // Herd anchor — rejected if it lands in the river or the study clearing.
      let ax = 0;
      let az = 0;
      for (let tries = 0; tries < 24; tries += 1) {
        const r = entry.radius[0] + Math.random() * (entry.radius[1] - entry.radius[0]);
        const a = Math.random() * Math.PI * 2;
        ax = Math.cos(a) * r;
        az = Math.sin(a) * r;
        const gh = terrainHeight(ax, az);
        // Keep herds on grazeable ground: out of the river, off the clearing,
        // and below the rocky tree line.
        if (!insideRiver(ax, az) && Math.hypot(ax, az) > 6.5 && gh > -0.9 && gh < 26) break;
      }

      // Distant herds spread wider so they read as a scatter across a hillside
      // rather than a tight clump of dots.
      const distGain = 1 + Math.min(Math.hypot(ax, az) / 160, 2.2);
      const spread = (3 + (1 - SPECS[entry.species].herdTightness) * 7) * distGain;
      let motherIndex = -1;

      for (let i = 0; i < entry.perHerd; i += 1) {
        if (spawned >= budget.animalCount) break outer;
        // Every herd gets 1–2 babies playing around the adults.
        const baby = i > 0 && Math.random() < 0.34;
        const x = ax + (Math.random() - 0.5) * spread * 2;
        const z = az + (Math.random() - 0.5) * spread * 2;
        if (insideRiver(x, z)) continue;

        // LOD is chosen at SPAWN time from the animal's distance to the study
        // clearing (the camera lives there in every preset), so the geometry
        // budget is decided once instead of thrashing at runtime.
        const dist = Math.hypot(x, z);
        const nearCut = budget.tier === "low" ? 14 : 26;
        const midCut = budget.tier === "low" ? 30 : 48;
        const lod: Lod = dist < nearCut ? "near" : dist < midCut ? "mid" : "far";

        const base = buildAnimal(entry.species, baby, lod, bank, shadows && dist < 26);
        base.group.position.set(x, terrainHeight(x, z), z);
        base.group.rotation.y = Math.random() * Math.PI * 2;
        // Far animals are scaled up a little. A real buffalo at 300 m is about
        // two pixels tall and simply vanishes; nudging the silhouette keeps the
        // distant herds legible without adding a single triangle. The growth is
        // gentle and only starts past 90 m, so nothing near you looks wrong.
        if (dist > 90) {
          const grow = 1 + Math.min((dist - 90) / 260, 1) * 1.5;
          base.group.scale.setScalar(grow);
        }

        const animal: Animal = {
          ...base,
          behaviour: Math.random() < 0.62 ? "graze" : "walk",
          timer: 1 + Math.random() * 6,
          phase: Math.random() * Math.PI * 2,
          heading: base.group.rotation.y,
          speed: 0,
          homeX: ax,
          homeZ: az,
          motherIndex: baby ? motherIndex : -1,
          bounce: 0,
          distance: dist,
        };
        if (!baby && motherIndex < 0) motherIndex = animals.length;

        group.add(base.group);
        animals.push(animal);
        spawned += 1;
      }
    }
  }

  function rethink(a: Animal) {
    const roll = Math.random();
    if (a.baby) {
      // Babies play far more than they eat.
      a.behaviour = roll < 0.4 ? "play" : roll < 0.7 ? "walk" : roll < 0.9 ? "graze" : "look";
    } else {
      a.behaviour = roll < 0.55 ? "graze" : roll < 0.82 ? "walk" : roll < 0.94 ? "look" : "play";
    }
    a.timer = a.behaviour === "graze" ? 5 + Math.random() * 9 : 2 + Math.random() * 5;

    if (a.behaviour === "walk" || a.behaviour === "play") {
      a.speed = a.spec.walkSpeed * (a.baby ? 1.5 : 1) * (a.behaviour === "play" ? 1.6 : 0.55 + Math.random() * 0.6);
      // Steer back toward the herd anchor (or the mother, for a calf) so the
      // herd never disperses into the horizon.
      const tx = a.motherIndex >= 0 ? animals[a.motherIndex].group.position.x : a.homeX;
      const tz = a.motherIndex >= 0 ? animals[a.motherIndex].group.position.z : a.homeZ;
      const dx = tx - a.group.position.x;
      const dz = tz - a.group.position.z;
      const away = Math.hypot(dx, dz);
      const wander = (Math.random() - 0.5) * (away > 9 ? 0.5 : 2.6);
      a.heading = Math.atan2(dz, dx) + wander;
    } else {
      a.speed = 0;
    }
  }

  return {
    group,
    update(dt, time, cameraPos) {
      for (let i = 0; i < animals.length; i += 1) {
        const a = animals[i];
        const pos = a.group.position;
        a.distance = Math.hypot(pos.x - cameraPos.x, pos.z - cameraPos.z);

        a.timer -= dt;
        if (a.timer <= 0) rethink(a);

        // ── Locomotion (always runs — it is 6 float ops) ───────────────
        if (a.speed > 0) {
          const step = a.speed * dt;
          const nx = pos.x + Math.cos(a.heading) * step;
          const nz = pos.z + Math.sin(a.heading) * step;
          // Fence each animal around its OWN herd anchor, not around the
          // origin. The old global 78 m ring dragged every distant herd back
          // towards the clearing until the far half of the valley emptied out.
          const fromHome = Math.hypot(nx - a.homeX, nz - a.homeZ);
          if (insideRiver(nx, nz) || fromHome > 26 || Math.hypot(nx, nz) < 5.2) {
            a.heading += Math.PI * (0.6 + Math.random() * 0.8);
          } else {
            pos.x = nx;
            pos.z = nz;
          }
          pos.y = terrainHeight(pos.x, pos.z);
          // Smooth turn toward the heading (no snapping).
          const diff = Math.atan2(Math.sin(-a.heading + Math.PI / 2 - a.group.rotation.y), Math.cos(-a.heading + Math.PI / 2 - a.group.rotation.y));
          a.group.rotation.y += diff * Math.min(1, dt * 3.2);
        }

        // ── Animation LOD ─────────────────────────────────────────────
        // Skip the per-bone animation once the animal is too far for a leg
        // swing to cover even a pixel. They still walk (that is 6 float ops
        // above) so the distant herds keep drifting across the hillside; they
        // just stop paying for gait, head bob and tail flick.
        if (a.distance > 62) continue;

        const t = time + a.phase;
        const moving = a.speed > 0.01;
        const mid = a.distance > 28;

        // Body bob + ground-follow tilt (cheap, runs to 62 m).
        const bob = moving ? Math.sin(t * (a.baby ? 11 : 7.4)) * 0.022 : Math.sin(t * 1.6) * 0.006;
        a.body.position.y = a.spec.legLength + a.spec.bodyRadius * 0.86 + bob;

        if (a.behaviour === "play" && a.baby) {
          // Frisky calf: little pronking hops.
          a.bounce = Math.max(0, Math.sin(t * 5.4)) * 0.22;
          a.group.position.y = terrainHeight(pos.x, pos.z) + a.bounce;
          a.group.rotation.z = Math.sin(t * 5.4) * 0.07;
        } else if (a.bounce > 0) {
          a.bounce = 0;
          a.group.rotation.z = 0;
          a.group.position.y = terrainHeight(pos.x, pos.z);
        }

        if (!a.neck || !a.head) continue;

        // Head / neck: dip to the grass while grazing, chew, lift to scan.
        const targetNeck =
          a.behaviour === "graze" ? 0.92 + Math.sin(t * 1.4) * 0.05 :
          a.behaviour === "look" ? -0.2 :
          moving ? 0.18 + Math.sin(t * 3.1) * 0.05 : 0.3;
        a.neck.rotation.z = THREE.MathUtils.lerp(a.neck.rotation.z, targetNeck, Math.min(1, dt * 2.6));
        if (a.behaviour === "graze") {
          a.head.rotation.z = Math.sin(t * 7.2) * 0.07; // chewing
          a.head.rotation.y = Math.sin(t * 0.5) * 0.25; // sweeping for fresh grass
        } else if (a.behaviour === "look") {
          a.head.rotation.y = Math.sin(t * 0.8) * 0.55;
        }

        if (mid) continue; // beyond 28 m: no limbs, no ears, no tail

        // Tail swishes at the flies — the detail that sells "alive" up close.
        if (a.tail) {
          a.tail.rotation.z = Math.sin(t * 2.4) * 0.22;
          a.tail.rotation.x = Math.sin(t * 1.7 + 1) * 0.16;
        }

        // Four-beat walk cycle (diagonal pairs), amplitude tracks speed.
        if (a.legs.length === 4) {
          const gaitSpeed = moving ? (a.behaviour === "play" ? 12 : 7.4) : 0;
          const amp = moving ? (a.behaviour === "play" ? 0.62 : 0.4) : 0;
          if (amp > 0) {
            a.legs[0].rotation.z = Math.sin(t * gaitSpeed) * amp;
            a.legs[3].rotation.z = Math.sin(t * gaitSpeed) * amp;
            a.legs[1].rotation.z = Math.sin(t * gaitSpeed + Math.PI) * amp;
            a.legs[2].rotation.z = Math.sin(t * gaitSpeed + Math.PI) * amp;
          } else {
            for (const leg of a.legs) leg.rotation.z *= 1 - Math.min(1, dt * 4);
          }
        }

        // Sit the animal on the slope it is standing on. The tilt is applied
        // as pitch/roll on top of the heading (never as a full quaternion, or
        // it would fight the yaw the locomotion code owns).
        if (a.distance < 22) {
          const e = 0.8;
          const slopeX = terrainHeight(pos.x - e, pos.z) - terrainHeight(pos.x + e, pos.z);
          const slopeZ = terrainHeight(pos.x, pos.z - e) - terrainHeight(pos.x, pos.z + e);
          const yaw = a.group.rotation.y;
          const pitch = Math.atan2(slopeX * Math.cos(yaw) + slopeZ * Math.sin(yaw), 2 * e);
          const roll = Math.atan2(slopeZ * Math.cos(yaw) - slopeX * Math.sin(yaw), 2 * e);
          a.group.rotation.x = THREE.MathUtils.lerp(a.group.rotation.x, -pitch, Math.min(1, dt * 2));
          if (a.bounce <= 0) {
            a.group.rotation.z = THREE.MathUtils.lerp(a.group.rotation.z, roll, Math.min(1, dt * 2));
          }
        }
      }
    },
    dispose() {
      bank.dispose();
      group.clear();
    },
  };
}
