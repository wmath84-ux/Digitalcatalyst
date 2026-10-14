/**
 * Recall theme application — Digitalcatalyst port override.
 *
 * Upstream wrote `.dark` / `.high-contrast` onto `document.documentElement` and
 * toggled `dyslexia-font` on <html>. Digitalcatalyst owns a separate global
 * theme, so writing Recall's theme state there would fight the host and leak
 * typography into the rest of the app.
 *
 * This override applies the same three pieces of state to the Revision feature
 * shell instead — the element carrying `data-recall-root` — which is exactly the
 * element `recall-theme.css` reads. Recall's light appearance is the default;
 * the feature stays light even when an older/cloud setting requests dark.
 * The rest of the app is untouched (§22).
 *
 * Radix portals render under <body>, outside that root. While Revision is
 * mounted, mirror only its scoped Recall variables + theme attributes onto the
 * body so dialog/select/alert-dialog utilities resolve in the active theme.
 * The exact previous body values are restored on unmount.
 */

import type { Theme, AccentColor } from "../types";

export const RECALL_ROOT_SELECTOR = "[data-recall-root]";

const PORTAL_THEME_ATTRIBUTES = ["data-recall-theme", "data-recall-contrast"] as const;

type InlineValue = { value: string; priority: string };

let registeredRoot: HTMLElement | null = null;
let portalBody: HTMLElement | null = null;
let previousPortalAttributes = new Map<(typeof PORTAL_THEME_ATTRIBUTES)[number], string | null>();
let previousPortalProperties = new Map<string, InlineValue>();
let appliedPortalProperties = new Set<string>();
let previousColorScheme: InlineValue | null = null;

function isRecallThemeProperty(name: string): boolean {
  // Only feature tokens may reach body. Copying Tailwind's --radius/--font
  // scales here restyled the Home-style footer even outside the Recall root.
  return name.startsWith("--rc-") || name.startsWith("--accent-");
}

function inlineValue(element: HTMLElement, name: string): InlineValue {
  return {
    value: element.style.getPropertyValue(name),
    priority: element.style.getPropertyPriority(name),
  };
}

function restoreInlineValue(element: HTMLElement, name: string, saved: InlineValue): void {
  if (saved.value) element.style.setProperty(name, saved.value, saved.priority);
  else element.style.removeProperty(name);
}

function restorePortalTheme(): void {
  if (!portalBody) return;

  for (const name of appliedPortalProperties) {
    const saved = previousPortalProperties.get(name);
    if (saved) restoreInlineValue(portalBody, name, saved);
  }
  for (const [name, value] of previousPortalAttributes) {
    if (value === null) portalBody.removeAttribute(name);
    else portalBody.setAttribute(name, value);
  }
  if (previousColorScheme) {
    restoreInlineValue(portalBody, "color-scheme", previousColorScheme);
  }

  portalBody = null;
  previousPortalAttributes = new Map();
  previousPortalProperties = new Map();
  appliedPortalProperties = new Set();
  previousColorScheme = null;
}

function attachPortalBody(body: HTMLElement): void {
  if (portalBody === body) return;
  restorePortalTheme();

  portalBody = body;
  previousPortalAttributes = new Map(
    PORTAL_THEME_ATTRIBUTES.map((name) => [name, body.getAttribute(name)]),
  );
  previousColorScheme = inlineValue(body, "color-scheme");
}

function syncPortalTheme(root: HTMLElement): void {
  if (typeof document === "undefined" || typeof window === "undefined" || !document.body) return;

  const body = document.body;
  attachPortalBody(body);

  const computed = window.getComputedStyle(root);
  const nextProperties = new Map<string, string>();
  for (let index = 0; index < computed.length; index += 1) {
    const name = computed.item(index);
    if (!isRecallThemeProperty(name)) continue;
    const value = computed.getPropertyValue(name).trim();
    if (value) nextProperties.set(name, value);
  }

  // If a theme stops defining a token, return that property to the body's
  // original inline value instead of leaving a stale theme value behind.
  for (const name of appliedPortalProperties) {
    if (nextProperties.has(name)) continue;
    const saved = previousPortalProperties.get(name);
    if (saved) restoreInlineValue(body, name, saved);
  }

  for (const [name, value] of nextProperties) {
    if (!previousPortalProperties.has(name)) {
      previousPortalProperties.set(name, inlineValue(body, name));
    }
    body.style.setProperty(name, value);
  }
  appliedPortalProperties = new Set(nextProperties.keys());

  body.setAttribute("data-recall-theme", root.getAttribute("data-recall-theme") ?? "light");
  body.setAttribute("data-recall-contrast", root.getAttribute("data-recall-contrast") ?? "normal");

}

/** The feature shell registers itself on mount (fast path, no DOM query). */
export function registerRecallThemeRoot(element: HTMLElement | null): void {
  registeredRoot = element;
  if (element) syncPortalTheme(element);
  else restorePortalTheme();
}

function resolveRoot(): HTMLElement | null {
  if (registeredRoot && registeredRoot.isConnected) return registeredRoot;
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(RECALL_ROOT_SELECTOR);
}

export function applyTheme(_theme: Theme): void {
  const root = resolveRoot();
  if (!root) return;

  // Revision is always light, independently of device/host and saved settings.
  root.setAttribute("data-recall-theme", "light");
  root.setAttribute("data-recall-contrast", "normal");
  root.style.colorScheme = "light";
  syncPortalTheme(root);
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

  const colors = ACCENT_COLORS[color] ?? ACCENT_COLORS.zinc;
  root.style.setProperty("--accent-light", colors.light);
  root.style.setProperty("--accent-dark", colors.dark);
  syncPortalTheme(root);
}

export function applyDyslexiaFont(enabled: boolean): void {
  const root = resolveRoot();
  if (!root) return;
  root.classList.toggle("dyslexia-font", enabled);
  syncPortalTheme(root);
}
