// src/utils/openingSplash.ts
//
// The app opening animation — ONE decision engine, ONE lifecycle owner.
//
// Why this file exists (and why the earlier attempts did not stick): the
// opening used to be driven from four places at once — the pre-React script in
// index.html, `AppLaunchSplash`, the `splash.style.display` effect in RootPage,
// and OfflineGate. Each of them could hide the splash on its own, and every
// "fix" added another guard instead of removing one. The reachable ways for a
// user to see *nothing* on both desktop and mobile were:
//
//   1. `if (video.ended) finished()` — a PWA/Capacitor app that is resumed
//      rather than reloaded had an already-ended clip, so the opening was
//      declared "handled" before it was ever shown.
//   2. The first `error` event (empty `src` at parse time, a dropped range
//      request, a 5 MB clip on a flaky mobile link) hid the splash instantly
//      with nothing underneath.
//   3. `@media (prefers-reduced-motion: reduce) { #app-opening-splash {
//      display: none !important } }` — Android's "Reduce animation", Windows'
//      "animation effects off" and iOS "Reduce Motion" deleted the opening on
//      every screen size, no matter what the JavaScript did.
//   4. Admin branding `openingAnimationEnabled: false` (cached in localStorage)
//      hid it pre-React, and the value could be written by any branding save.
//
// The rules now enforced here:
//
//   • The opening is never blank. A CSS-only brand card paints first (no JS
//     needed), the MP4 fades in on top of it as soon as it has real frames,
//     and if the clip cannot deliver a frame the brand card simply stays.
//   • Reduced motion means "no motion", not "nothing": the card is shown for
//     the same minimum time; `?opening=force` plays the clip anyway.
//   • This controller is the ONLY writer of `#app-opening-splash`. React does
//     not touch the <video>, so a StrictMode remount can no longer abort,
//     restart or "finish" the clip.
//   • A CSS failsafe (index.html) hides the splash after ~11 s even if the
//     bundle throws, so a broken opening can never white-screen the app.
//   • Every branch is overridable from the URL, and `?opening=debug` shows a
//     badge with the exact reason — so "it does not play on my phone" can be
//     answered from a screenshot instead of a guess.

import { useEffect, useState } from "react";

export const APP_OPENING_VIDEO_MOBILE_SRC = "/assets/animations/EduOS_app_opening_mobile.mp4";
export const APP_OPENING_VIDEO_DESKTOP_SRC = "/assets/animations/EduOS_app_opening_desktop.mp4";

/** Both shipped MP4s are 10.006 s (mvhd timescale 1000 / duration 10006). */
const CLIP_DURATION_MS = 10_006;

export const OPENING_SPLASH_ID = "app-opening-splash";
export const OPENING_VIDEO_ID = "app-opening-video";
export const OPENING_DEBUG_ID = "app-opening-debug";
/** Below this CSS px width the portrait clip plays; tablet + desktop get the wide clip. */
export const OPENING_MOBILE_MAX_WIDTH = 768;

/** Never let the opening flash by — the card / first frame is held this long. */
export const OPENING_MIN_VISIBLE_MS = 1_400;
/** How long a zero-frame clip may hold on before it is declared unplayable. */
export const OPENING_FIRST_FRAME_GRACE_MS = 3_000;
/** Hard ceiling — the app always opens, even if `ended` never fires. */
export const OPENING_MAX_WAIT_MS = CLIP_DURATION_MS + 2_000;
/** Fade-out length before the splash leaves the layout. */
export const OPENING_FADE_MS = 380;

export const OPENING_QUERY_KEY = "opening";
export const OPENING_OVERRIDE_STORAGE_KEY = "eduvora.opening.override.v1";
export const OPENING_STATE_EVENT = "eduvora:opening-state";
export const OPENING_BRAND_CACHE_KEY = "eduvora.branding.v2";

export type OpeningClip = "mobile" | "desktop";
/** `video` = the shipped EduOS clip; `static` = the CSS brand card only. */
export type OpeningMode = "video" | "static";
export type OpeningState = "pending" | "playing" | "fallback" | "done" | "skipped";
export type OpeningOverride = "on" | "off" | "force" | "static" | "debug";

export interface OpeningInput {
  /** CSS px viewport width used to pick the portrait vs landscape clip. */
  width: number;
  /** `settings/branding.openingAnimationEnabled` (cached or live). */
  brandingEnabled: boolean;
  reducedMotion: boolean;
  offline: boolean;
  override: OpeningOverride | null;
}

export interface OpeningDecision {
  show: boolean;
  clip: OpeningClip;
  src: string;
  mode: OpeningMode;
  debug: boolean;
  /** Plain-language justification, surfaced in the debug badge and console. */
  reason: string;
  minVisibleMs: number;
  maxWaitMs: number;
}

const OVERRIDES: OpeningOverride[] = ["on", "off", "force", "static", "debug"];

/** Parse `?opening=on,debug` style values. Unknown tokens are ignored. */
export function parseOpeningOverride(raw: string | null | undefined): OpeningOverride | null {
  if (typeof raw !== "string" || !raw) return null;
  const tokens = raw
    .toLowerCase()
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter((token) => OVERRIDES.includes(token as OpeningOverride));
  if (tokens.length === 0) return null;
  // Most specific wins; `force`/`on` are synonyms kept for both spellings used
  // in the last sessions.
  if (tokens.includes("off")) return "off";
  if (tokens.includes("force")) return "force";
  if (tokens.includes("on")) return "on";
  if (tokens.includes("static")) return "static";
  return "debug";
}

/** Read the override from the URL first, then from the persisted device choice. */
export function readOpeningOverride(search: string, stored: string | null): OpeningOverride | null {
  // A hash-routed app means both spellings appear in the wild:
  // `/?opening=debug#/home` and `/?opening=debug#/home?x=1`. Everything from
  // the fragment on is the app's own route, so it is dropped before parsing.
  const query = (search || "").split("#")[0];
  const params = new URLSearchParams(query.replace(/^[?&]/, ""));
  return parseOpeningOverride(params.get(OPENING_QUERY_KEY)) ?? parseOpeningOverride(stored);
}

/** The clip a given viewport width should use. */
export function openingClipForWidth(width: number): OpeningClip {
  return Number.isFinite(width) && width < OPENING_MOBILE_MAX_WIDTH ? "mobile" : "desktop";
}

export function openingSrcForClip(clip: OpeningClip): string {
  return clip === "mobile" ? APP_OPENING_VIDEO_MOBILE_SRC : APP_OPENING_VIDEO_DESKTOP_SRC;
}

/**
 * The single source of truth for whether the opening plays, which file, and
 * for how long. Pure — no DOM — so it is unit-tested directly.
 */
export function resolveOpeningDecision(input: OpeningInput): OpeningDecision {
  const clip = openingClipForWidth(input.width);
  const src = openingSrcForClip(clip);
  const base = {
    clip,
    src,
    debug: input.override === "debug",
    minVisibleMs: OPENING_MIN_VISIBLE_MS,
    maxWaitMs: OPENING_MAX_WAIT_MS,
  };

  if (input.override === "off") {
    return { ...base, show: false, mode: "video", reason: "skipped by the opening=off override" };
  }
  if (input.offline && input.override !== "force") {
    return { ...base, show: false, mode: "static", reason: "offline at boot — the offline screen paints instead" };
  }
  if (!input.brandingEnabled && input.override !== "on" && input.override !== "force") {
    return {
      ...base,
      show: false,
      mode: "video",
      reason:
        "admin branding has the opening turned off (App branding → App behaviour). " +
        "This device can override it with ?opening=on",
    };
  }
  if (input.override === "static") {
    return { ...base, show: true, mode: "static", reason: "forced the static opening card (opening=static)" };
  }
  if (input.reducedMotion && input.override !== "force") {
    return {
      ...base,
      show: true,
      mode: "static",
      reason: "system prefers reduced motion — showing the static opening card (opening=force plays the clip anyway)",
    };
  }
  return {
    ...base,
    show: true,
    mode: "video",
    reason: input.override ? `playing the opening (${input.override} override)` : "playing the opening animation",
  };
}

/* ───────────────────────────── runtime controller ─────────────────────────
   Installed by index.html's boot script as `window.__eduosOpening` and
   re-adopted (or created from scratch) by React. Exactly one controller is
   ever live.
   ------------------------------------------------------------------------- */

export interface OpeningController {
  readonly decision: OpeningDecision;
  readonly state: OpeningState;
  /** ms since the controller took over the splash. */
  readonly elapsedMs: number;
  /** ms until the first real frame was painted, or null while unknown. */
  readonly firstFrameMs: number | null;
  readonly lastError: string | null;
  /** networkState / readyState snapshot for the debug badge. */
  readonly mediaSnapshot: string;
  subscribe(listener: (controller: OpeningController) => void): () => void;
  whenDone(): Promise<void>;
  /** Re-run the opening right now (admin preview + the dev sandbox page). */
  replay(): void;
  /** Take the splash out of the layout immediately. */
  dismiss(): void;
  setDebug(next: boolean): void;
}

const isBrowser = (): boolean => typeof document !== "undefined" && typeof window !== "undefined";

function readStoredBrandingOpening(): boolean {
  if (!isBrowser()) return true;
  try {
    const cached = window.localStorage.getItem(OPENING_BRAND_CACHE_KEY);
    if (!cached) return true;
    const parsed = JSON.parse(cached) as { openingAnimationEnabled?: unknown };
    // Only an explicit `false` turns the opening off — the same rule as
    // normalizeBranding, so a partial/corrupt cache can never hide it.
    return parsed?.openingAnimationEnabled !== false;
  } catch {
    return true;
  }
}

function prefersReducedMotion(): boolean {
  return isBrowser() && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function currentInput(): OpeningInput {
  return {
    width: window.innerWidth,
    brandingEnabled: readStoredBrandingOpening(),
    reducedMotion: prefersReducedMotion(),
    offline: navigator.onLine === false,
    override: readOpeningOverride(window.location.search, readStoredOverride()),
  };
}

function readStoredOverride(): string | null {
  try {
    return window.localStorage.getItem(OPENING_OVERRIDE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Persist a device-level override so a reload on a phone keeps the test on
 * (the app is a hash-routed PWA: `?opening=debug` survives the first
 * navigation only if it is remembered).
 */
export function setOpeningOverrideSticky(value: OpeningOverride | null): void {
  if (!isBrowser()) return;
  try {
    if (value) window.localStorage.setItem(OPENING_OVERRIDE_STORAGE_KEY, value);
    else window.localStorage.removeItem(OPENING_OVERRIDE_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

function brandName(): string {
  if (!isBrowser()) return "Eduvora";
  try {
    const cached = window.localStorage.getItem(OPENING_BRAND_CACHE_KEY);
    const raw = cached ? (JSON.parse(cached) as { appName?: unknown }).appName : "";
    const text = typeof raw === "string" ? raw.trim() : "";
    return text ? text.slice(0, 40) : "Eduvora";
  } catch {
    return "Eduvora";
  }
}

function mediaErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return "ABORTED";
    case 2:
      return "NETWORK";
    case 3:
      return "DECODE";
    case 4:
      return "SRC_NOT_SUPPORTED";
    default:
      return "UNKNOWN";
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

interface Elements {
  splash: HTMLElement;
  video: HTMLVideoElement | null;
  fallback: HTMLElement | null;
  name: HTMLElement | null;
}

/**
 * Build the splash overlay if the document does not already have one. The
 * markup normally ships in index.html (so it paints before React); this is the
 * fallback for a stale cached shell or any host that renders #root alone.
 */
function ensureElements(): Elements | null {
  if (!isBrowser()) return null;
  let splash = document.getElementById(OPENING_SPLASH_ID);
  if (!splash) {
    splash = document.createElement("div");
    splash.id = OPENING_SPLASH_ID;
    splash.className = "app-boot-splash";
    splash.setAttribute("role", "status");
    const video = document.createElement("video");
    video.id = OPENING_VIDEO_ID;
    video.className = "app-boot-video";
    video.muted = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.preload = "auto";
    const card = document.createElement("div");
    card.className = "app-boot-fallback";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = '<span class="app-boot-ring"></span><p class="app-boot-name"></p><span class="app-boot-shine"></span>';
    splash.appendChild(video);
    splash.appendChild(card);
    document.body.insertBefore(splash, document.body.firstChild);
  }
  return {
    splash,
    video: document.getElementById(OPENING_VIDEO_ID) as HTMLVideoElement | null,
    fallback: splash.querySelector(".app-boot-fallback"),
    name: splash.querySelector(".app-boot-name"),
  };
}

function installDebugBadge(): HTMLElement {
  let badge = document.getElementById(OPENING_DEBUG_ID);
  if (badge) return badge;
  badge = document.createElement("div");
  badge.id = OPENING_DEBUG_ID;
  badge.setAttribute("role", "note");
  badge.style.cssText =
    "position:fixed;left:8px;bottom:8px;z-index:2147483640;max-width:min(94vw,34rem);" +
    "padding:10px 12px;border-radius:12px;background:rgba(8,10,20,.94);color:#e8ecff;" +
    "font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;" +
    "box-shadow:0 8px 30px rgba(0,0,0,.45);pointer-events:none;";
  document.body.appendChild(badge);
  return badge;
}

function createController(els: Elements): OpeningController {
  const { splash, video, fallback, name } = els;
  const listeners = new Set<(c: OpeningController) => void>();
  const doneWaiters: Array<() => void> = [];
  const start = now();

  let decision = resolveOpeningDecision(currentInput());
  let state: OpeningState = "skipped";
  let debug = decision.debug;
  let firstFrameAt: number | null = null;
  let lastError: string | null = null;
  let minTimer = 0;
  let maxTimer = 0;
  let graceTimer = 0;
  let hideTimer = 0;
  let dismissedAt: number | null = null;

  if (name && !name.textContent) name.textContent = brandName();

  const clearTimers = () => {
    for (const id of [minTimer, maxTimer, graceTimer, hideTimer]) if (id) window.clearTimeout(id);
    minTimer = maxTimer = graceTimer = hideTimer = 0;
  };

  const emit = () => {
    for (const listener of [...listeners]) listener(controller);
  };

  const setState = (next: OpeningState) => {
    if (state === next) return;
    state = next;
    splash.dataset.opening = next;
    // `window.CustomEvent`, not the bare global: in a jsdom test the host
    // already exposes Node's own CustomEvent, which that window refuses.
    window.dispatchEvent(new window.CustomEvent(OPENING_STATE_EVENT, { detail: next }));
    emit();
    if (next === "done" || next === "skipped") {
      window.setTimeout(() => doneWaiters.splice(0).forEach((resolve) => resolve()), 0);
    }
  };

  const paint = () => {
    if (!debug) {
      document.getElementById(OPENING_DEBUG_ID)?.remove();
      return;
    }
    const badge = installDebugBadge();
    const media = video
      ? `networkState=${video.networkState} readyState=${video.readyState} currentTime=${video.currentTime.toFixed(2)}s` +
        (video.error ? ` error=${mediaErrorMessage(video.error.code)}` : "")
      : "no <video> element";
    badge.textContent =
      `[opening] state=${state} · ${decision.show ? decision.mode : "hidden"} · ${decision.reason}\n` +
      `clip=${decision.clip} · file=${decision.src}\n` +
      `${media}\n` +
      `branding.openingAnimationEnabled=${readStoredBrandingOpening()} · onLine=${navigator.onLine} · reducedMotion=${prefersReducedMotion()}\n` +
      `first frame: ${firstFrameAt === null ? "never" : `${Math.round(firstFrameAt)}ms`} · elapsed ${Math.round(now() - start)}ms\n` +
      (lastError ? `note: ${lastError}\n` : "") +
      `try: ?opening=force · ?opening=static · replay: __eduosOpening.replay()`;
  };

  /** Is the MP4 actually reachable from this device? (decisive for reports) */
  const probeClip = () => {
    if (!debug) return;
    void fetch(decision.src, { method: "HEAD" })
      .then((res) => {
        lastError = res.ok
          ? `clip reachable — HTTP ${res.status}, ${res.headers.get("content-type") || "?"}, ${res.headers.get("content-length") || "?"} bytes`
          : `clip NOT reachable — HTTP ${res.status}`;
        paint();
      })
      .catch((err: unknown) => {
        lastError = `clip fetch threw: ${String(err)}`;
        paint();
      });
  };

  const showCard = () => {
    splash.dataset.video = "off";
    if (fallback) fallback.hidden = false;
  };
  const hideCard = () => {
    splash.dataset.video = "on";
  };

  const finish = () => {
    if (dismissedAt !== null) return;
    dismissedAt = now();
    clearTimers();
    splash.dataset.hiding = "1";
    const settle = () => {
      // Whatever happened, the opening has been on screen: `done`, never
      // `skipped` — `skipped` is reserved for a decision not to show it at all,
      // and the offline-rescue path keys off that distinction.
      splash.style.display = "none";
      setState("done");
      paint();
    };
    // Reduced motion gets a hard cut instead of a fade.
    if (decision.mode === "static" || prefersReducedMotion()) {
      settle();
      return;
    }
    hideTimer = window.setTimeout(settle, OPENING_FADE_MS);
  };

  /** Never let the opening be shorter than the minimum visible window. */
  const dismissAfterFloor = () => {
    const waited = now() - start;
    const hold = Math.max(0, decision.minVisibleMs - waited);
    if (hold === 0) {
      finish();
      return;
    }
    minTimer = window.setTimeout(finish, hold);
  };

  const startVideo = () => {
    if (!video) return;
    video.muted = true;
    try {
      if (video.currentTime > 0) video.currentTime = 0;
    } catch {
      /* not seekable yet */
    }
    const playing = video.play();
    if (playing && typeof playing.catch === "function") {
      playing.catch((err: unknown) => {
        const errorName = err instanceof Error ? err.name : String(err);
        // An interrupted/deferred autoplay is not a failure: the clip stays on
        // screen and the first gesture retries it.
        if (errorName === "AbortError" || errorName === "NotAllowedError") {
          lastError = `play() deferred (${errorName}) — retrying on first gesture`;
          paint();
          return;
        }
        lastError = `play() failed (${errorName})`;
        if (firstFrameAt === null) setState("fallback");
        showCard();
        dismissAfterFloor();
      });
    }
  };

  const run = () => {
    clearTimers();
    dismissedAt = null;
    firstFrameAt = null;
    lastError = null;
    // JS is in charge — drop the CSS failsafe and any prior hide.
    splash.style.animation = "none";
    splash.style.display = "";
    delete splash.dataset.hiding;

    if (!decision.show) {
      // `data-opening` (not a `display` inline style) is what hides the splash.
      // React re-renders the document in other places, and an inline
      // `display:none` survived a later re-show, which is exactly how the
      // opening got permanently stuck off after one bad boot.
      splash.dataset.opening = "skipped";
      splash.dataset.video = "off";
      setState("skipped");
      paint();
      return;
    }

    setState("pending");
    showCard();

    // Static opening: the brand card alone (reduced motion, opening=static).
    if (decision.mode === "static" || !video) {
      splash.dataset.motion = "reduce";
      if (video) {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
      }
      minTimer = window.setTimeout(finish, decision.minVisibleMs);
      paint();
      return;
    }

    splash.dataset.motion = "full";
    if (video.getAttribute("src") !== decision.src) {
      video.setAttribute("src", decision.src);
      video.load();
    }
    startVideo();
    graceTimer = window.setTimeout(() => {
      if (firstFrameAt !== null) return;
      lastError = `no frame within ${OPENING_FIRST_FRAME_GRACE_MS}ms`;
      setState("fallback");
      showCard();
      dismissAfterFloor();
      paint();
    }, OPENING_FIRST_FRAME_GRACE_MS);
    maxTimer = window.setTimeout(finish, decision.maxWaitMs);
    paint();
    if (debug) probeClip();
  };

  // Media listeners are attached ONCE, so replay() cannot stack handlers.
  if (video) {
    const clearGraceTimer = () => {
      if (graceTimer) {
        window.clearTimeout(graceTimer);
        graceTimer = 0;
      }
    };
    const markFrame = () => {
      if (firstFrameAt === null) firstFrameAt = now() - start;
      hideCard();
      if (state === "pending" || state === "fallback") setState("playing");
      clearGraceTimer();
      paint();
    };
    video.addEventListener("loadeddata", markFrame);
    video.addEventListener("playing", markFrame);
    video.addEventListener("timeupdate", () => {
      if (video.currentTime > 0.04 && firstFrameAt === null) markFrame();
    });
    video.addEventListener("ended", () => {
      if (state === "skipped") return;
      dismissAfterFloor();
    });
    video.addEventListener("error", () => {
      lastError = video.error ? `media error: ${mediaErrorMessage(video.error.code)}` : "media error";
      // An error before the first frame does not end the opening — the brand
      // card carries it. After the first frame, close out gracefully.
      if (firstFrameAt === null) setState("fallback");
      showCard();
      dismissAfterFloor();
      paint();
    });
  }

  // First tap rescues a deferred autoplay (iOS/Safari, data-saver Chrome).
  window.addEventListener(
    "pointerdown",
    () => {
      if (decision.show && decision.mode === "video" && video && firstFrameAt === null && video.paused) startVideo();
    },
    { passive: true },
  );

  window.addEventListener("online", () => {
    // Offline boot skipped the opening; hand it back while still booting.
    if (state === "skipped" && decision.reason.startsWith("offline")) {
      decision = resolveOpeningDecision(currentInput());
      run();
    }
    paint();
  });

  window.addEventListener("resize", () => {
    const next = resolveOpeningDecision(currentInput());
    const clipChanged = next.clip !== decision.clip;
    decision = next;
    if (clipChanged && decision.show && decision.mode === "video" && video) {
      // Crossing the mobile breakpoint mid-clip: swap the file, keep playing.
      video.setAttribute("src", decision.src);
      video.load();
      startVideo();
    }
    paint();
  });

  if (typeof window.matchMedia === "function") {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    motion.addEventListener?.("change", () => {
      decision = resolveOpeningDecision(currentInput());
      paint();
    });
  }

  const controller: OpeningController = {
    get decision() {
      return decision;
    },
    get state() {
      return state;
    },
    get elapsedMs() {
      return Math.round(now() - start);
    },
    get firstFrameMs() {
      return firstFrameAt === null ? null : Math.round(firstFrameAt);
    },
    get lastError() {
      return lastError;
    },
    get mediaSnapshot() {
      return video
        ? `network=${video.networkState} ready=${video.readyState} t=${video.currentTime.toFixed(2)}s`
        : "no <video> element";
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(controller);
      return () => listeners.delete(listener);
    },
    whenDone() {
      if (state === "done" || state === "skipped") return Promise.resolve();
      return new Promise<void>((resolve) => doneWaiters.push(resolve));
    },
    replay() {
      decision = resolveOpeningDecision(currentInput());
      if (video) {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
        video.removeAttribute("src");
        video.load();
      }
      setState("pending");
      run();
    },
    dismiss() {
      finish();
    },
    setDebug(next: boolean) {
      debug = next;
      setOpeningOverrideSticky(next ? "debug" : null);
      decision = { ...decision, debug: next };
      paint();
      if (next) probeClip();
    },
  };

  run();
  return controller;
}

/**
 * Adopt (or create) the live opening controller. Idempotent, so React
 * StrictMode double-mounts and HMR can never start a second driver over the
 * same <video> — the bug that made the clip abort on boot.
 */
export function attachOpeningSplash(): OpeningController | null {
  if (!isBrowser()) return null;
  const host = window as unknown as { __eduosOpening?: OpeningController };
  if (host.__eduosOpening) return host.__eduosOpening;
  const els = ensureElements();
  if (!els) return null;
  const controller = createController(els);
  host.__eduosOpening = controller;
  return controller;
}

/** True while the opening is on screen. React uses it only for a11y + theme-color. */
export function isOpeningVisible(state: OpeningState): boolean {
  return state === "pending" || state === "playing" || state === "fallback";
}

export function useOpeningSplashVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(() => {
    const controller = isBrowser() ? attachOpeningSplash() : null;
    return controller ? isOpeningVisible(controller.state) : false;
  });
  useEffect(() => {
    if (!isBrowser()) return undefined;
    const controller = attachOpeningSplash();
    if (!controller) return undefined;
    return controller.subscribe((next) => setVisible(isOpeningVisible(next.state)));
  }, []);
  return visible;
}
