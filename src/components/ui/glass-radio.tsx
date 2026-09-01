// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-radio.json
//   source item: registry/new-york/ui/glass-radio/glass-radio.tsx
"use client";

import {
  type ComponentProps,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { cn } from "@/lib/utils";

interface RadioCtx {
  value?: string;
  setValue?: (v: string) => void;
  name: string;
}
const RadioContext = createContext<RadioCtx>({ name: "glass-radio" });

interface GlassRadioGroupProps extends Omit<ComponentProps<"div">, "onChange"> {
  value?: string;
  onValueChange?: (value: string) => void;
  name?: string;
}

/** Radio group — controlled via value/onValueChange. */
export function GlassRadioGroup({
  value,
  onValueChange,
  name = "glass-radio",
  className,
  children,
  ...props
}: GlassRadioGroupProps) {
  const setValue = useCallback((v: string) => onValueChange?.(v), [onValueChange]);
  const ctx = useMemo(() => ({ value, setValue, name }), [value, setValue, name]);
  return (
    <RadioContext.Provider value={ctx}>
      <div role="radiogroup" className={cn("flex flex-col gap-2.5", className)} {...props}>
        {children}
      </div>
    </RadioContext.Provider>
  );
}

interface GlassRadioProps extends Omit<ComponentProps<"button">, "value"> {
  value: string;
  ariaLabel?: string;
}

/** A glass radio dot. Use inside a GlassRadioGroup. */
export function GlassRadio({ value, ariaLabel, className, ...props }: GlassRadioProps) {
  const group = useContext(RadioContext);
  const selected = group.value === value;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      onClick={() => group.setValue?.(value)}
      className={cn(
        "relative grid size-[22px] place-items-center rounded-full outline-none transition-[border-color,transform] duration-150 active:scale-90",
        "border backdrop-blur-md focus-visible:ring-2 focus-visible:ring-sky-400/60",
        selected ? "border-sky-400/70" : "border-white/20 bg-white/[0.06] hover:border-white/35",
        className,
      )}
      {...props}
    >
      <span
        className="rounded-full bg-sky-400 transition-transform duration-150"
        style={{ width: 10, height: 10, transform: selected ? "scale(1)" : "scale(0)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.25), transparent 55%)" }}
      />
    </button>
  );
}
