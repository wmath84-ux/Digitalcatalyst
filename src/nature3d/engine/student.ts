// src/nature3d/engine/student.ts
//
// The seated student + the rustic chair.
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

export interface StudentRig {
  group: THREE.Group;
  /** Eye height in world space — the FPP camera anchor when seated. */
  eyePosition: THREE.Vector3;
  update(time: number): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

export function createStudent(budget: QualityBudget): StudentRig {
  const group = new THREE.Group();
  group.name = "student";
  const shadows = budget.shadowMapSize > 0;

  const seatZ = 2.6;
  const groundY = terrainHeight(0, seatZ);
  group.position.set(0, groundY, seatZ);

  const wood = new THREE.MeshStandardMaterial({ color: 0x7c4925, roughness: 0.75, metalness: 0.04 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c49b, roughness: 0.55 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x33200f, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.85 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.82 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x11151c });

  // ── Chair ────────────────────────────────────────────────────────────
  const chair = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.95), wood);
  seat.position.y = 0.78;
  seat.castShadow = shadows;
  seat.receiveShadow = shadows;
  chair.add(seat);
  const legGeo = new THREE.CylinderGeometry(0.042, 0.035, 0.78, 8);
  for (const [x, z] of [[-0.44, -0.35], [0.44, -0.35], [-0.44, 0.35], [0.44, 0.35]] as const) {
    const leg = new THREE.Mesh(legGeo, wood);
    leg.position.set(x, 0.39, z);
    leg.castShadow = shadows;
    chair.add(leg);
  }
  for (const x of [-0.44, 0.44]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 1.05, 8), wood);
    post.position.set(x, 1.25, 0.4);
    post.rotation.x = -0.1;
    post.castShadow = shadows;
    chair.add(post);
  }
  for (const y of [1.05, 1.25, 1.45]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.04), wood);
    slat.position.set(0, y, 0.4 + (y - 1.0) * -0.1);
    slat.rotation.x = -0.1;
    slat.castShadow = shadows;
    chair.add(slat);
  }
  group.add(chair);

  // ── Boy ──────────────────────────────────────────────────────────────
  const boy = new THREE.Group();
  // NO rotation. The boy is authored already facing −Z, which is the board
  // side: his eyes sit at z = −0.19, his thighs run out to z = −0.2 and his
  // arms reach to z = −0.1. The chair's backrest is at z = +0.4, behind him.
  // The old Math.PI spun that finished pose a half turn, so he ended up
  // sitting with his face in the backrest and his back to the board.

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.34, 3, 12), shirt);
  torso.position.set(0, 1.16, 0);
  torso.rotation.x = 0.06;
  torso.castShadow = shadows;
  boy.add(torso);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.62, 0.02);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 18), skin);
  head.scale.set(1, 1.08, 0.96);
  head.castShadow = shadows;
  headGroup.add(head);

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.225, 18, 14, 0, Math.PI * 2, 0, Math.PI / 1.85),
    hair,
  );
  cap.rotation.x = 0.1;
  headGroup.add(cap);
  for (let i = -3; i <= 3; i += 1) {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.13, 5), hair);
    tuft.position.set(i * 0.045, 0.2, -0.05 + Math.abs(i) * 0.015);
    tuft.rotation.set(0.5, 0, i * -0.18);
    headGroup.add(tuft);
  }
  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.075, 0.075]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), dark);
    eye.position.set(x, 0.02, -0.19);
    eye.scale.z = 0.5;
    headGroup.add(eye);
    eyes.push(eye);
  }
  headGroup.rotation.x = 0.1;
  boy.add(headGroup);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.42), shorts);
  hips.position.set(0, 0.87, 0);
  hips.castShadow = shadows;
  boy.add(hips);

  const legPivots: THREE.Group[] = [];
  for (const x of [-0.14, 0.14]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.24, 3, 9), shorts);
    thigh.position.set(x, 0.86, -0.2);
    thigh.rotation.x = Math.PI / 2;
    thigh.castShadow = shadows;
    boy.add(thigh);

    const pivot = new THREE.Group();
    pivot.position.set(x, 0.85, -0.38);
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.28, 3, 9), skin);
    calf.position.y = -0.22;
    calf.castShadow = shadows;
    pivot.add(calf);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.22), shoe);
    foot.position.set(0, -0.42, -0.05);
    foot.castShadow = shadows;
    pivot.add(foot);
    boy.add(pivot);
    legPivots.push(pivot);
  }

  const armPivots: THREE.Group[] = [];
  for (const x of [-0.26, 0.26]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.34, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.3, 3, 9), shirt);
    arm.position.set(0, -0.2, -0.1);
    arm.rotation.x = -0.55;
    arm.castShadow = shadows;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 9, 8), skin);
    hand.position.set(0, -0.4, -0.24);
    pivot.add(hand);
    boy.add(pivot);
    armPivots.push(pivot);
  }

  group.add(boy);

  const eyePosition = new THREE.Vector3(0, groundY + 1.66, seatZ);
  let blink = 3;

  return {
    group,
    eyePosition,
    update(time) {
      if (!group.visible) return;
      const breath = Math.sin(time * 1.9);
      headGroup.position.y = 1.62 + breath * 0.012;
      torso.scale.y = 1 + breath * 0.012;
      headGroup.rotation.y = Math.sin(time * 0.42) * 0.14;
      headGroup.rotation.x = 0.1 + Math.sin(time * 0.31) * 0.05;

      // Idle blink — a 120 ms squash every few seconds.
      blink -= 1 / 60;
      if (blink < 0) {
        const t = -blink;
        const squash = t < 0.12 ? 1 - Math.sin((t / 0.12) * Math.PI) * 0.92 : 1;
        eyes.forEach((e) => { e.scale.y = squash; });
        if (t > 0.12) blink = 2.5 + Math.random() * 3.5;
      }

      const swing = Math.sin(time * 1.5);
      legPivots[0].rotation.x = swing * 0.09;
      legPivots[1].rotation.x = -swing * 0.07;
      armPivots[0].rotation.x = Math.sin(time * 1.2) * 0.04;
      armPivots[1].rotation.x = Math.sin(time * 1.2 + 1) * 0.04;
    },
    setVisible(v) {
      group.visible = v;
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
      group.clear();
    },
  };
}
