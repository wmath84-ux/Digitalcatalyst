// src/nature3d/engine/atmosphere.ts
//
// AIR IS AN OBJECT — height fog, aerial perspective and the cheap subsurface
// term that makes foliage read as translucent instead of painted.
//
// ── What this replaces (research §15, §16, §21, principles 17, 18, 23, 24)
//
// Before this file, distance haze was one line in `scene.ts`:
//
//     this.scene.fog = new THREE.FogExp2(0xbcd9ef, budget.fogDensity)
//
// That is three.js's stock exponential-squared fog: a uniform, colourless
// grey that multiplies by distance. It hides the far hills (which is why it
// was there) but it does nothing else, because real air does three things a
// uniform fog cannot:
//
//   1. IT POOLS LOW. Haze is densest in the valleys and thins with altitude,
//      which is what makes a mountain top look CLOSE and a valley floor look
//      far away — the single strongest scale cue a landscape has. The stock
//      fog treats a 100 m summit and a riverbank identically.
//
//   2. IT IS LIT. Air scatters the sun's own colour towards the viewer, so
//      everything far away gets warmer and brighter as it approaches the
//      sun's side of the frame and cooler away from it. This is *aerial
//      perspective* (principle 24) and it is why a photograph of a range at
//      dusk has a warm limb on one side.
//
//   3. IT RESOLVES SILHOUETTES. Distant objects lose contrast before they
//      lose shape, so the far range keeps its readable silhouette while its
//      internal detail melts into the sky (research §7: "distance par
//      realism geometry se nahi, atmospheric depth se aata hai").
//
// On top of that the same shader pass fakes SUB-SURFACE SCATTERING for
// foliage (principles 17–18): a leaf is not opaque, light passes through it
// and comes out green. Real SSS needs a thickness map and a blur pass; the
// observation that it matters is that the sun is BEHIND the leaf and the
// viewer is looking towards it — so one `pow(max(dot(viewDir, sunDir)))`
// term, added to the lit colour of the leaf cards and the grass blades, is
// ~95 % of the look for about eight ALU. That is exactly the trade the
// research calls "fake what you can't render" (principle 39).
//
// ── How it attaches ────────────────────────────────────────────────────
//
// `register(material)` CHAINS onto whatever `onBeforeCompile` the material
// already has (the grass and leaf wind shaders), so the two injections
// compose instead of fighting. The uniforms are shared objects: every
// registered material points at the SAME `{ value }` boxes, so `update()`
// writes a colour once and the whole world changes — no per-material loop in
// the frame budget.

import * as THREE from "three";
import type { QualityBudget } from "./quality";
import { atmosphereKeyFor, type AtmosphereKey } from "./palette";

/** One `{ value }` box per uniform, shared by every registered material. */
export interface AtmosphereUniforms {
  uDcSunDir: { value: THREE.Vector3 };
  uDcSunColor: { value: THREE.Color };
  uDcHazeColor: { value: THREE.Color };
  uDcInScatter: { value: number };
  uDcHazeHeight: { value: number };
  uDcHazeGround: { value: number };
  uDcAerial: { value: number };
  uDcTransmit: { value: number };
  uDcTransmitColor: { value: THREE.Color };
  uDcPhase: { value: number };
}

/** The shape of the object three hands to `onBeforeCompile`. */
export interface ShaderLike {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

type CompileFn = (shader: ShaderLike, renderer: unknown) => void;

export interface AtmosphereRegistration {
  /** Foliage gets the transmission term; rock and ground do not. */
  foliage?: boolean;
}

export interface Atmosphere {
  uniforms: AtmosphereUniforms;
  /** Patch one material. Safe to call on a material that is already patched. */
  register(material: THREE.Material, opts?: AtmosphereRegistration): void;
  /** Patch every material found under a subtree (terrain shells, props). */
  registerTree(root: THREE.Object3D, opts?: AtmosphereRegistration): void;
  /** Push the current hour/sun/air into the shared uniforms. Allocation-free. */
  update(
    elevation: number,
    sunDir: THREE.Vector3,
    sunColor: THREE.Color,
    hazeColor: THREE.Color,
  ): void;
  dispose(): void;
}

/**
 * The varyings the world-space passes need.
 *
 * ONLY one of these is unconditional. A fragment `in` with no matching vertex
 * `out` is a LINK ERROR under WebGL2's GLSL ES 3.00 — not a warning — so the
 * normal is published only when the shader actually has a normal attribute to
 * publish. `MeshBasicMaterial` (the contact decals) has no normal attribute,
 * and asking it for one would take the whole page down in a shader compile
 * failure rather than in a subtle visual glitch.
 */
const VARYING_POSITION = /* glsl */ `
  varying vec3 vDcWorldPos;
`;

const VARYING_NORMAL = /* glsl */ `
  varying vec3 vDcWorldNormal;
`;

/**
 * Marker set on a shader object once the world varyings exist.
 *
 * Two systems need them (this file, for the haze and the transmission term,
 * and `weathering.ts`, for the world-aligned moss and dust). Rather than
 * forcing a registration ORDER — which would be a silent, shader-compile-time
 * landmine the day someone reorders two lines in `scene.ts` — the injection is
 * idempotent and both callers go through it.
 */
interface MarkedShader extends ShaderLike {
  /** `undefined` = not injected yet; otherwise: was the normal published? */
  dcWorldVaryings?: boolean;
}

/**
 * Publish the world position (and, when one exists, the world normal) to the
 * fragment stage.
 *
 * Returns whether the normal varying was published, so a caller can decide
 * whether its own world-space maths is legal in this particular shader.
 *
 * Everything else about three's `<project_vertex>` is preserved (`mvPosition`
 * keeps its name and meaning), so `fog_vertex`, `logdepthbuf_vertex`,
 * `clipping_planes_vertex` and the shadow varyings keep working untouched.
 */
export function injectWorldVaryings(shader: ShaderLike): boolean {
  const marked = shader as MarkedShader;
  if (marked.dcWorldVaryings !== undefined) return marked.dcWorldVaryings;

  // A vertex shader with no normal attribute cannot feed a world normal.
  const withNormal =
    shader.vertexShader.includes("#include <beginnormal_vertex>") &&
    shader.vertexShader.includes("#include <project_vertex>");

  marked.dcWorldVaryings = withNormal;

  const decl = withNormal ? `${VARYING_POSITION}${VARYING_NORMAL}` : VARYING_POSITION;
  shader.vertexShader = shader.vertexShader
    .replace(VERTEX_MARK, `${VERTEX_MARK}\n${decl}`)
    .replace(VERTEX_PROJECT, projectVertexChunk(withNormal));
  shader.fragmentShader = shader.fragmentShader.replace(FRAG_COMMON, `${FRAG_COMMON}\n${decl}`);

  return withNormal;
}


const VERTEX_MARK = "#include <common>";
const VERTEX_PROJECT = "#include <project_vertex>";
const FRAG_COMMON = "#include <common>";
const FRAG_FOG = "#include <fog_fragment>";
const FRAG_OPAQUE = "#include <opaque_fragment>";

/**
 * Replace three's `<project_vertex>` with one that ALSO publishes the world
 * position and the world normal.
 *
 * Everything else about the chunk is preserved (`mvPosition` keeps its name
 * and its meaning) so `fog_vertex`, `logdepthbuf_vertex`, `clipping_planes_vertex`
 * and the shadow varyings all keep working exactly as before — the injection
 * is additive, not a re-implementation of the pipeline.
 */
function projectVertexChunk(withNormal: boolean): string {
  return /* glsl */ `
  vec4 dcLocalPos = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    dcLocalPos = instanceMatrix * dcLocalPos;
  #endif
  vec4 dcWorldPos = modelMatrix * dcLocalPos;
  vDcWorldPos = dcWorldPos.xyz;
  ${
    withNormal
      ? `
  mat3 dcNormalMatrix = mat3( modelMatrix );
  #ifdef USE_INSTANCING
    dcNormalMatrix = dcNormalMatrix * mat3( instanceMatrix );
  #endif
  vDcWorldNormal = normalize( dcNormalMatrix * objectNormal );
  `
      : ""
  }
  vec4 mvPosition = viewMatrix * dcWorldPos;
  gl_Position = projectionMatrix * mvPosition;
`;
}

/**
 * The fog chunk, replaced.
 *
 * `FOG_EXP2` is the scene's FogExp2 and the only path used at runtime; the
 * linear fallback is there so the chunk is never a silent no-op if the scene
 * is switched to a linear fog.
 */
const FOG_CHUNK = /* glsl */ `
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      // Height-weighted optical depth. Haze pools in the low ground and
      // clears with altitude, so a summit reads near and a valley reads far.
      float dcHazeAlt = max( vDcWorldPos.y, -12.0 );
      float dcHazeFall = exp( - dcHazeAlt / uDcHazeHeight );
      float dcHazeDensity = fogDensity * mix( 1.0, uDcHazeGround, dcHazeFall );

      // Two-distance integral of an exponential-squared medium: the plain
      // exp(-d^2) form, weighted so the low ground thickens first.
      float dcDepth = max( vFogDepth, 0.0 );
      float dcFog = 1.0 - exp( - dcHazeDensity * dcHazeDensity * dcDepth * dcDepth );
      dcFog = clamp( dcFog, 0.0, 1.0 );

      // AERIAL PERSPECTIVE. Air in front of a distant surface has been lit by
      // the sun, so the haze is not the fog colour — it is the fog colour
      // pushed towards the sun's own colour, most strongly when the surface
      // is in the sun's direction from the viewer.
      vec3 dcEye = normalize( vDcWorldPos - cameraPosition );
      float dcToward = max( dot( dcEye, uDcSunDir ), 0.0 );
      vec3 dcHaze = mix( uDcHazeColor, uDcSunColor * uDcHazeColor, dcToward * uDcInScatter );

      // Mie forward lobe: a tight halo right at the sun, plus the broad band.
      dcHaze += uDcSunColor * ( pow( dcToward, 8.0 ) * 0.05 + pow( dcToward, 2.0 ) * 0.02 ) * uDcInScatter;

      gl_FragColor.rgb = mix( gl_FragColor.rgb, dcHaze, dcFog * uDcAerial );
    #else
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, smoothstep( fogNear, fogFar, vFogDepth ) );
    #endif
  #endif
`;

/** The real transmission chunk (kept separate so the no-op above never runs). */
const TRANSMIT_APPLY = /* glsl */ `
  #include <opaque_fragment>
  if ( uDcTransmit > 0.0 ) {
    vec3 dcViewDir = normalize( cameraPosition - vDcWorldPos );
    float dcThru = pow( max( dot( dcViewDir, uDcSunDir ), 0.0 ), uDcPhase );
    // Thicker foliage transmits less; the diffuse alpha of an alpha-tested
    // card is 1.0, so the material's own colour is the mask.
    gl_FragColor.rgb += uDcTransmitColor * ( dcThru * 0.85 + dcThru * dcThru * 0.5 ) * uDcTransmit;
  }
`;

export function createAtmosphere(budget: QualityBudget): Atmosphere {
  const uniforms: AtmosphereUniforms = {
    uDcSunDir: { value: new THREE.Vector3(0.62, 0.34, -0.7).normalize() },
    uDcSunColor: { value: new THREE.Color(0xfff0cf) },
    uDcHazeColor: { value: new THREE.Color(0xbcd9ef) },
    uDcInScatter: { value: 0.4 },
    // 46 m of scale height: the meadow's own relief is ~12 m, so the haze
    // thins noticeably as the learner walks up the lesson-board hill but
    // still blankets the whole valley floor evenly.
    uDcHazeHeight: { value: 46 },
    uDcHazeGround: { value: 1.22 },
    uDcAerial: { value: budget.fogDensity > 0.0004 ? 0.85 : 1 },
    uDcTransmit: { value: 0.34 },
    uDcTransmitColor: { value: new THREE.Color(0x9dbb52) },
    uDcPhase: { value: 2.6 },
  };

  const patched = new WeakSet<THREE.Material>();
  let lastKey: AtmosphereKey | null = null;

  const register = (material: THREE.Material, opts: AtmosphereRegistration = {}) => {
    if (patched.has(material)) return;
    patched.add(material);

    const foliage = opts.foliage === true;
    const previous = material.onBeforeCompile as unknown as CompileFn | undefined;

    const inject = (shader: ShaderLike) => {
      Object.assign(shader.uniforms, uniforms);

      // ── World varyings (shared with `weathering.ts`, idempotent) ─────
      injectWorldVaryings(shader);

      // ── Fragment: haze uniforms, fog, (foliage) transmission ─────────
      // NOTE: the replacement KEEPS `#include <common>`. That chunk defines
      // PI, saturate, pow2 and BRDF_Lambert, which the standard/lambert
      // pipelines use — dropping the line compiles to four GLSL errors and
      // three.js renders NOTHING for the material (this exact mistake once
      // made the whole ground invisible; the harness section 8 guards it).
      shader.fragmentShader = shader.fragmentShader
        .replace(
          FRAG_COMMON,
          /* glsl */ `
          #include <common>
          uniform vec3 uDcSunDir;
          uniform vec3 uDcSunColor;
          uniform vec3 uDcHazeColor;
          uniform float uDcInScatter;
          uniform float uDcHazeHeight;
          uniform float uDcHazeGround;
          uniform float uDcAerial;
          uniform float uDcTransmit;
          uniform vec3 uDcTransmitColor;
          uniform float uDcPhase;
          `,
        )
        .replace(FRAG_FOG, FOG_CHUNK);

      if (foliage) shader.fragmentShader = shader.fragmentShader.replace(FRAG_OPAQUE, TRANSMIT_APPLY);

      (material.userData as { dcShader?: ShaderLike }).dcShader = shader;
    };

    material.onBeforeCompile = ((shader: ShaderLike, renderer: unknown) => {
      previous?.(shader, renderer);
      inject(shader);
    }) as unknown as THREE.Material["onBeforeCompile"];

    // Distinct programs: a foliage material and a rock material must never
    // share a compiled shader even if they started from the same class.
    const prior = material.customProgramCacheKey;
    material.customProgramCacheKey = () =>
      `${prior ? prior.call(material) : "dc"}-atmo-${foliage ? "leaf" : "solid"}`;
  };

  return {
    uniforms,
    register,
    registerTree(root, opts) {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
        const mat = mesh.material;
        if (!mat) return;
        if (Array.isArray(mat)) mat.forEach((m) => register(m, opts));
        else register(mat, opts);
      });
    },
    update(elevation, sunDir, sunColor, hazeColor) {
      const key = atmosphereKeyFor(elevation);

      // The four values that change every frame the sun moves. They are
      // copied, then tinted by the current hour's art-direction key, so the
      // meadow stays warm at dusk and crisp at noon without a second table.
      uniforms.uDcSunDir.value.copy(sunDir);
      uniforms.uDcHazeColor.value.copy(hazeColor).multiply(key.haze);
      uniforms.uDcSunColor.value.copy(sunColor).lerp(key.sun, 0.5);

      // The banded values, re-derived only when the sun crosses into a new
      // band of the sky (three bands per day, at most a handful of writes).
      if (key !== lastKey) {
        lastKey = key;
        uniforms.uDcInScatter.value = key.inScatter;
        // Low sun = dense air to look through = more aerial perspective, and
        // more forward-scattered light through the leaves, which is what
        // makes a backlit canopy at 6 pm glow.
        const low = 1 - Math.min(1, Math.max(0, elevation / 0.55));
        uniforms.uDcAerial.value = 0.82 + low * 0.3;
        uniforms.uDcTransmit.value = 0.22 + low * 0.34;
        uniforms.uDcPhase.value = 2.6 + low * 1.4;
      }
    },
    dispose() {
      // Materials are owned by the systems that built them and are disposed
      // there. Only the band cache belongs to this object.
      lastKey = null;
    },
  };
}
