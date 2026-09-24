// src/nature3d/engine/student.ts
//
// The seated student (his seat — the vintage day bed — is in `dayBed.ts`).
//
// He is the SAME character as the Explore-mode player: this file builds him
// with `createRealisticMale` and holds a seated pose on the rig's own
// joints, so the design (face, hair, tee, joggers, sneakers) can never drift
// from the walker's. Idle life (breath, blink, look-around, leg swing) is
// layered on the same joints every frame.
//
// In THIRD PERSON the boy is fully visible, breathing, blinking, legs
// swinging. The moment FIRST-PERSON mode is entered the whole group is hidden
// (`visible = false`) — exactly as asked: in FPP there is only a camera, no
// body parts swinging in front of the lens, which is also the cheapest and
// smoothest option because the entire character subtree is skipped by the
// renderer and by the animation loop.

import * as THREE from "three";
import type { QualityBudget } from "./quality";
import { terrainHeight } from "./terrain";
import { createRealisticMale, type PlayerRig } from "./character/RealisticMale";

export interface StudentRig {
  group: THREE.Group;
  /** Physical furniture, separate from the learner for seasonal treatments. */
  chair: THREE.Group;
  /** Eye height in world space — the FPP camera anchor when seated. */
  eyePosition: THREE.Vector3;
  update(time: number): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

// Seat surface of the day bed, in metres above the local ground.
const SEAT_TOP = 0.77;

export function createStudent(budget: QualityBudget): StudentRig {
  const group = new THREE.Group();
  group.name = "student";
  const shadows = budget.shadowMapSize > 0;

  const seatZ = 2.6;
  const groundY = terrainHeight(0, seatZ);
  group.position.set(0, groundY, seatZ);

  // ── Seat ────────────────────────────────────────────────────────
  // The old procedural chair (seat + legs + backrest) was replaced by the
  // real Poly Haven "Vintage Day Bed" — see `dayBed.ts`, loaded async in
  // scene.ts and placed around the boy. This group is kept as the named
  // anchor so the StudentRig API (and the winter registration on it) is
  // unchanged.
  const chair = new THREE.Group();
  chair.name = "student-chair";
  group.add(chair);

  // ── Boy: the same rig as the Explore walker, seated ─────────────────
  // NO rotation. The rig faces −Z, which is the board side, exactly like
  // the walker at yaw 0.
  const rig: PlayerRig = createRealisticMale(shadows);
  group.add(rig.group);
  const J = rig.joints;

  // Pelvis parked on the seat (hips box is 0.2 tall, centred on the joint).
  J.Hips.position.set(0, SEAT_TOP + 0.1, 0);
  // Thighs forward, nearly horizontal; calves hang; sneakers level.
  for (const side of ["Left", "Right"] as const) {
    const up = J[`${side}UpLeg`];
    const leg = J[`${side}Leg`];
    up.rotation.set(1.45, 0, side === "Left" ? 0.07 : -0.07);
    leg.rotation.set(-1.42, 0, 0);
    J[`${side}Foot`].rotation.set(0, 0, 0);
    J[`${side}ToeBase`].rotation.set(0, 0, 0);
  }
  // Torso upright with a slight study lean over the knees.
  J.Spine.rotation.set(-0.09, 0, 0);
  J.Spine1.rotation.set(-0.13, 0, 0);
  J.Neck.rotation.set(-0.04, 0, 0);
  J.Head.rotation.set(0.1, 0, 0);
  // Arms reach to the lap: upper arms forward, elbows soft.
  J.LeftShoulder.rotation.set(0, 0, 0.06);
  J.RightShoulder.rotation.set(0, 0, -0.06);
  J.LeftArm.rotation.set(0.52, 0, 0.12);
  J.RightArm.rotation.set(0.52, 0, -0.12);
  J.LeftForeArm.rotation.set(0.55, 0, 0);
  J.RightForeArm.rotation.set(0.55, 0, 0);

  // Eye meshes for the blink (sclera + iris share the eye material).
  const eyeMat = rig.materials[4];
  const eyeMeshes: THREE.Mesh[] = [];
  J.Head.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material === eyeMat) eyeMeshes.push(m);
  });

  const eyePosition = new THREE.Vector3(0, groundY + SEAT_TOP + 0.85, seatZ);
  let blink = 3;

  return {
    group,
    chair,
    eyePosition,
    update(time) {
      if (!group.visible) return;
      const breath = Math.sin(time * 1.9);
      // Breath: chest rise + a touch of head nod.
      J.Spine1.rotation.x = -0.13 + breath * 0.012;
      J.Head.position.y = 0.09 + breath * 0.004;
      J.Head.rotation.y = Math.sin(time * 0.42) * 0.14;
      J.Head.rotation.x = 0.1 + Math.sin(time * 0.31) * 0.05;

      // Idle blink — a 120 ms squash every few seconds.
      blink -= 1 / 60;
      if (blink < 0) {
        const t = -blink;
        const squash = t < 0.12 ? 1 - Math.sin((t / 0.12) * Math.PI) * 0.92 : 1;
        for (const e of eyeMeshes) {
          if (e.userData.sy === undefined) e.userData.sy = e.scale.y;
          e.scale.y = (e.userData.sy as number) * squash;
        }
        if (t > 0.12) blink = 2.5 + Math.random() * 3.5;
      }

      // Dangling feet swing gently (the day bed is bar-height).
      const swing = Math.sin(time * 1.5);
      J.LeftLeg.rotation.x = -1.42 + swing * 0.09;
      J.RightLeg.rotation.x = -1.42 - swing * 0.07;
      J.LeftArm.rotation.x = 0.52 + Math.sin(time * 1.2) * 0.04;
      J.RightArm.rotation.x = 0.52 + Math.sin(time * 1.2 + 1) * 0.04;
    },
    setVisible(v) {
      group.visible = v;
    },
    dispose() {
      rig.dispose();
      group.clear();
    },
  };
}
