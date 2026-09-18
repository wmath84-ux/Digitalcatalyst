// src/nature3d/engine/sky.ts
//
// Sky dome, the 360° mountain ring, clouds, sun shafts and the drifting
// leaf/pollen motes — everything that lives above the horizon line.
//
// The dome is a single BackSide sphere with a shader gradient (no texture
// upload, no banding), and the mountains are ONE merged geometry so the whole
// panorama costs a single draw call.

import * as THREE from "three";
import type { QualityBudget } from "./quality";
import type { TextureSet } from "./textures";

export interface SkySystem {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  update(dt: number, time: number, wind: number): void;
  dispose(): void;
}

const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
varying vec3 vWorld;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;

void main() {
  float h = vWorld.y;
  // Two-stage gradient: warm haze near the horizon, deep blue overhead.
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  sky = mix(uGround, sky, smoothstep(-0.12, 0.05, h));

  // Sun disc + broad glow, the thing that makes a gradient read as morning.
  float d = max(dot(normalize(vWorld), normalize(uSunDir)), 0.0);
  sky += uSunColor * pow(d, 900.0) * 3.2;
  sky += uSunColor * pow(d, 14.0) * 0.30;
  sky += uSunColor * pow(d, 3.0) * 0.07;

  gl_FragColor = vec4(sky, 1.0);
  #include <colorspace_fragment>
}
`;

export function createSky(tex: TextureSet, budget: QualityBudget): SkySystem {
  const group = new THREE.Group();
  group.name = "sky";

  const sunDir = new THREE.Vector3(0.62, 0.34, -0.7).normalize();

  // ── Dome ─────────────────────────────────────────────────────────────
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x2a6ec4) },
      uHorizon: { value: new THREE.Color(0xbfe0f5) },
      uGround: { value: new THREE.Color(0xd9c9a8) },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color(0xfff0cf) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(budget.farPlane * 0.46, 32, 20), domeMat);
  dome.renderOrder = -1000;
  group.add(dome);

  // ── Mountain ring (merged, 1 draw call) ──────────────────────────────
  const ringRadius = budget.farPlane * 0.3;
  const peakCount = budget.tier === "low" ? 18 : 30;
  const verts: number[] = [];
  const cols: number[] = [];
  const snow = new THREE.Color(0xf2f7ff);
  const rockHi = new THREE.Color(0x8fa1ae);
  const rockLo = new THREE.Color(0x3c5a44);
  const tmp = new THREE.Color();

  for (let i = 0; i < peakCount; i += 1) {
    const a0 = (i / peakCount) * Math.PI * 2;
    const a1 = ((i + 1) / peakCount) * Math.PI * 2;
    const r0 = ringRadius * (0.9 + Math.random() * 0.25);
    const r1 = ringRadius * (0.9 + Math.random() * 0.25);
    const h = ringRadius * (0.16 + Math.random() * 0.2);
    const mid = (a0 + a1) / 2;
    const rm = (r0 + r1) / 2 * (0.94 + Math.random() * 0.12);

    const p0 = [Math.cos(a0) * r0, -4, Math.sin(a0) * r0];
    const p1 = [Math.cos(a1) * r1, -4, Math.sin(a1) * r1];
    const peak = [Math.cos(mid) * rm, h, Math.sin(mid) * rm];
    verts.push(...p0, ...p1, ...peak);

    tmp.copy(rockLo);
    cols.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
    tmp.copy(h > ringRadius * 0.27 ? snow : rockHi);
    cols.push(tmp.r, tmp.g, tmp.b);

    // A second, taller ridge behind for depth.
    if (i % 2 === 0) {
      const back = ringRadius * 1.28;
      const hb = ringRadius * (0.22 + Math.random() * 0.24);
      verts.push(
        Math.cos(a0) * back, -4, Math.sin(a0) * back,
        Math.cos(a1) * back, -4, Math.sin(a1) * back,
        Math.cos(mid) * back, hb, Math.sin(mid) * back,
      );
      tmp.set(0x6d8698);
      cols.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
      tmp.copy(snow);
      cols.push(tmp.r, tmp.g, tmp.b);
    }
  }
  const ridgeGeo = new THREE.BufferGeometry();
  ridgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  ridgeGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  ridgeGeo.computeVertexNormals();
  const ridge = new THREE.Mesh(
    ridgeGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }),
  );
  ridge.renderOrder = -900;
  group.add(ridge);

  // ── Clouds ───────────────────────────────────────────────────────────
  const cloudMat = new THREE.MeshBasicMaterial({
    map: tex.cloud,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: false,
  });
  const cloudGeo = new THREE.PlaneGeometry(1, 1);
  const cloudCount = budget.tier === "low" ? 14 : 30;
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
  const dummy = new THREE.Object3D();
  const cloudSeeds: Array<{ a: number; r: number; y: number; s: number; drift: number }> = [];
  for (let i = 0; i < cloudCount; i += 1) {
    cloudSeeds.push({
      a: Math.random() * Math.PI * 2,
      r: ringRadius * (0.55 + Math.random() * 0.8),
      y: ringRadius * (0.18 + Math.random() * 0.3),
      s: ringRadius * (0.1 + Math.random() * 0.18),
      drift: 0.004 + Math.random() * 0.008,
    });
  }
  clouds.renderOrder = -850;
  group.add(clouds);

  // ── Volumetric sun shafts ────────────────────────────────────────────
  let shafts: THREE.Group | null = null;
  if (budget.sunShafts) {
    shafts = new THREE.Group();
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0xfff6dd,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const shaftGeo = new THREE.CylinderGeometry(1.4, 7.5, 60, 10, 1, true);
    for (let i = 0; i < 5; i += 1) {
      const m = new THREE.Mesh(shaftGeo, shaftMat);
      m.position.set(16 + i * 5, 22, -16 + i * 4);
      m.rotation.set(0.6, 0, -0.46);
      shafts.add(m);
    }
    group.add(shafts);
  }

  // ── Drifting leaves / pollen motes ───────────────────────────────────
  const moteCount = budget.driftingLeaves;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i += 1) {
    motePos[i * 3] = (Math.random() - 0.5) * 60;
    motePos[i * 3 + 1] = 0.6 + Math.random() * 6;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      map: tex.leaf,
      color: 0xd8e9a8,
      size: 0.4,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      alphaTest: 0.25,
    }),
  );
  group.add(motes);
  const moteAttr = moteGeo.attributes.position as THREE.BufferAttribute;

  // ── Lights ───────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xfff4e2, 0x4a6b33, 1.05);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.35);
  sun.position.copy(sunDir).multiplyScalar(70);
  if (budget.shadowMapSize > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(budget.shadowMapSize);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 190;
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
  }
  const fill = new THREE.DirectionalLight(0xa8d6ff, 0.5);
  fill.position.set(-40, 26, 34);

  group.add(hemi, sun, sun.target, fill);

  return {
    group,
    sun,
    hemi,
    update(dt, time, wind) {
      // Clouds drift
      for (let i = 0; i < cloudCount; i += 1) {
        const s = cloudSeeds[i];
        s.a += s.drift * dt * (0.6 + wind * 0.5);
        dummy.position.set(Math.cos(s.a) * s.r, s.y + Math.sin(time * 0.1 + i) * 1.4, Math.sin(s.a) * s.r);
        dummy.lookAt(0, s.y * 0.4, 0);
        dummy.scale.set(s.s * 2.4, s.s, 1);
        dummy.updateMatrix();
        clouds.setMatrixAt(i, dummy.matrix);
      }
      clouds.instanceMatrix.needsUpdate = true;

      // Motes drift downwind and respawn upwind
      const arr = moteAttr.array as Float32Array;
      for (let i = 0; i < moteCount; i += 1) {
        const xi = i * 3;
        arr[xi] += (1.1 + (i % 5) * 0.2) * dt * wind;
        arr[xi + 1] -= (0.12 + (i % 3) * 0.05) * dt;
        arr[xi + 2] += Math.sin(time * 0.6 + i) * dt * 0.3;
        if (arr[xi] > 32 || arr[xi + 1] < 0.2) {
          arr[xi] = -32;
          arr[xi + 1] = 1.5 + Math.random() * 5;
          arr[xi + 2] = (Math.random() - 0.5) * 60;
        }
      }
      moteAttr.needsUpdate = true;

      if (shafts) shafts.rotation.y = Math.sin(time * 0.04) * 0.03;
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose?.();
      });
      group.clear();
    },
  };
}
