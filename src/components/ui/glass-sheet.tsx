// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-sheet.json
//   source item: registry/new-york/ui/glass-sheet/glass-sheet.tsx
//
// [digitalcatalyst] Type-only adaptation: `React.CSSProperties` → an explicitly
// imported `CSSProperties` (this tsconfig has no global React namespace).
"use client";

import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { GlassSurface } from "@/components/ui/glass";
import { cn } from "@/lib/utils";

interface SheetCtx { open: boolean; setOpen: (v: boolean) => void }
const SheetContext = createContext<SheetCtx>({ open: false, setOpen: () => undefined });

export function GlassSheet({
  open: controlled,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (v: boolean) => void;
  children?: ReactNode;
}) {
  const [internal, setInternal] = useState(defaultOpen);
  const open = controlled !== undefined ? controlled : internal;
  const setOpen = useCallback(
    (v: boolean) => {
      if (controlled === undefined) setInternal(v);
      onOpenChange?.(v);
    },
    [controlled, onOpenChange],
  );
  return <SheetContext.Provider value={{ open, setOpen }}>{children}</SheetContext.Provider>;
}

export function GlassSheetTrigger({ children, className, ...props }: ComponentProps<"button">) {
  const { setOpen } = useContext(SheetContext);
  return (
    <button type="button" className={cn("outline-none", className)} onClick={() => setOpen(true)} {...props}>
      {children}
    </button>
  );
}

type Side = "right" | "left" | "top" | "bottom";

const hidden: Record<Side, string> = {
  right: "translateX(100%)",
  left: "translateX(-100%)",
  top: "translateY(-100%)",
  bottom: "translateY(100%)",
};
const posClass: Record<Side, string> = {
  right: "right-0 top-0 h-full w-[min(24rem,90vw)]",
  left: "left-0 top-0 h-full w-[min(24rem,90vw)]",
  top: "left-0 top-0 w-full h-[min(20rem,80vh)]",
  bottom: "left-0 bottom-0 w-full h-[min(20rem,80vh)]",
};
const radius: Record<Side, number> = { right: 24, left: 24, top: 24, bottom: 24 };

interface SheetContentProps extends ComponentProps<"div"> {
  side?: Side;
  tint?: number;
}

export function GlassSheetContent({ side = "right", tint = 0.5, className, children, ...props }: SheetContentProps) {
  const { open, setOpen } = useContext(SheetContext);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, setOpen]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <style>{`@keyframes glass-sheet-in{from{transform:var(--sheet-from)}to{transform:translate(0,0)}}`}</style>
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-in fade-in-0 duration-200"
        onClick={() => setOpen(false)}
      />
      <GlassSurface
        role="dialog"
        aria-modal="true"
        tint={tint}
        radius={radius[side]}
        className={cn("absolute", posClass[side], className)}
        contentClassName="h-full overflow-auto p-6"
        style={{
          ["--sheet-from" as string]: hidden[side],
          animation: "glass-sheet-in 0.34s cubic-bezier(0.22,1,0.36,1) both",
        } as CSSProperties}
        {...props}
      >
        {children}
      </GlassSurface>
    </div>,
    document.body,
  );
}

export function GlassSheetTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-lg font-semibold text-white", className)} {...props} />;
}
export function GlassSheetDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("mt-1.5 text-sm text-white/55", className)} {...props} />;
}
export function GlassSheetClose({ children, className, ...props }: ComponentProps<"button">) {
  const { setOpen } = useContext(SheetContext);
  return (
    <button type="button" className={cn("outline-none", className)} onClick={() => setOpen(false)} {...props}>
      {children}
    </button>
  );
}
