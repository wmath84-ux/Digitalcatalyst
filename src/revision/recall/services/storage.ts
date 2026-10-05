/**
 * Recall theme application — Digitalcatalyst port override.
 *
 * Upstream wrote `.dark` / `.high-contrast` onto `document.documentElement` and
 * toggled `dyslexia-font` on <html>. Digitalcatalyst's app is dark-only and its
 * own glass pack pins `html.dark` unconditionally (src/lib/glassScheme.ts), so
 * writing theme state there would (a) fight the host and (b) leak the feature's
 * typography into the rest of the app.
 *
 * This override applies the same three pieces of state to the Revision feature
 * shell instead — the element carrying `data-recall-root` — which is exactly the
 * element `recall-theme.css` reads. The rest of the app is untouched (§22).
 */

import type { Theme, AccentColor } from "../types";

export const RECALL_ROOT_SELECTOR = "[data-recall-root]";

let registeredRoot: HTMLElement | null = null;

/** The feature shell registers itself on mount (fast path, no DOM query). */
export function registerRecallThemeRoot(element: HTMLElement | null): void {
  registeredRoot = element;
}

function resolveRoot(): HTMLElement | null {
  if (registeredRoot && registeredRoot.isConnected) return registeredRoot;
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(RECALL_ROOT_SELECTOR);
}

export function applyTheme(theme: Theme): void {
  const root = resolveRoot();
  if (!root) return;

  // Upstream: dark + high-contrast both mean "the dark token set"; the
  // high-contrast token set layers on top through data-recall-contrast.
  root.setAttribute("data-recall-theme", theme === "light" ? "light" : "dark");
  root.setAttribute("data-recall-contrast", theme === "high-contrast" ? "high" : "normal");
  root.style.colorScheme = theme === "high-contrast" ? "dark" : theme === "light" ? "light" : "dark";
}

const ACCENT_COLORS: Record<AccentColor, { light: string; dark: string }> = {
  zinc: { light: "#18181b", dark: "#f4f4f5" },
  blue: { light: "#1d4ed8", dark: "#60a5fa" },
  green: { light: "#15803d", dark: "#4ade80" },
  rose: { light: "#be123c", dark: "#fb7185" },
  amber: { light: "#b45309", dark: "#fbbf24" },
  violet: { light: "#7c3aed", dark: "#a78bfa" },
};

export function applyAccentColor(color: AccentColor): void {
  const root = resolveRoot();
  if (!root) return;

  Object.keys(ACCENT_COLORS).forEach((candidate) => {
    root.classList.remove(`accent-${candidate}`);
  });
  root.classList.add(`accent-${color}`);

  const colors = ACCENT_COLORS[color];
  root.style.setProperty("--accent-light", colors.light);
  root.style.setProperty("--accent-dark", colors.dark);
}

export function applyDyslexiaFont(enabled: boolean): void {
  const root = resolveRoot();
  if (!root) return;
  root.classList.toggle("dyslexia-font", enabled);
}
