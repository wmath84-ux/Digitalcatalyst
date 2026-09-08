// Colour scheme for the website-glass pack.
//
// The app is DARK ONLY. The vendored websiteglass.com components carry both of
// the published materials and pick one by reading `html.dark` / `html.light`
// (see readDark() in components/ui/glass.tsx), so the one thing this module
// still does is pin the dark side of that pair on <html>.
//
// There is deliberately no light scheme here any more: no `"light"` value, no
// stored preference, no `useGlassScheme()` and no switch in the UI. The
// previous version persisted `dc.glass.scheme` and let Settings / Profile flip
// the pack to its light material; that whole path is gone, and any stale
// `dc.glass.scheme` entry left in localStorage is ignored (the class it drove
// is now written unconditionally).
//
// `colorScheme` is written too, so form controls, scrollbars and the native
// date/time pickers inherit the dark rendering instead of following the OS.
export type GlassScheme = "dark";

/** The old preference key. Read once so it can be dropped. */
const LEGACY_KEY = "dc.glass.scheme";

export function applyGlassScheme(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.add("dark");
  root.classList.remove("light");
  root.dataset.theme = "dark";
  root.style.colorScheme = "dark";
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* private mode — nothing to clean up */
  }
}
