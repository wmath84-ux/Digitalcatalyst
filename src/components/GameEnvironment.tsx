// src/components/GameEnvironment.tsx
//
// THE STRATA GAME MODE
// --------------------
// The full-screen 3D world that the header's "Game" button opens, built on the
// real Strata Game Library (https://github.com/jbcom/strata-game-library) — the
// published `@strata-game-library/*` packages, not a hand-rolled copy:
//
//   · `@strata-game-library/core`      → `fbm` / `getTerrainHeight` / `getBiomeAt`
//                                        procedural SDF noise + the R3F
//                                        `ProceduralSky` and `AdvancedWater`
//                                        components.
//   · `@strata-game-library/presets`   → GPU-instanced `createGrassInstances`,
//                                        `createTreeInstances`,
//                                        `createRockInstances` vegetation.
//
// WHY THE OLD SCREEN WAS BLACK
//   1. The overlay mounted the <Canvas> inside `max-h-[80vh]` on a parent that
//      never resolved a height on mobile, so the canvas got 0×0 px.
//   2. `<Stars>` + `<Sky>` + a `scene.background` were fighting each other and
//      a full-size opaque water plane sat exactly on the terrain plane, so the
//      camera looked at an unlit surface.
//   3. Any WebGL failure (no GPU / context loss — very common in the Android
//      WebView) threw inside the R3F tree and left the black backdrop with no
//      message at all.
//
// The rewrite fixes all three: the canvas fills the overlay with an explicit
// 100%/100dvh box, the world is lit + fogged from one place, and the scene is
// wrapped in a Suspense boundary AND an error boundary that show a readable
// fallback (plus a WebGL-unsupported notice) instead of a black rectangle.

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, OrbitControls, Preload, Sky, Stars } from "@react-three/drei";
import * as THREE from "three";
import {
  fbm,
  getBiomeAt,
  getTerrainHeight,
  type BiomeData,
} from "@strata-game-library/core";
import { AdvancedWater, ProceduralSky } from "@strata-game-library/core/components";
import {
  createGrassInstances,
  createRockInstances,
  createTreeInstances,
} from "@strata-game-library/presets/vegetation";

/* ────────────────────────────────────────────────────────────────
   World constants — one source of truth for terrain + water so the
   shoreline always lines up (the old scene had them overlapping).
   ──────────────────────────────────────────────────────────────── */
const WORLD_SIZE = 220;
const TERRAIN_SEGMENTS = 160;
const WATER_LEVEL = -1.6;
const SEED = 1337;

/** The Strata biome map the terrain height + vegetation both sample. */
const BIOMES: BiomeData[] = [
  { type: "forest", center: new THREE.Vector2(-40, -20), radius: 70 },
  { type: "mountain", center: new THREE.Vector2(60, -60), radius: 80 },
  { type: "savanna", center: new THREE.Vector2(30, 50), radius: 70 },
  { type: "marsh", center: new THREE.Vector2(-60, 60), radius: 55 },
  { type: "scrubland", center: new THREE.Vector2(0, 0), radius: 60 },
];

/** Height field — Strata's biome terrain plus a few FBM detail octaves. */
function heightAt(x: number, z: number): number {
  const base = getTerrainHeight(x, z, BIOMES);
  // Strata's `fbm(x, y, z, octaves)` — the third argument is the Z slice, so
  // the seed is folded in as a constant offset on that axis.
  const detail = fbm(x * 0.035, z * 0.035, SEED * 0.001, 4) * 1.6;
  const ridges = fbm(x * 0.01, z * 0.01, SEED * 0.002 + 9.7, 3) * 3.2;
  return base + detail + ridges;
}

const BIOME_COLORS: Record<BiomeData["type"], number> = {
  marsh: 0x35513a,
  forest: 0x2f5130,
  desert: 0xd9c48c,
  tundra: 0xb9c6cc,
  savanna: 0x8ba24b,
  mountain: 0x6f6a60,
  scrubland: 0x5c6b39,
};

/* ── Terrain ─────────────────────────────────────────────────── */
function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      WORLD_SIZE,
      WORLD_SIZE,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS,
    );
    geo.rotateX(-Math.PI / 2);

    const positions = geo.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const y = heightAt(x, z);
      positions.setY(i, y);

      const biome = getBiomeAt(x, z, BIOMES);
      color.setHex(BIOME_COLORS[biome.type] ?? 0x4a7c23);

      if (y < WATER_LEVEL + 0.9) color.lerp(new THREE.Color(0xd8caa4), 0.65); // shore sand
      else if (y > 11) color.lerp(new THREE.Color(0xf2f5f7), Math.min(1, (y - 11) / 7)); // snow caps

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0.02} />
    </mesh>
  );
}

/* ── Strata GPU-instanced vegetation ─────────────────────────── */
function Vegetation({ quality }: { quality: "low" | "high" }) {
  const meshes = useMemo(() => {
    const options = { seed: SEED, heightFunction: heightAt, enableWind: true };
    const grass = createGrassInstances(
      quality === "high" ? 9000 : 2600,
      WORLD_SIZE * 0.8,
      BIOMES,
      { ...options, windStrength: 0.35 },
    );
    const trees = createTreeInstances(
      quality === "high" ? 320 : 110,
      WORLD_SIZE * 0.8,
      BIOMES,
      { ...options, windStrength: 0.16 },
    );
    const rocks = createRockInstances(
      quality === "high" ? 160 : 60,
      WORLD_SIZE * 0.8,
      BIOMES,
      { seed: SEED, heightFunction: heightAt },
    );
    [grass, trees, rocks].forEach((mesh) => {
      mesh.castShadow = quality === "high";
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
    });
    return { grass, trees, rocks };
  }, [quality]);

  useEffect(
    () => () => {
      Object.values(meshes).forEach((mesh) => {
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
    },
    [meshes],
  );

  // Strata's instanced vegetation animates its wind shader from a `time`
  // uniform — drive it from the R3F frame loop.
  useFrame(({ clock }) => {
    Object.values(meshes).forEach((mesh) => {
      const material = mesh.material as THREE.ShaderMaterial | undefined;
      const uniforms = material && "uniforms" in material ? material.uniforms : undefined;
      if (uniforms?.time) uniforms.time.value = clock.elapsedTime;
    });
  });

  return (
    <>
      <primitive object={meshes.grass} />
      <primitive object={meshes.trees} />
      <primitive object={meshes.rocks} />
    </>
  );
}

/* ── Floating collectible crystals (the game-y bit) ──────────── */
function Crystal({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.rotation.y += delta * 0.7;
    mesh.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.6 + position[0]) * 0.45;
  });
  return (
    <mesh ref={ref} position={position} castShadow>
      <octahedronGeometry args={[0.9, 0]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.9}
        metalness={0.35}
        roughness={0.15}
      />
    </mesh>
  );
}

function Crystals() {
  const spots = useMemo(() => {
    const palette = ["#63e6ff", "#ff7ad9", "#8bff6a", "#ffd166", "#b18cff"];
    return Array.from({ length: 10 }).map((_, i) => {
      const angle = (i / 10) * Math.PI * 2;
      const radius = 22 + (i % 4) * 9;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = Math.max(WATER_LEVEL + 2, heightAt(x, z)) + 3.2;
      return { position: [x, y, z] as [number, number, number], color: palette[i % palette.length] };
    });
  }, []);
  return (
    <>
      {spots.map((spot) => (
        <Crystal key={`${spot.position[0]}-${spot.position[2]}`} {...spot} />
      ))}
    </>
  );
}

/* ── Scene ───────────────────────────────────────────────────── */
function GameScene({ quality }: { quality: "low" | "high" }) {
  const { scene, camera } = useThree();

  useEffect(() => {
    // One place owns the atmosphere: a light horizon colour + matching fog so
    // the distant terrain fades instead of ending in a hard black band.
    scene.background = new THREE.Color("#8fc7e8");
    scene.fog = new THREE.Fog("#8fc7e8", 90, 260);
    camera.position.set(34, 22, 40);
    camera.lookAt(0, 2, 0);
    return () => {
      scene.fog = null;
    };
  }, [scene, camera]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#cfe9ff", "#5a4a32", 0.7]} />
      <directionalLight
        position={[70, 90, 40]}
        intensity={1.65}
        castShadow={quality === "high"}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-camera-far={400}
      />

      {/* Strata's procedural sky sits behind drei's Sky gradient so the world
          keeps its atmosphere even if the shader sky is culled on a weak GPU. */}
      <Sky distance={450000} sunPosition={[70, 45, 40]} turbidity={6} rayleigh={1.6} />
      <ProceduralSky
        timeOfDay={{ sunAngle: 46, sunIntensity: 0.95, ambientLight: 0.5, starVisibility: 0, fogDensity: 0.15 }}
        weather={{ intensity: 0.1 }}
        size={[900, 450]}
        distance={320}
      />
      <Stars radius={320} depth={60} count={quality === "high" ? 1200 : 400} factor={5} fade saturation={0} />

      <Terrain />
      <Vegetation quality={quality} />

      {/* Strata's AdvancedWater — caustics + foam, parked at the shoreline. */}
      <AdvancedWater
        position={[0, WATER_LEVEL, 0]}
        size={WORLD_SIZE * 1.4}
        segments={quality === "high" ? 96 : 40}
        color={0x2f8fbf}
        deepColor={0x0a3350}
        foamColor={0xdff3ff}
        causticIntensity={0.65}
        waveHeight={0.22}
        waveSpeed={0.75}
      />

      <Crystals />

      <OrbitControls
        makeDefault
        target={[0, 2, 0]}
        enablePan
        enableZoom
        enableRotate
        enableDamping
        dampingFactor={0.06}
        minDistance={8}
        maxDistance={160}
        maxPolarAngle={Math.PI / 2.15}
      />
      <AdaptiveDpr pixelated />
      <Preload all />
    </>
  );
}

/* ── Error boundary: never show a bare black screen again ────── */
class SceneErrorBoundary extends Component<
  { children: ReactNode; onError?: (message: string) => void },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : "The 3D world failed to start." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[GameEnvironment] scene crashed", error, info);
    this.props.onError?.(error.message);
  }

  render() {
    if (this.state.message) return null;
    return this.props.children;
  }
}

function detectWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

type GameEnvironmentProps = {
  onClose: () => void;
};

export default function GameEnvironment({ onClose }: GameEnvironmentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const webglSupported = useMemo(detectWebGL, []);

  // Mobile phones get the lighter world (fewer instances, no shadow map) so
  // the WebView keeps a usable frame rate instead of dropping its context.
  const quality: "low" | "high" = useMemo(() => {
    if (typeof window === "undefined") return "low";
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    const smallViewport = window.innerWidth < 768;
    const lowCores = (navigator.hardwareConcurrency ?? 4) <= 4;
    return coarse || smallViewport || lowCores ? "low" : "high";
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-game-environment
      role="dialog"
      aria-modal="true"
      aria-label="Strata game environment"
      className="fixed inset-0 z-[100] bg-[#0b1220]"
      style={{ touchAction: "none", height: "100dvh", width: "100vw" }}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-[102] grid place-items-center rounded-full bg-black/45 p-3 text-white backdrop-blur-md transition hover:bg-black/65"
        aria-label="Close game"
        style={{ minWidth: 48, minHeight: 48, touchAction: "manipulation" }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* The canvas OWNS the whole overlay — no max-height parent that can
          collapse to zero on a phone (the old black-screen bug). */}
      <div className="absolute inset-0" style={{ touchAction: "none" }}>
        {webglSupported && !failure ? (
          <Canvas
            shadows={quality === "high"}
            dpr={quality === "high" ? [1, 2] : [1, 1.5]}
            camera={{ position: [34, 22, 40], fov: 55, near: 0.1, far: 2000 }}
            gl={{ antialias: quality === "high", alpha: false, powerPreference: "high-performance" }}
            style={{ width: "100%", height: "100%", display: "block", background: "#8fc7e8" }}
            onCreated={({ gl }) => {
              gl.setClearColor("#8fc7e8", 1);
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.05;
              setReady(true);
              gl.domElement.addEventListener("webglcontextlost", (event) => {
                event.preventDefault();
                setFailure("The graphics context was lost. Reopen game mode to try again.");
              });
            }}
          >
            <SceneErrorBoundary onError={setFailure}>
              <Suspense fallback={null}>
                <GameScene quality={quality} />
              </Suspense>
            </SceneErrorBoundary>
          </Canvas>
        ) : (
          <div className="grid h-full w-full place-items-center px-8 text-center text-white">
            <div>
              <p className="text-lg font-bold">Game mode can’t start on this device</p>
              <p className="mt-2 text-sm text-white/70">
                {failure ?? "WebGL is not available in this browser. Enable hardware acceleration and try again."}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-full bg-white/15 px-5 py-2 text-sm font-semibold hover:bg-white/25"
              >
                Back to app
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Loading veil — replaces the old “black screen with nothing”. */}
      {webglSupported && !failure && !ready ? (
        <div className="pointer-events-none absolute inset-0 z-[101] grid place-items-center bg-[#0b1220] text-white">
          <div className="flex flex-col items-center gap-3">
            <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            <p className="text-sm font-semibold tracking-wide">Building the world…</p>
          </div>
        </div>
      ) : null}

      {/* Controls hint */}
      {ready && !failure ? (
        <div className="pointer-events-none absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[101] -translate-x-1/2 rounded-full bg-black/45 px-4 py-2 backdrop-blur-md">
          <p className="text-xs text-white md:text-sm">
            <span className="hidden md:inline">Drag to look · Scroll to zoom · Right-click to pan · Esc to exit</span>
            <span className="md:hidden">Swipe to look · Pinch to zoom</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
