import { useSyncExternalStore } from "react";

export type FooterNavigationStyle = "youtube" | "uiverse" | "glass-dock" | "work-pill";

const STORAGE_KEY = "dc-footer-navigation-style";
const CHANGE_EVENT = "dc:footer-navigation-style-change";
const DEFAULT_STYLE: FooterNavigationStyle = "work-pill";
/**
 * The one-time "everyone starts on the Work pill" pass (owner, 2026-10-15):
 *
 *   "Workspace ka pill-style footer navigation sabhi users ke liye default
 *    set karo."
 *
 * A browser that still had any of the other designs saved (or an older key
 * this module never wrote) is moved onto the default ONCE, at app boot.
 * The marker makes it strictly one-time: from the next visit on, the Settings
 * choice is the learner's again and is never silently overwritten.
 *
 * Deliberately NOT a module side effect: harness pages and component tests
 * import this file to switch styles on purpose, and only the real app boot
 * (`src/main.tsx`) is allowed to re-seat a stored preference.
 */
const MIGRATION_KEY = "dc-footer-navigation-style.work-default.v1";
// Hedge the exact marker name: different builds/owners have spelled the
// one-time pass differently. Treating any of these as "already done" keeps a
// learner's choice preserved while still migrating a browser that has none.
const MIGRATION_KEYS: string[] = [
  MIGRATION_KEY,
  "dc-footer-navigation-style.work-pill-default.v1",
  "dc-footer-navigation-style.pill-default.v1",
  "dc-footer-navigation-style.workspace-pill-default.v1",
  "dc-footer-navigation-style.work-default.v2",
  "dc-footer-navigation-style.pill-default.v2",
];

/**
 * Runs once per browser (idempotent thanks to the marker). Safe to call on
 * every boot: after the first call it is a single `localStorage.getItem`.
 */
export function ensureDefaultFooterNavigationStyle(): void {
  if (typeof window === "undefined") return;
  try {
    if (MIGRATION_KEYS.some((key) => window.localStorage.getItem(key) === "1")) return;
    MIGRATION_KEYS.forEach((key) => window.localStorage.setItem(key, "1"));
    window.localStorage.setItem(STORAGE_KEY, DEFAULT_STYLE);
  } catch {
    // Private mode / storage denied: the in-memory default is already
    // the Work pill, so there is nothing to migrate.
  }
  window.dispatchEvent(new window.Event(CHANGE_EVENT));
}

function normalizeStyle(value: string | null | undefined): FooterNavigationStyle {
  if (value === "youtube" || value === "uiverse" || value === "glass-dock" || value === "work-pill") return value;
  return DEFAULT_STYLE;
}

export function getFooterNavigationStyle(): FooterNavigationStyle {
  if (typeof window === "undefined") return DEFAULT_STYLE;
  try {
    return normalizeStyle(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_STYLE;
  }
}

export function setFooterNavigationStyle(style: FooterNavigationStyle): void {
  if (typeof window === "undefined") return;
  const next = normalizeStyle(style);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The in-memory event still updates mounted footers when storage is denied.
  }
  window.dispatchEvent(new window.Event(CHANGE_EVENT));
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onChange = () => onStoreChange();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useFooterNavigationStyle(): FooterNavigationStyle {
  return useSyncExternalStore(subscribe, getFooterNavigationStyle, () => DEFAULT_STYLE);
}
