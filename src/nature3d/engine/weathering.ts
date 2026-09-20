// src/nature3d/engine/weathering.ts
//
// "PERFECT IS FAKE" — the weathering pass (research §11, §15, §6, §21).
//
// ── The rule this file exists to enforce ────────────────────────────────
//
// A renderer's default output is perfectly straight edges, perfectly uniform
// roughness and perfectly clean surfaces. The human eye rejects all three,
// because nothing in the real world survives ten years of sun, rain and
// gravity without a history written on it. So every surface in the sanctuary
// gets at least one of these four stories:
//
//   CAVITY → accumulated dirt. Crevices, cracks and the undersides of
//            ledges are where water and dust collect and where nothing wipes
//            them away. Baked from the GEOMETRY (see `bakeCurvature`), so it
//            is free at runtime — this is the "vertex-colour AO" trick from
//            §21, kept as three raw channels instead of one colour so each
//            can drive a different physical effect:
//              ao     → ambient occlusion multiplier
//              cavity → how much dirt/moss collects here
//              convex → edge wear (where surfaces get knocked and polished)
//
//   MOSS   → follows water and shade, never the sun. It grows on UP-facing
//            surfaces (it needs the rain) that are also away from the sun's
//            side of the sky, and it takes hold in cavities first. This is
//            the geological logic of §6 applied in world space: because the
//            projection is tri-planar and world-aligned, a rock rotated to
//            any angle still grows moss on whichever faces happen to point up
//            and away from the sun — the shader does not care how the mesh
//            was rotated, which is precisely how one rock asset serves every
//            biome (§6, principle 14).
//
//   DUST   → settles on up-facing flats only. A vertical face sheds it. This
//            is why real boulders have clean sides and grubby tops.
//
//   WATER  → darkens and polishes. Water fills the micro-facets that make a
//            surface rough (§15), so a wet surface is BOTH darker and
//            smoother — a rock at the river line reads instantly as wet
//            without a single reflection calculation.
//
// Everything is driven from the vertex/fragment stage with no extra passes,
// no render targets and no per-frame CPU work.

import * as THREE from "three";
import type { QualityTier } from "./quality";
import { injectWorldVaryings, type ShaderLike } from "./atmosphere";
import { ROUGHNESS_RANGE } from "./palette";
import { SUN_SIDE_X, SUN_SIDE_Z } from "./environment";

export interface WeatheringUniforms {
  uDcWeatherMap: { value: THREE.Texture };
  uDcWeatherScale: { value: number };
  /** The shade side of the sky, in world XZ (from `environment.SUN_SIDE_*`). */
  uDcShadeAxis: { value: THREE.Vector2 };
  uDcMossColor: { value: THREE.Color };
  uDcDustColor: { value: THREE.Color };
  uDcMossAmount: { value: number };
  uDcDustAmount: { value: number };
  uDcWetRoughness: { value: number };
  uDcDryRoughness: { value: number };
}

export interface Weathering {
  uniforms: WeatheringUniforms;
  /**
   * Patch a standard material with the weathering model.
   *
   * `attrib` names the per-instance attribute the prop supplies (moss, dust,
   * wet per instance); pass `null` for a single object that has no instances.
   */
  apply(material: THREE.Material, opts?: { attrib?: string | null }): void;
  /** Bake ao / cavity / convexity into `aDcBake` on a geometry. */
  bakeCurvature(geometry: THREE.BufferGeometry, opts?: { radius?: number; strength?: number }): void;
  /** Write a per-instance weathering attribute onto an InstancedMesh. */
  setInstanceWeather(mesh: THREE.InstancedMesh, values: Float32Array): void;
  dispose(): void;
}

/** How the per-instance attribute is laid out. */
export const WEATHER_CHANNELS = 3;

export function createWeathering(tex: THREE.Texture, tier: QualityTier): Weathering {
  const triplanar = tier !== "low";

  const uniforms: WeatheringUniforms = {
    uDcWeatherMap: { value: tex },
    // 1 tile per 1.6 m of world: at 256 px that is a 160 px/m detail map, which
    // matches the texel density the rest of the sanctuary is authored at.
    uDcWeatherScale: { value: 0.62 },
    // Which way the sky is shaded, from the same constant the moss, the tree
    // lean and the terrain tint read (see `environment.SUN_SIDE_*`).
    uDcShadeAxis: { value: new THREE.Vector2(SUN_SIDE_X, SUN_SIDE_Z) },
    uDcMossColor: { value: new THREE.Color(0x4e6b31) },
    uDcDustColor: { value: new THREE.Color(0x9c9484) },
    uDcMossAmount: { value: 1 },
    uDcDustAmount: { value: 0.85 },
    uDcWetRoughness: { value: ROUGHNESS_RANGE.rockWet[0] + 0.06 },
    uDcDryRoughness: { value: ROUGHNESS_RANGE.rock[0] + 0.16 },
  };

  const patched = new WeakSet<THREE.Material>();

  const apply = (material: THREE.Material, opts: { attrib?: string | null } = {}) => {
    if (patched.has(material)) return;
    patched.add(material);
    const attrib = opts.attrib === undefined ? "aDcWeather" : opts.attrib;
    const hasInstances = attrib !== null;
    const previous = material.onBeforeCompile as unknown as
      | ((shader: ShaderLike, renderer: unknown) => void)
      | undefined;

    const triplanarChunk = triplanar
      ? /* glsl */ `
        // TRI-PLANAR world projection: blend the three axis-aligned samples by
        // how much the surface faces each one. A rock rotated to any angle
        // still receives its dirt, moss and streaks in world space, so the
        // same asset never wears its texture the same way twice and never
        // stretches on a steep face (principle 14).
        vec3 dcBlend = pow( abs( vDcWorldNormal ), vec3( 4.0 ) );
        dcBlend /= max( dcBlend.x + dcBlend.y + dcBlend.z, 1e-4 );
        vec3 dcDetail = texture2D( uDcWeatherMap, vDcWorldPos.zy * uDcWeatherScale ).rgb * dcBlend.x
                      + texture2D( uDcWeatherMap, vDcWorldPos.xz * uDcWeatherScale ).rgb * dcBlend.y
                      + texture2D( uDcWeatherMap, vDcWorldPos.xy * uDcWeatherScale ).rgb * dcBlend.z;
      `
      : /* glsl */ `
        // One fetch on the weakest devices. The up-facing projection is
        // already the one that matters: moss and dust live on top surfaces,
        // and the mountainside views that expose the difference are exactly
        // the ones a low tier is not rendering anyway.
        vec3 dcDetail = texture2D( uDcWeatherMap, vDcWorldPos.xz * uDcWeatherScale ).rgb;
      `;

    const inject = (shader: ShaderLike) => {
      // The whole model is expressed in WORLD space (that is what makes one
      // rotated rock believable in every biome), so it needs the world normal.
      // A shader without one skips the pass entirely instead of failing to
      // compile — moss is not worth a black screen.
      const withNormal = injectWorldVaryings(shader);
      if (!withNormal) return;
      Object.assign(shader.uniforms, uniforms);

      const attrDecl = hasInstances
        ? /* glsl */ `
          attribute vec3 ${attrib};
          varying vec3 vDcWeather;
        `
        : /* glsl */ `
          varying vec3 vDcWeather;
        `;

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          /* glsl */ `
          #include <common>
          attribute vec3 aDcBake;
          ${attrDecl}
          varying vec3 vDcBake;
          `,
        )
        .replace(
          "#include <begin_vertex>",
          /* glsl */ `
          #include <begin_vertex>
          vDcBake = aDcBake;
          ${hasInstances ? `vDcWeather = ${attrib};` : "vDcWeather = vec3( 0.0 );"}
          `,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          /* glsl */ `
          #include <common>
          uniform sampler2D uDcWeatherMap;
          uniform float uDcWeatherScale;
          uniform vec2 uDcShadeAxis;
          uniform vec3 uDcMossColor;
          uniform vec3 uDcDustColor;
          uniform float uDcMossAmount;
          uniform float uDcDustAmount;
          uniform float uDcWetRoughness;
          uniform float uDcDryRoughness;
          varying vec3 vDcBake;
          varying vec3 vDcWeather;
          `,
        )
        .replace(
          "#include <map_fragment>",
          /* glsl */ `
          #include <map_fragment>

          // ── The weathering model ──────────────────────────────────────
          float dcAo = clamp( vDcBake.x, 0.0, 1.0 );
          float dcCavity = clamp( vDcBake.y, 0.0, 1.0 );
          float dcConvex = clamp( vDcBake.z, 0.0, 1.0 );
          float dcUp = clamp( vDcWorldNormal.y, 0.0, 1.0 );

          vec2 dcFlat = normalize( vDcWorldNormal.xz + vec2( 1e-4 ) );
          // 1 on the shade side of the sky, 0 on the sunlit side.
          float dcShadeSide = clamp( 0.5 + 0.5 * dot( dcFlat, normalize( uDcShadeAxis ) ), 0.0, 1.0 );

          ${triplanarChunk}

          // Moss: needs rain (up-facing), shade (away from the sun) and a
          // foothold (cavities and the bases of things).
          float dcMoss = uDcMossAmount * vDcWeather.x
            * smoothstep( 0.18, 0.86, dcUp * ( 0.35 + 0.65 * dcShadeSide ) )
            * ( 0.55 + 0.45 * dcCavity + 0.35 * dcDetail.r );

          // Dust and silt: settles on anything that faces the sky.
          float dcDust = uDcDustAmount * vDcWeather.y
            * smoothstep( 0.5, 0.95, dcUp ) * ( 0.6 + 0.4 * dcDetail.g );

          // Wet: the river line and after rain. Streaks run DOWN from
          // occluded ledges, which is what water physically does (principle 9:
          // "rust wahan aati hai jahan paani rukta hai").
          float dcStreak = smoothstep( 0.42, 0.0, dcUp ) * ( 1.0 - dcAo );
          float dcWet = clamp( vDcWeather.z + dcStreak * 0.35, 0.0, 1.0 ) * ( 0.6 + 0.4 * dcDetail.b );

          // Edge wear: convex corners are where a rock is knocked, scraped and
          // polished. They go a touch paler and smoother than the faces.
          float dcEdge = dcConvex * ( 1.0 - clamp( dcMoss + dcDust, 0.0, 1.0 ) );

          // ── Albedo ────────────────────────────────────────────────────
          diffuseColor.rgb = mix( diffuseColor.rgb, uDcMossColor, clamp( dcMoss, 0.0, 0.85 ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, uDcDustColor, clamp( dcDust, 0.0, 0.7 ) );
          diffuseColor.rgb *= mix( 1.0, 0.62, clamp( dcWet, 0.0, 1.0 ) );       // wet = darker
          diffuseColor.rgb *= mix( 0.55, 1.0, dcAo );                            // baked cavity AO
          diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.18, dcEdge * 0.5 );
          `,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          /* glsl */ `
          #include <roughnessmap_fragment>

          // Roughness variation is the single strongest "real material" cue
          // (principle 12): dry mineral dull, dust duller, moss dead-matte,
          // water glassy. It is applied AFTER the map so it can never be
          // defeated by a flat authored map.
          roughnessFactor = mix( roughnessFactor, uDcDryRoughness, clamp( dcDust * 0.8 + dcMoss * 0.6, 0.0, 1.0 ) );
          roughnessFactor = mix( roughnessFactor, uDcWetRoughness, clamp( dcWet, 0.0, 1.0 ) );
          roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.82, dcEdge * 0.6 );
          roughnessFactor = clamp( roughnessFactor, ${ROUGHNESS_RANGE.rock[0].toFixed(2)} - 0.22, 1.0 );
          `,
        );

      (material.userData as { dcShader?: ShaderLike }).dcShader = shader;
    };

    material.onBeforeCompile = ((shader: ShaderLike, renderer: unknown) => {
      previous?.(shader, renderer);
      inject(shader);
    }) as unknown as THREE.Material["onBeforeCompile"];

    const prior = material.customProgramCacheKey;
    material.customProgramCacheKey = () =>
      `${prior ? prior.call(material) : "dc"}-weather-${triplanar ? "tri" : "flat"}-${hasInstances ? "inst" : "single"}`;
  };

  return {
    uniforms,
    apply,
    bakeCurvature(geometry, opts = {}) {
      bakeCurvature(geometry, opts.radius ?? 1.6, opts.strength ?? 1);
    },
    setInstanceWeather(mesh, values) {
      const attr = new THREE.InstancedBufferAttribute(values, WEATHER_CHANNELS);
      attr.setUsage(THREE.StaticDrawUsage);
      mesh.geometry.setAttribute("aDcWeather", attr);
    },
    dispose() {
      // Materials and geometries belong to the systems that built them; the
      // shared uniform boxes die with this object. Clearing the WeakSet is
      // neither possible nor needed — `patched` holds no strong references.
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  Curvature baking — the "vertex-colour AO" trick, done properly
// ─────────────────────────────────────────────────────────────────────────

/**
 * Bake ambient occlusion, cavity and convexity into `aDcBake`.
 *
 * The method is the one a modeller uses when they bake a curvature map, but
 * it is computed here at BUILD time on the CPU so it costs nothing at
 * runtime and needs no bake tool, no high-poly twin and no texture:
 *
 *   1. weld the vertices by position — the geometry is a soup of triangles
 *      with duplicated corners, and curvature is a property of the SURFACE,
 *      not of a triangle corner;
 *   2. for each welded vertex, average its neighbours' positions;
 *   3. compare that average with the vertex itself, along the normal:
 *        neighbour average BEHIND the surface  → convex (a bump, an edge)
 *        neighbour average IN FRONT of it      → concave (a dip, a crevice)
 *   4. AO = how much of the sky hemisphere the vertex can see (its normal's
 *      Y), reduced by everything concave around it.
 *
 * `radius` is the search radius in world units: a rock whose crevices are
 * 3 cm deep needs a small radius, and one whose bedding planes step 40 cm
 * needs a large one — size it against the feature you want to catch.
 */
export function bakeCurvature(
  geometry: THREE.BufferGeometry,
  radius: number,
  strength: number,
): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos) return;
  const nor = geometry.attributes.normal as THREE.BufferAttribute | undefined;
  if (!nor) geometry.computeVertexNormals();

  const normals = geometry.attributes.normal as THREE.BufferAttribute;
  const count = pos.count;
  const bake = new Float32Array(count * 3);

  // ── Weld by quantised position ───────────────────────────────────────
  const cell = Math.max(radius * 0.35, 1e-3);
  const buckets = new Map<string, number[]>();
  const keyOf = (x: number, y: number, z: number) =>
    `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;

  for (let i = 0; i < count; i += 1) {
    const k = keyOf(pos.getX(i), pos.getY(i), pos.getZ(i));
    const list = buckets.get(k);
    if (list) list.push(i);
    else buckets.set(k, [i]);
  }

  // ── Neighbour average per welded vertex ──────────────────────────────
  const ax = new Float32Array(count);
  const ay = new Float32Array(count);
  const az = new Float32Array(count);
  const nx = new Float32Array(count);
  const ny = new Float32Array(count);
  const nz = new Float32Array(count);

  const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
    [0, 0, 0],
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [1, 1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, -1], [0, 1, 1], [0, -1, -1],
  ];

  for (let i = 0; i < count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (const [dx, dy, dz] of NEIGHBOURS) {
      const k = keyOf(x + dx * cell, y + dy * cell, z + dz * cell);
      const list = buckets.get(k);
      if (!list) continue;
      for (const j of list) {
        const d = Math.hypot(pos.getX(j) - x, pos.getY(j) - y, pos.getZ(j) - z);
        if (d > radius || d < 1e-6) continue;
        sx += pos.getX(j);
        sy += pos.getY(j);
        sz += pos.getZ(j);
        n += 1;
      }
    }
    if (n > 0) {
      ax[i] = sx / n;
      ay[i] = sy / n;
      az[i] = sz / n;
    } else {
      ax[i] = x;
      ay[i] = y;
      az[i] = z;
    }
    nx[i] = normals.getX(i);
    ny[i] = normals.getY(i);
    nz[i] = normals.getZ(i);
  }

  // ── Concavity along the normal ───────────────────────────────────────
  let maxConcave = 1e-5;
  let maxConvex = 1e-5;
  const concave = new Float32Array(count);
  const convex = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const dx = ax[i] - pos.getX(i);
    const dy = ay[i] - pos.getY(i);
    const dz = az[i] - pos.getZ(i);
    const along = dx * nx[i] + dy * ny[i] + dz * nz[i];
    if (along > 0) {
      concave[i] = along;
      if (along > maxConcave) maxConcave = along;
    } else {
      convex[i] = -along;
      if (-along > maxConvex) maxConvex = -along;
    }
  }

  for (let i = 0; i < count; i += 1) {
    const cav = Math.pow(clamp01(concave[i] / maxConcave), 0.75) * strength;
    const cvx = Math.pow(clamp01(convex[i] / maxConvex), 0.9) * strength;
    // Sky access: a vertex whose normal points into the lower hemisphere sees
    // less of the sky, so it is in the ground's ambient shadow.
    const sky = 0.5 + 0.5 * ny[i];
    const ao = clamp01(sky * (1 - cav * 0.85) + cvx * 0.12 * sky);
    bake[i * 3] = ao;
    bake[i * 3 + 1] = cav;
    bake[i * 3 + 2] = cvx;
  }

  geometry.setAttribute("aDcBake", new THREE.BufferAttribute(bake, 3));
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
