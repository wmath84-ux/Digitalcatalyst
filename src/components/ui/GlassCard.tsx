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

export type AppGlassCardProps = ComponentProps<typeof RegistryGlassCard> & {
  /**
   * The registry card hardcodes `contentClassName="p-5"`; the prop is forwarded
   * (the vendored item spreads caller props last, so it wins) and typed here —
   * media cards need `p-0` to keep the artwork edge-to-edge.
   */
  contentClassName?: string;
};

export function GlassCard({
  className,
  ...props
}: AppGlassCardProps) {
  return (
    <RegistryGlassCard
      /* Phase A6: the pack's own tint (0.4) and white ink — no app-side
         material. `dc-glass-card` only carries the rim hook in glass.css. */
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
