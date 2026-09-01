// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-input.json
//   source item: registry/new-york/ui/glass-input/glass-input.tsx
//
// [digitalcatalyst] On a light chrome (the site header) the white label /
// white placeholder needs an override; it lives in src/glass.css under
// ".dc-glass-input" so this file stays byte-comparable to the registry item.
"use client";

import { type ComponentProps, type ReactNode, useRef, useState } from "react";
import { GlassSurface, type GlassSurfaceHandle } from "@/components/ui/glass";
import { cn } from "@/lib/utils";

interface GlassInputProps extends ComponentProps<"input"> {
  icon?: ReactNode;
  tint?: number;
  radius?: number;
}

export function GlassInput({
  icon,
  tint = 0.4,
  radius = 9999,
  placeholder = "Search…",
  className,
  onFocus,
  onBlur,
  ...props
}: GlassInputProps) {
  const [focused, setFocused] = useState(false);
  const surfaceRef = useRef<GlassSurfaceHandle | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    surfaceRef.current?.setTintLift(0.1);
    if (glowRef.current) glowRef.current.style.opacity = "1";
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    surfaceRef.current?.setTintLift(0);
    if (glowRef.current) glowRef.current.style.opacity = "0";
    onBlur?.(e);
  };

  return (
    <GlassSurface
      handleRef={surfaceRef}
      tint={tint}
      radius={radius}
      className={cn("relative", className)}
    >
      {/* Focus glow ring */}
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-200"
        style={{
          opacity: 0,
          boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.35), 0 0 16px rgba(255,255,255,0.08)",
        }}
      />

      <div className="relative flex items-center gap-2.5 px-4 py-2.5">
        {icon && (
          <span className="shrink-0 text-white/35 transition-colors duration-150"
            style={{ color: focused ? "rgba(255,255,255,0.55)" : undefined }}>
            {icon}
          </span>
        )}
        <input
          className={cn(
            "w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30",
            "caret-white/70",
          )}
          placeholder={placeholder}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
      </div>
    </GlassSurface>
  );
}
