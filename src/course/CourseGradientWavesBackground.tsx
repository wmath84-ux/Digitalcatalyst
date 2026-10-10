// src/course/CourseGradientWavesBackground.tsx
//
// The Course Player's animated background: the SAME React Bits "Gradient
// Waves" component the landing page paints (src/components/GradientWaves.tsx,
// https://reactbits.dev/c/backgrounds/gradient-waves), at the SAME documented
// defaults — #5227FF horizon, #FF9FFC waves, #FFFFFF crests, grain on, cursor
// parallax on. Nothing is approximated with a static gradient.
//
// It is driven by Player settings → "Modern module listing":
//   ON  (default) → this layer is mounted behind the player's content area;
//   OFF           → this layer is unmounted and the legacy backdrop painted by
//                   `.course-player-shell` (flatPlayerChrome.css / the light
//                   theme in courseTheme.css) shows again, untouched.
//
// ── Layering ────────────────────────────────────────────────────────────
// Mounted as the FIRST child of the player's stage (the area between the top
// progress rail and the bottom of the screen) with `position:absolute; inset:0;
// z-index:-1; pointer-events:none`. The shell is `position:fixed`, i.e. its own
// stacking context, so z-index -1 paints the waves directly above the shell's
// legacy backdrop and BELOW every other thing in the player: the lesson and
// study panes, the divider, the peek dock, the snow, the centre completion
// control, and every dialog / sheet / popover (which all carry positive
// z-indexes or are portalled to <body>). No z-index is added to any existing
// element, so no overlay gets trapped in a new stacking context.
//
// The layer never receives pointer events (clicks, taps, wheel and touch
// scrolling all land on the content above it); the component's cursor
// parallax listens on `window` instead (the landing page's documented
// adaptation), so the effect still follows the pointer.
//
// ── Performance ─────────────────────────────────────────────────────────
//   · One WebGL context per mount. The component is memoised and takes no
//     props from the player, so the player's frequent re-renders never touch
//     it, and GradientWaves itself creates its renderer once (mount effect with
//     no dependencies) — never per render.
//   · Toggling OFF unmounts it: GradientWaves' cleanup cancels the rAF loop,
//     disconnects its Resize/Intersection observers, removes its window /
//     document listeners, removes the canvas and calls WEBGL_lose_context, so
//     the GPU memory is released immediately.
//   · The loop already pauses while the tab is hidden or the layer is off
//     screen (React Bits' own IntersectionObserver + visibilitychange).
//   · Pixel-ratio cap: 1× on touch devices (Android phones / tablets), 1.5× on
//     desktop. The waves are a soft field, so the look is the same while the
//     raymarch shades 2–4× fewer pixels next to a playing lesson.
//   · WebGL2 is probed ONCE per session (cached) — re-probing on every toggle
//     would burn through the browser's live-context budget.
//   · A tiny error boundary means a lost / refused GPU context can only ever
//     remove the background, never take the player down with it.

import { Component, memo, type ReactNode } from "react";
import GradientWaves from "../components/GradientWaves";

let webgl2Supported: boolean | null = null;

/**
 * The shader is `#version 300 es`; ogl silently falls back to WebGL1 when
 * WebGL2 is missing and the compile then throws in the mount effect. Probed
 * once and cached for the session.
 */
export function supportsCourseGradientWaves(): boolean {
  if (webgl2Supported !== null) return webgl2Supported;
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    webgl2Supported = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl2Supported = false;
  }
  return webgl2Supported;
}

/** 1× on coarse-pointer (touch) devices, 1.5× elsewhere. */
export function courseGradientWavesMaxDpr(): number {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return 1.5;
  try {
    return window.matchMedia("(pointer: coarse)").matches ? 1 : 1.5;
  } catch {
    return 1.5;
  }
}

/** Swallows a GPU/context failure so only the background disappears. */
class WavesErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (typeof console !== "undefined") console.warn("[CoursePlayer] Gradient Waves background disabled:", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function CourseGradientWavesBackgroundImpl() {
  const supported = supportsCourseGradientWaves();
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[-1] overflow-hidden"
      aria-hidden="true"
      data-course-gradient-waves=""
      data-webgl2={supported ? "true" : "false"}
    >
      {supported ? (
        <WavesErrorBoundary>
          {/* Landing page's exact component and defaults — only the pixel
              ratio cap differs (see header). */}
          <GradientWaves maxDpr={courseGradientWavesMaxDpr()} />
        </WavesErrorBoundary>
      ) : null}
    </div>
  );
}

/** Memoised: the player re-renders constantly; this layer never needs to. */
const CourseGradientWavesBackground = memo(CourseGradientWavesBackgroundImpl);
export default CourseGradientWavesBackground;
