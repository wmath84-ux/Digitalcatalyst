// src/utils/systemBars.ts
//
// ONE coordinator for the Android system status bar, the system navigation bar
// and the browser `theme-color`. Nothing else writes those — pages, the theme
// switch and the Course Player only *report* what they need (see
// `setSystemBarOverride`) and this module decides the colours.
//
// WHERE THE COLOUR COMES FROM
//   The colour is read from the page that is actually on screen, not from a
//   separate list of route colours that could drift from the design:
//     · top edge    → the rendered background under the top edge of the
//                     viewport (the page header, when a page has one);
//     · bottom edge → the rendered background under the bottom edge (the
//                     footer / bottom bar);
//     · no page background at all → the document background (theme aware).
//   Translucent layers (glass headers, dialog scrims) are composited over the
//   layers beneath them. A page whose edge is a gradient or an image cannot be
//   sampled as one colour, so it declares the colour it wants with
//   `data-system-bar-color="#rrggbb"` on the element that paints that edge.
//
// WHEN IT RE-SAMPLES
//   Hash route change, popstate, Light/Dark switch (<html> class / data-theme /
//   style), media-query change, resize / orientation, page show / visibility,
//   and any DOM change in <body> (a page render, a dialog opening or closing).
//   Changes are coalesced, and the native call is skipped when nothing changed.
//
// WHAT IT WRITES
//   · Android (Capacitor): AppStatusBar.setSystemBars → window status and
//     navigation bar colours, plus the light/dark icon appearance of each bar,
//     computed from the colour's own luminance. Native code ignores bar colours
//     on Android 15+ (targetSdk 35 forces edge-to-edge): there the bar area shows
//     the page's own top/bottom background, which is the same colour this module
//     samples, so the two stay in step. Icons are honoured on every API level.
//   · Browser / PWA: the `theme-color` meta tag(s).

import { registerPlugin } from "@capacitor/core";
import { isCapacitorNative } from "./nativeRuntime";
import { subscribeFullscreen } from "./fullscreen";
import { OPAQUE_BLACK, OPAQUE_WHITE, compositeOver, parseCssColor, prefersDarkIcons, toHex, type Rgba } from "./systemBarColor";

export interface SystemBarsPayload {
  /** Status bar (top edge) colour, `#rrggbb`. */
  status: string;
  /** Navigation bar (bottom edge) colour, `#rrggbb`. */
  navigation: string;
  /** True when the status bar needs dark icons (light background). */
  statusDarkIcons: boolean;
  /** True when the navigation bar needs dark icons (light background). */
  navigationDarkIcons: boolean;
}

interface AppStatusBarNativePlugin {
  setSystemBars(options: SystemBarsPayload): Promise<unknown>;
}

const AppStatusBarPlugin = registerPlugin<AppStatusBarNativePlugin>("AppStatusBar");

const isDarkScheme = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

/** The colour painted behind everything: <body> over <html>, else the theme default. */
function documentBackground(): Rgba {
  const fallback = isDarkScheme() ? OPAQUE_BLACK : OPAQUE_WHITE;
  const html = parseCssColor(getComputedStyle(document.documentElement).backgroundColor);
  const body = document.body ? parseCssColor(getComputedStyle(document.body).backgroundColor) : null;
  let base: Rgba = html && html.a > 0 ? compositeOver(html, fallback) : fallback;
  if (body && body.a > 0) base = compositeOver(body, base);
  return { ...base, a: 1 };
}

/**
 * The colour that is visibly painted under one screen edge.
 *
 * Walks the hit-test stack top → bottom (`elementsFromPoint`), so a dialog scrim
 * darkens the page that is really underneath it, not the document background.
 * Collection stops at the first opaque layer; the translucent layers above it are
 * composited over it. A page-declared `data-system-bar-color` on the element that
 * paints the edge replaces that element's (possibly gradient) background.
 */
export function sampleEdgeColor(edge: "top" | "bottom"): Rgba {
  const base = documentBackground();
  if (typeof document.elementsFromPoint !== "function") return base;
  const x = Math.max(0, Math.floor(window.innerWidth / 2));
  const y = edge === "top" ? 1 : Math.max(0, window.innerHeight - 2);
  const stack = document
    .elementsFromPoint(x, y)
    .filter((el) => el !== document.documentElement && el !== document.body);

  // Layers, top first.
  const layers: Rgba[] = [];
  for (const el of stack) {
    const declared = el.closest<HTMLElement>("[data-system-bar-color]");
    if (declared) {
      const explicit = parseCssColor(declared.dataset.systemBarColor);
      if (explicit && explicit.a > 0) {
        layers.push(explicit);
        break;
      }
    }
    const own = parseCssColor(getComputedStyle(el).backgroundColor);
    if (!own || own.a <= 0) continue;
    layers.push(own);
    if (own.a >= 1) break;
  }
  if (layers.length === 0) return base;

  // Start from the deepest opaque layer if there is one, else from the document
  // background, and paint the translucent layers above it.
  let result = base;
  let start = layers.length - 1;
  if (layers[start].a >= 1) {
    result = layers[start];
    start -= 1;
  }
  for (let i = start; i >= 0; i -= 1) result = compositeOver(layers[i], result);
  return { ...result, a: 1 };
}

// ── Coordinator state ──────────────────────────────────────────────────────

/** Owner → colour. The most recently set owner wins. Used by full-screen / landscape layers. */
const overrides = new Map<string, string>();
let lastApplied: string | null = null;
let scheduledTimer = 0;
let started = false;
let stopListening: (() => void) | null = null;

/**
 * Let a non-page layer (the Course Player's landscape chrome, the theme switch)
 * take over the bars with one colour, or give them back to the page (`null`).
 * Pages never call this — they just render their own header and the coordinator
 * samples it.
 */
export function setSystemBarOverride(owner: string, color: string | null): void {
  if (color) overrides.set(owner, color);
  else overrides.delete(owner);
  scheduleSystemBarSync(0);
}

/** The payload that should be on the bars right now. */
export function computeSystemBarsPayload(): SystemBarsPayload {
  let top: Rgba | null = null;
  let bottom: Rgba | null = null;
  let override: Rgba | null = null;
  for (const color of overrides.values()) override = parseCssColor(color) ?? override;

  if (override) {
    top = override;
    bottom = override;
  } else {
    top = sampleEdgeColor("top");
    bottom = sampleEdgeColor("bottom");
  }
  return {
    status: toHex(top),
    navigation: toHex(bottom),
    statusDarkIcons: prefersDarkIcons(top),
    navigationDarkIcons: prefersDarkIcons(bottom),
  };
}

function writeThemeColorMeta(color: string): void {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    document.head.appendChild(meta);
    return;
  }
  metas.forEach((meta) => meta.setAttribute("content", color));
}

/** Sample, then write only when the result changed. */
export function applySystemBarsNow(): void {
  if (typeof document === "undefined") return;
  const payload = computeSystemBarsPayload();
  const key = JSON.stringify(payload);
  if (key === lastApplied) return;
  lastApplied = key;

  writeThemeColorMeta(payload.status);
  if (isCapacitorNative()) {
    AppStatusBarPlugin.setSystemBars(payload).catch(() => {
      // An older native shell without this method: the page still works, the bars keep their last colour.
    });
  }
}

/** Coalesce many triggers into one sample, after the browser has painted the change. */
export function scheduleSystemBarSync(delayMs = 60): void {
  if (typeof window === "undefined") return;
  if (scheduledTimer) window.clearTimeout(scheduledTimer);
  scheduledTimer = window.setTimeout(() => {
    scheduledTimer = 0;
    window.requestAnimationFrame(() => applySystemBarsNow());
  }, delayMs);
}

/**
 * Start listening for everything that can change the colour under the bars.
 * Idempotent. Returns the stop function (used by tests and hot reload).
 */
export function startSystemBarSync(): () => void {
  if (started || typeof window === "undefined" || typeof document === "undefined") {
    return stopListening ?? (() => undefined);
  }
  started = true;
  const onChange = () => scheduleSystemBarSync(60);
  const events = ["hashchange", "popstate", "pageshow", "resize", "orientationchange"] as const;
  events.forEach((name) => window.addEventListener(name, onChange));
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisible);
  // Immersive / fullscreen exit restores the bars on its own: force one re-apply
  // even when the sampled colours did not change.
  const unsubscribeFullscreen = subscribeFullscreen(() => {
    lastApplied = null;
    onChange();
  });

  const schemeQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const addQueryListener = (query: MediaQueryList) => {
    if (typeof query.addEventListener === "function") query.addEventListener("change", onChange);
    else (query as unknown as { addListener?: (fn: () => void) => void }).addListener?.(onChange);
  };
  if (schemeQuery) addQueryListener(schemeQuery);

  // Light/Dark switch: the app sets class / data-theme / style on <html>.
  const rootObserver = new MutationObserver(onChange);
  rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });

  // Every page render, dialog open/close, header change.
  const bodyObserver = new MutationObserver(onChange);
  if (document.body) {
    bodyObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "data-system-bar-color"] });
  }

  stopListening = () => {
    events.forEach((name) => window.removeEventListener(name, onChange));
    document.removeEventListener("visibilitychange", onVisible);
    unsubscribeFullscreen();
    if (schemeQuery) {
      if (typeof schemeQuery.removeEventListener === "function") schemeQuery.removeEventListener("change", onChange);
      else (schemeQuery as unknown as { removeListener?: (fn: () => void) => void }).removeListener?.(onChange);
    }
    rootObserver.disconnect();
    bodyObserver.disconnect();
    if (scheduledTimer) window.clearTimeout(scheduledTimer);
    scheduledTimer = 0;
    started = false;
    stopListening = null;
  };
  scheduleSystemBarSync(0);
  return stopListening;
}
