import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  useRef,
} from "react";
import "./vampirebat-button.css";
import { Track, glide, easeGel, easeSoft, PRESS, RELEASE } from "./glass-motion";
import { cn } from "@/lib/utils";

/**
 * VampirebatButton — a faithful React port of Marcelo Dolza's
 * "stupid-vampirebat-24" Uiverse button:
 *   https://uiverse.io/marcelodolza/stupid-vampirebat-24
 *
 * Selected treatment ONLY — the Home page promotion-card CTAs
 * (Explore Now / Grab Deal / Reserve Seat). Not a global button.
 *
 * The reference's whole animation system is ported (entrance letter
 * cascade + arrow slide-in, hover shimmer + letter re-bloom + arrow
 * swing, active splash + shadow compression, focus letter swap +
 * arrow flight + path stroke).
 *
 * The promotion buttons' EXISTING press behaviour is preserved on top
 * of it: the same pointer-down scale (→0.92, PRESS/easeGel) and release
 * (→1, RELEASE/easeSoft) glide the previous GlassButton capsule ran —
 * applied as the CSS `scale` property, which composes with the
 * reference's rotate/skew transform without conflicting.
 *
 * Labels are split into per-letter spans to reproduce the reference's
 * stagger (each letter carries `--i`), but the visible text is never
 * changed: pass the real CTA text as `label`.
 */
export interface VampirebatButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visible button text (the promotion CTA label). */
  label: string;
}

export function VampirebatButton({
  label,
  className,
  style,
  type = "button",
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  ...props
}: VampirebatButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const scale = useRef(new Track(1));

  // The existing promotion-button press feedback, unchanged in behaviour.
  const press = () => {
    scale.current.watch((v) => {
      if (btnRef.current) btnRef.current.style.scale = String(v);
    });
    glide(scale.current, 0.92, PRESS, easeGel);
  };
  const release = () => {
    glide(scale.current, 1, RELEASE, easeSoft);
  };

  // One glyph cell per character; the space gets manual width (the
  // reference's nth-child(5) margins) and a non-breaking data-label so
  // the pseudo-element copies never collapse. Glyphs are direct flex
  // items of their `.uzv-ch` group, so the fragment has no wrapper.
  const glyphs = (
    <>
      {Array.from(label).map((char, index) => {
        const isSpace = char === " ";
        return (
          <span
            key={index}
            className={isSpace ? "uzv-glyph uzv-glyph--space" : "uzv-glyph"}
            style={{ "--i": index } as CSSProperties}
            data-label={isSpace ? "\u00A0" : char}
          >
            {char}
          </span>
        );
      })}
    </>
  );

  return (
    <button
      {...props}
      ref={btnRef}
      type={type}
      className={cn("uiverse-vampirebat", className)}
      style={style}
      onPointerDown={(e) => {
        press();
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        release();
        onPointerUp?.(e);
      }}
      onPointerLeave={(e) => {
        release();
        onPointerLeave?.(e);
      }}
      onPointerCancel={(e) => {
        release();
        onPointerCancel?.(e);
      }}
    >
      <span className="uzv-bg" aria-hidden="true" />
      <span className="uzv-wrap">
        <span className="uzv-outline" aria-hidden="true" />
        <span className="uzv-content">
          <span className="uzv-words">
            <span className="uzv-ch uzv-state-1">{glyphs}</span>
            {/* The focus-state duplicate label (re-renters at the
                reference's 80px offset); decorative. */}
            <span className="uzv-ch uzv-state-2" aria-hidden="true">
              {glyphs}
            </span>
          </span>
          <span className="uzv-icon" aria-hidden="true">
            <div />
          </span>
          {/* Focus stroke (draws along the bottom edge on :focus). */}
          <svg
            className="uzv-path"
            viewBox="0 0 220 80"
            preserveAspectRatio="none"
            width="100%"
            height="100%"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M-20 74 C 20 40 45 96 85 62 C 125 28 150 96 190 66 C 215 48 235 74 250 58"
              fill="none"
              strokeWidth="2.5"
            />
          </svg>
          {/* Active splash (dashed ripple in the top-left corner). */}
          <svg
            className="uzv-splash"
            viewBox="0 0 90 90"
            width="90"
            height="90"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="45" cy="45" r="38" fill="none" strokeWidth="2.5" />
          </svg>
        </span>
      </span>
    </button>
  );
}

export default VampirebatButton;
