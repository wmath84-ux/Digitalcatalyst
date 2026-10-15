import { useSyncExternalStore } from "react";

export type FooterNavigationStyle = "youtube" | "uiverse" | "glass-dock" | "work-pill";

const STORAGE_KEY = "dc-footer-navigation-style";
const CHANGE_EVENT = "dc:footer-navigation-style-change";
const DEFAULT_STYLE: FooterNavigationStyle = "work-pill";
/**
 * The one-time "everyone starts on the Workspace pill" pass:
 *
 *   "Workspace ka pill-style footer navigation sabhi users ke liye
 *    default set karo."
 *
 * This supersedes the earlier Edge-to-edge (`youtube`) default. A browser
 * that still has any other design saved — Edge-to-edge included — is moved
 * onto the Workspace pill (`work-pill`) ONCE, at app boot. The marker is a
 * NEW key, distinct from the retired `…edge-default.v1` one, so browsers
 * that already ran that pass are still moved onto the new default.
 *
 * The marker makes it strictly one-time: from the next visit on, the
 * Settings choice is the learner's again and is never silently overwritten,
 * so a design picked in Settings is preserved across later boots.
 *
 * Deliberately NOT a module side effect: harness pages and component tests
 * import this file to switch styles on purpose, and only the real app boot
 * (`src/main.tsx`) is allowed to re-seat a stored preference.
 */
const MIGRATION_KEY = "dc-footer-navigation-style.work-pill-default.v1";

/**
 * Runs once per browser (idempotent thanks to the marker). Safe to call on
 * every boot: after the first call it is a single `localStorage.getItem`.
 */
export function ensureDefaultFooterNavigationStyle(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(MIGRATION_KEY) === "1") return;
    window.localStorage.setItem(MIGRATION_KEY, "1");
    window.localStorage.setItem(STORAGE_KEY, DEFAULT_STYLE);
  } catch {
    // Private mode / storage denied: the in-memory default is already
    // the Workspace pill, so there is nothing to migrate.
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
