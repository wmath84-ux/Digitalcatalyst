// App colour theme: "light" or "dark".
//
// Single source of truth for the learner-facing colour scheme.
//
//   • Default: LIGHT. Used when nothing valid is stored yet.
//   • Persistence: localStorage under THEME_STORAGE_KEY ("dc.theme").
//   • Applied to <html> as `data-theme`, a `light` / `dark` class (the vendored
//     glass components and Tailwind's `dark:` variant read these), and
//     `color-scheme`, so native form controls and scrollbars match.
//   • Routes that were always dark keep their dark look regardless of the
//     stored preference (admin console and the course player, which has its
//     own light/dark palette). See `resolveDocumentTheme`.
//
// The inline pre-paint script in index.html mirrors `resolveDocumentTheme` and
// the storage key, so the correct theme is on <html> before the first paint
// (no flash of the wrong theme). Keep the two in sync.

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "dc.theme";
export const DEFAULT_THEME_MODE: ThemeMode = "light";

/** Routes that always render with the dark palette (see resolveDocumentTheme). */
const FORCED_DARK_HASH_PREFIXES = ["#/admin", "#/course/", "#/my-course/"] as const;

export function normalizeThemeMode(value: unknown): ThemeMode | null {
  return value === "light" || value === "dark" ? value : null;
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredThemeMode(storage: Storage | null = safeStorage()): ThemeMode {
  try {
    return normalizeThemeMode(storage?.getItem(THEME_STORAGE_KEY)) ?? DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function writeStoredThemeMode(mode: ThemeMode, storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* private mode / quota — the choice still applies for this session */
  }
}

/**
 * The theme a route should actually render with. Admin and course-player routes
 * are pinned dark so their existing, dark-only chrome is unchanged.
 */
export function resolveDocumentTheme(mode: ThemeMode, hash: string): ThemeMode {
  if (FORCED_DARK_HASH_PREFIXES.some((prefix) => hash.startsWith(prefix))) return "dark";
  return mode;
}

export function applyDocumentTheme(theme: ThemeMode, doc: Document = document): void {
  const root = doc.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  doc.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute(
    "content",
    theme === "light" ? "#f8fafc" : "#0a0c12",
  );
}

// ── store ───────────────────────────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

let storedMode: ThemeMode = DEFAULT_THEME_MODE;
let initialised = false;

function currentHash(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

/** The user's stored preference (what the Profile toggle shows). */
export function getThemeMode(): ThemeMode {
  return storedMode;
}

/** Theme actually rendered on the current route. */
export function getEffectiveThemeMode(hash: string = currentHash()): ThemeMode {
  return resolveDocumentTheme(storedMode, hash);
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Re-applies the theme for the current route. Safe to call on every navigation. */
export function syncDocumentTheme(hash: string = currentHash()): void {
  if (typeof document === "undefined") return;
  applyDocumentTheme(resolveDocumentTheme(storedMode, hash));
  emit();
}

export function setThemeMode(mode: ThemeMode): void {
  if (mode === storedMode) return;
  storedMode = mode;
  writeStoredThemeMode(mode);
  syncDocumentTheme();
}

export function subscribeThemeMode(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Loads the stored preference, applies it, and keeps other open tabs in step.
 * Idempotent; call once at boot.
 */
export function initThemeMode(): void {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  storedMode = readStoredThemeMode();
  syncDocumentTheme();
  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    const next = readStoredThemeMode();
    if (next === storedMode) return;
    storedMode = next;
    syncDocumentTheme();
  });
}

/** Test-only: resets the module state. */
export function __resetThemeModeForTests(): void {
  listeners.clear();
  storedMode = DEFAULT_THEME_MODE;
  initialised = false;
}
