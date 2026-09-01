// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-toggle-group.json
//   source item: registry/new-york/ui/glass-toggle-group/glass-toggle-group.tsx
"use client";

import {
  type ComponentProps,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GlassSurface } from "@/components/ui/glass";
import { cn } from "@/lib/utils";

interface ToggleCtx {
  value: string;
  setValue: (v: string) => void;
}
const ToggleContext = createContext<ToggleCtx>({ value: "", setValue: () => undefined });

interface GlassToggleGroupProps extends Omit<ComponentProps<"div">, "onChange"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  tint?: number;
  children?: ReactNode;
}

/** A segmented control — a frosted bar with a sliding glass indicator. */
export function GlassToggleGroup({
  value: controlled,
  defaultValue = "",
  onValueChange,
  tint = 0.35,
  className,
  children,
  ...props
}: GlassToggleGroupProps) {
  const [internal, setInternal] = useState(defaultValue);
  const active = controlled !== undefined ? controlled : internal;
  const setValue = useCallback(
    (v: string) => {
      if (controlled === undefined) setInternal(v);
      onValueChange?.(v);
    },
    [controlled, onValueChange],
  );
  const ctx = useMemo(() => ({ value: active, setValue }), [active, setValue]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const indicator = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    const list = listRef.current;
    const ind = indicator.current;
    if (!list || !ind) return;
    const el = list.querySelector<HTMLElement>(`[data-toggle][data-value="${CSS.escape(active)}"]`);
    if (!el) { ind.style.opacity = "0"; return; }
    ind.style.opacity = "1";
    ind.style.width = `${el.offsetWidth}px`;
    ind.style.transform = `translateX(${el.offsetLeft}px)`;
  }, [active]);

  useLayoutEffect(() => { place(); }, [place]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(place);
    ro.observe(list);
    return () => ro.disconnect();
  }, [place]);

  return (
    <ToggleContext.Provider value={ctx}>
      <GlassSurface
        tint={tint}
        radius={9999}
        className={cn("relative inline-flex p-1", className)}
        {...props}
      >
        <div
          ref={indicator}
          aria-hidden
          className="pointer-events-none absolute bottom-1 top-1 left-0 rounded-full"
          style={{
            width: 0,
            opacity: 0,
            background: "rgba(255,255,255,0.16)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 10px rgba(0,0,0,0.18)",
            transition: "transform 0.28s cubic-bezier(0.22,1.15,0.36,1.06), width 0.28s cubic-bezier(0.22,1.15,0.36,1.06), opacity 0.15s",
          }}
        />
        <div ref={listRef} role="group" className="relative flex items-center gap-1">
          {children}
        </div>
      </GlassSurface>
    </ToggleContext.Provider>
  );
}

interface GlassToggleItemProps extends ComponentProps<"button"> {
  value: string;
}

export function GlassToggleItem({ value, children, className, ...props }: GlassToggleItemProps) {
  const { value: active, setValue } = useContext(ToggleContext);
  const on = active === value;
  return (
    <button
      type="button"
      data-toggle
      data-value={value}
      aria-pressed={on}
      className={cn(
        "relative z-10 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium outline-none transition-colors duration-200",
        on ? "text-white" : "text-white/45 hover:text-white/70",
        className,
      )}
      onClick={() => setValue(value)}
      {...props}
    >
      {children}
    </button>
  );
}
