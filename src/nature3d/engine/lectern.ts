// src/nature3d/engine/lectern.ts
//
// THE THREE-BOARD LECTERN — the study triptych the student sits in front of.
//
// Three 30 m boards stand in an arc around the chair:
//
//        mind map  ┐                            ┌  note taking
//                   \                          /
//                    \        reading         /
//                     \    (dead ahead)      /
//                      \                    /
//                            [ desk ]
//                            [chair ]
//                              you
//
// ── The geometry problem, and why it is solved by root-finding ──────────
//
// Two requirements fight each other:
//
//   (a) every board must face the student square-on, so the page rendered on
//       it is never read at a slant;
//   (b) there must be exactly 1 m of air between neighbouring boards.
//
// You cannot get both by parking three boards on one circle around the chair.
// A 30 m board is a CHORD of that circle, and its ends fall inside the arc.
// Sweeping the side board round until its near corner is 1 m away needs about
// 35 degrees of swing at a 26 m radius, and by then the two boards overlap in
// depth — the measured minimum gap on a common circle never drops below 18 m
// no matter what radius you pick. The circle simply cannot be made to work.
//
// So the side boards are NOT on the centre board's circle. Each is placed by
// solving, for the swing angle `p`:
//
//     centre(p) = rightEdgeOfCentreBoard + (GAP + HALF_WIDTH) * (cos p, -sin p)
//     residual(p) = atan2(centre.x, -centre.z) - p
//
// `residual(p) = 0` is exactly the statement "the board sitting 1 m off the
// centre board's edge, swung by p, happens to face the student". It has no
// closed form, so it is bisected at module load — 90 iterations, microseconds,
// and the answer is a compile-time-constant-like value for the whole session.
// At the shipped 26 m reading distance the solution is a 37.7 degree swing
// with the side boards at 45.2 m, and the trio subtends 41.3 degrees off
// centre — comfortably inside one glance.

import * as THREE from "three";
import { terrainHeight } from "./terrain";

/** Board face size in metres. 30 m wide, 16:9, as specified. */
export const LECTERN_BOARD_WIDTH = 30;
export const LECTERN_BOARD_HEIGHT = (LECTERN_BOARD_WIDTH * 9) / 16; // 16.875

/** Air between neighbouring boards, in metres. */
export const LECTERN_GAP = 1;

/** How far the centre board stands from the chair. */
export const LECTERN_RADIUS = 26;

/** Where the student sits (the chair's own spot in `student.ts`). */
export const LECTERN_PIVOT_Z = 2.6;

/**
 * Ground clearance under the boards. The bottom edge sits here, so a 16.9 m
 * board reaches 20.1 m — tall, but it is read from 26 m away.
 */
export const LECTERN_BASE_HEIGHT = 3.2;

/** The three boards, left to right as the student sees them. */
export type LecternSlot = "mindmap" | "reading" | "notes";

/** Left → right, which is also the order they are laid out in. */
export const LECTERN_SLOTS: readonly LecternSlot[] = ["mindmap", "reading", "notes"] as const;

export interface LecternPlacement {
  slot: LecternSlot;
  /** Board centre in world space. */
  position: THREE.Vector3;
  /** Yaw that makes the board face the student. */
  yaw: number;
  /** Distance from the student's eye to the board centre. */
  distance: number;
}

const HALF_WIDTH = LECTERN_BOARD_WIDTH / 2;

/**
 * Solve the swing angle for a side board — see the header comment.
 *
 * Returns the positive (right-hand) solution in radians. Bisection is used
 * rather than Newton because the residual is cheap and bisection cannot
 * diverge; 90 halvings take the bracket below 1e-26 rad, far past float64.
 */
function solveSwing(radius: number): number {
  const k = LECTERN_GAP + HALF_WIDTH;
  const residual = (p: number) => {
    const cx = HALF_WIDTH + k * Math.cos(p);
    const cz = -radius - k * Math.sin(p);
    return Math.atan2(cx, -cz) - p;
  };
  let lo = 0.01;
  let hi = 1.5;
  // The residual is positive at lo (a barely-swung board sits far to the side,
  // so its bearing exceeds its yaw) and negative at hi. If that ever stops
  // holding the layout has changed fundamentally, so fall back to a sane 40
  // degrees rather than returning a bisection of a non-bracket.
  if (residual(lo) * residual(hi) > 0) return 0.7;
  for (let i = 0; i < 90; i += 1) {
    const mid = (lo + hi) / 2;
    if (residual(lo) * residual(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** The solved swing, in radians. ~0.658 rad = 37.7 degrees. */
export const LECTERN_SWING = solveSwing(LECTERN_RADIUS);

/**
 * Where each board stands. Computed once and frozen — the layout is fixed, so
 * every consumer (the meshes, the camera presets, the tests) reads the same
 * numbers instead of recomputing them and drifting apart.
 */
export function lecternPlacements(): LecternPlacement[] {
  const pivotZ = LECTERN_PIVOT_Z;
  const k = LECTERN_GAP + HALF_WIDTH;
  const p = LECTERN_SWING;

  // Right board (note taking), then mirrored for the left (mind map).
  const rx = HALF_WIDTH + k * Math.cos(p);
  const rz = -LECTERN_RADIUS - k * Math.sin(p);

  const y = LECTERN_BASE_HEIGHT + LECTERN_BOARD_HEIGHT / 2;

  // ONE ground reference for all three boards, taken under the chair.
  //
  // Sampling the terrain under each board separately looks correct and is
  // wrong: the meadow rolls, so the three boards came out at y = 11.51, 10.58
  // and 8.53 — a three-metre stagger that reads as a broken set and tilts the
  // horizon line the learner reads across. A lectern is one piece of
  // furniture, so it gets one datum, and the legs in `boardScreens.ts` take up
  // whatever slack the ground leaves underneath.
  const groundY = terrainHeight(0, pivotZ);

  const make = (slot: LecternSlot, x: number, z: number, yaw: number): LecternPlacement => ({
    slot,
    // The lectern is anchored on the chair, so every z is measured from it.
    position: new THREE.Vector3(x, groundY + y, z + pivotZ),
    yaw,
    distance: Math.hypot(x, z),
  });

  return [
    make("mindmap", -rx, rz, -p),
    make("reading", 0, -LECTERN_RADIUS, 0),
    make("notes", rx, rz, p),
  ];
}

/**
 * The student's desk. A plain writing table between the chair and the boards —
 * it is scenery, never interactive, so it is built as ONE merged-material
 * group of five boxes and left alone for the rest of the session.
 */
export function createDesk(shadows: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = "student-desk";

  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.72, metalness: 0.03 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x5f3c1c, roughness: 0.8, metalness: 0.03 });

  const TOP_W = 1.9;
  const TOP_D = 0.82;
  const TOP_H = 0.06;
  const DESK_H = 0.76;

  const top = new THREE.Mesh(new THREE.BoxGeometry(TOP_W, TOP_H, TOP_D), wood);
  top.position.y = DESK_H;
  top.castShadow = shadows;
  top.receiveShadow = shadows;
  group.add(top);

  // A thin apron under the top stops the desk reading as a floating plank.
  const apron = new THREE.Mesh(new THREE.BoxGeometry(TOP_W - 0.14, 0.1, TOP_D - 0.2), darkWood);
  apron.position.y = DESK_H - 0.09;
  apron.castShadow = shadows;
  group.add(apron);

  const legGeo = new THREE.BoxGeometry(0.075, DESK_H - 0.06, 0.075);
  const inset = 0.11;
  for (const [x, z] of [
    [-TOP_W / 2 + inset, -TOP_D / 2 + inset],
    [TOP_W / 2 - inset, -TOP_D / 2 + inset],
    [-TOP_W / 2 + inset, TOP_D / 2 - inset],
    [TOP_W / 2 - inset, TOP_D / 2 - inset],
  ] as const) {
    const leg = new THREE.Mesh(legGeo, darkWood);
    leg.position.set(x, (DESK_H - 0.06) / 2, z);
    leg.castShadow = shadows;
    group.add(leg);
  }

  // Sits just in front of the chair, on the board side (−Z).
  const z = LECTERN_PIVOT_Z - 1.05;
  group.position.set(0, terrainHeight(0, z), z);
  return group;
}

/**
 * Dispose a group built here. Geometries and materials are owned per-mesh, so
 * a plain traversal is enough — nothing is shared with the rest of the scene.
 */
export function disposeGroup(group: THREE.Object3D) {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}
