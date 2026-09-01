// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-tile.json
//   source item: registry/new-york/ui/glass-tile/glass-tile.tsx
"use client";

import { type ComponentProps, useEffect, useRef, useState } from "react";
import { GlassLens } from "@/components/ui/glass";
import { cn } from "@/lib/utils";

interface GlassTileProps extends ComponentProps<"button"> {
  /** Selected state — adds an accent ring + tint. */
  selected?: boolean;
  /**
   * Opt into real lens refraction. Off by default: the tile is a cheap
   * CSS backdrop-blur surface so a grid of hundreds stays smooth. Turn on only
   * for small grids — it adds a per-tile displacement filter + ResizeObserver.
   */
  refract?: boolean;
}

/**
 * A selectable glass grid cell. Cheap by default (CSS backdrop-blur, no
 * per-cell filter) so it scales to large pickers; `refract` upgrades it to a
 * true refracting lens for small grids.
 */
export function GlassTile({
  selected = false,
  refract = false,
  className,
  children,
  ...props
}: GlassTileProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Only measure when refraction is requested — the cheap path runs no observer.
  useEffect(() => {
    if (!refract) return;
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [refract]);

  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      data-selected={selected || undefined}
      className={cn(
        "group relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl",
        "border outline-none transition-[background,border-color,transform] duration-150 active:scale-[0.97]",
        "backdrop-blur-md focus-visible:ring-2 focus-visible:ring-sky-400/60",
        selected
          ? "border-white/30 bg-white/[0.12] ring-2 ring-sky-400/70"
          : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]",
        className,
      )}
      {...props}
    >
      {refract && size.w > 0 && (
        <GlassLens
          width={size.w}
          height={size.h}
          radius={16}
          strength={0.45}
          blur={1}
          dome={0.12}
          className="pointer-events-none absolute inset-0"
          style={{ width: "100%", height: "100%" }}
        />
      )}

      <span className="relative z-10 flex items-center justify-center">
        {children}
      </span>

      {/* selected sheen */}
      {selected && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 45%)",
          }}
        />
      )}
    </button>
  );
}
