// src/classroom3d/SurfaceFrame.tsx
//
// A "wall surface" in the 3D classroom: a physical slab of geometry with a
// LIVE DOM panel welded onto its face (drei's <Html transform>). This is how
// the classroom reuses the real course player UI instead of re-implementing
// it — the lecture board, the notes board and the mind map board are all the
// same slab with different React children on them.
//
// Anything rendered inside is real, focusable, scrollable DOM: rich-text
// editors, iframes, video players and the mind map canvas all keep working.
//
// Three things make that true rather than merely intended:
//
//   · the panel is scaled through `surfaceScale()`, the ONLY correct px →
//     metre mapping for a drei <Html transform> (see surfaceScale.ts). The
//     hand-rolled `width / pixelWidth` this file used to carry was 40× too
//     small, which is why every surface in the room read as an empty slab;
//   · the panel gets `attachDragScroll`, because the room's own
//     `touch-action: none` (needed so head-turn drags never scroll the page)
//     also disables native touch scrolling inside these panels;
//   · the panel is wrapped in <SurfaceContexts>, because drei's <Html> renders
//     it into a SECOND React root where no context crosses — without the
//     bridge, `ResourceViewer`'s `useAuth()` throws and the board dies with
//     "Lecture board could not load" while the rest of the room looks fine.
//     See SurfaceContexts.tsx for the whole story.

import { Html } from "@react-three/drei";
import type { ReactNode } from "react";
import { Component, type ErrorInfo } from "react";
import { surfaceScale } from "./surfaceScale";
import SurfaceContexts, { useSurfaceContexts } from "./SurfaceContexts";
import { useDragScroll } from "./useSurfaceScroll";

/**
 * A crashed panel must never take the whole room down with it — and it must
 * never be a dead end either. The old boundary swallowed the reason and left
 * the learner staring at "could not load" with nothing to do, which is how a
 * one-line context error survived long enough to be reported as "content play
 * nahin ho raha". It now names the failure and offers a retry, because a
 * transient throw (a suspended asset, a first-frame race) usually renders
 * fine the second time.
 */
class PanelBoundary extends Component<
  { label: string; children: ReactNode },
  { failed: boolean; message: string }
> {
  state = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return {
      failed: true,
      message: error instanceof Error ? error.message : String(error ?? "Unknown error"),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[classroom3d] panel crashed", this.props.label, error, info);
  }

  private readonly retry = () => this.setState({ failed: false, message: "" });

  render() {
    if (this.state.failed) {
      return (
        <div
          className="grid h-full w-full place-items-center bg-[#0b1220] px-8 text-center text-sm font-bold text-white/70"
          data-classroom-surface-error
        >
          <div className="max-w-[46rem]">
            <p>{this.props.label} could not load.</p>
            <p className="mt-1 text-xs text-white/45">The rest of the classroom is still live.</p>
            {/* The real reason, on the slab itself: a learner can read it out
                and a developer can fix it without a console. */}
            <p
              className="mt-3 break-words rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-left font-mono text-[11px] font-semibold leading-relaxed text-rose-200/80"
              data-classroom-surface-error-detail
            >
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={this.retry}
              className="mt-4 rounded-xl border border-white/15 bg-white/10 px-5 py-2.5 text-xs font-black text-white/85 transition hover:bg-white/16"
              data-classroom-surface-retry
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface SurfaceFrameProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  /** Surface size in metres. */
  width: number;
  height: number;
  /** CSS pixels the DOM panel is authored at — scaled onto the slab. */
  pixelWidth?: number;
  /** Frame + glow colour. */
  accent?: string;
  /** Dim the frame when the learner is not facing this surface. */
  active?: boolean;
  /** Render the glow light the panel spills onto the wall (off on low tier). */
  spill?: boolean;
  label: string;
  children: ReactNode;
}

export default function SurfaceFrame({
  position,
  rotation = [0, 0, 0],
  width,
  height,
  pixelWidth = 1280,
  accent = "#8b5cf6",
  active = true,
  spill = true,
  label,
  children,
}: SurfaceFrameProps) {
  const pixelHeight = Math.round((pixelWidth * height) / width);
  // The DOM plane must land exactly on the slab face: drei maps 40 CSS px to
  // one world unit, so the scale is (metres / px) × 40 — never (metres / px).
  const scale = surfaceScale(width, pixelWidth);
  // Finger + mouse drag scrolling for everything inside this surface.
  const panelRef = useDragScroll<HTMLDivElement>();
  // Captured HERE, inside the canvas (R3F bridges the DOM tree's contexts into
  // the canvas reconciler), and re-provided inside the <Html> below — which
  // renders into a second React root that would otherwise see none of them.
  const contexts = useSurfaceContexts();
  const panelStyle = {
    width: `${pixelWidth}px`,
    height: `${pixelHeight}px`,
    minWidth: `${pixelWidth}px`,
    minHeight: `${pixelHeight}px`,
    overflow: "hidden",
    borderRadius: 10,
    background: "#05070f",
    boxShadow: `0 0 ${active ? 70 : 20}px rgba(0,0,0,0.55)`,
    transition: "box-shadow 240ms ease",
  };
  return (
    <group position={position} rotation={rotation}>
      {/* Outer bezel */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width + 0.16, height + 0.16, 0.08]} />
        <meshStandardMaterial
          color={active ? "#211a33" : "#171426"}
          roughness={0.55}
          metalness={0.35}
          emissive={accent}
          emissiveIntensity={active ? 0.16 : 0.04}
        />
      </mesh>
      {/* Dark backing so the DOM panel never shows the room through it */}
      <mesh position={[0, 0, 0.041]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#05070f" />
      </mesh>
      {/* The live DOM panel */}
      <Html
        transform
        occlude={false}
        position={[0, 0, 0.05]}
        distanceFactor={undefined}
        scale={scale}
        style={panelStyle}
        wrapperClass="dc-classroom-surface"
        zIndexRange={[10, 0]}
      >
        <SurfaceContexts value={contexts}>
          <div
            ref={panelRef}
            className="h-full w-full min-h-0 min-w-0"
            data-classroom-surface-panel
            data-classroom-surface-scroll
          >
            <PanelBoundary label={label}>{children}</PanelBoundary>
          </div>
        </SurfaceContexts>
      </Html>
      {/* Soft light spill from the panel onto the wall — dropped entirely on
          the low tier (3 fewer shaded lights) while the emissive frame keeps
          reading as a glow. */}
      {spill && (
        <pointLight position={[0, 0, 0.9]} intensity={active ? 2.1 : 0.5} distance={4.2} color={accent} />
      )}
    </group>
  );
}
