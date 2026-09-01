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
}
const CommandContext = createContext<CommandCtx>({ query: "", setOpen: () => undefined });

interface GlassCommandProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (v: boolean) => void;
  /** Bind ⌘K / Ctrl-K to toggle. */
  shortcut?: boolean;
  children?: ReactNode;
}

/** A ⌘K command palette: a portaled glass dialog with a filter + keyboard nav. */
export function GlassCommand({
  open: controlled,
  defaultOpen = false,
  onOpenChange,
  shortcut = true,
  children,
}: GlassCommandProps) {
  const [internal, setInternal] = useState(defaultOpen);
  const open = controlled !== undefined ? controlled : internal;
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const active = useRef(0);

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

  // Escape + focus input on open
  useEffect(() => {
    if (!open) return;
    active.current = 0;
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
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

  const onInputKey = (e: ReactKeyboardEvent) => {
    const items = visibleItems();
    if (e.key === "ArrowDown") { e.preventDefault(); active.current = Math.min(active.current + 1, items.length - 1); paintActive(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active.current = Math.max(active.current - 1, 0); paintActive(); }
    else if (e.key === "Enter") { e.preventDefault(); items[active.current]?.click(); }
  };

  const ctx = useMemo(() => ({ query, setOpen }), [query, open]); // eslint-disable-line react-hooks/exhaustive-deps

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
          className="relative z-10 w-full max-w-lg animate-in fade-in-0 zoom-in-95 duration-200"
          contentClassName="flex flex-col"
        >
          <div className="flex items-center gap-2.5 border-b border-white/10 px-4">
            <svg viewBox="0 0 16 16" fill="none" className="size-4 shrink-0 text-white/40" aria-hidden>
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Type a command or search…"
              className="w-full bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-white/35"
            />
          </div>
          <div ref={listRef} className="max-h-72 overflow-auto p-1.5">
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
  const visible = !query || text.toLowerCase().includes(query.toLowerCase());
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
  const { query } = useContext(CommandContext);
  // Shown by the consumer when nothing matches; simple passthrough.
  void query;
  return <div className={cn("px-3 py-6 text-center text-sm text-white/40", className)}>{children}</div>;
}
