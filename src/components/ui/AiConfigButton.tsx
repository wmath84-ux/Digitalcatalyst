import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import "./ai-config-button.css";
import { cn } from "@/lib/utils";

/**
 * AiConfigButton — the Revision → AI Configuration action button.
 *
 * A faithful React port of 0xnihilism's "quiet-dog-6" brutalist AI-provider
 * button (https://uiverse.io/0xnihilism/quiet-dog-6); the complete visual
 * behaviour (130×130 tile, 3px black border, 12px radius, 4px hard shadow,
 * the #356854 field with the #316b58 circle that rises from the bottom, the
 * dark logo disc that shrinks to 50px / climbs to 28% / spins on a 5s linear
 * loop, the label that slides up into view, the −4px hover lift and the
 * +2px press with its shadow collapse, and every easing curve in between) is
 * carried verbatim by `ai-config-button.css`.
 *
 * One component, dynamic content (Part 1A): `mark`/`icon` set the logo,
 * `caption`/`label` set the two text lines. Changing the provider, the model
 * or the wording swaps those contents only — the structure, dimensions,
 * animation and interaction are byte-for-byte the same, so there is never a
 * second component for a second label.
 *
 * Click behaviour (Part 1B): the reference's `:active` press IS the click
 * interaction, so it is kept — and additionally replayed as a full
 * `press → hold → reset` sequence in JS (`[data-uza-click]`) so the whole
 * animation is visible on a quick tap, on a keyboard activation and on touch.
 * `onClick` (the app's existing AI configuration action) then runs when that
 * sequence ends — under `prefers-reduced-motion` it runs immediately. Loading
 * is expressed with the reference's own hover choreography, so the existing
 * testing / processing state never replaces the animation.
 *
 * No AI logic lives here: provider, model, key handling, validation, saving
 * and error display all stay with the caller.
 */

/** The reference's own 0.4s tile transition is its press/reset timing. */
const PRESS_SEQUENCE_MS = 400;

export interface AiConfigButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Logo slot content. Pass a provider glyph string ("◐") or your own <svg>. */
  icon?: ReactNode;
  /** Small upper line, e.g. "Powered By" / the provider name. */
  caption?: ReactNode;
  /** Loud second line, e.g. the model or provider display name. */
  label: ReactNode;
  /** Existing processing state (kept accessible via aria-busy). */
  loading?: boolean;
  /**
   * The existing AI provider id (`getProvider(id).id`). The reference paints a
   * variant per provider, so this only picks the reference's own colours —
   * unknown ids keep the component default. Never used to branch behaviour.
   */
  provider?: string;
  /** The caller's AI configuration action — runs after the click animation. */
  onClick?: (event?: ReactMouseEvent<HTMLButtonElement>) => void;
  /** Contract hooks may also be written literally: `data-foo="bar"`. */
  [dataAttribute: `data-${string}`]: string | undefined;
}

/** The reference's own OpenAI glyph — the default logo when nothing is passed. */
function OpenAiGlyph() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path
        d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5907 8.3829 14.6108 7.2144a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.3927-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
        fill="#10A37F"
      />
    </svg>
  );
}

export function AiConfigButton({
  icon,
  caption = "Powered by",
  label,
  loading = false,
  provider,
  disabled,
  onClick,
  className,
  type = "button",
  children: _ignoredChildren,
  ...props
}: AiConfigButtonProps) {
  const [clicking, setClicking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBlocked = Boolean(disabled) || loading;

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setClicking(false);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const prefersReducedMotion = () => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  const handleClick = () => {
    const run = () => {
      timer.current = null;
      setClicking(false);
      onClick?.();
    };
    if (isBlocked || prefersReducedMotion()) {
      if (timer.current) clearTimeout(timer.current);
      run();
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    // Play the reference press first, then execute the existing action.
    setClicking(true);
    timer.current = setTimeout(run, PRESS_SEQUENCE_MS);
  };

  const contentText = [caption, label]
    .filter(Boolean)
    .map((node) => (typeof node === "string" ? node : ""))
    .join(" · ");

  return (
    <button
      {...props}
      type={type}
      disabled={isBlocked}
      aria-busy={loading || undefined}
      aria-label={props["aria-label"] ?? (contentText || undefined)}
      data-uza-state={loading ? "loading" : undefined}
      data-uza-provider={provider || undefined}
      data-uza-click={clicking ? "true" : undefined}
      className={cn("uza-tile", className)}
      onClick={handleClick}
      onBlur={clear}
    >
      <span className="uza-logo">
        <span className="uza-icon">
          {typeof icon === "string" ? <span className="uza-mark">{icon}</span> : (icon ?? <OpenAiGlyph />)}
        </span>
      </span>
      <span className="uza-text">
        <span>{caption}</span>
        <span>{label}</span>
      </span>
    </button>
  );
}

export default AiConfigButton;
