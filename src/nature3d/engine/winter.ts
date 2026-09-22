// A reversible seasonal layer, independent of the daylight clock.
// Materials keep their original colours/textures. One shared uniform turns
// snow on/off without rebuilding meshes or recompiling shaders on each click.
import * as THREE from "three";
import { injectWorldVaryings } from "./atmosphere";
import type { DaylightState } from "./daylight";
import type { QualityTier } from "./quality";
import { terrainHeight } from "./terrain";

type Surface = "ground" | "foliage" | "solid" | "ice" | "board";

/** Apply to a fresh daylight state; never change its hour or sun direction. */
export function winterDaylight(state: DaylightState): DaylightState {
  state.zenith.lerp(new THREE.Color(0x759bbd), 0.7);
  state.horizon.lerp(new THREE.Color(0xdceaf2), 0.8);
  state.ground.set(0xb9ccdd);
  state.fog.lerp(new THREE.Color(0xcbdde9), 0.8);
  state.hemiSky.lerp(new THREE.Color(0xd5e8ff), 0.65);
  state.hemiGround.set(0xb0c4db);
  state.sunColor.lerp(new THREE.Color(0xe2efff), 0.55);
  state.sunTint.lerp(new THREE.Color(0xe2efff), 0.55);
  state.sunIntensity *= 0.8;
  state.exposure *= 0.91;
  return state;
}

export function createWinter(tier: QualityTier) {
  const amount = { value: 0 };
  const registered = new WeakSet<THREE.Material>();
  const group = new THREE.Group();
  group.name = "ice-age-snowfall";
  group.visible = false;

  function register(material: THREE.Material, surface: Surface = "solid") {
    // Leave unlit screen backings, contact decals and living characters alone.
    // Furniture and board frames opt in independently from their content.
    if (registered.has(material) || !(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshLambertMaterial)) return;
    registered.add(material);
    const previous = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      injectWorldVaryings(shader);
      shader.uniforms.uIceAge = amount;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        "#include <common>\nuniform float uIceAge;",
      );
      if (surface === "ice") {
        // After the water's reflection/glint pass, before tone mapping and fog.
        // World-space veins remain still when the flow clock is frozen.
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <tonemapping_fragment>",
          /* glsl */ `
          float iceVein = pow(1.0 - abs(sin(vDcWorldPos.x * 0.7 + sin(vDcWorldPos.z * 0.38) * 2.0)), 18.0);
          float iceGrain = sin(vDcWorldPos.x * 3.1) * sin(vDcWorldPos.z * 2.7) * 0.025;
          vec3 iceColor = mix(vec3(0.32, 0.57, 0.70), vec3(0.78, 0.88, 0.94), iceVein * 0.7) + iceGrain;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, iceColor + gl_FragColor.rgb * 0.12, uIceAge);
          gl_FragColor.a = mix(gl_FragColor.a, 0.96, uIceAge);
          #include <tonemapping_fragment>
          `,
        );
      } else {
        // Even vertical cliffs, chair legs and board backs carry blue rime.
        // Upward faces accumulate powder; exposed sides show glacial ice.
        const floor = surface === "ground" ? "0.86" : surface === "foliage" ? "0.78" : "0.62";
        const boardMask = surface === "board" ? /* glsl */ `
          // Only the UV perimeter frosts over: preserve every word in the middle.
          #ifdef USE_MAP
            vec2 frostEdge = min(vMapUv, 1.0 - vMapUv);
            snowCover *= 1.0 - smoothstep(0.005, 0.045, min(frostEdge.x, frostEdge.y));
          #else
            snowCover = 0.0;
          #endif
        ` : "";
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          /* glsl */ `
          float snowUp = smoothstep(0.08, 0.72, normalize(vDcWorldNormal).y);
          float snowCover = uIceAge * mix(${floor}, 1.0, snowUp);
          ${boardMask}
          float snowGrain = sin(vDcWorldPos.x * 2.4 + sin(vDcWorldPos.z * 1.8)) * 0.025;
          float icePatch = smoothstep(0.15, 0.65,
            sin(vDcWorldPos.x * 0.19 + sin(vDcWorldPos.z * 0.13)) * cos(vDcWorldPos.z * 0.21));
          float glaze = max((1.0 - snowUp) * 0.75, icePatch * 0.65);
          vec3 snowColor = mix(vec3(0.79, 0.87, 0.93), vec3(0.40, 0.66, 0.82), glaze) + snowGrain;
          diffuseColor.rgb = mix(diffuseColor.rgb, snowColor, snowCover);
          #ifdef STANDARD
            roughnessFactor = mix(roughnessFactor, mix(0.93, 0.18, glaze), snowCover);
            metalnessFactor *= 1.0 - snowCover;
          #endif
          #include <emissivemap_fragment>
          `,
        );
      }
    };
    material.customProgramCacheKey = () => `${cacheKey}|winter-v2:${surface}`;
    material.needsUpdate = true;
  }

  function registerTree(root: THREE.Object3D, surface: Surface = "solid") {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => register(material, surface));
    });
  }

  // A single GPU-animated particle draw; no per-flake JS or texture downloads.
  const count = tier === "low" ? 450 : tier === "medium" ? 900 : 1600;
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(seeds, 3));
  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: 1 },
    uCenter: { value: new THREE.Vector3() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWind;
      uniform vec3 uCenter;
      varying float vFade;
      void main() {
        vec3 p = position * vec3(130.0, 70.0, 130.0);
        p.x = mod(p.x + uTime * uWind * 2.6 + sin(uTime * 0.7 + position.y * 20.0) * uWind * 2.0 - uCenter.x, 130.0) - 65.0;
        p.z = mod(p.z + sin(uTime * 0.3 + position.x * 30.0) * 2.0 - uCenter.z, 130.0) - 65.0;
        p.y = mod(p.y - uTime * (1.8 + position.z * 1.7) - uCenter.y, 70.0) - 35.0;
        vFade = (1.0 - smoothstep(45.0, 65.0, length(p.xz))) * (1.0 - smoothstep(25.0, 35.0, abs(p.y)));
        vec4 mv = viewMatrix * vec4(p + uCenter, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(160.0 / max(1.0, -mv.z), 1.3, 5.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vFade;
      void main() {
        float radius = length(gl_PointCoord - 0.5);
        float alpha = (1.0 - smoothstep(0.15, 0.5, radius)) * vFade * 0.8;
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(0.9, 0.96, 1.0, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const snow = new THREE.Points(geometry, material);
  snow.frustumCulled = false; // Shader positions follow the viewer, not seed bounds.
  group.add(snow);

  // Low wind-blown powder hugs the actual terrain (including highland slopes)
  // instead of following the camera's altitude. One extra draw, sampled at
  // 10 Hz with preallocated arrays; no extra terrain meshes or render passes.
  const dustCount = tier === "low" ? 96 : tier === "medium" ? 192 : 320;
  const dustSeeds = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustSeeds.length; i += 1) dustSeeds[i] = Math.random();
  const dustPositions = new Float32Array(dustCount * 3);
  const dustGeometry = new THREE.BufferGeometry();
  const dustAttribute = new THREE.BufferAttribute(dustPositions, 3);
  dustAttribute.setUsage(THREE.DynamicDrawUsage);
  dustGeometry.setAttribute("position", dustAttribute);
  const dustMaterial = new THREE.PointsMaterial({
    color: 0xe2f4ff, size: 1.6, transparent: true, opacity: 0.30,
    depthWrite: false, sizeAttenuation: true,
  });
  dustMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vPowderFade;")
      .replace("#include <begin_vertex>", `
        #include <begin_vertex>
        vPowderFade = 1.0 - smoothstep(40.0, 60.0, length(position.xz - cameraPosition.xz));
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vPowderFade;")
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        vec2 powder = (gl_PointCoord - 0.5) * vec2(1.0, 2.8);
        diffuseColor.a *= (1.0 - smoothstep(0.05, 0.5, length(powder))) * vPowderFade;
        if (diffuseColor.a < 0.01) discard;
      `);
  };
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.name = "wind-blown-snow-dust";
  dust.frustumCulled = false;
  group.add(dust);
  let dustClock = 0.1;
  const dustCenter = new THREE.Vector3(Infinity, Infinity, Infinity);
  const wrap = (value: number) => ((value % 120) + 120) % 120 - 60;

  return {
    group,
    register,
    registerTree,
    setEnabled(enabled: boolean) {
      amount.value = enabled ? 1 : 0;
      group.visible = enabled;
      dustClock = 0.1; // Populate immediately after re-enabling, even if paused.
    },
    update(dt: number, camera: THREE.Camera, wind: number, reducedMotion = false) {
      if (!group.visible) return;
      if (!reducedMotion) uniforms.uTime.value += dt;
      uniforms.uCenter.value.copy(camera.position);
      uniforms.uWind.value = wind;
      if (!reducedMotion) dustClock += dt;
      if (dustClock < 0.1 && dustCenter.distanceToSquared(camera.position) < 9) return;
      dustClock = 0;
      dustCenter.copy(camera.position);
      const time = uniforms.uTime.value;
      for (let i = 0; i < dustCount; i += 1) {
        const p = i * 3;
        const speed = 1.8 + dustSeeds[p + 1] * 2.2;
        const x = camera.position.x + wrap(dustSeeds[p] * 120 + time * wind * speed - camera.position.x);
        const z = camera.position.z + wrap(dustSeeds[p + 2] * 120 + time * wind * 0.7 - camera.position.z);
        dustPositions[p] = x;
        dustPositions[p + 1] = terrainHeight(x, z) + 0.25 + dustSeeds[p + 1] * 1.2 + Math.sin(time + i) * 0.15;
        dustPositions[p + 2] = z;
      }
      dustAttribute.needsUpdate = true;
    },
    dispose() {
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      group.clear();
    },
  };
}

export type WinterSystem = ReturnType<typeof createWinter>;
