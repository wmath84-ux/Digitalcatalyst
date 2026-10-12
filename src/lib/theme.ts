// Light-only application theme. Legacy dark preferences and callers are normalized.
export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "dc.theme";
export const DEFAULT_THEME_MODE: ThemeMode = "light";


export function normalizeThemeMode(value: unknown): ThemeMode | null {
  return value === "light" || value === "dark" ? "light" : null;
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

export function writeStoredThemeMode(_mode: ThemeMode, storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, "light");
  } catch {
    /* private mode / quota — the choice still applies for this session */
  }
}

/** All routes use light appearance, including restored legacy preferences. */
export function resolveDocumentTheme(_mode: ThemeMode, _hash: string): ThemeMode {
  return "light";
}

export function applyDocumentTheme(_theme: ThemeMode, doc: Document = document): void {
  const root = doc.documentElement;
  root.dataset.theme = "light";
  root.classList.toggle("light", true);
  root.classList.toggle("dark", false);
  root.style.colorScheme = "light";
  doc.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute(
    "content",
    "#f7f9fb",
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
  storedMode = "light";
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
  writeStoredThemeMode("light");
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
