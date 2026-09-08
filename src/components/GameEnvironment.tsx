// src/components/GameEnvironment.tsx
//
// THE STRATA GAME MODE
// --------------------
// Full-screen host for the Strata Game Library examples
// (https://github.com/jbcom/strata-game-library), opened by the "Game" button
// in the header on both desktop and mobile.
//
// WHAT IS INSTALLED
//   The upstream example apps are vendored BYTE-FOR-BYTE into
//   `src/strata-examples/` — no edits, original `strata-game-library/...`
//   imports intact. `vite.config.ts` aliases those specifiers onto the small
//   shims in `src/strata-shim/`, which re-export the published scoped
//   packages exactly like the upstream (unpublished) umbrella package does.
//   So each scene below is the real example, running as-is:
//
//     · world-topology      — the flagship world: topology, regions, spawns
//     · vegetation-showcase — GPU-instanced grass/trees/rocks over biomes
//     · water-scene         — the water system
//     · sky-volumetrics     — ProceduralSky + volumetrics
//     · basic-terrain       — FBM marching-cubes terrain
//
//   (`api-showcase` and `declarative-game` are the two upstream examples that
//   import `strata-game-library/r3f`'s game-shell exports — StrataGame,
//   RuntimeCreature, RuntimeProp, createGameHUD, createPauseMenu. That r3f
//   package is not published to npm, so those two cannot be installed.)
//
// Each example owns its own <Canvas>, camera, lighting and controls, so this
// file deliberately adds NOTHING to the 3D scene. It only supplies the
// chrome the app needs around it: the overlay, a scene switcher, WebGL
// detection, a Suspense boundary and an error boundary — because a failure
// inside an example must show a readable message instead of the black screen
// this component used to render.

import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { loadExample } from "../strata-examples/registry";

/* ── The vendored upstream examples ──────────────────────────────
   Lazily loaded so the (heavy) three.js example bundles are only fetched
   when the learner actually opens game mode. */
const scenes = [
  {
    id: "world-topology",
    label: "World",
    blurb: "Topology, regions & spawn systems",
    Component: lazy(async () => ({ default: await loadExample("world-topology") })),
  },
  {
    id: "vegetation-showcase",
    label: "Vegetation",
    blurb: "GPU-instanced grass, trees & biomes",
    Component: lazy(async () => ({ default: await loadExample("vegetation-showcase") })),
  },
  {
    id: "water-scene",
    label: "Water",
    blurb: "Waves, caustics & reflections",
    Component: lazy(async () => ({ default: await loadExample("water-scene") })),
  },
  {
    id: "sky-volumetrics",
    label: "Sky",
    blurb: "Procedural sky & volumetrics",
    Component: lazy(async () => ({ default: await loadExample("sky-volumetrics") })),
  },
  {
    id: "basic-terrain",
    label: "Terrain",
    blurb: "FBM procedural terrain",
    Component: lazy(async () => ({ default: await loadExample("basic-terrain") })),
  },
] as const;

type SceneId = (typeof scenes)[number]["id"];

/* ── Error boundary: never show a bare black screen again ────── */
class SceneErrorBoundary extends Component<
  { children: ReactNode; sceneId: string; onError?: (message: string) => void },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return {
      message: error instanceof Error ? error.message : "The 3D scene failed to start.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[GameEnvironment] scene crashed", error, info);
    this.props.onError?.(error.message);
  }

  // Remount (and so clear the error) whenever the learner picks another scene.
  componentDidUpdate(prev: { sceneId: string }) {
    if (prev.sceneId !== this.props.sceneId && this.state.message) {
      this.setState({ message: null });
    }
  }

  render() {
    if (this.state.message) {
      return (
        <div className="grid h-full w-full place-items-center px-8 text-center text-white">
          <div>
            <p className="text-lg font-bold">This scene could not start</p>
            <p className="mt-2 max-w-md text-sm text-white/70">{this.state.message}</p>
            <p className="mt-2 text-xs text-white/45">Pick another scene from the bar below.</p>
          </div>
        </div>
      );
    }
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
  const [sceneId, setSceneId] = useState<SceneId>("world-topology");
  const [failure, setFailure] = useState<string | null>(null);
  const webglSupported = useMemo(detectWebGL, []);

  const active = scenes.find((scene) => scene.id === sceneId) ?? scenes[0];
  const ActiveScene = active.Component;

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

      {/* The example owns the whole overlay. No max-height parent that can
          collapse to zero on a phone — that was the old black-screen bug. */}
      <div className="absolute inset-0" style={{ touchAction: "none" }}>
        {webglSupported ? (
          <SceneErrorBoundary sceneId={sceneId} onError={setFailure}>
            <Suspense
              fallback={
                <div className="grid h-full w-full place-items-center bg-[#0b1220] text-white">
                  <div className="flex flex-col items-center gap-3">
                    <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                    <p className="text-sm font-semibold tracking-wide">Loading {active.label}…</p>
                  </div>
                </div>
              }
            >
              {/* `key` remounts the example (and its Canvas) on every switch,
                  so one scene's GL state never leaks into the next. */}
              <ActiveScene key={sceneId} />
            </Suspense>
          </SceneErrorBoundary>
        ) : (
          <div className="grid h-full w-full place-items-center px-8 text-center text-white">
            <div>
              <p className="text-lg font-bold">Game mode can’t start on this device</p>
              <p className="mt-2 text-sm text-white/70">
                {failure ??
                  "WebGL is not available in this browser. Enable hardware acceleration and try again."}
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

      {/* Scene switcher — one entry per installed upstream example. */}
      {webglSupported ? (
        <div className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[101] w-[min(96vw,720px)] -translate-x-1/2">
          <div
            role="tablist"
            aria-label="Strata scenes"
            className="flex items-center gap-1 overflow-x-auto rounded-full bg-black/50 p-1.5 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {scenes.map((scene) => {
              const isActive = scene.id === sceneId;
              return (
                <button
                  key={scene.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  title={scene.blurb}
                  data-strata-scene={scene.id}
                  onClick={() => {
                    setFailure(null);
                    setSceneId(scene.id);
                  }}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition md:text-sm ${
                    isActive
                      ? "bg-white text-slate-900"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                  style={{ touchAction: "manipulation" }}
                >
                  {scene.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[11px] text-white/55">
            {active.blurb} · drag to look, pinch or scroll to zoom, Esc to exit
          </p>
        </div>
      ) : null}
    </div>
  );
}
