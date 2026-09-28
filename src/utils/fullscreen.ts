// src/utils/fullscreen.ts
//
// ONE fullscreen controller for the whole app.
//
// ── WHY THIS EXISTS (the "Fullscreen button APK mein kaam nahi karta" bug) ──
//
// The Sanctuary's Fullscreen row (and the Course Player's "Hide status bar"
// switch, and the media viewer's Fullscreen row) all called
//
//     document.documentElement.requestFullscreen()
//
// That works in a desktop browser and in Android Chrome / the PWA. Inside the
// Capacitor Android WebView it can NEVER work: Android's WebView only honours
// an HTML5 fullscreen request when the host Activity overrides
// `WebChromeClient.onShowCustomView()` / `onHideCustomView()`, and Capacitor's
// stock `BridgeWebChromeClient` answers every request with an immediate
// `callback.onCustomViewHidden()` — i.e. "this WebView does not support
// fullscreen". The promise rejects, every caller swallowed the rejection
// (`.catch(() => {})`), and the button looked completely dead on the APK —
// on phones AND on tablets. iOS Safari is the same story from the other side:
// it simply does not expose `Element.requestFullscreen()` at all.
//
// So fullscreen is now negotiated in layers, in this order:
//
//   1. NATIVE (Capacitor shell) — the `AppFullscreen` Android plugin, which
//      drives `WindowInsetsControllerCompat` (immersive system bars). This is
//      the ONLY layer that can hide the Android status + navigation bars from
//      a WebView, and it is what makes the APK button work. The Activity also
//      installs a real WebChromeClient (see FullscreenWebChromeClient.java)
//      so HTML5 element fullscreen — YouTube iframes, <video>, the media
//      viewer's own stage — works inside the APK as well.
//   2. WEB — the standard / WebKit Fullscreen API on the document root with
//      `navigationUI: "hide"` (desktop browsers, Android Chrome, PWA).
//   3. APP IMMERSIVE (fallback) — `data-app-fullscreen="true"` on <html>.
//      Used only where a page genuinely cannot hide the OS chrome (iOS Safari,
//      an in-app browser). The screen keeps working, the button visibly
//      responds, and screens that want it can hide their own chrome for the
//      duration (the Sanctuary frees the whole viewport).
//
// Every layer reports through ONE snapshot + subscription, so a button's label
// ("Fullscreen" ⇄ "Exit fullscreen") is always honest about what is really on.

/** Which layer currently owns the screen. */
export type FullscreenMode = "none" | "native" | "web" | "app";

export interface FullscreenSnapshot {
  /** True while ANY fullscreen layer is active. */
  active: boolean;
  /** The layer that took the request (`"app"` = in-page fallback). */
  mode: FullscreenMode;
}

/** Options for {@link enterFullscreen}. */
export interface EnterFullscreenOptions {
  /**
   * Element to put fullscreen (media viewers pass their own stage). When it is
   * omitted the request is APP-level: the Android immersive bridge is tried
   * first inside the APK, then the document root in a browser.
   */
  element?: Element | null;
  /**
   * Set false when the caller must NOT be told "fullscreen is on" unless the
   * OS/browser chrome really went away (the Course Player's status-bar switch
   * is a toggle: reporting the page-level fallback as ON would be a lie).
   */
  allowAppFallback?: boolean;
}

interface AppFullscreenPlugin {
  enter(): Promise<{ active?: boolean }>;
  exit(): Promise<{ active?: boolean }>;
  isActive(): Promise<{ active?: boolean }>;
}

type PrefixedFullscreenElement = Element & {
  webkitRequestFullscreen?: (options?: unknown) => void;
  mozRequestFullScreen?: () => void;
  msRequestFullscreen?: () => void;
};

const listeners = new Set<() => void>();

/** The layer that owns the screen right now (single owner, by design). */
let mode: FullscreenMode = "none";
/** True while a plugin round-trip is in flight (prevents double taps). */
let nativePending = false;
let pluginPromise: Promise<AppFullscreenPlugin | null> | null = null;

const doc = (): Document | null => (typeof document === "undefined" ? null : document);

/**
 * True inside the Capacitor shell (the Android APK / iOS app). Reads the
 * injected global directly — same check `nativeRuntime.ts` uses — so it is
 * safe in a plain browser and never triggers a plugin import.
 */
export const isNativeRuntime = (): boolean => {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }).Capacitor;
  if (!capacitor) return false;
  try {
    if (typeof capacitor.isNativePlatform === "function") return capacitor.isNativePlatform();
    if (typeof capacitor.getPlatform === "function") return capacitor.getPlatform() !== "web";
  } catch {
    /* fall through */
  }
  return false;
};

/** The element the browser currently has in real fullscreen, if any. */
const webFullscreenElement = (): Element | null => {
  const d = doc() as (Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  }) | null;
  if (!d) return null;
  return (
    d.fullscreenElement
    || d.webkitFullscreenElement
    || d.mozFullScreenElement
    || d.msFullscreenElement
    || null
  );
};

const emit = (): void => {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* a listener must never break the controller */
    }
  }
};

/** Publish the in-page fallback flag that CSS/JS can react to. */
const publishDomFlag = (): void => {
  const d = doc();
  if (!d?.documentElement) return;
  if (mode === "app") d.documentElement.setAttribute("data-app-fullscreen", "true");
  else d.documentElement.removeAttribute("data-app-fullscreen");
};

const setMode = (next: FullscreenMode): void => {
  if (mode === next) return;
  mode = next;
  publishDomFlag();
  emit();
};

/** The live snapshot (cheap — no DOM reads). */
export const getFullscreenSnapshot = (): FullscreenSnapshot => ({
  active: mode !== "none",
  mode,
});

/** True while the app owns a fullscreen surface of any layer. */
export const isFullscreenActive = (): boolean => mode !== "none" || webFullscreenElement() !== null;

/** True while the last-resort in-page fallback owns the screen. */
export const isAppFullscreenFallback = (): boolean => mode === "app";

/** Subscribe to fullscreen changes (buttons mirror the live state). */
export const subscribeFullscreen = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Keep the snapshot honest when the browser leaves fullscreen on its own
// (Android swipe-down, Escape, the OS "exit fullscreen" pill).
if (typeof document !== "undefined") {
  const onWebChange = (): void => {
    if (webFullscreenElement()) {
      if (mode !== "web") setMode("web");
    } else if (mode === "web") {
      setMode("none");
    }
  };
  document.addEventListener("fullscreenchange", onWebChange);
  document.addEventListener("webkitfullscreenchange", onWebChange as EventListener);
}

/** Load (once) the native immersive plugin proxy — null off native / offline. */
const loadNativePlugin = async (): Promise<AppFullscreenPlugin | null> => {
  if (!isNativeRuntime()) return null;
  if (!pluginPromise) {
    pluginPromise = import("@capacitor/core")
      .then(({ registerPlugin }) => registerPlugin<AppFullscreenPlugin>("AppFullscreen"))
      .catch(() => null);
  }
  try {
    return await pluginPromise;
  } catch {
    return null;
  }
};

/**
 * Ask the browser for real fullscreen on `element`. Resolves `true` only when
 * the element actually went fullscreen — a rejected request (no user gesture,
 * unsupported element, WebView without a WebChromeClient custom view host)
 * resolves `false` so the caller can fall back to another layer.
 */
const requestWebFullscreen = (element: PrefixedFullscreenElement): Promise<boolean> => {
  return new Promise((resolve) => {
    try {
      if (typeof element.requestFullscreen === "function") {
        const result = element.requestFullscreen({ navigationUI: "hide" });
        if (result && typeof result.then === "function") {
          result.then(() => resolve(true)).catch(() => resolve(false));
          return;
        }
        resolve(true);
        return;
      }
      const prefixed = element.webkitRequestFullscreen || element.mozRequestFullScreen || element.msRequestFullscreen;
      if (typeof prefixed === "function") {
        // Prefixed entry points take no options argument (passing one throws).
        (prefixed as () => void).call(element);
        resolve(true);
        return;
      }
    } catch {
      /* denied / unsupported — the caller picks the next layer */
    }
    resolve(false);
  });
};

/** Leave the browser's own fullscreen, whatever the entry point was. */
const exitWebFullscreen = async (): Promise<void> => {
  const d = doc() as (Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    mozCancelFullScreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  }) | null;
  if (!d || !webFullscreenElement()) return;
  const exit = d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen;
  if (typeof exit !== "function") return;
  try {
    await exit.call(d);
  } catch {
    /* already gone */
  }
};

/** Native immersive entry — resolves true only when the plugin answered. */
const enterNativeFullscreen = async (): Promise<boolean> => {
  if (nativePending) return mode === "native";
  const plugin = await loadNativePlugin();
  if (!plugin) return false;
  nativePending = true;
  try {
    await plugin.enter();
    return true;
  } catch {
    return false;
  } finally {
    nativePending = false;
  }
};

const exitNativeFullscreen = async (): Promise<void> => {
  const plugin = await loadNativePlugin();
  if (!plugin) return;
  try {
    await plugin.exit();
  } catch {
    /* the shell has no plugin (older build) — nothing to release */
  }
};

/**
 * Enter fullscreen.
 *
 * Element-level requests (`element` given — media stages) try the REAL web API
 * first on every platform: inside the APK it now works too, because the shell
 * installs a WebChromeClient that hosts the custom view. App-level requests
 * inside the APK go straight to the native immersive bridge — no reparenting,
 * so the WebGL canvas never relayouts mid-request.
 *
 * Call this straight from the user gesture (click / tap handler): the browser
 * layers only accept a request that rides a real activation.
 */
export const enterFullscreen = async (options: EnterFullscreenOptions = {}): Promise<FullscreenSnapshot> => {
  const isElementRequest = Boolean(options.element);
  const target = options.element ?? doc()?.documentElement ?? null;
  if (!target) return getFullscreenSnapshot();

  // 1 · Element request (media stage): real web fullscreen is the best result
  //     on every platform that honours it — inside the APK included, now that
  //     the shell hosts the Chrome custom view.
  if (
    isElementRequest
    && (await requestWebFullscreen(target as PrefixedFullscreenElement))
  ) {
    setMode("web");
    return getFullscreenSnapshot();
  }

  // 2 · App-level request inside the shell: the native immersive bridge. No
  //     WebView reparenting, so the WebGL canvas never relayouts mid-flight.
  if (
    !isElementRequest
    && isNativeRuntime()
    && (await enterNativeFullscreen())
  ) {
    setMode("native");
    return getFullscreenSnapshot();
  }

  // 3 · Standard web fullscreen on the document root (desktop, Android
  //     Chrome, iPadOS).
  if (
    !isElementRequest
    && (await requestWebFullscreen(target as PrefixedFullscreenElement))
  ) {
    setMode("web");
    return getFullscreenSnapshot();
  }

  // 4 · Element request on a shell whose WebView refused it: at least give the
  //     learner the immersive system bars.
  if (
    isElementRequest
    && isNativeRuntime()
    && (await enterNativeFullscreen())
  ) {
    setMode("native");
    return getFullscreenSnapshot();
  }

  // 5 · Last resort: the page hides its own chrome. The screen always answers
  //     — unless the caller asked us not to claim a fullscreen we don't have.
  if (options.allowAppFallback === false) return getFullscreenSnapshot();
  setMode("app");
  return getFullscreenSnapshot();
};

/** Leave fullscreen, whichever layer owns it. */
export const exitFullscreen = async (): Promise<FullscreenSnapshot> => {
  if (webFullscreenElement()) await exitWebFullscreen();
  if (isNativeRuntime()) await exitNativeFullscreen();
  setMode("none");
  return getFullscreenSnapshot();
};

/**
 * One-tap fullscreen for a button: enter when idle, leave when active.
 * Mirrors the state right before deciding, so a stale label can't invert the
 * meaning of the tap.
 */
export const toggleFullscreen = async (options: EnterFullscreenOptions = {}): Promise<FullscreenSnapshot> => {
  if (isFullscreenActive()) return exitFullscreen();
  return enterFullscreen(options);
};

/**
 * Re-assert the native immersive state if the system brought the bars back
 * (a notification shade pull, a permission dialog, a resume after background).
 * Cheap and safe to call on every foreground / focus event.
 */
export const resyncFullscreen = async (): Promise<void> => {
  if (!isNativeRuntime()) return;
  const plugin = await loadNativePlugin();
  if (!plugin) return;
  try {
    const { active } = await plugin.isActive();
    if (active) {
      if (mode === "none") setMode("native");
    } else if (mode === "native") {
      setMode("none");
    }
  } catch {
    /* the shell has no plugin — the web layers stay in charge */
  }
};

// Coming back to the foreground is exactly when Android has re-shown the bars.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void resyncFullscreen();
  });
}

/** True when the app should be allowed to hide the phone's status bar. */
export const canUseFullscreen = (): boolean => {
  if (typeof document === "undefined") return false;
  if (isNativeRuntime()) return true;
  const root = document.documentElement as PrefixedFullscreenElement;
  return typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
};
