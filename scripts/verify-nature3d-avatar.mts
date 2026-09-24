// Run with: bash scripts/verify-nature3d.sh   (needs esbuild + three, both already in devDeps)
//
// Explore-mode character verification harness — the rig budget, the
// locomotion maths, stance, grounding, collision, foot IK, the follow camera
// and determinism, all exercised headlessly in Node.
//
// The character layer is fully procedural (no DOM, no GLTF, no WebGL), so the
// REAL controller + rig + animation + IK + camera code runs here exactly as
// in the browser: the only thing missing is the rasteriser. That makes this
// a behaviour proof, not a source-shape grep.

import * as THREE from "three";
import {
  BONE_NAMES,
  CHARACTER_SCALE,
  CHARACTER_TUNING as T,
  CharacterAnimationController,
  CharacterController,
  CharacterInputManager,
  createRealisticMale,
  FootIKController,
  sampleGround,
  ThirdPersonCameraController,
} from "../src/nature3d/engine/character";
import { RIVER_CENTER_X, terrainHeight, WORLD_HALF } from "../src/nature3d/engine/terrain";
import { WAREHOUSE_HALF_X, WAREHOUSE_HALF_Z, WAREHOUSE_X, WAREHOUSE_Z } from "../src/nature3d/engine/warehouseSite";
import { insideBeachHouse, installBeachHouseSites } from "../src/nature3d/engine/beachHouseSite";
import { insideWarehouse } from "../src/nature3d/engine/warehouseSite";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const DT = 1 / 60;
const finite = (n: number) => Number.isFinite(n);

// A fixed beach-house site so the collision set is non-trivial. The real
// solve runs in the browser; here one deterministic pad is enough.
installBeachHouseSites([
  { x: 120, z: -80, yaw: 0.4, scale: 1, padY: 0 },
]);

function makeWalker() {
  const controller = new CharacterController();
  controller.rebuildBlockers();
  const input = new CharacterInputManager();
  return { controller, input };
}

function countTris(root: THREE.Object3D): number {
  let t = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    t += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(t);
}

// ── 1. Rig budget + skeleton contract ─────────────────────────────────
{
  const rig = createRealisticMale(false);
  const bones = Object.keys(rig.joints);
  check("rig: all 21 skeleton-contract bones exist", bones.length === 21 && BONE_NAMES.every((b) => bones.includes(b)), `${bones.length} bones`);
  const tris = countTris(rig.group);
  check("rig: triangle budget sane for a hero character", tris > 3000 && tris < 14000, `${tris} tris`);
  check("rig: 5 opaque PBR materials", rig.materials.length === 5 && rig.materials.every((m) => !(m as THREE.MeshStandardMaterial).transparent));
  // Faces local −Z: the face furniture sits on the −Z side of the head.
  let faceMinZ = Infinity;
  rig.joints.Head.children.forEach((c) => {
    if ((c as THREE.Mesh).isMesh && Math.abs(c.position.x) < 0.06) faceMinZ = Math.min(faceMinZ, c.position.z);
  });
  check("rig: authored facing −Z (travel convention)", faceMinZ < -0.08, `min face z=${faceMinZ.toFixed(3)}`);
  // Human scale: ~1.8 m toe-to-crown at CHARACTER_SCALE.
  const bb = new THREE.Box3().setFromObject(rig.group);
  const h = (bb.max.y - bb.min.y) * CHARACTER_SCALE;
  check("rig: human-scale height", h > 1.6 && h < 2.0, `${h.toFixed(2)} m`);
  rig.dispose();
}
{
  // Deterministic build: two rigs are vertex-identical.
  const a = createRealisticMale(false);
  const b = createRealisticMale(false);
  const hash = (root: THREE.Object3D) => {
    let s = "";
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const p = m.geometry.attributes.position as THREE.BufferAttribute;
      s += `${p.count}:${p.array[0].toFixed(4)},${p.array[1].toFixed(4)};`;
    });
    return s;
  };
  check("rig: procedural build is deterministic", hash(a.group) === hash(b.group));
  a.dispose();
  b.dispose();
}

// ── 2. Locomotion: accel, analog turns, no-skate law, states ──────────
{
  const { controller, input } = makeWalker();
  controller.spawn(5, 9, 0);
  check("loco: spawn parks feet exactly on the ground", Math.abs(controller.position.y - terrainHeight(5, 9)) < 1e-9 && controller.isGrounded);
  input.setMoveVector(0, 1, true);
  let maxDSpeed = 0;
  let maxDYaw = 0;
  let prevSpeed = 0;
  let prevYaw = controller.yaw;
  let predPhase = 0;
  const startPhase = controller.snapshot.gaitPhase;
  const seen = new Set<string>();
  for (let i = 0; i < 240; i += 1) {
    controller.update(DT, input, 0, 0.18);
    const s = controller.snapshot;
    seen.add(s.locomotion);
    maxDSpeed = Math.max(maxDSpeed, Math.abs(s.speed - prevSpeed));
    prevSpeed = s.speed;
    const dy = Math.abs(Math.atan2(Math.sin(s.yaw - prevYaw), Math.cos(s.yaw - prevYaw)));
    maxDYaw = Math.max(maxDYaw, dy);
    prevYaw = s.yaw;
    predPhase += ((s.speed * DT) / s.strideLen) * Math.PI;
  }
  const err = Math.abs(controller.snapshot.gaitPhase - startPhase - predPhase);
  check("loco: jog cruise reaches 2.7 m/s", Math.abs(controller.snapshot.speed - T.jogSpeed) / T.jogSpeed < 0.05, `${controller.snapshot.speed.toFixed(2)} m/s`);
  check("loco: no speed snap (accel-smoothed)", maxDSpeed < 0.5, `max Δv=${maxDSpeed.toFixed(3)}`);
  check("loco: no rotation snap (shortest-angle)", maxDYaw < 0.2, `max Δyaw=${maxDYaw.toFixed(3)}`);
  check("loco: gait phase locked to distance (no-skate law)", err < 1e-6, `err=${err.toExponential(1)}`);
  check("loco: start/walk/jog all visited on ramp-up", seen.has("start") && seen.has("walk") && seen.has("jog"), [...seen].join(","));
  // Release → stop → idle.
  input.setMoveVector(0, 0, false);
  for (let i = 0; i < 180; i += 1) {
    controller.update(DT, input, 0, 0.18);
    seen.add(controller.snapshot.locomotion);
  }
  check("loco: release visits stop then settles idle", seen.has("stop") && controller.snapshot.locomotion === "idle" && controller.snapshot.speed < 0.05);
}
{
  // Sprint cruise + gating (forward + grounded + stand only).
  const { controller, input } = makeWalker();
  controller.spawn(5, 9, 0);
  input.setMoveVector(0, 1, true);
  input.setSprintToggle(true);
  for (let i = 0; i < 300; i += 1) controller.update(DT, input, 0, 0.18);
  check("loco: sprint cruise reaches 5.2 m/s", Math.abs(controller.snapshot.speed - T.sprintSpeed) / T.sprintSpeed < 0.05, `${controller.snapshot.speed.toFixed(2)} m/s`);
  check("loco: sprint state + blend engage", controller.snapshot.locomotion === "sprint" && controller.snapshot.sprint01 > 0.9);
  // Strafe + sprint stays jog-class (no sideways sprint).
  input.setMoveVector(1, 0, true);
  for (let i = 0; i < 180; i += 1) controller.update(DT, input, 0, 0.18);
  check("loco: sideways stick never engages sprint", controller.snapshot.speed < T.jogSpeed + 0.05 && controller.snapshot.locomotion !== "sprint", `${controller.snapshot.speed.toFixed(2)} m/s`);
  // Crouch + sprint stays crouch-class.
  input.setMoveVector(0, 1, true);
  input.toggleCrouch();
  for (let i = 0; i < 180; i += 1) controller.update(DT, input, 0, 0.18);
  check("loco: sprint impossible while crouched", controller.snapshot.speed <= T.crouchSpeed + 0.05, `${controller.snapshot.speed.toFixed(2)} m/s`);
}
{
  // Hard turn at speed: continuous position, bounded yaw rate.
  const { controller, input } = makeWalker();
  controller.spawn(5, 9, 0);
  input.setMoveVector(0, 1, true);
  for (let i = 0; i < 120; i += 1) controller.update(DT, input, 0, 0.18);
  input.setMoveVector(-1, 0, true);
  let maxDYaw = 0;
  let prevYaw = controller.yaw;
  let teleported = false;
  let px = controller.position.x;
  let pz = controller.position.z;
  for (let i = 0; i < 120; i += 1) {
    controller.update(DT, input, 0, 0.18);
    const s = controller.snapshot;
    maxDYaw = Math.max(maxDYaw, Math.abs(Math.atan2(Math.sin(s.yaw - prevYaw), Math.cos(s.yaw - prevYaw))));
    prevYaw = s.yaw;
    const step = Math.hypot(controller.position.x - px, controller.position.z - pz);
    if (step > Math.max(s.speed * DT * 2, 0.05) + 1e-6) teleported = true;
    px = controller.position.x;
    pz = controller.position.z;
  }
  check("loco: hard turn never snaps yaw", maxDYaw < 0.25, `max Δyaw=${maxDYaw.toFixed(3)}`);
  check("loco: hard turn never teleports", !teleported);
}
{
  // Turn-in-place: idle + parked off-shoulder camera → shuffle to face it.
  const { controller, input } = makeWalker();
  controller.spawn(5, 9, 0);
  const camYaw = Math.PI / 2;
  let turned = false;
  for (let i = 0; i < 300; i += 1) {
    controller.update(DT, input, camYaw, 0.18);
    if (controller.snapshot.turningInPlace) turned = true;
  }
  const aligned = Math.abs(Math.atan2(Math.sin(camYaw - controller.yaw), Math.cos(camYaw - controller.yaw)));
  check("loco: turn-in-place engages when idle off-shoulder", turned);
  check("loco: turn-in-place converges on the camera heading", aligned < 0.15 && !controller.snapshot.turningInPlace, `err=${aligned.toFixed(3)}`);
}

// ── 3. Jump: takeoff, arc, landing grade, buffer, no double-jump ──────
{
  const { controller, input } = makeWalker();
  controller.spawn(5, 9, 0);
  input.queueJump();
  controller.update(DT, input, 0, 0.18);
  check("jump: takeoff leaves the ground at jump velocity", !controller.isGrounded && controller.snapshot.verticalVel > 4.5, `vy=${controller.snapshot.verticalVel.toFixed(2)}`);
  const air: string[] = [];
  for (let i = 0; i < 240 && !controller.isGrounded; i += 1) {
    controller.update(DT, input, 0, 0.18);
    air.push(controller.snapshot.airborne);
  }
  check("jump: arc passes jump → fall → land", air.includes("jump") && air.includes("fall") && controller.snapshot.airborne === "land", air.filter((v, i) => air.indexOf(v) === i).join("→"));
  check("jump: landing absorb envelope fires", controller.snapshot.landAbsorb > 0.05, `absorb=${controller.snapshot.landAbsorb.toFixed(2)}`);
}
{
  // Buffer: a press just before touchdown jumps on landing.
  const { controller, input } = makeWalker();
  controller.spawn(5, 9, 0);
  input.queueJump();
  for (let i = 0; i < 240 && !controller.isGrounded; i += 1) {
    if (controller.position.y - terrainHeight(controller.position.x, controller.position.z) < 0.35) input.queueJump();
    controller.update(DT, input, 0, 0.18);
  }
  let jumped = controller.snapshot.airborne === "jump";
  for (let i = 0; i < 30; i += 1) {
    controller.update(DT, input, 0, 0.18);
    if (!controller.isGrounded) jumped = true;
  }
  check("jump: buffered press fires on touchdown", jumped);
}
{
  // No double jump once coyote expires.
  const { controller, input } = makeWalker();
  controller.spawn(5, 9, 0);
  input.queueJump();
  controller.update(DT, input, 0, 0.18);
  for (let i = 0; i < 30; i += 1) controller.update(DT, input, 0, 0.18);
  const vyBefore = controller.snapshot.verticalVel;
  input.queueJump();
  controller.update(DT, input, 0, 0.18);
  check("jump: no mid-air double jump", controller.snapshot.verticalVel < vyBefore && !controller.isGrounded);
}

// ── 4. Stance: staged crouch/prone, headroom, prone jump ──────────────
{
  const { controller, input } = makeWalker();
  controller.spawn(5, 9, 0);
  input.setMoveVector(0, 1, true);
  input.toggleCrouch();
  const seq: string[] = [controller.stanceState];
  for (let i = 0; i < 120; i += 1) {
    controller.update(DT, input, 0, 0.18);
    const st = controller.stanceState;
    if (seq[seq.length - 1] !== st) seq.push(st);
  }
  check("stance: stand → crouch stages through a transition", seq.join(",") === "stand,standToCrouch,crouch", seq.join(","));
  check("stance: crouch caps speed at 1.3 m/s", controller.snapshot.speed <= T.crouchSpeed + 0.05, `${controller.snapshot.speed.toFixed(2)} m/s`);
  input.toggleProne();
  seq.length = 0;
  seq.push(controller.stanceState);
  for (let i = 0; i < 240; i += 1) {
    controller.update(DT, input, 0, 0.18);
    const st = controller.stanceState;
    if (seq[seq.length - 1] !== st) seq.push(st);
  }
  check("stance: crouch → prone stages through a transition", seq.join(",") === "crouch,crouchToProne,prone", seq.join(","));
  check("stance: prone blend completes", controller.snapshot.prone01 > 0.99);
}
{
  // Stand → prone passes THROUGH crouch (never faked).
  const { controller, input } = makeWalker();
  controller.spawn(5, 9, 0);
  input.toggleProne();
  const seq: string[] = [controller.stanceState];
  for (let i = 0; i < 300; i += 1) {
    controller.update(DT, input, 0, 0.18);
    const st = controller.stanceState;
    if (seq[seq.length - 1] !== st) seq.push(st);
  }
  check("stance: stand → prone stages via crouch", seq.join(",") === "stand,standToCrouch,crouchToProne,prone", seq.join(","));
}
{
  // No standing up under the desk (top at 0.79 m).
  const { controller, input } = makeWalker();
  const DESK_Z = 2.6 - 1.05;
  controller.spawn(0, DESK_Z, 0);
  input.toggleProne();
  for (let i = 0; i < 300; i += 1) controller.update(DT, input, 0, 0.18);
  input.toggleProne(); // ask to stand…
  const seq: string[] = [controller.stanceState];
  for (let i = 0; i < 300; i += 1) {
    controller.update(DT, input, 0, 0.18);
    const st = controller.stanceState;
    if (seq[seq.length - 1] !== st) seq.push(st);
  }
  check("stance: headroom check denies standing under the desk", !seq.includes("stand") && controller.stanceState === "crouch", seq.join(","));
}
{
  // Jump from prone pops to crouch — never a prone leap.
  const { controller, input } = makeWalker();
  controller.spawn(5, 9, 0);
  input.toggleProne();
  for (let i = 0; i < 300; i += 1) controller.update(DT, input, 0, 0.18);
  input.queueJump();
  for (let i = 0; i < 120; i += 1) controller.update(DT, input, 0, 0.18);
  check("stance: jump from prone becomes crouch, stays grounded", controller.stanceState !== "prone" && controller.isGrounded, controller.stanceState);
}

// ── 5. Grounding, slopes, water, collision ────────────────────────────
{
  // A 10-second meadow walk: feet glued, nothing NaN.
  const { controller, input } = makeWalker();
  controller.spawn(5, 9, 0);
  input.setMoveVector(0.3, 0.9, true);
  let ok = true;
  for (let i = 0; i < 600; i += 1) {
    controller.update(DT, input, -0.4, 0.18);
    const p = controller.position;
    if (!finite(p.x) || !finite(p.y) || !finite(p.z) || !finite(controller.yaw)) ok = false;
    if (controller.isGrounded) {
      const g = terrainHeight(p.x, p.z);
      if (p.y < g - 0.02 || p.y > g + T.groundStickDistance + T.stepOffset + 0.05) ok = false;
    }
    if (Math.abs(p.x) > WORLD_HALF || Math.abs(p.z) > WORLD_HALF) ok = false;
  }
  check("ground: 10 s walk stays glued, bounded and finite", ok, `end=(${controller.position.x.toFixed(1)}, ${controller.position.z.toFixed(1)})`);
}
{
  // The villa wall is solid.
  const { controller, input } = makeWalker();
  controller.spawn(WAREHOUSE_X + WAREHOUSE_HALF_X + 3, WAREHOUSE_Z, Math.PI / 2);
  input.setMoveVector(0, 1, true);
  let inside = false;
  for (let i = 0; i < 240; i += 1) {
    controller.update(DT, input, Math.PI / 2, 0.18);
    if (insideWarehouse(controller.position.x, controller.position.z, -0.1)) inside = true;
  }
  check("collide: the villa wall holds", !inside && controller.position.x > WAREHOUSE_X + WAREHOUSE_HALF_X - 0.6, `x=${controller.position.x.toFixed(2)} (wall at ${(WAREHOUSE_X + WAREHOUSE_HALF_X).toFixed(1)})`);
}
{
  // The test beach house is solid.
  const { controller, input } = makeWalker();
  controller.spawn(120, -80 - 12, Math.PI);
  input.setMoveVector(0, 1, true);
  let inside = false;
  for (let i = 0; i < 240; i += 1) {
    controller.update(DT, input, Math.PI, 0.18);
    if (insideBeachHouse(controller.position.x, controller.position.z, -0.1)) inside = true;
  }
  check("collide: a beach-house wall holds", !inside);
}
{
  // The desk blocks stand/crouch; prone crawls under. Approach from the
  // north — the day bed guards the south side at every stance.
  const DESK_Z = 2.6 - 1.05;
  const { controller, input } = makeWalker();
  controller.spawn(0, DESK_Z - 2.5, Math.PI);
  input.setMoveVector(0, 1, true);
  for (let i = 0; i < 240; i += 1) controller.update(DT, input, Math.PI, 0.18);
  const blockedZ = controller.position.z;
  check("collide: the desk blocks a standing walker", blockedZ > DESK_Z - 2.5 && blockedZ < DESK_Z - 0.4, `z=${blockedZ.toFixed(2)}`);
  input.toggleProne();
  for (let i = 0; i < 300; i += 1) controller.update(DT, input, Math.PI, 0.18);
  for (let i = 0; i < 600; i += 1) controller.update(DT, input, Math.PI, 0.18);
  const proneZ = controller.position.z;
  // Under the desk top but stopped by the day bed behind it: the desk was
  // passed (else z would still be ~0.79) and the bed holds prone bodies.
  check("collide: prone crawls under the desk", proneZ > DESK_Z - 0.4 && proneZ < 1.4, `z=${proneZ.toFixed(2)}`);
}
{
  // Deep river water is a soft wall.
  const { controller, input } = makeWalker();
  controller.spawn(RIVER_CENTER_X + 14, 60, Math.PI / 2);
  input.setMoveVector(0, 1, true);
  let deep = false;
  for (let i = 0; i < 400; i += 1) {
    controller.update(DT, input, Math.PI / 2, 0.18);
    if (sampleGround(controller.position.x, controller.position.z).deepWater) deep = true;
  }
  check("ground: deep water refuses the step", !deep, `x=${controller.position.x.toFixed(1)} (channel at ${RIVER_CENTER_X})`);
}
{
  // Unwalkable slopes cannot be climbed (the body slides instead of sticking).
  let sx = 0;
  let sz = 0;
  for (let x = -900; x < 900 && sx === 0; x += 30) {
    for (let z = -900; z < 900; z += 30) {
      const g = sampleGround(x, z);
      if (g.slope > T.maxWalkableSlope + 0.06) {
        sx = x;
        sz = z;
        break;
      }
    }
  }
  if (sx === 0) {
    check("ground: steep test slope found", false, "no slope > max in scan band");
  } else {
    const { controller, input } = makeWalker();
    controller.spawn(sx, sz, 0);
    const h0 = controller.position.y;
    input.setMoveVector(0, 1, true);
    for (let i = 0; i < 240; i += 1) controller.update(DT, input, 0, 0.18);
    check("ground: cliff faces shed the climber downhill", controller.position.y <= h0 + 0.3, `${h0.toFixed(1)} → ${controller.position.y.toFixed(1)} m`);
  }
}

// ── 6. Animation + foot IK over a jog ────────────────────────────────
{
  const { controller, input } = makeWalker();
  const rig = createRealisticMale(false);
  const anim = new CharacterAnimationController();
  const ik = new FootIKController();
  ik.setQualityTier("HIGH");
  controller.spawn(5, 9, 0);
  input.setMoveVector(0.2, 0.95, true);
  let ok = true;
  let kneeMax = -Infinity;
  for (let i = 0; i < 240; i += 1) {
    controller.update(DT, input, 0, 0.18);
    const snap = controller.snapshot;
    rig.group.position.copy(controller.position);
    rig.group.rotation.y = controller.yaw;
    anim.update(DT, i * DT, snap, rig);
    ik.update(DT, snap, rig, controller.position, controller.yaw);
    rig.group.traverse((o) => {
      if (!finite(o.rotation.x) || !finite(o.rotation.y) || !finite(o.rotation.z)) ok = false;
      if (!finite(o.position.x) || !finite(o.position.y) || !finite(o.position.z)) ok = false;
    });
    kneeMax = Math.max(kneeMax, rig.joints.LeftLeg.rotation.x, rig.joints.RightLeg.rotation.x);
  }
  check("anim+ik: 4 s jog keeps every joint finite", ok);
  check("anim+ik: knees never hyperextend", kneeMax <= 0.02, `max knee=${kneeMax.toFixed(3)}`);
  rig.dispose();
}
{
  // Crouch / prone / air / look poses hit their targets.
  const rig = createRealisticMale(false);
  const anim = new CharacterAnimationController();
  const { controller, input } = makeWalker();
  controller.spawn(5, 9, 0);
  input.toggleCrouch();
  for (let i = 0; i < 120; i += 1) {
    controller.update(DT, input, 0, 0.18);
    anim.update(DT, i * DT, controller.snapshot, rig);
  }
  check("anim: crouch drops the hips and bends the knees", rig.joints.Hips.position.y < 0.7 && rig.joints.LeftLeg.rotation.x < -0.8, `hips=${rig.joints.Hips.position.y.toFixed(2)}`);
  input.toggleProne();
  for (let i = 0; i < 240; i += 1) {
    controller.update(DT, input, 0, 0.18);
    anim.update(DT, i * DT, controller.snapshot, rig);
  }
  check("anim: prone lays the body flat near the dirt", rig.joints.Hips.rotation.x < -1.0 && rig.joints.Hips.position.y < 0.55, `pitch=${rig.joints.Hips.rotation.x.toFixed(2)} y=${rig.joints.Hips.position.y.toFixed(2)}`);
  rig.dispose();
}
{
  // Air pose + look layer from synthetic snapshots.
  const rig = createRealisticMale(false);
  const anim = new CharacterAnimationController();
  const { controller } = makeWalker();
  controller.spawn(5, 9, 0);
  const snap = controller.snapshot;
  snap.grounded = false;
  snap.airborne = "fall";
  snap.air01 = 1;
  snap.airTime = 0.5;
  snap.speed = 2;
  for (let i = 0; i < 90; i += 1) anim.update(DT, i * DT, snap, rig);
  check("anim: falling spreads the arms", rig.joints.LeftArm.rotation.z > 0.3 && rig.joints.RightArm.rotation.z < -0.3);
  snap.grounded = true;
  snap.airborne = "ground";
  snap.speed = 0;
  snap.lookYawOffset = 0.5;
  snap.cameraPitch = 0.2;
  for (let i = 0; i < 90; i += 1) anim.update(DT, i * DT, snap, rig);
  check("anim: idle look layer turns the head to the camera", rig.joints.Head.rotation.y > 0.2, `head yaw=${rig.joints.Head.rotation.y.toFixed(2)}`);
  rig.dispose();
}

// ── 7. Follow camera: floor, walls, FOV ──────────────────────────────
{
  const { controller, input } = makeWalker();
  const cam = new ThirdPersonCameraController();
  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 4000);
  controller.spawn(5, 9, 0);
  cam.snapBehind(controller.yaw, controller.position);
  input.setMoveVector(0.2, 0.95, true);
  input.setSprintToggle(true);
  let ok = true;
  let fovMax = 0;
  for (let i = 0; i < 300; i += 1) {
    controller.update(DT, input, cam.lookYaw, cam.lookPitch);
    cam.update(DT, camera, controller.position, controller.snapshot);
    if (camera.position.y < terrainHeight(camera.position.x, camera.position.z) + 0.15) ok = false;
    if (insideWarehouse(camera.position.x, camera.position.z, 0)) ok = false;
    fovMax = Math.max(fovMax, camera.fov);
  }
  check("camera: 5 s sprint keeps the lens over the dirt and out of walls", ok);
  check("camera: sprint FOV kick stays in range", fovMax > 65 && fovMax <= 65 + T.sprintFovKick + 0.05, `max fov=${fovMax.toFixed(2)}`);
}
{
  // Boom pull-in: a wall between pivot and lens shortens the boom.
  const { controller } = makeWalker();
  const cam = new ThirdPersonCameraController();
  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 4000);
  controller.spawn(WAREHOUSE_X, WAREHOUSE_Z + WAREHOUSE_HALF_Z + 1.4, 0);
  cam.snapBehind(Math.PI, controller.position);
  for (let i = 0; i < 60; i += 1) cam.update(DT, camera, controller.position, controller.snapshot);
  check("camera: the boom never parks the lens inside the villa", !insideWarehouse(camera.position.x, camera.position.z, 0));
}

// ── 8. Input abstraction ─────────────────────────────────────────────
{
  const input = new CharacterInputManager();
  input.setMoveVector(1, 1, true);
  const r = input.read();
  check("input: stick vector is unit-clamped", Math.hypot(r.moveX, r.moveY) <= 1 + 1e-9);
  input.setMoveVector(0.05, 0.05, true);
  const d = input.read();
  check("input: stick dead-zone parks micro drift", d.moveX === 0 && d.moveY === 0);
  input.queueJump();
  check("input: jump edge-trigger fires once", input.consumeJump() === true && input.consumeJump() === false);
  input.toggleCrouch();
  input.toggleProne();
  check("input: stance toggles are edge-triggered", input.consumeCrouchToggle() && input.consumeProneToggle() && !input.consumeCrouchToggle());
}

// ── 9. Determinism ───────────────────────────────────────────────────
{
  const runOnce = () => {
    const { controller, input } = makeWalker();
    const rig = createRealisticMale(false);
    const anim = new CharacterAnimationController();
    const ik = new FootIKController();
    ik.setQualityTier("HIGH");
    controller.spawn(5, 9, 0);
    input.setMoveVector(0.35, 0.9, true);
    let acc = "";
    for (let i = 0; i < 300; i += 1) {
      if (i === 100) input.queueJump();
      if (i === 200) input.toggleCrouch();
      controller.update(DT, input, -0.3 + i * 0.0004, 0.18);
      const snap = controller.snapshot;
      rig.group.position.copy(controller.position);
      rig.group.rotation.y = controller.yaw;
      anim.update(DT, i * DT, snap, rig);
      ik.update(DT, snap, rig, controller.position, controller.yaw);
      if (i % 30 === 0) {
        acc += `${controller.position.x.toFixed(6)},${controller.position.y.toFixed(6)},${controller.position.z.toFixed(6)},${controller.yaw.toFixed(6)},${snap.gaitPhase.toFixed(6)},${rig.joints.LeftLeg.rotation.x.toFixed(6)};`;
      }
    }
    rig.dispose();
    return acc;
  };
  const a = runOnce();
  const b = runOnce();
  check("determinism: locomotion + pose are frame-identical", a === b);
}

console.log(failures === 0 ? "\nALL AVATAR CHECKS PASSED" : `\n${failures} AVATAR CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
