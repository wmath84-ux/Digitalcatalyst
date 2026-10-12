import { useSyncExternalStore } from "react";

export type FooterNavigationStyle = "uiverse" | "glass-dock";

const STORAGE_KEY = "dc-footer-navigation-style";
const CHANGE_EVENT = "dc:footer-navigation-style-change";
const DEFAULT_STYLE: FooterNavigationStyle = "uiverse";

function normalizeStyle(value: string | null | undefined): FooterNavigationStyle {
  return value === "glass-dock" ? "glass-dock" : DEFAULT_STYLE;
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
