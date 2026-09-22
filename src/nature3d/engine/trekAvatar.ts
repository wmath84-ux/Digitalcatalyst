// src/nature3d/engine/trekAvatar.ts
//
// THE WALKING CHARACTER — TerrainTrek's player, upgraded to a premium
// mobile-shooter feel while keeping its gameplay constants.
//
// ROLE TODAY: the figure only ever SITS at the study desk and breathes —
// the walk mode (locomotion, third-person camera, jump physics) was removed
// with the first-person feature, and its tuning constants went with it.
//
// WHAT STAYS VERBATIM:
//
//   seating   hips drop, thighs fold, facing PI (the board side)
//
// WHAT WAS UPGRADED (the character-quality bar):
//
//   body      the violet stick-human is replaced by an original, fully
//             procedural trail-guide character: anatomical proportions,
//             a real 18-joint pivot rig (pelvis → spine → chest → neck →
//             head, arms with elbows + wrists, legs with knees + ankles),
//             clothing detail baked into vertex colours, solid-shell hair,
//             glossy trek shades, and a sprung backpack — 2 materials,
//             1 procedural texture, ~2k triangles (budget: 8k low-end).
//   locomotion  the 8-way compass snap is replaced by an analog pipeline:
//             stick → wish heading + wish speed → accel/decel → turn-rate
//             limited heading → gait phase locked to distance travelled,
//             so feet cannot skate by construction. States: idle, start,
//             walk, jog, run, sprint, dash, stop, turn, jump, fall, land.
//   feet      analytic two-bone IK plants each foot on the real terrain
//             (height + slope), staggered at 30 Hz, gated by speed,
//             camera distance and quality tier. FK stays authoritative in
//             the air and at dash speed, where IK would be unjudgeable.
//   camera    the same spherical placement, now damped (no touch jitter),
//             with a shoulder offset, a sprint FOV kick and a landing dip.
//
// ARCHITECTURE (input → render):
//
//   the figure is static (seated) — the scene just drives
//   TrekAvatar.update (breathes the seated rig each frame).
//
// Both updates are allocation-free: every temp is hoisted, the frame loop
// stays clean, and there is no Math.random anywhere (deterministic).

import * as THREE from "three";
import { terrainHeight, terrainNormal } from "./terrain";
import { damp } from "./controls";

/** The walk speed the seat-idle pose is scaled against. */
export const WALK_SPEED = 10;
/** Visual scale of the seated character (user directive: 3×). */
export const AVATAR_SCALE = 3;

/** Locomotion states — gait SELECTION only; the pose itself is continuous. */
export type LocoState =
  | "idle" | "start" | "walk" | "jog" | "run" | "sprint" | "dash"
  | "stop" | "turn" | "jump" | "fall" | "land";

// ─────────────────────────────────────────────────────────────────────────
// The character — an original procedural trail guide
// ─────────────────────────────────────────────────────────────────────────

export interface TrekAvatar {
  group: THREE.Group;
  /** Hide the body (first person) without disturbing the rig. */
  setVisible(v: boolean): void;
  /** Seat the avatar on the chair, or stand them back up. */
  setSeated(seated: boolean, chair?: THREE.Vector3): void;
  readonly seated: boolean;
  /**
   * Pose the rig for this frame. Reads locomotion state from the player
   * (speed, heading, gait phase, airborne, landing) and the camera (for the
   * LOD distance only). Allocation-free. Respects `seated`: on the chair it
   * only breathes, standing it runs the full locomotion pose + foot IK.
   */
  update(dt: number, time: number, player: TrekPlayer, camera: THREE.Camera): void;
  /** Low-end mode: foot IK off, animation rate capped. Never breaks pose. */
  setLowEnd(v: boolean): void;
  dispose(): void;
}

/** Deterministic PRNG (mulberry32) — no Math.random in the character. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The shared micro-detail texture: fabric grain / skin grain as a subtle
 * near-white multiplier. A DataTexture (not canvas) so it builds identically
 * in the browser AND in headless Node harnesses — no DOM needed.
 */
function makeDetailTexture(): THREE.DataTexture {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const rnd = seededRandom(0xC0FFEE);
  // Value-noise-ish grain: two octaves of smoothed random + fine speckle.
  const coarse = new Float32Array(16 * 16);
  for (let i = 0; i < coarse.length; i += 1) coarse[i] = rnd();
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const cx = (x / S) * 16;
      const cy = (y / S) * 16;
      const x0 = Math.floor(cx) % 16;
      const y0 = Math.floor(cy) % 16;
      const x1 = (x0 + 1) % 16;
      const y1 = (y0 + 1) % 16;
      const fx = cx - Math.floor(cx);
      const fy = cy - Math.floor(cy);
      const smooth =
        coarse[y0 * 16 + x0] * (1 - fx) * (1 - fy) +
        coarse[y0 * 16 + x1] * fx * (1 - fy) +
        coarse[y1 * 16 + x0] * (1 - fx) * fy +
        coarse[y1 * 16 + x1] * fx * fy;
      // 232..255: visible grain on cloth, never dirty on skin.
      const v = 232 + Math.round(smooth * 14 + rnd() * 9);
      const o = (y * S + x) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, S, S);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Wardrobe — flat albedo zones; shading comes from vertex bands + lights.
const C_SKIN = new THREE.Color(0xc98d5e);
const C_SKIN_SHADE = new THREE.Color(0x9c6a41);
const C_SHIRT = new THREE.Color(0x1f7a6d);
const C_SHIRT_SHADE = new THREE.Color(0x14604f);
const C_PANTS = new THREE.Color(0x8a7a56);
const C_PANTS_SHADE = new THREE.Color(0x66593c);
const C_BOOT = new THREE.Color(0x4a3826);
const C_SOLE = new THREE.Color(0x241b12);
const C_HAIR = new THREE.Color(0x2b1c10);
const C_PACK = new THREE.Color(0xb4552d);
const C_PACK_SHADE = new THREE.Color(0x7e3a1e);
const C_STRAP = new THREE.Color(0x33302b);
const C_BELT = new THREE.Color(0x2e2a26);
const C_PAD = new THREE.Color(0x3f3a33);

/**
 * Paint per-vertex colours onto a part. `fn(y01, ny, target)` receives the
 * vertex's normalised height within the part (0 bottom … 1 top) and its
 * normal Y, so clothing bands (cuffs, belt, kneepads, soles) and baked
 * joint shading are one cheap pass at build time — never per frame.
 */
function paint(
  geo: THREE.BufferGeometry,
  fn: (y01: number, ny: number, out: THREE.Color) => void,
): void {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const span = Math.max(bb.max.y - bb.min.y, 1e-5);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute | undefined;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const y01 = (pos.getY(i) - bb.min.y) / span;
    fn(y01, nor ? nor.getY(i) : 1, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/**
 * Build the trail-guide character.
 *
 * The model faces local −Z (the direction of travel when group.rotation.y
 * equals the movement heading). Proportions target a ~1.67 m athletic adult:
 * head ≈ 1/8 of height, fingertips reach mid-thigh, shoulders twice hips.
 */
export function createTrekAvatar(shadows: boolean): TrekAvatar {
  const group = new THREE.Group();
  group.name = "trek-avatar";

  const body = new THREE.Group();
  body.name = "avatar-body";
  body.scale.setScalar(AVATAR_SCALE);

  // TWO materials total: the PBR body (vertex colours × grain) and the
  // glossy shades. Nothing transparent anywhere — hair is a solid shell.
  const detail = makeDetailTexture();
  const bodyMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: detail,
    roughness: 0.88,
    metalness: 0,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x0e141b,
    roughness: 0.16,
    metalness: 0.25,
  });

  const meshes: THREE.Mesh[] = [];
  function part(
    geo: THREE.BufferGeometry,
    parent: THREE.Object3D,
    x = 0,
    y = 0,
    z = 0,
    mat: THREE.Material = bodyMat,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadows;
    m.receiveShadow = false;
    parent.add(m);
    meshes.push(m);
    return m;
  }
  function joint(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  // ── Pelvis + spine + chest ──────────────────────────────────────────
  const PELVIS_Y = 1.0;
  const pelvisG = joint(body, 0, PELVIS_Y, 0);
  {
    const g = new THREE.BoxGeometry(0.3, 0.2, 0.21);
    paint(g, (y01, _ny, out) => {
      // Belt band across the top, pants below, shaded seat at the back is
      // handled by the light; the bottom edge darkens into the hip joints.
      if (y01 > 0.78) out.copy(C_BELT);
      else out.copy(C_PANTS).lerp(C_PANTS_SHADE, y01 < 0.25 ? 0.55 : 0.12);
    });
    part(g, pelvisG);
  }

  const spineG = joint(pelvisG, 0, 0.1, 0);
  {
    // Shirt tucked: shirt above, belt line at the very bottom.
    const g = new THREE.CapsuleGeometry(0.132, 0.1, 3, 10);
    paint(g, (y01, _ny, out) => {
      if (y01 < 0.12) out.copy(C_BELT);
      else out.copy(C_SHIRT).lerp(C_SHIRT_SHADE, (1 - y01) * 0.35);
    });
    part(g, spineG, 0, 0.07, 0);
  }

  const chestG = joint(spineG, 0, 0.16, 0);
  let packMesh: THREE.Mesh;
  {
    // Collar trim at the top, under-arm shading baked low on the sides is
    // approximated by darkening the bottom band (the joint shadow).
    const g = new THREE.CapsuleGeometry(0.155, 0.16, 3, 12);
    paint(g, (y01, ny, out) => {
      out.copy(C_SHIRT);
      if (y01 > 0.9) out.lerp(C_SHIRT_SHADE, 0.7); // collar
      if (y01 < 0.22) out.lerp(C_SHIRT_SHADE, 0.55); // under-arm joint shade
      if (ny < -0.2) out.lerp(C_SHIRT_SHADE, 0.25);
    });
    part(g, chestG, 0, 0.1, 0);
    // Backpack: rust shell, darker base, strap-coloured front face (+Z faces
    // the back, away from travel). Real 3D gear, one box, vertex-banded.
    const pack = new THREE.BoxGeometry(0.3, 0.36, 0.16);
    paint(pack, (y01, _ny, out) => {
      out.copy(C_PACK).lerp(C_PACK_SHADE, (1 - y01) * 0.6);
      if (y01 > 0.42 && y01 < 0.58) out.lerp(C_STRAP, 0.85); // compression strap
    });
    packMesh = part(pack, chestG, 0, 0.12, 0.21);
  }

  // ── Neck + head ─────────────────────────────────────────────────────
  const neckG = joint(chestG, 0, 0.2, 0);
  {
    const g = new THREE.CapsuleGeometry(0.05, 0.05, 2, 8);
    paint(g, (_y01, _ny, out) => out.copy(C_SKIN_SHADE));
    part(g, neckG, 0, 0.03, 0);
  }
  const headG = joint(neckG, 0, 0.09, 0);
  {
    // Skull: skin with a jaw/neck shade gradient (no facial rig — believable
    // at gameplay distance through proportion + shading, not geometry).
    const g = new THREE.SphereGeometry(0.115, 16, 12);
    g.scale(0.94, 1.06, 0.98);
    paint(g, (y01, ny, out) => {
      out.copy(C_SKIN);
      if (y01 < 0.3) out.lerp(C_SKIN_SHADE, 0.5 * (1 - y01 / 0.3));
      if (ny < -0.3) out.lerp(C_SKIN_SHADE, 0.3);
    });
    part(g, headG, 0, 0.1, -0.005);
    // Hair: a SOLID shell (no transparency anywhere — §15), covering the
    // crown and back, open at the face.
    const hair = new THREE.SphereGeometry(0.122, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.52);
    hair.scale(0.96, 1.02, 1.0);
    paint(hair, (_y01, _ny, out) => out.copy(C_HAIR));
    const hairMesh = part(hair, headG, 0, 0.108, 0.012);
    hairMesh.rotation.x = -0.28; // tips the opening toward the face (−Z)
    // Trek shades: one glossy strip. The low roughness gives the specular
    // highlight eyes need, for a single extra draw call and zero rigging.
    const shades = new THREE.BoxGeometry(0.15, 0.045, 0.03);
    part(shades, headG, 0, 0.115, -0.098, eyeMat);
  }

  // ── Arms (shoulder pivots, elbows, wrists) ──────────────────────────
  // NOTE: `armL/armR` name the SHOULDER groups — the seated-pose contract
  // addresses them, and the walk pose drives shoulders + elbows + wrists.
  const shoulderY = 0.155; // relative to chestG → abs ≈ 1.415
  const shoulderX = 0.215;
  function buildArm(side: -1 | 1): { shoulder: THREE.Group; elbow: THREE.Group; wrist: THREE.Group } {
    const shoulder = joint(chestG, side * shoulderX, shoulderY, 0);
    {
      // Sleeve down to mid-forearm… actually short sleeve: shirt to elbow.
      const g = new THREE.CapsuleGeometry(0.056, 0.2, 2, 8);
      paint(g, (y01, _ny, out) => {
        if (y01 < 0.3) out.copy(C_SKIN); // elbow skin
        else out.copy(C_SHIRT).lerp(C_SHIRT_SHADE, (1 - y01) * 0.4);
        if (y01 > 0.86) out.lerp(C_SHIRT_SHADE, 0.5); // shoulder cap shade
      });
      part(g, shoulder, 0, -0.15, 0);
    }
    const elbow = joint(shoulder, 0, -0.3, 0);
    {
      const g = new THREE.CapsuleGeometry(0.047, 0.18, 2, 8);
      paint(g, (y01, _ny, out) => {
        out.copy(C_SKIN).lerp(C_SKIN_SHADE, (1 - y01) * 0.3);
      });
      part(g, elbow, 0, -0.13, 0);
    }
    const wrist = joint(elbow, 0, -0.27, 0);
    {
      const g = new THREE.BoxGeometry(0.07, 0.15, 0.045);
      paint(g, (y01, _ny, out) => {
        out.copy(C_SKIN).lerp(C_SKIN_SHADE, (1 - y01) * 0.35);
      });
      part(g, wrist, 0, -0.07, -0.005);
    }
    return { shoulder, elbow, wrist };
  }
  const armBuildL = buildArm(-1);
  const armBuildR = buildArm(1);
  const armL = armBuildL.shoulder;
  const armR = armBuildR.shoulder;
  const elbowL = armBuildL.elbow;
  const elbowR = armBuildR.elbow;
  const wristL = armBuildL.wrist;
  const wristR = armBuildR.wrist;
  armL.rotation.z = 0.09;
  armR.rotation.z = -0.09;

  // ── Legs (hip pivots, knees, ankles) ────────────────────────────────
  // NOTE: `legL/legR` name the HIP groups — the seated fold addresses them.
  const HIP_X = 0.105;
  const HIP_DROP = 0.02; // hips sit just below the pelvis origin
  const THIGH_LEN = 0.44; // hip → knee
  const CALF_LEN = 0.42; // knee → ankle
  const ANKLE_H = 0.08; // ankle → sole
  function buildLeg(side: -1 | 1): { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group } {
    const hip = joint(pelvisG, side * HIP_X, -HIP_DROP, 0);
    {
      // Trousers with a kneepad band at the bottom and hip-joint shade up top.
      const g = new THREE.CapsuleGeometry(0.078, 0.26, 3, 10);
      paint(g, (y01, _ny, out) => {
        if (y01 < 0.2) out.copy(C_PAD);
        else out.copy(C_PANTS).lerp(C_PANTS_SHADE, y01 > 0.8 ? 0.5 : 0.12);
      });
      part(g, hip, 0, -0.19, 0);
    }
    const knee = joint(hip, 0, -THIGH_LEN, 0);
    {
      // Trousers taper into boots at the bottom third.
      const g = new THREE.CapsuleGeometry(0.06, 0.26, 3, 9);
      paint(g, (y01, _ny, out) => {
        if (y01 < 0.34) out.copy(C_BOOT).lerp(C_SOLE, (0.34 - y01) * 1.4);
        else out.copy(C_PANTS).lerp(C_PANTS_SHADE, 0.15);
      });
      part(g, knee, 0, -0.18, 0);
    }
    const ankle = joint(knee, 0, -CALF_LEN, 0);
    {
      // Boot: dark toe (−Z front), sole band at the very bottom.
      const g = new THREE.BoxGeometry(0.105, 0.09, 0.25);
      paint(g, (y01, _ny, out) => {
        if (y01 < 0.18) out.copy(C_SOLE);
        else out.copy(C_BOOT);
      });
      part(g, ankle, 0, -0.035, -0.05);
    }
    return { hip, knee, ankle };
  }
  const legBuildL = buildLeg(-1);
  const legBuildR = buildLeg(1);
  const legL = legBuildL.hip;
  const legR = legBuildR.hip;
  const kneeL = legBuildL.knee;
  const kneeR = legBuildR.knee;
  kneeL.name = "kneeL";
  kneeR.name = "kneeR";
  const ankleL = legBuildL.ankle;
  const ankleR = legBuildR.ankle;

  group.add(body);

  // ── Foot-IK scratch (hoisted — the pose loop allocates nothing) ──────
  let lowEnd = false;
  let lodTick = 0;
  let ikTick = 0;
  const ikWeightL = { v: 0 };
  const ikWeightR = { v: 0 };
  const plantL = { x: 0, z: 0, live: false };
  const plantR = { x: 0, z: 0, live: false };
  const solL = { hip: 0, knee: 0, ankle: 0, drop: 0 };
  const solR = { hip: 0, knee: 0, ankle: 0, drop: 0 };
  const pelvisDrop = { v: 0 };
  const packSpring = { x: 0, v: 0 };
  const nScratch = new THREE.Vector3();
  const headWorld = new THREE.Vector3();

  let seated = false;

  /**
   * Analytic two-bone IK for one leg, in the leg's sagittal plane.
   *
   * Writes thigh/knee/ankle X rotations that place the foot at (tx, tz) with
   * the sole on `soleY` and pitched `solePitch`. Returns the pelvis drop the
   * target demands when it is out of reach (the caller eases the pelvis down
   * by the max of both legs — feet stay planted instead of floating).
   */
  function solveLeg(
    side: -1 | 1,
    hip: THREE.Group,
    knee: THREE.Group,
    ankle: THREE.Group,
    heading: number,
    hipY: number,
    tx: number,
    tz: number,
    soleY: number,
    solePitch: number,
  ): number {
    // Hip world position, analytically (no matrix reads — deterministic).
    const s = Math.sin(heading);
    const c = Math.cos(heading);
    const hx = group.position.x + side * HIP_X * AVATAR_SCALE * c;
    const hz = group.position.z - side * HIP_X * AVATAR_SCALE * s;
    // Target relative to the hip, in the facing frame (fwd = −Z local).
    // World move dir for heading h is (−sin h, −cos h); lateral is (cos h, −sin h).
    const dx = tx - hx;
    const dz = tz - hz;
    const fwd = dx * -s + dz * -c;
    // Ankle target: sole on the planted terrain ⇒ ankle ANKLE_H above it.
    const ankleY = soleY + ANKLE_H * AVATAR_SCALE;
    const rise = hipY - ankleY;
    const dist = Math.hypot(fwd, rise);
    const maxReach = (THIGH_LEN + CALF_LEN - 0.015) * AVATAR_SCALE;
    const minReach = 0.3 * AVATAR_SCALE;
    const drop = Math.max(0, dist - maxReach);
    const D = THREE.MathUtils.clamp(dist, minReach, maxReach);
    const thigh = THIGH_LEN * AVATAR_SCALE;
    const calf = CALF_LEN * AVATAR_SCALE;
    // Knee flexion from the law of cosines (0 = straight, + = bent back).
    const cosK = THREE.MathUtils.clamp(
      (thigh * thigh + calf * calf - D * D) / (2 * thigh * calf),
      -1,
      1,
    );
    const kneeBend = Math.PI - Math.acos(cosK);
    // Thigh pitch: direction to target, minus the knee's share.
    const aim = Math.atan2(fwd, rise); // 0 = straight down, + = forward
    const cosA = THREE.MathUtils.clamp(
      (thigh * thigh + D * D - calf * calf) / (2 * thigh * D),
      -1,
      1,
    );
    const thighPitch = aim - Math.acos(cosA);
    hip.rotation.x = thighPitch;
    // Knees bend BACKWARD (foot toward +Z local): negative X rotation.
    knee.rotation.x = -kneeBend;
    // Ankle: sole matches the slope pitch under the facing frame.
    ankle.rotation.x = -(thighPitch - kneeBend) + solePitch;
    return drop;
  }

  function resetStandingPose(): void {
    pelvisG.position.set(0, PELVIS_Y, 0);
    pelvisG.rotation.set(0, 0, 0);
    spineG.rotation.set(0, 0, 0);
    chestG.rotation.set(0, 0, 0);
    neckG.rotation.set(0, 0, 0);
    headG.rotation.set(0, 0, 0);
    legL.rotation.set(0, 0, 0);
    legR.rotation.set(0, 0, 0);
    legL.position.set(-HIP_X, -HIP_DROP, 0);
    legR.position.set(HIP_X, -HIP_DROP, 0);
    kneeL.rotation.set(0, 0, 0);
    kneeR.rotation.set(0, 0, 0);
    ankleL.rotation.set(0, 0, 0);
    ankleR.rotation.set(0, 0, 0);
    armL.rotation.set(0, 0, 0.09);
    armR.rotation.set(0, 0, -0.09);
    elbowL.rotation.set(0, 0, 0);
    elbowR.rotation.set(0, 0, 0);
    wristL.rotation.set(0, 0, 0);
    wristR.rotation.set(0, 0, 0);
    body.position.y = 0;
    body.rotation.y = 0;
    plantL.live = false;
    plantR.live = false;
    ikWeightL.v = 0;
    ikWeightR.v = 0;
    pelvisDrop.v = 0;
  }

  const api: TrekAvatar = {
    group,
    setVisible(v) {
      body.visible = v;
    },
    setSeated(v, chair) {
      seated = v;
      if (v) {
        // Sitting: hips drop to seat height, thighs go horizontal, shins
        // hang down, arms come forward to rest on the desk line.
        legL.rotation.x = -Math.PI / 2;
        legR.rotation.x = -Math.PI / 2;
        legL.position.set(-HIP_X, 0.5 - PELVIS_Y, 0);
        legR.position.set(HIP_X, 0.5 - PELVIS_Y, 0);
        kneeL.rotation.x = 1.35;
        kneeR.rotation.x = 1.35;
        ankleL.rotation.x = 0.25;
        ankleR.rotation.x = 0.25;
        armL.rotation.set(-0.85, 0, 0.12);
        armR.rotation.set(-0.85, 0, -0.12);
        elbowL.rotation.x = -0.5;
        elbowR.rotation.x = -0.5;
        spineG.rotation.x = -0.06;
        chestG.rotation.x = -0.04;
        headG.rotation.x = 0.08;
        body.position.y = -0.42;
        // The model faces local −Z; the chair faces the boards (−Z world).
        // The group heading stays PI (contract), so the BODY counter-turns.
        body.rotation.y = Math.PI;
        if (chair) {
          group.position.copy(chair);
          // Face the board, which is on the -Z side of the clearing.
          group.rotation.y = Math.PI;
        }
      } else {
        resetStandingPose();
      }
    },
    get seated() {
      return seated;
    },
    setLowEnd(v) {
      lowEnd = v;
      if (v) {
        ikWeightL.v = 0;
        ikWeightR.v = 0;
      }
    },
    update(dt, time, player, camera) {
      // ── Animation LOD by camera distance (one character: rate, not mesh)
      // LOD0 <12 m: every frame + IK · LOD1 <30 m: every frame, IK at 15 Hz
      // LOD2 <60 m: every 2nd frame, no IK · LOD3: every 4th frame, no IK.
      headWorld.copy(group.position);
      headWorld.y += 1.55;
      const camDist = camera.position.distanceTo(headWorld);
      const lod = camDist < 12 ? 0 : camDist < 30 ? 1 : camDist < 60 ? 2 : 3;
      const skip = lowEnd ? 2 : lod === 0 || lod === 1 ? 1 : lod === 2 ? 2 : 4;
      lodTick += 1;
      if (lodTick % skip !== 0) return;
      const adt = dt * skip; // skipped frames still advance phase time below

      if (seated) {
        // Micro-life only: the folds stay exactly where setSeated put them.
        const breath = Math.sin(time * 1.7);
        chestG.rotation.x = -0.04 + breath * 0.008;
        headG.rotation.x = 0.08 + breath * 0.01;
        headG.rotation.y = Math.sin(time * 0.4) * 0.06;
        return;
      }

      // ── Read the locomotion state (never mutated here) ──────────────
      const speed = player.speed;
      const speed01 = THREE.MathUtils.clamp(speed / WALK_SPEED, 0, 1.35);
      const phase = player.gaitPhase;
      const moving = speed > 0.25;
      const air = !player.grounded;
      const land = player.landAbsorb;
      const turnLean = player.turnLean;

      // ── Gait parameters, continuous in speed (states pick, pose blends)
      const swing = Math.min(0.16 + 0.068 * speed, 1.02);
      const bobAmp = Math.min(0.012 + 0.0042 * speed, 0.055);
      const crouch = Math.min(0.012 + 0.006 * speed, 0.085) + land * 0.09;
      const armSwing = Math.min(0.12 + 0.062 * speed, 0.85);
      const elbowBase = 0.28 + speed01 * 0.7;
      // Forward lean that must stay small enough to read at 15 m: base + the
      // acceleration push (start) / braking brace (stop) + landing absorb.
      const lean = 0.03 + speed01 * 0.2 + player.accelSm * 0.028 + land * 0.22 +
        (player.state === "dash" ? 0.12 : 0);

      // ── Pelvis: bob twice per cycle, sway once, drop into crouch/IK ──
      const bobY = -crouch - bobAmp * Math.abs(Math.cos(phase)) * (moving && !air ? 1 : 0.15);
      pelvisG.position.y = PELVIS_Y + bobY - pelvisDrop.v;
      pelvisG.rotation.z = (moving && !air ? Math.min(0.02 + 0.008 * speed, 0.07) : 0.004) *
        Math.sin(phase);
      pelvisG.rotation.y = moving && !air ? 0.05 * Math.sin(phase) * Math.min(speed01 + 0.3, 1) : 0;

      // ── Spine: lean + turn roll + breathing (upper body stays alive) ──
      const breath = Math.sin(time * (moving ? 2.6 : 1.7)) * (moving ? 0.006 : 0.012);
      spineG.rotation.x = -lean * 0.55 + breath * 0.4;
      spineG.rotation.z = turnLean;
      chestG.rotation.x = -lean * 0.45 + breath;
      chestG.rotation.z = turnLean * 0.7;
      chestG.rotation.y = turnLean * 0.9;
      // Gaze stabilisation: the head counter-pitches half the spine lean and
      // nods once per stride — no aim mode exists, so this is the look layer.
      headG.rotation.x = lean * 0.5 + (moving && !air ? Math.sin(phase * 2) * 0.02 : breath * 0.6);
      headG.rotation.y = turnLean * 1.4 + Math.sin(time * 0.4) * 0.03;
      neckG.rotation.x = -lean * 0.1;

      if (air) {
        // ── Airborne: split tuck, arms out for balance ────────────────
        const airT = player.airTime;
        const tuck = Math.min(airT * 3, 1);
        legL.rotation.x = 0.32 * tuck + 0.1;
        legR.rotation.x = -0.22 * tuck - 0.08;
        kneeL.rotation.x = -(0.55 + tuck * 0.5);
        kneeR.rotation.x = -(0.35 + tuck * 0.65);
        ankleL.rotation.x = 0.3;
        ankleR.rotation.x = 0.35;
        armL.rotation.x = -0.5 * tuck;
        armR.rotation.x = -0.5 * tuck;
        armL.rotation.z = 0.09 + 0.55 * tuck;
        armR.rotation.z = -0.09 - 0.55 * tuck;
        elbowL.rotation.x = 0.5;
        elbowR.rotation.x = 0.5;
        plantL.live = false;
        plantR.live = false;
        ikWeightL.v = 0;
        ikWeightR.v = 0;
      } else {
        // ── Grounded FK gait (IK overrides per foot below) ────────────
        const sL = Math.sin(phase);
        const sR = Math.sin(phase + Math.PI);
        legL.rotation.x = swing * sL;
        legR.rotation.x = swing * sR;
        // Knees bend only backward: stance micro-bend + swing-through fold.
        // Peak fold lands just after the foot passes under the body.
        const foldL = Math.pow(Math.max(0, Math.sin(phase + 2.35)), 1.4);
        const foldR = Math.pow(Math.max(0, Math.sin(phase + Math.PI + 2.35)), 1.4);
        kneeL.rotation.x = -(0.1 + crouch * 4.2 + swing * 1.5 * foldL + land * 1.0);
        kneeR.rotation.x = -(0.1 + crouch * 4.2 + swing * 1.5 * foldR + land * 1.0);
        ankleL.rotation.x = -(legL.rotation.x + kneeL.rotation.x) * 0.82;
        ankleR.rotation.x = -(legR.rotation.x + kneeR.rotation.x) * 0.82;

        // Arms counter-swing the opposite leg; elbows pump with speed.
        armL.rotation.x = -armSwing * sR - land * 0.35;
        armR.rotation.x = -armSwing * sL - land * 0.35;
        armL.rotation.z = 0.09 + speed01 * 0.05;
        armR.rotation.z = -0.09 - speed01 * 0.05;
        elbowL.rotation.x = elbowBase * (0.55 + 0.45 * Math.max(0, -sR)) + land * 0.3;
        elbowR.rotation.x = elbowBase * (0.55 + 0.45 * Math.max(0, -sL)) + land * 0.3;
        wristL.rotation.x = Math.sin(phase * 2) * 0.05 * speed01;
        wristR.rotation.x = Math.sin(phase * 2 + 1) * 0.05 * speed01;

        // ── Foot IK: plant stance feet on the real terrain ──────────
        // Eligible: grounded, readable speed, near camera, tier allows.
        // Sprint+ is FK-only — at 12 u/s a plant lasts 3 frames and the eye
        // cannot judge it; the phase law already prevents skating.
        const ikAllowed = !lowEnd && speed < 12 && (lod === 0 || (lod === 1 && ikTick % 2 === 0));
        ikTick += 1;
        updateFoot(
          -1, legL, kneeL, ankleL, sL, player, ikWeightL, plantL, solL, ikAllowed, adt,
        );
        updateFoot(
          1, legR, kneeR, ankleR, sR, player, ikWeightR, plantR, solR, ikAllowed, adt,
        );
      }

      // ── Backpack secondary motion: one sprung axis, never noisy ─────
      // Driven by acceleration + stride bob; critically damped-ish so it
      // settles instead of oscillating.
      const drive = -player.accelSm * 0.035 - (moving && !air ? Math.sin(phase * 2) * 0.02 * speed01 : 0);
      const stiff = 90;
      const dampC = 14;
      packSpring.v += ((drive - packSpring.x) * stiff - packSpring.v * dampC) * Math.min(adt, 0.05);
      packSpring.x += packSpring.v * Math.min(adt, 0.05);
      packMesh.rotation.x = THREE.MathUtils.clamp(packSpring.x, -0.3, 0.3);
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
      bodyMat.dispose();
      eyeMat.dispose();
      detail.dispose();
      group.clear();
    },
  };

  /**
   * One foot's plant/hold/swing cycle.
   *
   * While the leg is in stance the foot HOLDS its captured world position —
   * the body travels over a planted foot, which is what "no skating" means
   * geometrically. During swing the FK gait owns the leg and IK fades out.
   *
   * MOBILE THROTTLING: the two feet solve on ALTERNATE frames (staggered),
   * each blending from its CACHED solution on the frames it skips — so IK
   * costs one terrain sample + one analytic solve per frame at most, with
   * zero raycasts anywhere. A held plant is static by definition, so the
   * cached solution is exact on skip frames, not stale.
   */
  function updateFoot(
    side: -1 | 1,
    hip: THREE.Group,
    knee: THREE.Group,
    ankle: THREE.Group,
    s: number,
    player: TrekPlayer,
    weight: { v: number },
    plant: { x: number; z: number; live: boolean },
    sol: { hip: number; knee: number; ankle: number; drop: number },
    ikAllowed: boolean,
    adt: number,
  ): void {
    // Stance when the leg is back and loaded; swing when coming through.
    const stanceTarget = ikAllowed ? THREE.MathUtils.smoothstep(-s, -0.3, 0.45) : 0;
    weight.v += (stanceTarget - weight.v) * damp(14, adt);
    if (weight.v < 0.02) {
      if (weight.v < 0.001) plant.live = false;
      return; // FK owns the foot — nothing to solve or blend.
    }
    // FK pose was written by the gait block this frame — capture it BEFORE
    // a solve overwrites the joint rotations.
    const fkHip = hip.rotation.x;
    const fkKnee = knee.rotation.x;
    const fkAnkle = ankle.rotation.x;
    // Stagger: this foot solves only on its own ticks.
    const myTick = (ikTick + (side < 0 ? 0 : 1)) % 2 === 0;
    if (myTick) {
      const heading = group.rotation.y;
      const hs = Math.sin(heading);
      const hc = Math.cos(heading);
      // Capture the plant once per stance: ahead of the hip by half a stride.
      if (!plant.live) {
        const stride = player.strideLen;
        const hx = group.position.x + side * HIP_X * AVATAR_SCALE * hc;
        const hz = group.position.z - side * HIP_X * AVATAR_SCALE * hs;
        plant.x = hx + -hs * stride * 0.5;
        plant.z = hz + -hc * stride * 0.5;
        plant.live = true;
      }
      // Solve against the REAL terrain under the held plant. A few centimetres
      // of sole lift stops the boot mesh sinking into the slope.
      const soleY = terrainHeight(plant.x, plant.z) + 0.04;
      terrainNormal(plant.x, plant.z, nScratch);
      // Slope pitch in the facing frame: how much the sole must tip.
      const solePitch = Math.atan2(-(nScratch.x * -hs + nScratch.z * -hc), nScratch.y);
      const hipY = group.position.y + (pelvisG.position.y - HIP_DROP) * AVATAR_SCALE;
      sol.drop = solveLeg(side, hip, knee, ankle, heading, hipY, plant.x, plant.z, soleY, solePitch);
      sol.hip = hip.rotation.x;
      sol.knee = knee.rotation.x;
      sol.ankle = ankle.rotation.x;
    }
    // Blend the FK pose toward the (possibly cached) solution.
    hip.rotation.x = fkHip + (sol.hip - fkHip) * weight.v;
    knee.rotation.x = fkKnee + (sol.knee - fkKnee) * weight.v;
    ankle.rotation.x = fkAnkle + (sol.ankle - fkAnkle) * weight.v;
    // Pelvis eases down when a plant is out of leg reach (downhill plants).
    pelvisDrop.v = Math.min(0.12, Math.max(pelvisDrop.v, sol.drop * weight.v));
    pelvisDrop.v += (0 - pelvisDrop.v) * damp(6, adt) * (1 - weight.v * 0.5);
  }

  return api;
}

// ─────────────────────────────────────────────────────────────────────────
// The player state — locomotion, jump physics and the third-person camera
// ─────────────────────────────────────────────────────────────────────────

/**
 * TerrainTrek's player state + third-person camera, upgraded.
 *
 * The movement MODEL keeps the source's distinctive contract — the camera's
 * theta IS the heading reference and the stick applies an offset to it — but
 * the offset is now the stick's ANALOG angle instead of an 8-way snap table,
 * speed chases the stick magnitude through accel/decel filters, and the
 * heading turns toward its wish at a speed-dependent rate instead of popping.
 * The camera keeps the source's spherical placement, damped per frame.
 */
/**
 * The seated figure's pose state. The locomotion/camera machinery left with
 * the walk mode — what remains is only what the breathing-seat pose still
 * reads (gait phase, lean, landing envelopes all parked at idle values).
 */
export class TrekPlayer {
  position = new THREE.Vector3(0, 0, 0);
  rotation = 0;
  /** Smoothed planar speed, metres/second. */
  speed = 0;

  // ── Locomotion state (read by the avatar pose) ────────────────────
  state: LocoState = "idle";
  /** Gait phase, radians; advances by distance/stride so feet cannot skate. */
  gaitPhase = 0;
  /** Current stride length, metres — the phase law's denominator. */
  strideLen = 0.8;
  /** Smoothed acceleration (+push / −brake), for lean + secondary motion. */
  accelSm = 0;
  /** Signed turn rate × speed, for turn lean. */
  turnLean = 0;
  grounded = true;
  /** 0..1 landing-absorb envelope (drives knees/spine/camera dip). */
  landAbsorb = 0;
  /** Seconds since leaving the ground (drives the air tuck). */
  airTime = 0;

  reset(x: number, z: number) {
    this.position.set(x, terrainHeight(x, z), z);
    this.rotation = 0;
    this.speed = 0;
    this.state = "idle";
    this.gaitPhase = 0;
    this.strideLen = 0.8;
    this.accelSm = 0;
    this.turnLean = 0;
    this.grounded = true;
    this.landAbsorb = 0;
    this.airTime = 0;
  }
}
