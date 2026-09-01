// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-dropdown-menu.json
//   source item: registry/new-york/ui/glass-dropdown-menu/glass-dropdown-menu.tsx
//
// [digitalcatalyst] Type-only adaptation: the registry writes `React.RefObject<…>`
// relying on the global React namespace, which this tsconfig does not expose.
// `RefObject` is imported explicitly. No behaviour change.
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
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { GlassSurface } from "@/components/ui/glass";
import { cn } from "@/lib/utils";

interface MenuCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}
const MenuContext = createContext<MenuCtx>({
  open: false,
  setOpen: () => undefined,
  triggerRef: { current: null },
});

export function GlassDropdownMenu({
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const setOpen = useCallback(
    (v: boolean) => {
      if (controlled === undefined) setInternal(v);
      onOpenChange?.(v);
    },
    [controlled, onOpenChange],
  );
  return (
    <MenuContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative inline-flex">{children}</div>
    </MenuContext.Provider>
  );
}

export function GlassDropdownTrigger({ children, className, ...props }: ComponentProps<"button">) {
  const { open, setOpen, triggerRef } = useContext(MenuContext);
  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      className={cn("outline-none", className)}
      onClick={() => setOpen(!open)}
      {...props}
    >
      {children}
    </button>
  );
}

interface ContentProps extends ComponentProps<"div"> {
  tint?: number;
  align?: "start" | "end";
  sideOffset?: number;
}

export function GlassDropdownContent({
  tint = 0.55,
  align = "start",
  sideOffset = 8,
  className,
  children,
  ...props
}: ContentProps) {
  const { open, setOpen, triggerRef } = useContext(MenuContext);
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, tx: "translate(0,0)" });

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = triggerRef.current?.getBoundingClientRect();
      if (!t) return;
      const top = t.bottom + sideOffset;
      const left = align === "start" ? t.left : t.right;
      setPos({ top, left, tx: align === "start" ? "translate(0,0)" : "translate(-100%,0)" });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, align, sideOffset, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (ref.current && !ref.current.contains(n) && !triggerRef.current?.contains(n)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = ref.current?.querySelectorAll<HTMLElement>("[data-menu-item]:not([disabled])");
        if (!items || !items.length) return;
        const arr = Array.from(items);
        const i = arr.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (i + 1) % arr.length : (i - 1 + arr.length) % arr.length;
        arr[next]?.focus();
      }
    };
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
      role="menu"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        transform: `${pos.tx} scale(${open ? 1 : 0.95})`,
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        zIndex: 1000,
        transformOrigin: "top center",
        transition: "opacity 0.16s, transform 0.18s cubic-bezier(0.22,1.15,0.36,1.06)",
      }}
      className={cn("min-w-[200px]", className)}
      {...props}
    >
      <GlassSurface tint={tint} radius={18} className="overflow-hidden py-1.5">
        {children}
      </GlassSurface>
    </div>,
    document.body,
  );
}

export function GlassDropdownItem({
  className,
  onClick,
  children,
  ...props
}: ComponentProps<"button">) {
  const { setOpen } = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      data-menu-item
      tabIndex={-1}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2 text-sm text-white/80 outline-none transition-colors hover:bg-white/10 focus:bg-white/10",
        className,
      )}
      onClick={(e) => { onClick?.(e); setOpen(false); }}
      {...props}
    >
      {children}
    </button>
  );
}

export function GlassDropdownLabel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-white/35", className)} {...props} />;
}

export function GlassDropdownSeparator({ className }: { className?: string }) {
  return <div aria-hidden className={cn("my-1 mx-2 h-px bg-white/10", className)} />;
}
