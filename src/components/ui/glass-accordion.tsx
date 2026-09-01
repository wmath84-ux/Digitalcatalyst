// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-accordion.json
//   source item: registry/new-york/ui/glass-accordion/glass-accordion.tsx
"use client";

import {
  type ComponentProps,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { GlassSurface } from "@/components/ui/glass";
import { cn } from "@/lib/utils";

interface AccordionCtx {
  isOpen: (v: string) => boolean;
  toggle: (v: string) => void;
}
const AccordionContext = createContext<AccordionCtx>({ isOpen: () => false, toggle: () => undefined });

const ItemContext = createContext<string>("");

interface GlassAccordionProps extends Omit<ComponentProps<"div">, "onChange"> {
  type?: "single" | "multiple";
  defaultValue?: string[];
  value?: string[];
  onValueChange?: (value: string[]) => void;
  tint?: number;
  children?: ReactNode;
}

/** A frosted glass accordion. `type="single"` keeps one section open at a time. */
export function GlassAccordion({
  type = "single",
  defaultValue = [],
  value: controlled,
  onValueChange,
  tint = 0.4,
  className,
  children,
  ...props
}: GlassAccordionProps) {
  const [internal, setInternal] = useState<string[]>(defaultValue);
  const open = controlled ?? internal;

  const set = useCallback(
    (next: string[]) => {
      if (controlled === undefined) setInternal(next);
      onValueChange?.(next);
    },
    [controlled, onValueChange],
  );

  const ctx = useMemo<AccordionCtx>(
    () => ({
      isOpen: (v) => open.includes(v),
      toggle: (v) => {
        if (open.includes(v)) set(open.filter((x) => x !== v));
        else set(type === "single" ? [v] : [...open, v]);
      },
    }),
    [open, set, type],
  );

  return (
    <AccordionContext.Provider value={ctx}>
      <GlassSurface tint={tint} radius={18} className={cn("text-white", className)} contentClassName="divide-y divide-white/10" {...props}>
        {children}
      </GlassSurface>
    </AccordionContext.Provider>
  );
}

export function GlassAccordionItem({ value, className, children, ...props }: ComponentProps<"div"> & { value: string }) {
  return (
    <ItemContext.Provider value={value}>
      <div className={cn("px-4", className)} {...props}>{children}</div>
    </ItemContext.Provider>
  );
}

export function GlassAccordionTrigger({ className, children, ...props }: ComponentProps<"button">) {
  const { isOpen, toggle } = useContext(AccordionContext);
  const value = useContext(ItemContext);
  const open = isOpen(value);
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => toggle(value)}
      className={cn(
        "flex w-full items-center justify-between gap-3 py-3.5 text-left text-sm font-medium outline-none focus-visible:text-white",
        open ? "text-white" : "text-white/80 hover:text-white",
        className,
      )}
      {...props}
    >
      {children}
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="size-4 shrink-0 text-white/50 transition-transform duration-200"
        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        aria-hidden
      >
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function GlassAccordionContent({ className, children, ...props }: ComponentProps<"div">) {
  const { isOpen } = useContext(AccordionContext);
  const value = useContext(ItemContext);
  const open = isOpen(value);
  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden">
        <div className={cn("pb-4 text-sm text-white/65", className)} {...props}>{children}</div>
      </div>
    </div>
  );
}
