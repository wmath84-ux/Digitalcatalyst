// src/nature3d/SafariStudioPage.tsx
//
// THE CLAY SAFARI PAGE — the second 3D area, opened by its own rail button.
//
// Same full-screen treatment as the Sanctuary: this page is the only thing on
// screen, no side panel and no top bar. Same HUD language, same Joystick
// component, same exit affordance, so moving between the two worlds does not
// feel like moving between two different products.
//
// React mounts the canvas and draws the HUD. It never re-renders while the
// world animates: the joystick talks to the engine through a ref.

import { useCallback, useEffect, useRef, useState } from "react";
import { LogOut, Maximize2, Minimize2 } from "lucide-react";
import Joystick from "./components/Joystick";
import { SafariWorld } from "./safari/SafariWorld";
import { webglSupported } from "./engine/quality";

export default function SafariStudioPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SafariWorld | null>(null);

  const [supported] = useState(() => webglSupported());
  const [booting, setBooting] = useState(true);
  const [progress, setProgress] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setImmersive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // ── Boot the world once ─────────────────────────────────────────────
  useEffect(() => {
    if (!supported) return undefined;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return undefined;

    let engine: SafariWorld | null = null;
    try {
      engine = new SafariWorld({
        canvas,
        onProgress: (f) => setProgress(f),
        onReady: () => setBooting(false),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The 3D world could not start on this device.");
      return undefined;
    }
    engineRef.current = engine;

    const resize = () => {
      const r = host.getBoundingClientRect();
      engine?.resize(r.width, r.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    return () => {
      ro.disconnect();
      engine?.dispose();
      engineRef.current = null;
    };
  }, [supported]);

  const onMoveStick = useCallback((x: number, y: number, active: boolean) => {
    engineRef.current?.setMoveStick(x, y, active);
  }, []);

  const exitSafari = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    window.location.hash = "#/home";
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  }, []);

  if (!supported || error) {
    return (
      <main className="fixed inset-0 z-[90] grid place-items-center bg-[#0b1620] p-8 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-lg font-semibold text-white">Clay Safari can’t run here</h1>
          <p className="text-sm text-white/70">
            {error ?? "This device or browser doesn’t support WebGL, which the 3D world needs."}
          </p>
          <button
            onClick={exitSafari}
            className="rounded-full bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
          >
            Back to Digital Catalyst
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 z-[90] bg-[#0b1620]">
      <div
        ref={hostRef}
        className="absolute overflow-hidden bg-[#0b1620]"
        style={{ inset: 0, touchAction: "none" }}
      >
        <canvas ref={canvasRef} className="block h-full w-full outline-none" />

        {booting && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#0b1620]">
            <div className="space-y-3 text-center">
              <div className="text-sm font-medium text-white/80">Shaping the clay…</div>
              <div className="mx-auto h-1 w-48 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-[width] duration-200"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── HUD ── */}
        <div className="pointer-events-none absolute inset-0">
          <header className="pointer-events-auto absolute left-3 right-3 top-3 flex items-center justify-between">
            <div className="rounded-full bg-black/35 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur">
              Clay Safari
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleFullscreen}
                title={immersive ? "Exit fullscreen" : "Fullscreen"}
                className="pointer-events-auto rounded-full bg-black/35 p-2 text-white/90 backdrop-blur hover:bg-black/50"
              >
                {immersive ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={exitSafari}
                title="Back to Digital Catalyst"
                className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-2 text-xs text-white/90 backdrop-blur hover:bg-black/50"
              >
                <LogOut className="h-3.5 w-3.5 text-rose-200" />
                <span className="hidden sm:inline">Exit</span>
              </button>
            </div>
          </header>

          {/* Move joystick — same component and same feel as the Sanctuary. */}
          <div className="pointer-events-auto absolute bottom-6 left-6">
            <Joystick onChange={onMoveStick} label="Move" accent="#34d399" size={128} />
          </div>
        </div>
      </div>
    </main>
  );
}
