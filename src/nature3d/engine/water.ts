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

export function createWater(
  tex: TextureSet,
  budget: QualityBudget,
  /**
   * The live sun direction, SHARED with the sky (same Vector3 instance).
   * The glint has to track the sun or the river would sparkle from the
   * morning position all evening. Holding the reference means the daylight
   * code writes once and this follows for free — no per-frame copy, and the
   * reflection schedule itself is untouched.
   */
  sunDir: THREE.Vector3,
): WaterSystem {
  const group = new THREE.Group();
  group.name = "water";

  // ── River surface ────────────────────────────────────────────────────
  //
  // Technique credits (all open source, re-implemented rather than imported so
  // the page stays dependency-free and keeps its zero-lag budget):
  //
  //   * DUAL-PHASE FLOW, from Valve's "Water Flow in Portal 2" (SIGGRAPH 2010)
  //     and three.js `Water2`/flow-map example. Scrolling a normal map in one
  //     direction makes the texture visibly slide. Instead we sample it TWICE
  //     with two half-cycle-offset phases and cross-fade between them, so the
  //     pattern continuously regenerates and the eye never locks onto a
  //     sliding feature. This single trick is the difference between "blue
  //     plastic moving" and "water flowing".
  //   * SCHLICK FRESNEL with F0 = 0.02 (water's real ~2 % normal reflectance)
  //     plus a GGX-ish sun glint, from the WaterThreeJS ocean. Grazing angles
  //     go mirror-bright, straight-down goes deep and transparent — that
  //     view-dependence is most of what reads as "wet".
  //   * DEPTH TINT via Beer-Lambert: shallow edges are bright turquoise,
  //     the channel centre saturates to deep green-blue.
  //
  // Cost: one extra texture fetch and ~20 ALU in the fragment shader. No
  // render targets, no planar reflection pass, no second camera.
  const RIVER_LENGTH = 1000;
  const riverGeo = new THREE.PlaneGeometry(12.5, RIVER_LENGTH, 1, budget.tier === "low" ? 40 : 140);
  riverGeo.rotateX(-Math.PI / 2);

  const flowTex = tex.water.clone();
  flowTex.needsUpdate = true;
  flowTex.wrapS = THREE.RepeatWrapping;
  flowTex.wrapT = THREE.RepeatWrapping;
  flowTex.repeat.set(3, 24);

  const normTex = tex.waterNormal.clone();
  normTex.needsUpdate = true;
  normTex.wrapS = THREE.RepeatWrapping;
  normTex.wrapT = THREE.RepeatWrapping;

  const riverMat = new THREE.MeshStandardMaterial({
    color: 0x2f7fae,
    roughness: 0.14,
    metalness: 0.42,
    transparent: true,
    opacity: 0.9,
    map: flowTex,
    envMapIntensity: 1.2,
  });
  riverMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uFlowMap = { value: normTex };
    shader.uniforms.uSunDir = { value: sunDir };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec3 vDcWorld;")
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        // Two crossing wave trains give a convincing current without a
        // simulation. Amplitude is tiny so it never breaks the shoreline.
        transformed.y += sin(transformed.z * 0.6 + uTime * 2.4) * 0.045
                       + sin(transformed.x * 1.3 - uTime * 1.7) * 0.025;
        vDcWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform sampler2D uFlowMap;
        uniform vec3 uSunDir;
        varying vec3 vDcWorld;
        `,
      )
      .replace(
        "#include <dithering_fragment>",
        /* glsl */ `
        #include <dithering_fragment>

        // ── Dual-phase flow (Portal 2 / three.js Water2) ────────────────
        vec2 dcUv = vDcWorld.xz * vec2(0.09, 0.055);
        vec2 dcFlow = vec2(0.06, 0.85);          // downstream direction
        float dcCycle = 0.22;
        float dcHalf = 0.5;
        float dcPhase0 = fract(uTime * dcCycle);
        float dcPhase1 = fract(uTime * dcCycle + dcHalf);
        vec3 dcN0 = texture2D(uFlowMap, dcUv - dcFlow * dcPhase0).rgb;
        vec3 dcN1 = texture2D(uFlowMap, dcUv * 1.37 + 0.37 - dcFlow * dcPhase1).rgb;
        // Triangle wave cross-fade: each sample is swapped out exactly when
        // it has drifted furthest, so no frame ever shows a sliding seam.
        float dcMix = abs((dcPhase0 - dcHalf) / dcHalf);
        vec3 dcNrm = normalize(mix(dcN0, dcN1, dcMix) * 2.0 - 1.0);
        vec3 dcNormal = normalize(vec3(dcNrm.x * 0.45, 1.0, dcNrm.y * 0.45));

        vec3 dcView = normalize(cameraPosition - vDcWorld);

        // ── Schlick Fresnel, F0 = 0.02 ──────────────────────────────────
        float dcCos = clamp(dot(dcView, dcNormal), 0.0, 1.0);
        float dcFres = 0.02 + 0.98 * pow(1.0 - dcCos, 5.0);

        // ── Depth tint (Beer-Lambert): shallow bright, deep saturated ───
        vec3 dcShallow = vec3(0.34, 0.72, 0.74);
        vec3 dcDeep    = vec3(0.03, 0.17, 0.28);
        float dcDepth = smoothstep(0.0, 4.2, abs(vDcWorld.x - ${RIVER_CENTER_X.toFixed(1)}));
        vec3 dcBody = mix(dcDeep, dcShallow, dcDepth);

        // ── Sky reflection + GGX-ish sun glint ──────────────────────────
        vec3 dcSky = mix(vec3(0.72, 0.85, 0.95), vec3(0.20, 0.44, 0.78), 0.45);
        vec3 dcH = normalize(dcView + uSunDir);
        float dcSpec = pow(max(dot(dcNormal, dcH), 0.0), 220.0) * 2.4;

        vec3 dcCol = mix(dcBody, dcSky, dcFres) + dcSpec;
        // Whitewater where the surface is steep (riffles over the bed).
        dcCol += smoothstep(0.55, 1.0, abs(dcNrm.x) + abs(dcNrm.y)) * 0.12;

        gl_FragColor.rgb = mix(gl_FragColor.rgb, dcCol, 0.82);
        gl_FragColor.a = mix(0.72, 0.97, dcFres);
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
    new THREE.PlaneGeometry(13.5, RIVER_LENGTH + 2),
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

  // ── Waterfall sheet ──────────────────────────────────────────────────
  //
  // A single scrolling plane reads as a flat curtain. Three cheap additions
  // fix that, all in the fragment shader:
  //   * two vertically-scrolling samples at different speeds and scales, so
  //     the water has fast surface streaks over a slower body;
  //   * the sheet goes from clear at the lip to churned white at the base,
  //     which is what a real fall does as it entrains air;
  //   * vertical streak noise so it breaks into ropes instead of a sheet.
  const fallTex = tex.water.clone();
  fallTex.needsUpdate = true;
  fallTex.wrapS = THREE.RepeatWrapping;
  fallTex.wrapT = THREE.RepeatWrapping;
  fallTex.repeat.set(1.4, 5);
  const fallMat = new THREE.MeshStandardMaterial({
    map: fallTex,
    color: 0xe8f6ff,
    transparent: true,
    opacity: 0.9,
    roughness: 0.16,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  fallMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTime;\nuniform sampler2D map;",
      )
      .replace(
        "#include <dithering_fragment>",
        /* glsl */ `
        #include <dithering_fragment>
        // vMapUv.y runs 0 at the base to 1 at the lip.
        float dcDrop = 1.0 - vMapUv.y;

        // Two speeds: a fast surface streak over a slower body.
        float dcA = texture2D(map, vMapUv * vec2(1.0, 2.0) + vec2(0.0, -uTime * 1.9)).r;
        float dcB = texture2D(map, vMapUv * vec2(2.3, 3.7) + vec2(0.13, -uTime * 3.1)).r;

        // Vertical ropes — a fall separates into strands, it is not a sheet.
        float dcRope = 0.55 + 0.45 * sin(vMapUv.x * 46.0 + dcA * 5.0);

        // Aeration: clear at the lip, churned white at the base.
        float dcFoam = smoothstep(0.25, 1.0, dcDrop);
        vec3 dcCol = mix(vec3(0.62, 0.82, 0.93), vec3(1.0), dcFoam * 0.9 + dcB * 0.25);

        gl_FragColor.rgb = mix(gl_FragColor.rgb, dcCol * (0.72 + dcRope * 0.4), 0.85);
        gl_FragColor.a *= clamp(0.45 + dcDrop * 0.75 + dcB * 0.2, 0.0, 1.0);
        `,
      );
    fallMat.userData.shader = shader;
  };
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 19, 1, 10), fallMat);
  fall.position.set(RIVER_CENTER_X, 5.4, -37.4);
  group.add(fall);

  // ── Spray ────────────────────────────────────────────────────────────
  //
  // The old cloud drifted straight up and teleported back down, which reads
  // as rising smoke, not splash. Real plunge-pool spray bursts UP and OUTWARD
  // from the impact point, slows under gravity, then falls back — so each
  // particle now carries a small ballistic velocity and is respawned at the
  // impact point when it lands. Still one draw call and one typed-array loop.
  const count = budget.waterfallParticles;
  const IMPACT_X = RIVER_CENTER_X;
  const IMPACT_Y = -1.2;
  const IMPACT_Z = -36.4;
  const pGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const life = new Float32Array(count);

  const seedParticle = (i: number) => {
    // Burst from a small disc at the foot of the fall.
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 2.6;
    positions[i * 3] = IMPACT_X + Math.cos(a) * r;
    positions[i * 3 + 1] = IMPACT_Y + Math.random() * 0.5;
    positions[i * 3 + 2] = IMPACT_Z + Math.sin(a) * r * 0.7;
    // Up and outward, biased downstream.
    const speed = 1.6 + Math.random() * 2.8;
    velocities[i * 3] = Math.cos(a) * (0.5 + Math.random() * 1.1);
    velocities[i * 3 + 1] = speed;
    velocities[i * 3 + 2] = Math.sin(a) * (0.4 + Math.random() * 0.9) + 0.7;
    life[i] = 0.7 + Math.random() * 1.9;
  };
  for (let i = 0; i < count; i += 1) {
    seedParticle(i);
    // Stagger the first cycle so they do not all burst on frame one.
    life[i] *= Math.random();
  }

  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const spray = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      map: tex.cloud,
      color: 0xffffff,
      size: 0.62,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    }),
  );
  spray.frustumCulled = false;
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
      const fallShader = fallMat.userData.shader as { uniforms: Record<string, { value: number }> } | undefined;
      if (fallShader) fallShader.uniforms.uTime.value = time;

      // Ballistic spray: integrate, apply gravity and drag, respawn on death.
      const arr = attr.array as Float32Array;
      const g = 6.4 * dt;
      const drag = 1 - 0.9 * dt;
      for (let i = 0; i < count; i += 1) {
        life[i] -= dt;
        const p = i * 3;
        if (life[i] <= 0 || arr[p + 1] < IMPACT_Y - 0.6) {
          seedParticle(i);
          arr[p] = positions[p];
          arr[p + 1] = positions[p + 1];
          arr[p + 2] = positions[p + 2];
          continue;
        }
        velocities[p + 1] -= g;
        velocities[p] *= drag;
        velocities[p + 2] *= drag;
        arr[p] += velocities[p] * dt;
        arr[p + 1] += velocities[p + 1] * dt;
        arr[p + 2] += velocities[p + 2] * dt;
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
