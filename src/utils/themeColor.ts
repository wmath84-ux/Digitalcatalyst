// src/utils/themeColor.ts
//
// Compatibility surface for the older theme-colour helpers. The colours that
// reach the browser `theme-color` tag and the Android system bars are decided by
// `systemBars.ts` (it samples the page that is on screen). These functions only
// *report* an explicit colour to that coordinator, or give the bars back to the
// page.

import { setSystemBarOverride } from "./systemBars";

export const STATUS_BAR_LIGHT = "#ffffff";
export const STATUS_BAR_DARK = "#000000";

// Backward compatibility with existing imports
export const THEME_COLOR_LIGHT = STATUS_BAR_LIGHT;
export const THEME_COLOR_DARK = STATUS_BAR_DARK;

const THEME_OWNER = "theme-color";

/** Checks whether the system is currently in Dark Mode */
export function isSystemDarkMode(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Returns the status bar colour for the current system theme (fallback only; the page is sampled). */
export function getSystemThemeColor(): string {
  return isSystemDarkMode() ? STATUS_BAR_DARK : STATUS_BAR_LIGHT;
}

/**
 * Paint the bars with an explicit colour (for example a Course Player layer
 * that blends into the bars). Pure white / black are the page's own default
 * and are treated as "no override".
 */
export function setThemeColor(color?: string): void {
  if (typeof document === "undefined") return;
  if (color && color !== STATUS_BAR_LIGHT && color !== STATUS_BAR_DARK) {
    setSystemBarOverride(THEME_OWNER, color);
  } else {
    setSystemBarOverride(THEME_OWNER, null);
  }
}

/** Give the bars back to the page that is on screen. */
export function syncSystemThemeColor(): void {
  setSystemBarOverride(THEME_OWNER, null);
}
