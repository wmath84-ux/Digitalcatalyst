// src/nature3d/engine/water.ts
//
// River, waterfall and the splash mist.
//
// The river surface is a single plane whose NORMAL MAP scrolls in two
// directions at different speeds — the classic, nearly-free way to fake
// flowing water. Real vertex displacement is added only in the near band
// (a shader-side sine, not a CPU loop).
//
// The waterfall sheet scrolls a second copy of the same texture vertically and
// the spray is one `Points` cloud updated with a typed-array loop that touches
// only Y (never allocates).

import * as THREE from "three";
import type { QualityBudget } from "./quality";
import { RIVER_CENTER_X, WATER_LEVEL } from "./terrain";
import type { TextureSet } from "./textures";

export interface WaterSystem {
  group: THREE.Group;
  update(dt: number, time: number): void;
  dispose(): void;
}

export function createWater(tex: TextureSet, budget: QualityBudget): WaterSystem {
  const group = new THREE.Group();
  group.name = "water";

  // ── River surface ────────────────────────────────────────────────────
  const riverGeo = new THREE.PlaneGeometry(12.5, 150, 1, budget.tier === "low" ? 20 : 60);
  riverGeo.rotateX(-Math.PI / 2);

  const flowTex = tex.water.clone();
  flowTex.needsUpdate = true;
  flowTex.wrapS = THREE.RepeatWrapping;
  flowTex.wrapT = THREE.RepeatWrapping;
  flowTex.repeat.set(3, 24);

  const riverMat = new THREE.MeshStandardMaterial({
    color: 0x2f7fae,
    roughness: 0.14,
    metalness: 0.42,
    transparent: true,
    opacity: 0.88,
    map: flowTex,
    envMapIntensity: 1.2,
  });
  riverMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        // Two crossing wave trains give a convincing current without a
        // simulation. Amplitude is tiny so it never breaks the shoreline.
        transformed.y += sin(transformed.z * 0.6 + uTime * 2.4) * 0.045
                       + sin(transformed.x * 1.3 - uTime * 1.7) * 0.025;
        `,
      );
    riverMat.userData.shader = shader;
  };

  const river = new THREE.Mesh(riverGeo, riverMat);
  river.position.set(RIVER_CENTER_X, WATER_LEVEL, 0);
  river.renderOrder = 1;
  group.add(river);

  // Wet, dark riverbed under the translucent surface.
  const bed = new THREE.Mesh(
    new THREE.PlaneGeometry(13.5, 152),
    new THREE.MeshLambertMaterial({ map: tex.rock, color: 0x4a5450 }),
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(RIVER_CENTER_X, WATER_LEVEL - 0.75, 0);
  group.add(bed);

  // ── Cliff + waterfall ────────────────────────────────────────────────
  const cliffGeo = new THREE.BoxGeometry(20, 20, 16, 3, 3, 3);
  const cliffPos = cliffGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cliffPos.count; i += 1) {
    cliffPos.setXYZ(
      i,
      cliffPos.getX(i) + (Math.random() - 0.5) * 1.8,
      cliffPos.getY(i) + (Math.random() - 0.5) * 1.4,
      cliffPos.getZ(i) + (Math.random() - 0.5) * 1.8,
    );
  }
  cliffGeo.computeVertexNormals();
  const cliff = new THREE.Mesh(
    cliffGeo,
    new THREE.MeshStandardMaterial({
      map: tex.rock,
      normalMap: tex.rockNormal,
      color: 0x8e9792,
      roughness: 0.95,
      metalness: 0.02,
      flatShading: true,
    }),
  );
  cliff.position.set(RIVER_CENTER_X, 7, -46);
  cliff.castShadow = budget.shadowMapSize > 0;
  cliff.receiveShadow = budget.shadowMapSize > 0;
  group.add(cliff);

  const fallTex = tex.water.clone();
  fallTex.needsUpdate = true;
  fallTex.wrapS = THREE.RepeatWrapping;
  fallTex.wrapT = THREE.RepeatWrapping;
  fallTex.repeat.set(1.4, 5);
  const fallMat = new THREE.MeshStandardMaterial({
    map: fallTex,
    color: 0xe8f6ff,
    transparent: true,
    opacity: 0.86,
    roughness: 0.16,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 19, 1, 10), fallMat);
  fall.position.set(RIVER_CENTER_X, 5.4, -37.4);
  group.add(fall);

  // ── Spray ────────────────────────────────────────────────────────────
  const count = budget.waterfallParticles;
  const pGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = RIVER_CENTER_X + (Math.random() - 0.5) * 7;
    positions[i * 3 + 1] = -1.2 + Math.random() * 3.2;
    positions[i * 3 + 2] = -36.4 + (Math.random() - 0.5) * 4.5;
    velocities[i] = 0.6 + Math.random() * 1.6;
  }
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const spray = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      map: tex.cloud,
      color: 0xffffff,
      size: 0.6,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    }),
  );
  group.add(spray);

  const attr = pGeo.attributes.position as THREE.BufferAttribute;

  return {
    group,
    update(dt, time) {
      const shader = riverMat.userData.shader as { uniforms: Record<string, { value: number }> } | undefined;
      if (shader) shader.uniforms.uTime.value = time;

      // Scrolling UVs = flowing water, one float per frame.
      flowTex.offset.y = (time * 0.28) % 1;
      flowTex.offset.x = Math.sin(time * 0.15) * 0.04;
      fallTex.offset.y = (-time * 1.35) % 1;

      const arr = attr.array as Float32Array;
      for (let i = 0; i < count; i += 1) {
        const yi = i * 3 + 1;
        arr[yi] += velocities[i] * dt * 0.8;
        if (arr[yi] > 2.6) arr[yi] = -1.3;
      }
      attr.needsUpdate = true;
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose?.();
      });
      flowTex.dispose();
      fallTex.dispose();
      group.clear();
    },
  };
}
