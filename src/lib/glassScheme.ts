// Colour scheme for the website-glass pack.
//
// The scheme is owned by src/lib/theme.ts (light by default, switchable from the
// Profile page, persisted in localStorage). This module keeps the historical
// entry point that the router calls on every route change; it now simply
// re-applies the stored theme for that route. The vendored glass components read
// `html.dark` / `html.light` (see readDark() in components/ui/glass.tsx), which
// `applyDocumentTheme` keeps in sync.
//
// The legacy `dc.glass.scheme` key is no longer read; it is removed once so stale
// values do not linger.
import { syncDocumentTheme } from "./theme";

/** The old preference key. Read once so it can be dropped. */
const LEGACY_KEY = "dc.glass.scheme";

export function applyGlassScheme(): void {
  if (typeof document === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* private mode — nothing to clean up */
  }
  syncDocumentTheme();
}
