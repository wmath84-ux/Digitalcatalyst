/**
 * Universal background preference (`src/lib/background.ts`).
 *
 * The app has TWO backgrounds, switchable from Profile → Preferences:
 *
 *   "classic" — the fixed gradient + grid paint (.dc-backdrop, glass-theme.css)
 *   "waves"   — the AI Canvas Wave Lines canvas, animated live, always
 *               (components/backgrounds/WaveLines.tsx, mounted by GlassBackdrop)
 *
 * The choice is a device preference (localStorage, like the glass scheme), and
 * is also mirrored onto `<html data-background>` so CSS can key off it if a
 * surface ever needs to. GlassBackdrop reads the store, so every mount point
 * (AppShell / DesktopShell / MyDay) switches in the same tick.
 */
import { useSyncExternalStore } from "react";

export type BackgroundKind = "classic" | "waves";

const KEY = "dc.background";
const KINDS: readonly BackgroundKind[] = ["classic", "waves"];
const listeners = new Set<() => void>();

function asKind(value: string | null | undefined): BackgroundKind | null {
  return KINDS.find((k) => k === value) ?? null;
}

function read(): BackgroundKind {
  if (typeof window === "undefined") return "classic";
  try {
    return asKind(window.localStorage.getItem(KEY)) ?? "classic";
  } catch {
    /* private mode / capacitor prefs may throw — fall through */
    return "classic";
  }
}

/** Mirror the choice onto <html> (CSS hook: `html[data-background="waves"]`). */
export function applyBackground(kind: BackgroundKind = read()): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.background = kind;
}

export function setBackground(kind: BackgroundKind): void {
  try {
    window.localStorage.setItem(KEY, kind);
  } catch {
    /* ignore */
  }
  applyBackground(kind);
  for (const l of listeners) l();
}

export function useBackground(): [BackgroundKind, (kind: BackgroundKind) => void] {
  const kind = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    read,
    () => "classic" as BackgroundKind,
  );
  return [kind, setBackground];
}
