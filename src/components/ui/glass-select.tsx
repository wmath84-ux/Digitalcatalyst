// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-select.json
//   source item: registry/new-york/ui/glass-select/glass-select.tsx
//
// [digitalcatalyst] Type-only adaptation: `React.RefObject<…>` → an explicitly
// imported `RefObject` (this tsconfig has no global React namespace).
"use client";

import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { GlassSurface } from "@/components/ui/glass";
import { cn } from "@/lib/utils";

interface SelectCtx {
  value?: string;
  setValue: (v: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  register: (value: string, label: string) => void;
  labelOf: (value?: string) => string | undefined;
}
const SelectContext = createContext<SelectCtx | null>(null);
const useSelect = () => {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error("GlassSelect parts must be used within <GlassSelect>");
  return ctx;
};

export function GlassSelect({
  value: controlled,
  defaultValue,
  onValueChange,
  children,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  children?: ReactNode;
}) {
  const [internal, setInternal] = useState(defaultValue);
  const value = controlled !== undefined ? controlled : internal;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Reactive label registry so the trigger re-renders once items report labels.
  const [labels, setLabels] = useState<Record<string, string>>({});

  const setValue = useCallback(
    (v: string) => {
      if (controlled === undefined) setInternal(v);
      onValueChange?.(v);
      setOpen(false);
    },
    [controlled, onValueChange],
  );

  const register = useCallback((v: string, label: string) => {
    setLabels((prev) => (prev[v] === label ? prev : { ...prev, [v]: label }));
  }, []);
  const labelOf = useCallback((v?: string) => (v ? labels[v] : undefined), [labels]);

  const ctx = useMemo(
    () => ({ value, setValue, open, setOpen, triggerRef, register, labelOf }),
    [value, setValue, open, register, labelOf],
  );
  return <SelectContext.Provider value={ctx}>{children}</SelectContext.Provider>;
}

export function GlassSelectTrigger({
  className,
  placeholder = "Select…",
  ...props
}: ComponentProps<"button"> & { placeholder?: string }) {
  const { open, setOpen, triggerRef, value, labelOf } = useSelect();
  const label = labelOf(value);
  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(
        "flex h-10 w-56 items-center justify-between gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-sm outline-none backdrop-blur-md transition-colors hover:border-white/25 focus-visible:ring-2 focus-visible:ring-sky-400/50",
        label ? "text-white" : "text-white/40",
        className,
      )}
      {...props}
    >
      <span className="truncate">{label ?? placeholder}</span>
      <svg viewBox="0 0 16 16" fill="none" className="size-4 shrink-0 text-white/40" aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function GlassSelectContent({ tint = 0.6, className, children, ...props }: ComponentProps<"div"> & { tint?: number }) {
  const { open, setOpen, triggerRef } = useSelect();
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState({ top: 0, left: 0, width: 224 });

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = triggerRef.current?.getBoundingClientRect();
      if (!t) return;
      setRect({ top: t.bottom + 6, left: t.left, width: t.width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (ref.current && !ref.current.contains(n) && !triggerRef.current?.contains(n)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, triggerRef]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={ref}
      role="listbox"
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        opacity: open ? 1 : 0,
        transform: `scale(${open ? 1 : 0.97})`,
        pointerEvents: open ? "auto" : "none",
        zIndex: 1000,
        transformOrigin: "top center",
        transition: "opacity 0.16s, transform 0.18s cubic-bezier(0.22,1.15,0.36,1.06)",
      }}
      className={cn(className)}
      {...props}
    >
      <GlassSurface tint={tint} radius={16} className="max-h-64 overflow-auto py-1.5">
        {children}
      </GlassSurface>
    </div>,
    document.body,
  );
}

export function GlassSelectItem({
  value,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { value: string }) {
  const { setValue, value: selected, register } = useSelect();
  const selectedNow = selected === value;

  useEffect(() => {
    if (typeof children === "string") register(value, children);
  }, [value, children, register]);

  return (
    <button
      type="button"
      role="option"
      aria-selected={selectedNow}
      onClick={() => setValue(value)}
      className={cn(
        "flex w-full items-center justify-between gap-2 px-3.5 py-2 text-sm text-white/80 outline-none transition-colors hover:bg-white/10 focus:bg-white/10",
        selectedNow && "text-white",
        className,
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      {selectedNow && (
        <svg viewBox="0 0 16 16" fill="none" className="size-4 shrink-0 text-sky-300" aria-hidden>
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
