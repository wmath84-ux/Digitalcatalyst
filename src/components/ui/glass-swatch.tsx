// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-swatch.json
//   source item: registry/new-york/ui/glass-swatch/glass-swatch.tsx
"use client";

import {
  type ComponentProps,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { cn } from "@/lib/utils";

interface SwatchGroupCtx {
  value?: string;
  setValue?: (v: string) => void;
}
const SwatchContext = createContext<SwatchGroupCtx>({});

interface GlassSwatchGroupProps extends Omit<ComponentProps<"div">, "onChange"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

/** Radio-group wrapper for a row of swatches. Controlled via value/onValueChange. */
export function GlassSwatchGroup({
  value,
  onValueChange,
  className,
  children,
  ...props
}: GlassSwatchGroupProps) {
  const setValue = useCallback((v: string) => onValueChange?.(v), [onValueChange]);
  const ctx = useMemo(() => ({ value, setValue }), [value, setValue]);
  return (
    <SwatchContext.Provider value={ctx}>
      <div role="radiogroup" className={cn("flex flex-wrap gap-2.5", className)} {...props}>
        {children}
      </div>
    </SwatchContext.Provider>
  );
}

interface GlassSwatchProps extends Omit<ComponentProps<"button">, "color"> {
  /** Fill colour — any CSS color. */
  color: string;
  /** Value within a GlassSwatchGroup. */
  value?: string;
  /** Standalone selected state (ignored inside a group). */
  selected?: boolean;
  /** Accessible name (also the native tooltip). */
  title?: string;
  size?: number;
}

/**
 * A glass-edged colour swatch: an opaque colour fill with a glassy rim and
 * sheen, a selected accent ring, and a press. Use inside `GlassSwatchGroup`
 * (radio behaviour via `value`) or standalone (`selected` + `onClick`).
 */
export function GlassSwatch({
  color,
  value,
  selected: selectedProp,
  title,
  size = 36,
  className,
  onClick,
  ...props
}: GlassSwatchProps) {
  const group = useContext(SwatchContext);
  const inGroup = value !== undefined && group.setValue !== undefined;
  const selected = inGroup ? group.value === value : !!selectedProp;

  return (
    <button
      type="button"
      role={inGroup ? "radio" : undefined}
      aria-checked={inGroup ? selected : undefined}
      aria-pressed={inGroup ? undefined : selected}
      aria-label={title}
      title={title}
      onClick={(e) => {
        if (inGroup && value !== undefined) group.setValue?.(value);
        onClick?.(e);
      }}
      className={cn(
        "relative shrink-0 rounded-full outline-none transition-transform duration-150 active:scale-90",
        "focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        selected && "ring-2 ring-white ring-offset-2 ring-offset-transparent",
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      {/* colour fill */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: color,
          boxShadow:
            "inset 0 1px 1.5px rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      />
      {/* glass rim sheen */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "linear-gradient(145deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 48%)",
        }}
      />
    </button>
  );
}
