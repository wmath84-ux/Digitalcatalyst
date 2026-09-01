// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-card.json
//   source item: registry/new-york/ui/glass-card/glass-card.tsx
"use client";

import { type ComponentProps } from "react";
import { GlassSurface } from "@/components/ui/glass";
import { cn } from "@/lib/utils";

interface GlassCardProps extends ComponentProps<"div"> {
  tint?: number;
}

/** A frosted glass card surface with optional header/content/footer parts. */
export function GlassCard({ tint = 0.4, className, children, ...props }: GlassCardProps) {
  return (
    <GlassSurface
      tint={tint}
      radius={20}
      className={cn("text-white", className)}
      contentClassName="p-5"
      {...props}
    >
      {children}
    </GlassSurface>
  );
}

export function GlassCardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mb-3 flex flex-col gap-1", className)} {...props} />;
}

export function GlassCardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-base font-semibold leading-tight", className)} {...props} />;
}

export function GlassCardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-sm text-white/55", className)} {...props} />;
}

export function GlassCardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("text-sm text-white/75", className)} {...props} />;
}

export function GlassCardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mt-4 flex items-center gap-2", className)} {...props} />;
}
