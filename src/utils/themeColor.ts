// Keeps the mobile browser/PWA status bar and surrounding chrome in sync with
// the screen that is actually on display. Dark screens (landing, auth, admin
// login and the boot splash) use the deep brand background; every light app
// screen uses the app's slate page background so the status bar never renders
// black on top of a light UI.
export const THEME_COLOR_DARK = "#05060f";
export const THEME_COLOR_LIGHT = "#f1f5f9"; // matches bg-slate-100 page shells

export function setThemeColor(color: string): void {
  if (typeof document === "undefined") return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  if (meta.getAttribute("content") !== color) meta.setAttribute("content", color);
}
