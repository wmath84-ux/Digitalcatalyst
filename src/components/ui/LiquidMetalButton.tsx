import React, { forwardRef, useRef } from "react";
import { GlassSurface, type GlassSurfaceHandle } from "./glass";
import { PRESS, RELEASE, Track, easeGel, easeSoft, glide } from "./glass-motion";
import "./liquidMetalButton.css";

/**
 * LiquidMetalButton — the app's primary action button.
 *
 * Wave 1 (liquid glass) keeps this component's API (`tone`, `className`, all
 * button props, the forwarded ref, the `data-liquid-tone` marker and the
 * `eduvora-primary-action` hook that other styles/tests target) and swaps its
 * material for the pack's: the disc is a `GlassSurface` (frost + specular rim)
 * that squeezes and clears its tint while held, driven by the shared
 * `Track`/`glide` core — the same gel press `glass-button` performs, wired so
 * this app's tones and full-width layout still work.
 *
 * `liquidMetalButton.css` is still imported on purpose: it owns the gradient
 * for the *pre-glass* look, focus-visible and disabled states. `src/glass.css`
 * neutralises the opaque gradient only under `html[data-glass="on"]`, so the
 * kill switch genuinely rolls the button back instead of leaving a half-glass
 * control.
 */
export type LiquidMetalTone = "silver" | "blue" | "dark" | "danger" | "primary";

export interface LiquidMetalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: LiquidMetalTone;
  /** Frosted tint 0–1 of the glass surface. */
  tint?: number;
  /** "icon" renders a circular disc instead of a capsule. */
  shape?: "capsule" | "icon";
}

// tone → (surface tint colour, label colour). Silver is the neutral/secondary
// action, blue/dark the primary, danger the destructive confirm.
// Tint is deliberately high for the coloured tones: a lens over a *light* page
// is a pale wash, so a white label would drop under contrast if the fill were
// as thin as upstream's 0.4 default. Silver stays a light frosted neutral.
const TONES: Record<LiquidMetalTone, { rgb: string; tint: number; label: string }> = {
  silver: { rgb: "226,232,240", tint: 0.72, label: "text-slate-700" },
  blue: { rgb: "59,130,246", tint: 0.62, label: "text-white" },
  dark: { rgb: "15,23,42", tint: 0.7, label: "text-white" },
  danger: { rgb: "225,29,72", tint: 0.62, label: "text-white" },
  primary: { rgb: "79,70,229", tint: 0.66, label: "text-white" },
};

const LiquidMetalButton = forwardRef<HTMLButtonElement, LiquidMetalButtonProps>(({
  children,
  className = "",
  tone = "blue",
  tint,
  shape = "capsule",
  disabled,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  ...buttonProps
}, ref) => {
  const surface = useRef<GlassSurfaceHandle | null>(null);
  const scaleEl = useRef<HTMLSpanElement | null>(null);
  const scale = useRef(new Track(1));
  const spec = TONES[tone] ?? TONES.blue;
  const isIcon = shape === "icon";

  // Same numbers as upstream GlassButton: press squeezes to 0.92 with the gel
  // ease and clears the tint; release springs back over RELEASE seconds.
  const press = () => {
    scale.current.watch((v) => {
      if (scaleEl.current) scaleEl.current.style.scale = String(v);
    });
    surface.current?.setTintLift(-0.14);
    glide(scale.current, 0.92, PRESS, easeGel);
  };

  const release = () => {
    surface.current?.setTintLift(0);
    glide(scale.current, 1, RELEASE, easeSoft);
  };

  return (
    <button
      {...buttonProps}
      ref={ref}
      disabled={disabled}
      data-liquid-tone={tone}
      className={`liquid-metal-button eduvora-primary-action relative select-none outline-none transition-[filter] focus-visible:brightness-110 ${
        isIcon ? "size-11 p-0" : "h-11 w-full max-w-full p-0"
      } ${className}`.trim()}
      onPointerDown={(e) => { if (!disabled) press(); onPointerDown?.(e); }}
      onPointerUp={(e) => { release(); onPointerUp?.(e); }}
      onPointerLeave={(e) => { release(); onPointerLeave?.(e); }}
      onPointerCancel={(e) => { release(); onPointerCancel?.(e); }}
    >
      <span ref={scaleEl} className="block h-full w-full origin-center" style={{ scale: "1" }}>
        <GlassSurface
          handleRef={surface}
          tint={tint ?? spec.tint}
          tintColor={spec.rgb}
          blur={16}
          saturation={1.5}
          radius={isIcon ? 999 : 14}
          /* height lives here (like upstream GlassButton) so the flex-1 caller
             only decides the width; `min-w-0` lets long labels truncate instead
             of pushing the neighbour out of a `flex gap-3` row. */
          className={isIcon ? "size-11" : "h-11 w-full min-w-0"}
          contentClassName={`flex h-full w-full items-center justify-center gap-2 px-5 text-sm font-semibold ${spec.label}`}
        >
          {children}
        </GlassSurface>
      </span>
    </button>
  );
});

LiquidMetalButton.displayName = "LiquidMetalButton";

export default LiquidMetalButton;
export { LiquidMetalButton };
