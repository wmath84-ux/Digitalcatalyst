// Colour scheme for the website-glass pack.
//
// The vendored components carry BOTH of websiteglass.com's materials and pick
// one by reading `html.dark` / `html.light` (see readDark() in
// components/ui/glass.tsx — upstream code, untouched). This module is the only
// thing that writes that class: a persisted user preference, exposed through
// the pack's own <GlassSwitch ariaLabel="Dark mode"> in the header (the exact
// controlled example from the Glass Switch docs). Default is dark because the
// Black Ice backdrop is dark; the user can flip to the light material any time
// and the pack renders exactly what the docs show for that scheme.
import { useSyncExternalStore } from "react";

export type GlassScheme = "dark" | "light";
const KEY = "dc.glass.scheme";
const listeners = new Set<() => void>();

function read(): GlassScheme {
  if (typeof window === "undefined") return "dark";
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch { /* ignore */ }
  return "dark";
}

export function applyGlassScheme(scheme: GlassScheme = read()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", scheme === "dark");
  root.classList.toggle("light", scheme === "light");
  root.style.colorScheme = scheme;
}

export function setGlassScheme(scheme: GlassScheme): void {
  try { window.localStorage.setItem(KEY, scheme); } catch { /* ignore */ }
  applyGlassScheme(scheme);
  for (const l of listeners) l();
}

export function useGlassScheme(): [GlassScheme, (s: GlassScheme) => void] {
  const scheme = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    read,
    () => "dark" as GlassScheme,
  );
  return [scheme, setGlassScheme];
}
