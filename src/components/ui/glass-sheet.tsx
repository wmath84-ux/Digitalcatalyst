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
import { useOverlayBounds, useOverlayBox } from "./overlayBounds";

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

/**
 * [digitalcatalyst] Optional viewport insets. When provided, BOTH the scrim
 * and the panel are constrained to the window inside these bounds, so the
 * sheet opens in the space BETWEEN pinned chrome (e.g. the Course Player's
 * top header and bottom footer dock) instead of spanning the full viewport.
 * Omitted → the original full-viewport behaviour (every other call site).
 */
export interface SheetBounds {
  top?: number | string;
  right?: number | string;
  bottom?: number | string;
  left?: number | string;
}

const px = (value: number | string) => (typeof value === "number" ? `${value}px` : value);

const boundsInset = (bounds: SheetBounds): CSSProperties => ({
  top: px(bounds.top ?? 0),
  right: px(bounds.right ?? 0),
  bottom: px(bounds.bottom ?? 0),
  left: px(bounds.left ?? 0),
});

/**
 * The PANEL's own inset for a bounded sheet. The scrim can take the plain
 * four-edge inset, but a bottom / top sheet must not be pinned on the far
 * edge of its sliding axis (top + height + bottom would over-constrain and
 * pin it at the WRONG edge): the far edge acts as a max-height cap instead,
 * and the width comes from the left + right pair rather than `w-full`.
 */
const panelInset = (bounds: SheetBounds, side: Side): CSSProperties => {
  if (side === "bottom") {
    return { left: px(bounds.left ?? 0), right: px(bounds.right ?? 0), bottom: px(bounds.bottom ?? 0) };
  }
  if (side === "top") {
    return { left: px(bounds.left ?? 0), right: px(bounds.right ?? 0), top: px(bounds.top ?? 0) };
  }
  return boundsInset(bounds);
};

interface SheetContentProps extends ComponentProps<"div"> {
  side?: Side;
  tint?: number;
  bounds?: SheetBounds;
  /** [digitalcatalyst] Override the inner content box's classes (the default
   *  `h-full overflow-auto p-6` is a padded scroller; call sites that lay
   *  out their own header + list can swap it for a flex column). */
  contentClassName?: string;
}

export function GlassSheetContent({ side = "right", tint = 0.5, className, children, bounds, style, contentClassName, ...props }: SheetContentProps) {
  const { open, setOpen } = useContext(SheetContext);
  const [mounted, setMounted] = useState(false);

  // [digitalcatalyst] Overlay bounds — when the sheet is opened inside an
  // `OverlayBoundsProvider` (e.g. the Subscription page's content column),
  // BOTH the scrim and the panel are constrained to that column's measured
  // on-screen rectangle on tablet / desktop widths, so the sheet visually
  // belongs to the host page instead of spanning the whole browser window.
  // Phones (and every call site without a provider) keep the classic
  // full-viewport sheet — the same reuse Modal.tsx / ConfirmDialog.tsx
  // already build on, never a second positioning architecture.
  const contextBounds = useOverlayBounds();
  const { scoped, box } = useOverlayBox(open, contextBounds);
  const measuredBounds: SheetBounds | undefined = scoped && box
    ? {
        top: box.top,
        left: box.left,
        right: Math.max(0, window.innerWidth - box.left - box.width),
        bottom: Math.max(0, window.innerHeight - box.top - box.height),
      }
    : undefined;
  const resolvedBounds = bounds ?? measuredBounds;

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

  // A side sheet that is bounded top AND bottom stretches between the two
  // instead of keeping `h-full`; a right sheet that is bounded on the left
  // keeps its right edge pinned and caps its width so its left edge never
  // slides under the left chrome. A bounded bottom / top sheet spans the
  // content column horizontally (left + right instead of `w-full`) and is
  // capped by the column's far edge instead of the viewport's.
  const boundsStyle: CSSProperties | undefined = resolvedBounds
    ? {
        ...panelInset(resolvedBounds, side),
        ...((side === "right" || side === "left") && resolvedBounds.top != null && resolvedBounds.bottom != null
          ? { height: "auto" }
          : null),
        ...(resolvedBounds.left != null && side === "right"
          ? { maxWidth: `calc(100vw - ${px(resolvedBounds.left)})` }
          : null),
        ...(side === "bottom" && resolvedBounds.top != null
          ? { width: "auto", maxHeight: `calc(100vh - ${px(resolvedBounds.top)} - ${px(resolvedBounds.bottom ?? 0)})` }
          : null),
        ...(side === "top" && resolvedBounds.bottom != null
          ? { width: "auto", maxHeight: `calc(100vh - ${px(resolvedBounds.bottom)} - ${px(resolvedBounds.top ?? 0)})` }
          : null),
      }
    : undefined;

  return createPortal(
    // pointer-events-none: the fixed layer itself must not swallow taps aimed
    // at pinned chrome OUTSIDE the (possibly inset) window — only the scrim
    // and the panel are interactive.
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <style>{`@keyframes glass-sheet-in{from{transform:var(--sheet-from)}to{transform:translate(0,0)}}`}</style>
      <div
        className={cn(
          "pointer-events-auto absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-in fade-in-0 duration-200",
          // A scoped scrim covers exactly the host column, so it follows the
          // column's rounded frame instead of painting over its corners.
          scoped && box ? "rounded-[1.75rem]" : undefined,
        )}
        style={resolvedBounds ? boundsInset(resolvedBounds) : undefined}
        onClick={() => setOpen(false)}
      />
      <GlassSurface
        role="dialog"
        aria-modal="true"
        tint={tint}
        radius={radius[side]}
        className={cn("pointer-events-auto absolute", posClass[side], className)}
        contentClassName={contentClassName ?? "h-full overflow-auto p-6"}
        style={{
          ["--sheet-from" as string]: hidden[side],
          animation: "glass-sheet-in 0.34s cubic-bezier(0.22,1,0.36,1) both",
          ...boundsStyle,
          ...style,
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
