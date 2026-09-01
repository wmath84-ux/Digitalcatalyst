// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-checkbox.json
//   source item: registry/new-york/ui/glass-checkbox/glass-checkbox.tsx
"use client";

import { type ComponentProps, useState } from "react";
import { cn } from "@/lib/utils";

interface GlassCheckboxProps extends Omit<ComponentProps<"button">, "onChange"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  ariaLabel?: string;
}

/** A glass checkbox — frosted box that fills with an accent and a checkmark when on. */
export function GlassCheckbox({
  checked: controlled,
  defaultChecked = false,
  onCheckedChange,
  ariaLabel,
  className,
  ...props
}: GlassCheckboxProps) {
  const isControlled = controlled !== undefined;
  const [internal, setInternal] = useState(defaultChecked);
  const on = isControlled ? controlled : internal;

  const toggle = () => {
    const next = !on;
    if (!isControlled) setInternal(next);
    onCheckedChange?.(next);
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={toggle}
      className={cn(
        "relative grid size-[22px] place-items-center rounded-[7px] outline-none transition-[background,border-color,transform] duration-150 active:scale-90",
        "border backdrop-blur-md focus-visible:ring-2 focus-visible:ring-sky-400/60",
        on
          ? "border-sky-400/70 bg-sky-500/80"
          : "border-white/20 bg-white/[0.06] hover:border-white/35",
        className,
      )}
      {...props}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className={cn("size-3.5 transition-opacity duration-150", on ? "opacity-100" : "opacity-0")}
        aria-hidden
      >
        <path
          d="M3.5 8.5l3 3 6-7"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* sheen */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.25), transparent 55%)" }}
      />
    </button>
  );
}
