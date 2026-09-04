// src/components/ui/GlassCard.tsx
//
// App-layer wrapper around the vendored `glass-card` registry item.
//
// The pack ships its card with white-on-dark copy (`text-white` on the surface,
// `text-white/55` / `text-white/75` in the parts), which is right for the dark
// demo page and wrong for every surface in this app. Rather than re-ink it from
// `glass.css` at 40 call sites, the wrapper pins the light defaults once and
// re-exports the parts. `cn` is tailwind-merge, so a page that *does* sit on a
// dark panel can pass its own `text-*` class and win.
//
// The registry's `GlassCard` hardcodes `radius={20}`, so `rounded-3xl` cards
// (24 px) land at 20 px here — that is the pack's card radius, and 4 px of
// corner is the price of not forking a vendored file.
import { type ComponentProps } from "react";
import {
  GlassCard as RegistryGlassCard,
  GlassCardContent as RegistryGlassCardContent,
  GlassCardDescription as RegistryGlassCardDescription,
  GlassCardFooter as RegistryGlassCardFooter,
  GlassCardHeader as RegistryGlassCardHeader,
  GlassCardTitle as RegistryGlassCardTitle,
} from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { GLASS_DOCS } from "@/lib/glassDocs";

export type AppGlassCardProps = ComponentProps<typeof RegistryGlassCard> & {
  /**
   * The registry card hardcodes `contentClassName="p-5"`; the prop is forwarded
   * (the vendored item spreads caller props last, so it wins) and typed here —
   * media cards need `p-0` to keep the artwork edge-to-edge.
   */
  contentClassName?: string;
  /** Material overrides — they default to the pinned docs sensitivity. */
  tint?: number;
  radius?: number;
  blur?: number;
  specular?: boolean;
  saturation?: number;
};

/**
 * The pinned "sensitivity" (websiteglass.com/docs/components/glass playground):
 * radius 24 · strength 0.5 · blur 4 · tint 0.25 · dome 0.1. Cards are frosted
 * GlassSurface surfaces, so they take the config's tint/blur/radius — the same
 * numbers the dock and headers read from GLASS_DOCS. Callers may still override
 * (the spread wins).
 */
const DOCS_MATERIAL = {
  tint: GLASS_DOCS.tint,
  radius: GLASS_DOCS.radius,
  blur: GLASS_DOCS.blur,
} as ComponentProps<typeof RegistryGlassCard>;

export function GlassCard({
  className,
  ...props
}: AppGlassCardProps) {
  return (
    <RegistryGlassCard
      /* The pinned docs sensitivity + white ink. `dc-glass-card` carries the
         rim hook in glass.css. */
      {...DOCS_MATERIAL}
      className={cn("dc-glass-card text-white", className)}
      {...props}
    />
  );
}

export function GlassCardHeader({ className, ...props }: ComponentProps<"div">) {
  return <RegistryGlassCardHeader className={cn("gap-0.5", className)} {...props} />;
}

export function GlassCardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <RegistryGlassCardTitle className={cn("text-[15px] font-extrabold text-white", className)} {...props} />;
}

export function GlassCardDescription({ className, ...props }: ComponentProps<"p">) {
  return <RegistryGlassCardDescription className={cn("text-white/60", className)} {...props} />;
}

export function GlassCardContent({ className, ...props }: ComponentProps<"div">) {
  return <RegistryGlassCardContent className={cn("text-white/80", className)} {...props} />;
}

export function GlassCardFooter({ className, ...props }: ComponentProps<"div">) {
  return <RegistryGlassCardFooter className={cn("mt-3", className)} {...props} />;
}
