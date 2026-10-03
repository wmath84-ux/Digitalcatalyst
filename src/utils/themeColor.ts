// src/utils/themeColor.ts
//
// Keeps the mobile browser, PWA, and APK status bar in sync with the
// device's system theme (Light / Dark mode).
//
// System Theme Behavior:
//   - System Light Mode -> Status bar is light/white (#ffffff) with dark icons.
//   - System Dark Mode  -> Status bar is dark (#000000) with light icons.
//   - System theme changes at runtime -> Status bar updates automatically.
//   - Course Player retains its custom landscape/fullscreen overrides and
//     restores back to the system theme upon exit.

export const STATUS_BAR_LIGHT = "#ffffff";
export const STATUS_BAR_DARK = "#000000";

// Backward compatibility with existing imports
export const THEME_COLOR_LIGHT = STATUS_BAR_LIGHT;
export const THEME_COLOR_DARK = STATUS_BAR_DARK;

/** Checks whether the system is currently in Dark Mode */
export function isSystemDarkMode(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Returns the status bar color corresponding to current system theme */
export function getSystemThemeColor(): string {
  return isSystemDarkMode() ? STATUS_BAR_DARK : STATUS_BAR_LIGHT;
}

let activeCustomColor: string | null = null;

/** Notify native Android shell if running inside Capacitor APK */
function syncNativeStatusBar(color: string, isDark: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, { setColor?: (opts: { color: string; isDark?: boolean; darkIcons?: boolean }) => Promise<void>; setTheme?: (opts: { theme: string; color?: string }) => Promise<void> }> } }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const plugin = cap.Plugins?.AppStatusBar;
      if (plugin?.setColor) {
        void plugin.setColor({ color, isDark, darkIcons: !isDark });
      }
    }
  } catch {
    // Ignore native bridge failures
  }
}

/** Set theme color for PWA/browser and notify native APK */
export function setThemeColor(color?: string): void {
  if (typeof document === "undefined") return;

  const resolvedColor = color || (isSystemDarkMode() ? STATUS_BAR_DARK : STATUS_BAR_LIGHT);
  const isDark = resolvedColor === STATUS_BAR_DARK || resolvedColor !== STATUS_BAR_LIGHT;

  if (color && color !== STATUS_BAR_LIGHT && color !== STATUS_BAR_DARK) {
    activeCustomColor = color;
  } else if (!color) {
    activeCustomColor = null;
  }

  // Update or create meta tags
  const metaTags = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metaTags.length === 0) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", resolvedColor);
    document.head.appendChild(meta);
  } else {
    metaTags.forEach((meta) => {
      meta.setAttribute("content", resolvedColor);
    });
  }

  syncNativeStatusBar(resolvedColor, isDark);
}

/** Syncs the status bar with the current system theme */
export function syncSystemThemeColor(): void {
  activeCustomColor = null;
  const isDark = isSystemDarkMode();
  const color = isDark ? STATUS_BAR_DARK : STATUS_BAR_LIGHT;

  if (typeof document !== "undefined") {
    const lightMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][media*="light"]');
    const darkMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][media*="dark"]');
    if (lightMeta) lightMeta.setAttribute("content", STATUS_BAR_LIGHT);
    if (darkMeta) darkMeta.setAttribute("content", STATUS_BAR_DARK);

    const genericMetas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
    genericMetas.forEach((m) => m.setAttribute("content", color));
  }

  syncNativeStatusBar(color, isDark);
}

// Runtime listener for system theme changes (e.g. user toggles Dark/Light in phone settings)
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  try {
    const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (!activeCustomColor) {
        syncSystemThemeColor();
      }
    };

    if (typeof darkModeQuery.addEventListener === "function") {
      darkModeQuery.addEventListener("change", handleSystemThemeChange);
    } else if (typeof (darkModeQuery as unknown as { addListener?: (fn: () => void) => void }).addListener === "function") {
      (darkModeQuery as unknown as { addListener: (fn: () => void) => void }).addListener(handleSystemThemeChange);
    }
  } catch {
    // Ignore mediaQuery listener errors
  }
}
