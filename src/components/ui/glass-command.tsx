// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-command.json
//   source item: registry/new-york/ui/glass-command/glass-command.tsx
//
// [digitalcatalyst] Type-only adaptation: `React.KeyboardEvent` → an explicitly
// imported `KeyboardEvent as ReactKeyboardEvent`, so the DOM `KeyboardEvent`
// used by the document listener below stays the global one.
"use client";

import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { GlassSurface } from "@/components/ui/glass";
import { cn } from "@/lib/utils";

interface CommandCtx {
  query: string;
  setOpen: (v: boolean) => void;
  visibleCount: number;
}
const CommandContext = createContext<CommandCtx>({ query: "", setOpen: () => undefined, visibleCount: 0 });

interface GlassCommandProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (v: boolean) => void;
  /** Bind ⌘K / Ctrl-K to toggle. */
  shortcut?: boolean;
  /** Search prompt and input name can be scoped to a particular palette use. */
  placeholder?: string;
  inputLabel?: string;
  panelClassName?: string;
  listClassName?: string;
  children?: ReactNode;
}

/** A ⌘K command palette: a portaled glass dialog with a filter + keyboard nav. */
export function GlassCommand({
  open: controlled,
  defaultOpen = false,
  onOpenChange,
  shortcut = true,
  placeholder = "Type a command or search…",
  inputLabel = "Search commands",
  panelClassName,
  listClassName,
  children,
}: GlassCommandProps) {
  const [internal, setInternal] = useState(defaultOpen);
  const open = controlled !== undefined ? controlled : internal;
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const active = useRef(0);
  const [visibleCount, setVisibleCount] = useState(0);

  const setOpen = (v: boolean) => {
    if (controlled === undefined) setInternal(v);
    onOpenChange?.(v);
    if (!v) setQuery("");
  };

  useEffect(() => setMounted(true), []);

  // ⌘K / Ctrl-K toggle
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcut, open]);

  // Escape, focus the input on open and keep keyboard focus inside the modal.
  useEffect(() => {
    if (!open) return;
    active.current = 0;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const panel = document.getElementById("dc-command-palette");
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) requestAnimationFrame(() => previousFocus.focus());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visibleItems = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-cmd-item]") ?? []);

  const paintActive = () => {
    const items = visibleItems();
    if (active.current >= items.length) active.current = Math.max(0, items.length - 1);
    items.forEach((el, i) => {
      el.dataset.active = i === active.current ? "true" : "false";
      if (i === active.current) el.scrollIntoView({ block: "nearest" });
    });
  };

  useEffect(() => {
    if (open) { active.current = 0; requestAnimationFrame(paintActive); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => {
      setVisibleCount(listRef.current?.querySelectorAll("[data-cmd-item]").length ?? 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [children, open, query]);

  const onInputKey = (e: ReactKeyboardEvent) => {
    const items = visibleItems();
    if (e.key === "ArrowDown") { e.preventDefault(); active.current = Math.min(active.current + 1, items.length - 1); paintActive(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active.current = Math.max(active.current - 1, 0); paintActive(); }
    else if (e.key === "Enter") { e.preventDefault(); items[active.current]?.click(); }
  };

  const ctx = useMemo(() => ({ query, setOpen, visibleCount }), [query, open, visibleCount]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted || !open) return null;

  return createPortal(
    <CommandContext.Provider value={ctx}>
      <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[14vh]">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-in fade-in-0 duration-200"
          onClick={() => setOpen(false)}
        />
        <GlassSurface
          tint={0.6}
          radius={20}
          data-glass-command-panel
          className={cn("relative z-10 w-full max-w-lg animate-in fade-in-0 zoom-in-95 duration-200", panelClassName)}
          contentClassName="flex flex-col"
          id="dc-command-palette"
          role="dialog"
          aria-modal="true"
          aria-label={inputLabel}
        >
          <div className="flex items-center gap-2.5 border-b border-white/10 px-4">
            <svg viewBox="0 0 16 16" fill="none" className="size-4 shrink-0 text-white/40" aria-hidden>
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder={placeholder}
              aria-label={inputLabel}
              className="w-full bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-white/35"
            />
          </div>
          <div ref={listRef} className={cn("max-h-72 overflow-auto p-1.5", listClassName)}>
            {children}
          </div>
        </GlassSurface>
      </div>
    </CommandContext.Provider>,
    document.body,
  );
}

export function GlassCommandGroup({ heading, className, children, ...props }: ComponentProps<"div"> & { heading?: string }) {
  return (
    <div className={cn("py-1", className)} {...props}>
      {heading && <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-white/35">{heading}</div>}
      {children}
    </div>
  );
}

interface ItemProps extends Omit<ComponentProps<"button">, "onSelect"> {
  /** Extra searchable text beyond the visible label. */
  keywords?: string;
  onSelect?: () => void;
}

export function GlassCommandItem({ keywords = "", onSelect, className, children, ...props }: ItemProps) {
  const { query, setOpen } = useContext(CommandContext);
  const text = (typeof children === "string" ? children : "") + " " + keywords;
  const normalizedQuery = query.trim().toLowerCase();
  const visible = !normalizedQuery || text.toLowerCase().includes(normalizedQuery);
  if (!visible) return null;
  return (
    <button
      type="button"
      data-cmd-item
      onClick={() => { onSelect?.(); setOpen(false); }}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-white/80 outline-none transition-colors",
        "data-[active=true]:bg-white/12 data-[active=true]:text-white hover:bg-white/8",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function GlassCommandEmpty({ className, children }: ComponentProps<"div">) {
  const { visibleCount } = useContext(CommandContext);
  if (visibleCount > 0) return null;
  return <div role="status" className={cn("px-3 py-6 text-center text-sm text-white/40", className)}>{children}</div>;
}
