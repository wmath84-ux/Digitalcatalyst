import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import "./watch-action-button.css";
import { cn } from "@/lib/utils";

/**
 * WatchActionButton — the action button worn above every product on the
 * My Purchases page.
 *
 * A faithful React port of shah1345's "spicy-liger-32" Uiverse button
 * (https://uiverse.io/shah1345/spicy-liger-32); the material, the two
 * pseudo-element "goo" ellipses, the hover fill and the inset press all live
 * in `watch-action-button.css` and are not re-interpreted here.
 *
 * Only the LABEL is dynamic (`label`), so a purchased course reads
 * WATCH NOW while a purchased e-book reads OPEN NOW and an in-progress course
 * can read CONTINUE LEARNING — one component, one design, every product.
 *
 * It contains no routing or entitlement logic: it is a real <button> that
 * forwards every native prop, so the caller keeps the app's existing
 * purchased-product action (`onOpenCourse({ id, title })` → the course
 * player) untouched and per product.
 */
export interface WatchActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visible action text (uppercased by the component, e.g. "Watch Now"). */
  label: string;
  /** Screen-reader name; defaults to `label`. Pass the product title for context. */
  ariaLabel?: string;
  /** Contract hooks may also be written literally: `data-foo="bar"`. */
  [dataAttribute: `data-${string}`]: string | undefined;
}

/** The reference's own press timing: `transition: all 0.2s ease-in`. */
const PRESS_MS = 200;

export function WatchActionButton({
  label,
  ariaLabel,
  className,
  disabled,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onKeyDown,
  onKeyUp,
  onClick,
  ...props
}: WatchActionButtonProps) {
  const [pressed, setPressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPressed(false);
  }, []);

  /* Mirrors the reference's `:active` frame for touch and keyboard, where
     `:active` alone is unreliable. No new animation is invented: the rules
     under `[data-uzw-press="true"]` are the reference's own `:active`
     declarations, and they reset after the reference's 0.2s transition. */
  const press = useCallback(() => {
    if (disabled) return;
    setPressed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(release, PRESS_MS);
  }, [disabled, release]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button
      {...props}
      type="button"
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      data-uzw-press={pressed ? "true" : undefined}
      className={cn("uzw-btn", className)}
      onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
        press();
        onPointerDown?.(event);
      }}
      onPointerUp={(event: ReactPointerEvent<HTMLButtonElement>) => {
        release();
        onPointerUp?.(event);
      }}
      onPointerLeave={(event: ReactPointerEvent<HTMLButtonElement>) => {
        release();
        onPointerLeave?.(event);
      }}
      onPointerCancel={(event: ReactPointerEvent<HTMLButtonElement>) => {
        release();
        onPointerCancel?.(event);
      }}
      onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Enter" || event.key === " ") press();
        onKeyDown?.(event);
      }}
      onKeyUp={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Enter" || event.key === " ") release();
        onKeyUp?.(event);
      }}
      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
        press();
        onClick?.(event);
      }}
    >
      <span className="uzw-btn__label">{label}</span>
    </button>
  );
}

export default WatchActionButton;
