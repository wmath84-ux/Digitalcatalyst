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
import type { DaylightState } from "./daylight";
import type { TextureSet } from "./textures";

export interface SkySystem {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Current sun direction, shared (not copied) with everything that reads it. */
  sunDir: THREE.Vector3;
  /**
   * Swap the procedural gradient dome for a baked equirect panorama (or back
   * with `null`). The texture is owned by the caller (cached across toggles);
   * the dome mesh and its material are owned here.
   */
  setAnimeSkybox(map: THREE.Texture | null): void;
  /** Re-light the whole sky for a moment of the day. */
  applyDaylight(state: DaylightState): void;
  setWinter(enabled: boolean): void;
  /** The camera, so the cloud billboards can face the live viewer. */
  update(dt: number, time: number, wind: number, camera: THREE.Camera): void;
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

// Physically-motivated sky, after Preetham/Bruneton but reduced to the two
// terms that actually matter for a morning scene (the full precomputed model
// needs lookup tables we cannot afford here):
//
//   RAYLEIGH  — 1/lambda^4 scattering by air molecules. Blue is scattered
//               ~5.5x more than red, which is why the zenith is blue and why
//               the horizon, seen through far more atmosphere, goes pale.
//   MIE       — forward scattering by aerosols, using the Henyey-Greenstein
//               phase function with g = 0.76. This is the warm halo that
//               hugs the sun and the haze that sits on the horizon.
//
// Everything is analytic: no textures, no lookup tables, ~30 ALU.
const vec3 RAYLEIGH_BETA = vec3(5.8e-3, 1.35e-2, 3.31e-2);

float henyeyGreenstein(float cosTheta, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

void main() {
  vec3 dir = normalize(vWorld);
  float h = dir.y;
  float cosTheta = dot(dir, normalize(uSunDir));

  // Optical depth: looking at the horizon travels through far more air than
  // looking up. The +0.15 keeps it finite below the horizon.
  float zenithAngle = max(h, 0.0);
  float optical = 1.0 / (zenithAngle + 0.15);

  // Rayleigh: the phase function is (1 + cos^2) * 3/16pi.
  float rayleighPhase = 0.0596831 * (1.0 + cosTheta * cosTheta);
  vec3 rayleigh = RAYLEIGH_BETA * optical * rayleighPhase * 62.0;

  // Mie: strong forward lobe, the sun's warm halo.
  float miePhase = henyeyGreenstein(cosTheta, 0.76);
  vec3 mie = vec3(0.0035) * optical * miePhase * 34.0;

  vec3 sky = rayleigh + mie;

  // Keep the art-directed palette in charge of the overall mood — the
  // scattering above supplies the STRUCTURE (gradient, halo, horizon haze),
  // these uniforms supply the colour grade the rest of the scene is lit to.
  vec3 graded = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  // USER DIRECTIVE (sunny afternoon): lean harder on the art-directed
  // saturated blue so the dome reads as a clear afternoon sky, not haze.
  sky = mix(graded, sky * uSunColor, 0.32);

  // Ground haze below the horizon line.
  sky = mix(uGround, sky, smoothstep(-0.12, 0.05, h));

  // Sun disc with a soft limb, plus the broad glow.
  float d = max(cosTheta, 0.0);
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
      // USER DIRECTIVE (sunny afternoon). Saturated afternoon-blue zenith,
      // a bright pale horizon and a green-gold haze below the line so the
      // first frame already reads as a clear sunny day. (daylight.ts
      // re-authors these live.)
      uZenith: { value: new THREE.Color(0x1f7eef) },
      uHorizon: { value: new THREE.Color(0xc8eeff) },
      uGround: { value: new THREE.Color(0xdceec0) },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color(0xfff8e0) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(budget.farPlane * 0.46, 32, 20), domeMat);
  dome.renderOrder = -1000;
  group.add(dome);

  // ── Anime panorama dome (optional) ───────────────────────────────────
  //
  // `sanctuary/skybox_anime_sky.jpg` — the equirect texture pulled out of the
  // Sketchfab "free - skybox anime sky" GLB. The GLB itself is not loaded at
  // runtime: its only content of value is this baked JPEG (the mesh is a
  // bare sphere), and modern three dropped the KHR_materials_pbrSpecular-
  // Glossiness extension the file is authored with, so GLTFLoader would hand
  // back an untextured ball. Drawn instead on OUR sphere with a basic
  // material, which keeps one draw call and lets daylight keep grading it.
  //
  // Nudge this fraction to spin the panorama around the compass (0.25 = 90°).
  const ANIME_SKY_OFFSET_U = 0.0;
  let animeMat: THREE.MeshBasicMaterial | null = null;
  let animeDome: THREE.Mesh | null = null;
  // Kept from the last applyDaylight so a texture arriving mid-session is
  // graded on arrival, not lit like noon for a frame.
  let lastDaylight: DaylightState | null = null;
  const ANIME_DAY = new THREE.Color(0xffffff);
  const ANIME_NIGHT = new THREE.Color(0x2a3550);
  const gradeAnime = (state: DaylightState) => {
    if (!animeMat) return;
    // The panorama is baked at noon: stay true to its art in daylight, lean
    // on the sun's tint near the edges of the day, and sink to a deep blue
    // multiply at night — never glowing at midnight.
    animeMat.color.copy(state.sunTint).lerp(ANIME_DAY, 0.65 * state.dayFactor + 0.1);
    animeMat.color.lerp(ANIME_NIGHT, 1 - state.dayFactor);
  };

  // ── No mountain ring ─────────────────────────────────────────────────
  //
  // There used to be a ring of three-vertex triangles out at the fog line
  // standing in for mountains. From inside the meadow they read exactly like
  // what they were: flat cardboard pyramids. They are gone. The skyline is now
  // REAL terrain — `distantRelief()` in terrain.ts raises eroded, snow-capped
  // ridges out of the same height field as the ground, so the hills have
  // proper silhouettes, catch the fog correctly, and can be walked to.
  const ringRadius = budget.farPlane * 0.3;

  // ── Clouds ───────────────────────────────────────────────────────────
  //
  // THE CHEAP "REAL" CLOUDS — the BGMI way, as asked. No volumetric stuff,
  // no per-pixel shading: ONE fBm-painted cumulus card (see textures.ts)
  // stamped on clustered billboard planes. What makes it read as weather
  // instead of floating white dots:
  //
  //   * CLUSTERS, not singles. Each bank is 3–6 puffs strung along the same
  //     arc at the same height, overlapping edge to edge — a single puff is
  //     a blob, a row of puffs is a cloud bank.
  //   * SIZE SPREAD. Puffs span ~60–180 m and the banks sit at 150–450 m,
  //     so the sky has near clouds and far haze at once (depth).
  //   * CAMERA BILLBOARDING. Every puff faces the viewer, so a bank never
  //     turns paper-thin as the camera orbits — the classic billboard tell.
  //   * A SLIGHT TIP. Each puff is tilted a touch past level so the shaded
  //     BASE of the texture is visible, which is what sells volume.
  const cloudMat = new THREE.MeshBasicMaterial({
    map: tex.cloud,
    transparent: true,
    // Bright tropical cumulus: denser and whiter than the old meadow clouds,
    // so the sky reads as clean fair-weather weather.
    opacity: 0.92,
    depthWrite: false,
    fog: false,
  });
  const cloudGeo = new THREE.PlaneGeometry(1, 1);
  const CLOUD_CLUSTERS = budget.tier === "low" ? 6 : budget.tier === "medium" ? 9 : 12;
  const dummy = new THREE.Object3D();
  const cloudSeeds: Array<{ a: number; r: number; y: number; s: number; drift: number }> = [];
  for (let c = 0; c < CLOUD_CLUSTERS; c += 1) {
    const a0 = (c / CLOUD_CLUSTERS) * Math.PI * 2 + Math.random() * 0.5;
    const r = ringRadius * (0.55 + Math.random() * 0.7);
    const y = ringRadius * (0.15 + Math.random() * 0.22);
    const drift = 0.003 + Math.random() * 0.006;
    const puffs = 3 + Math.floor(Math.random() * 4);
    const step = 0.045 + Math.random() * 0.03; // radians between puff centres
    for (let p = 0; p < puffs; p += 1) {
      const off = p - (puffs - 1) / 2;
      cloudSeeds.push({
        a: a0 + off * step,
        r: r * (1 - Math.abs(off) * 0.012),
        y: y + (Math.random() - 0.5) * 26,
        s: ringRadius * (0.1 + Math.random() * 0.11),
        drift,
      });
    }
  }
  // OVERHEAD BANKS. The far ring sits on the horizon, so a seated student
  // looking straight up at the zenith saw empty blue. These banks live
  // 70–160 m up and 40–220 m out — the patch of sky the desk look-up
  // actually points at.
  const OVERHEAD = budget.tier === "low" ? 4 : 7;
  for (let c = 0; c < OVERHEAD; c += 1) {
    const a0 = (c / OVERHEAD) * Math.PI * 2 + Math.random() * 0.8;
    const r = 48 + Math.random() * 180;
    const y = 78 + Math.random() * 88;
    const drift = 0.004 + Math.random() * 0.008;
    const puffs = 3 + Math.floor(Math.random() * 3);
    const step = 0.08 + Math.random() * 0.05;
    for (let p = 0; p < puffs; p += 1) {
      const off = p - (puffs - 1) / 2;
      cloudSeeds.push({
        a: a0 + off * step,
        r: r * (1 - Math.abs(off) * 0.04),
        y: y + (Math.random() - 0.5) * 18,
        s: 32 + Math.random() * 40,
        drift,
      });
    }
  }
  // ZENITH BANKS. The horizon ring and the mid-sky OVERHEAD banks still
  // leave a hole at the pole: looking straight up (desk look-up, FPP pitch
  // π/2) pointed at empty blue. These sit at small radius / high +Y so they
  // fill that patch. Y is clamped well above the terrain — a flipped vector
  // here parks the cards underground and they vanish.
  const ZENITH = budget.tier === "low" ? 3 : 5;
  for (let c = 0; c < ZENITH; c += 1) {
    const a0 = (c / ZENITH) * Math.PI * 2 + Math.random() * 1.1;
    const r = 6 + Math.random() * 34;
    const y = 210 + Math.random() * 130;
    const drift = 0.003 + Math.random() * 0.006;
    const puffs = 2 + Math.floor(Math.random() * 3);
    const step = 0.12 + Math.random() * 0.08;
    for (let p = 0; p < puffs; p += 1) {
      const off = p - (puffs - 1) / 2;
      cloudSeeds.push({
        a: a0 + off * step,
        r: Math.max(0, r * (1 - Math.abs(off) * 0.05)),
        y: y + (Math.random() - 0.5) * 16,
        s: 36 + Math.random() * 44,
        drift,
      });
    }
  }
  cloudSeeds.push({ a: 0, r: 0, y: 280, s: 52, drift: 0.002 });
  const cloudCount = cloudSeeds.length;
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
  clouds.renderOrder = -850;
  // InstancedMesh frustum-culls against the UNIT plane at the origin. Looking
  // up puts that origin-sphere outside the frustum even though the instances
  // are in the sky, so the whole bank vanished at the zenith.
  clouds.frustumCulled = false;
  cloudGeo.computeBoundingSphere();
  if (cloudGeo.boundingSphere) cloudGeo.boundingSphere.radius = 4000;
  cloudMat.side = THREE.DoubleSide;
  group.add(clouds);
  const CLOUD_WHITE = new THREE.Color(0xffffff);

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
  // USER DIRECTIVE (sunny afternoon): hard clean sun, saturated sky fill,
  // and a ground bounce that is sunlit grass — so every shadow stays a
  // soft green, never mud or black.
  const hemi = new THREE.HemisphereLight(0xd8f4ff, 0x62b032, 1.72);
  const sun = new THREE.DirectionalLight(0xfff8ea, 2.45);
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
  const fill = new THREE.DirectionalLight(0xb8dcff, 0.55);
  fill.position.set(-40, 26, 34);

  group.add(hemi, sun, sun.target, fill);

  return {
    group,
    sun,
    hemi,
    sunDir,
    /**
     * Re-light for a moment of the day.
     *
     * `sunDir` is mutated in place rather than replaced: the water shader and
     * the scene's shadow rig hold a reference to this very vector, so writing
     * through it keeps every consumer in step with no wiring and no per-frame
     * copying. The sun LIGHT is positioned by the scene (it follows the
     * camera so a finite shadow map stays useful) — only its direction,
     * colour and intensity are decided here.
     */
    setWinter(enabled) {
      motes.visible = !enabled;
    },
    setAnimeSkybox(map) {
      if (!map) {
        // Back to the procedural dome. The texture stays cached upstream —
        // toggling off must not cost a re-download on the next on.
        if (animeDome) {
          group.remove(animeDome);
          animeMat?.dispose();
          animeMat = null;
          animeDome = null;
        }
        dome.visible = true;
        return;
      }
      if (animeDome) {
        animeMat!.map = map;
        animeMat!.needsUpdate = true;
      } else {
        animeMat = new THREE.MeshBasicMaterial({
          map,
          side: THREE.BackSide,
          depthWrite: false,
          fog: false,
        });
        map.offset.x = ANIME_SKY_OFFSET_U;
        map.wrapS = THREE.RepeatWrapping;
        // Same sphere as the shader dome (shared geometry, one sphere of
        // VRAM), same draw slot — it REPLACES the dome, never stacks on it.
        animeDome = new THREE.Mesh(dome.geometry, animeMat);
        animeDome.renderOrder = -1000;
        animeDome.frustumCulled = false;
        group.add(animeDome);
        dome.visible = false;
      }
      if (lastDaylight) gradeAnime(lastDaylight);
    },
    applyDaylight(state) {
      lastDaylight = state;
      sunDir.copy(state.sunDir);
      domeMat.uniforms.uSunDir.value.copy(state.sunDir);
      (domeMat.uniforms.uSunColor.value as THREE.Color).copy(state.sunTint);
      (domeMat.uniforms.uZenith.value as THREE.Color).copy(state.zenith);
      (domeMat.uniforms.uHorizon.value as THREE.Color).copy(state.horizon);
      (domeMat.uniforms.uGround.value as THREE.Color).copy(state.ground);

      sun.color.copy(state.sunColor);
      sun.intensity = state.sunIntensity;
      hemi.color.copy(state.hemiSky);
      hemi.groundColor.copy(state.hemiGround);
      hemi.intensity = state.hemiIntensity;
      fill.intensity = state.fillIntensity;
      // Clouds pick up the sun's warmth — pure white at sunset is a dead give-away.
      cloudMat.color.copy(state.sunTint).lerp(CLOUD_WHITE, 0.72);
      // The anime panorama (when enabled) rides the same hour.
      gradeAnime(state);
    },
    update(dt, time, wind, camera) {
      // Cloud banks drift
      for (let i = 0; i < cloudCount; i += 1) {
        const s = cloudSeeds[i];
        s.a += s.drift * dt * (0.6 + wind * 0.5);
        dummy.position.set(
          Math.cos(s.a) * s.r,
          Math.max(40, s.y + Math.sin(time * 0.1 + i) * 1.4),
          Math.sin(s.a) * s.r,
        );
        // Full billboard — Y-locking lookAt left the cards edge-on (and the
        // instanced mesh culled) the moment the camera looked up. Horizon
        // banks still take a slight tip so the shaded base reads; zenith
        // cards skip it so they stay face-on at the pole.
        dummy.lookAt(camera.position);
        if (s.r > 70) dummy.rotateX(-0.1);
        dummy.scale.set(s.s * 2.7, s.s * 1.06, 1);
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
