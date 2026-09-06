// src/classroom3d/SurfaceFrame.tsx
//
// A "wall surface" in the 3D classroom: a physical slab of geometry with a
// LIVE DOM panel welded onto its face (drei's <Html transform>). This is how
// the classroom reuses the real course player UI instead of re-implementing
// it — the board, the notes wall and the mind wall are all the same slab with
// different React children on them.
//
// Anything rendered inside is real, focusable, scrollable DOM: rich-text
// editors, iframes, video players and the mind map canvas all keep working.

import { Html } from "@react-three/drei";
import type { ReactNode } from "react";
import { Component, type ErrorInfo } from "react";

/** A crashed panel must never take the whole room down with it. */
class PanelBoundary extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[classroom3d] panel crashed", this.props.label, error, info);
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="grid h-full w-full place-items-center bg-[#0b1220] text-center text-sm font-bold text-white/70">
          <div>
            <p>{this.props.label} could not load.</p>
            <p className="mt-1 text-xs text-white/45">The rest of the classroom is still live.</p>
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
  label,
  children,
}: SurfaceFrameProps) {
  const pixelHeight = Math.round((pixelWidth * height) / width);
  // metres-per-pixel: the DOM plane must land exactly on the slab face.
  const scale = width / pixelWidth;

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
        style={{
          width: pixelWidth,
          height: pixelHeight,
          overflow: "hidden",
          borderRadius: 10,
          background: "#05070f",
          boxShadow: `0 0 ${active ? 70 : 20}px rgba(0,0,0,0.55)`,
          transition: "box-shadow 240ms ease",
        }}
        wrapperClass="dc-classroom-surface"
        zIndexRange={[10, 0]}
      >
        <PanelBoundary label={label}>{children}</PanelBoundary>
      </Html>
      {/* Soft light spill from the panel onto the wall */}
      <pointLight position={[0, 0, 0.9]} intensity={active ? 2.1 : 0.5} distance={4.2} color={accent} />
    </group>
  );
}
