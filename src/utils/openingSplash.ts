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

/** Both shipped MP4s are 10.006 s (mvhd timescale 1000 / duration 10006) —
 *  the number every ceiling below is measured against. */
export const OPENING_CLIP_DURATION_MS = 10_006;

export const OPENING_SPLASH_ID = "app-opening-splash";
export const OPENING_VIDEO_ID = "app-opening-video";
export const OPENING_DEBUG_ID = "app-opening-debug";
/** Below this CSS px width the portrait clip plays; tablet + desktop get the wide clip. */
export const OPENING_MOBILE_MAX_WIDTH = 768;

/** Never let the opening flash by — the card / first frame is held this long. */
export const OPENING_MIN_VISIBLE_MS = 1_400;
/** How long the clip may take to produce its FIRST frame before it is declared
 *  unplayable. Generous on purpose: the whole clip has to be watchable on a
 *  slow mobile connection, and a genuinely dead file (404 / unsupported codec)
 *  reports `error` within milliseconds — so nothing was gained by cutting the
 *  attempt at 3 s, and that timeout is exactly what truncated the animation. */
export const OPENING_LOAD_CEILING_MS = 20_000;
/** While the clip runs, how long without a single advance of `currentTime`
 *  counts as a dead buffer (as opposed to "still playing"). */
export const OPENING_STALL_TIMEOUT_MS = 6_000;
/** Absolute backstop: the app is never held behind the opening longer than
 *  this, whatever the media element does. Deliberately far above the clip's
 *  10.006 s plus a slow download — a backstop that fires mid-clip is
 *  indistinguishable from the bug this file exists to kill. */
export const OPENING_HARD_CEILING_MS = 60_000;
/** `ended` holds the final frame this long before the fade starts, so the
 *  clip's last beat is not swallowed by the transition. */
export const OPENING_HOLD_AFTER_END_MS = 260;
/** Watchdog period while the opening is on screen. */
export const OPENING_WATCHDOG_MS = 500;
/** Fade-out length before the splash leaves the layout. */
export const OPENING_FADE_MS = 380;

export const OPENING_QUERY_KEY = "opening";
export const OPENING_OVERRIDE_STORAGE_KEY = "eduvora.opening.override.v1";
export const OPENING_OVERRIDE_STAMP_KEY = "eduvora.opening.override.at.v1";
/** How long a remembered override is honoured before it is dropped silently. */
export const OPENING_OVERRIDE_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * The ONLY overrides that may outlive the URL. `debug` is a badge (it changes
 * nothing the learner sees), `off` is a deliberate opt-out. Everything that
 * changes *what plays* — `static`, `on`, `force` — is URL- or tap-only.
 *
 * This rule exists because it was broken: "Preview the static card" on
 * `#/dev/opening` used to persist `static`, and from then on every boot on that
 * device showed the 1.4 s brand card instead of the clip and opened the app —
 * "I see a one-second frame and then the landing page".
 */
export const PERSISTED_OPENING_OVERRIDES: OpeningOverride[] = ["debug", "off"];
export const OPENING_STATE_EVENT = "eduvora:opening-state";
export const OPENING_BRAND_CACHE_KEY = "eduvora.branding.v2";
/**
 * An explicit device opt-in to the full clip even when the OS asks for less
 * motion. Reduced motion means "do not show motion nobody asked for", so
 * honoring it is right — but it should never be *silently* read as "the owner
 * wants no opening", which is how it looked like a 1 s flash. Remembering a
 * "show me more" choice is safe; remembering a "show me less" choice is not.
 */
export const OPENING_PREFER_FULL_KEY = "eduvora.opening.preferFull.v1";

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
  /** This device asked (on the dev page) for the full clip despite reduced motion. */
  preferFullClip?: boolean;
  /** The clip the pre-React boot script already started, if any. Adopting it
   *  instead of re-deriving it is what stops a mid-clip viewport change from
   *  reloading the file and restarting the animation. */
  lockedClip?: OpeningClip | null;
  timings?: Partial<OpeningTimings>;
}

/** The release schedule. Overridable for tests / the dev sandbox only. */
export interface OpeningTimings {
  minVisibleMs: number;
  loadCeilingMs: number;
  stallTimeoutMs: number;
  hardCeilingMs: number;
  holdAfterEndMs: number;
  watchdogMs: number;
  fadeMs: number;
}

export const DEFAULT_OPENING_TIMINGS: OpeningTimings = {
  minVisibleMs: OPENING_MIN_VISIBLE_MS,
  loadCeilingMs: OPENING_LOAD_CEILING_MS,
  stallTimeoutMs: OPENING_STALL_TIMEOUT_MS,
  hardCeilingMs: OPENING_HARD_CEILING_MS,
  holdAfterEndMs: OPENING_HOLD_AFTER_END_MS,
  watchdogMs: OPENING_WATCHDOG_MS,
  fadeMs: OPENING_FADE_MS,
};

export type OpeningReleaseKind = "ended" | "media-error" | "load-timeout" | "stalled" | "hard-ceiling";
export type OpeningRelease = { kind: OpeningReleaseKind; waitMs: number };

/**
 * When may the app be revealed? `null` means "let the opening keep playing".
 *
 * This is the rule the product asks for — **the clip runs to the end and only
 * then does the app open** — kept as a pure function so it is testable as a
 * table instead of by sleeping 12 s in a test runner. The only things that cut
 * it short are a media error and the two backstops; a slow download is NOT one
 * of them, which is the whole point.
 */
export function shouldReleaseOpening(input: {
  mode: OpeningMode;
  elapsedMs: number;
  sinceProgressMs: number;
  firstFrameMs: number | null;
  ended: boolean;
  error: boolean;
  /** Downloading more data (paused, not yet decodable): a buffer refill is not
   *  a dead clip, so the stall clock must not fire while it is happening. */
  buffering?: boolean;
  timings: OpeningTimings;
}): OpeningRelease | null {
  const t = input.timings;
  const floor = () => (input.elapsedMs < t.minVisibleMs ? t.minVisibleMs - input.elapsedMs : 0);
  if (input.ended) return { kind: "ended", waitMs: floor() };
  if (input.error) return { kind: "media-error", waitMs: floor() };
  if (input.elapsedMs >= t.hardCeilingMs) return { kind: "hard-ceiling", waitMs: 0 };
  if (input.mode === "static") return { kind: "ended", waitMs: floor() };
  if (input.firstFrameMs === null) {
    // Still waiting for frame one: only the (generous) load ceiling ends it.
    return input.elapsedMs >= t.loadCeilingMs ? { kind: "load-timeout", waitMs: 0 } : null;
  }
  if (input.sinceProgressMs >= t.stallTimeoutMs && !input.buffering) return { kind: "stalled", waitMs: 0 };
  return null;
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
  timings: OpeningTimings;
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

/**
 * A one-shot override: used by the very next opening and then cleared when the
 * opening finishes, so a preview tap can never strand a device in another mode.
 * (The persisted key is deliberately limited — see PERSISTED_OPENING_OVERRIDES.)
 */
let runtimeOverride: OpeningOverride | null = null;

export function setOpeningRuntimeOverride(value: OpeningOverride | null): void {
  runtimeOverride = value;
}

export function peekOpeningRuntimeOverride(): OpeningOverride | null {
  return runtimeOverride;
}

export function clearOpeningRuntimeOverride(): void {
  runtimeOverride = null;
}

/** The stored value, honouring the TTL and the "only these may persist" rule. */
export function readStickyOpeningOverride(read: (key: string) => string | null): OpeningOverride | null {
  const value = parseOpeningOverride(read(OPENING_OVERRIDE_STORAGE_KEY));
  if (!value) return null;
  if (!PERSISTED_OPENING_OVERRIDES.includes(value)) return null;
  const stamp = Number(read(OPENING_OVERRIDE_STAMP_KEY) || "0");
  if (stamp && Date.now() - stamp > OPENING_OVERRIDE_TTL_MS) return null;
  return value;
}

/** Read the override from the URL first, then from the persisted device choice. */
export function readOpeningOverride(
  search: string,
  stored: string | null,
  runtime: OpeningOverride | null = null,
): OpeningOverride | null {
  // A hash-routed app means both spellings appear in the wild:
  // `/?opening=debug#/home` and `/?opening=debug#/home?x=1`. Everything from
  // the fragment on is the app's own route, so it is dropped before parsing.
  const query = (search || "").split("#")[0];
  const params = new URLSearchParams(query.replace(/^[?&]/, ""));
  // URL (this tap) > one-shot preview > remembered device setting.
  return parseOpeningOverride(params.get(OPENING_QUERY_KEY)) ?? runtime ?? parseOpeningOverride(stored);
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
  const clip = input.lockedClip ?? openingClipForWidth(input.width);
  const src = openingSrcForClip(clip);
  const timings = { ...DEFAULT_OPENING_TIMINGS, ...(input.timings ?? {}) };
  const base = { clip, src, debug: input.override === "debug", minVisibleMs: timings.minVisibleMs, timings };

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
  if (input.reducedMotion && input.override !== "force" && !input.preferFullClip) {
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

/** The remembered "play the full opening anyway" choice for this device. */
export function readPreferFullClip(): boolean {
  if (!isBrowser()) return false;
  try {
    return window.localStorage.getItem(OPENING_PREFER_FULL_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPreferFullClip(next: boolean): void {
  if (!isBrowser()) return;
  try {
    if (next) window.localStorage.setItem(OPENING_PREFER_FULL_KEY, "1");
    else window.localStorage.removeItem(OPENING_PREFER_FULL_KEY);
  } catch {
    /* private mode */
  }
}

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

function currentInput(timings?: Partial<OpeningTimings>): OpeningInput {
  const boot = (window as unknown as { __eduosBoot?: { clip?: OpeningClip } }).__eduosBoot;
  const lockedClip = boot?.clip === "mobile" || boot?.clip === "desktop" ? boot.clip : null;
  return {
    lockedClip,
    timings,
    width: window.innerWidth,
    brandingEnabled: readStoredBrandingOpening(),
    reducedMotion: prefersReducedMotion(),
    preferFullClip: readPreferFullClip(),
    offline: navigator.onLine === false,
    override: readOpeningOverride(window.location.search, readStoredOverride(), peekOpeningRuntimeOverride()),
  };
}

function readStoredOverride(): string | null {
  if (!isBrowser()) return null;
  const read = (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const allowed = readStickyOpeningOverride(read);
  // Self-healing: a value left behind by an older build (or by the static-card
  // preview button) is dropped here so it can never strand the opening again.
  if (!allowed && read(OPENING_OVERRIDE_STORAGE_KEY)) {
    try {
      window.localStorage.removeItem(OPENING_OVERRIDE_STORAGE_KEY);
      window.localStorage.removeItem(OPENING_OVERRIDE_STAMP_KEY);
    } catch {
      /* private mode */
    }
  }
  return allowed;
}

/**
 * Persist a device-level override so a reload on a phone keeps the test on
 * (the app is a hash-routed PWA: `?opening=debug` survives the first
 * navigation only if it is remembered).
 */
export function setOpeningOverrideSticky(value: OpeningOverride | null): void {
  if (!isBrowser()) return;
  if (value && !PERSISTED_OPENING_OVERRIDES.includes(value)) {
    // Safe-by-default: remembered only when it cannot change what is shown.
    runtimeOverride = value;
    return;
  }
  try {
    if (value) {
      window.localStorage.setItem(OPENING_OVERRIDE_STORAGE_KEY, value);
      window.localStorage.setItem(OPENING_OVERRIDE_STAMP_KEY, String(Date.now()));
    } else {
      window.localStorage.removeItem(OPENING_OVERRIDE_STORAGE_KEY);
      window.localStorage.removeItem(OPENING_OVERRIDE_STAMP_KEY);
    }
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

function createController(els: Elements, injectedTimings?: Partial<OpeningTimings>): OpeningController {
  const { splash, video, fallback, name } = els;
  const listeners = new Set<(c: OpeningController) => void>();
  const doneWaiters: Array<() => void> = [];
  const start = now();

  let decision = resolveOpeningDecision(currentInput(injectedTimings));
  let state: OpeningState = "skipped";
  let debug = decision.debug;
  let firstFrameAt: number | null = null;
  let lastProgressAt = 0;
  let lastError: string | null = null;
  let minTimer = 0;
  let watchdogTimer = 0;
  let hideTimer = 0;
  let releasing = false;
  let lastTimeSeen = 0;

  if (name && !name.textContent) name.textContent = brandName();

  const clearTimers = () => {
    for (const id of [minTimer, hideTimer]) if (id) window.clearTimeout(id);
    if (watchdogTimer) window.clearInterval(watchdogTimer);
    minTimer = hideTimer = watchdogTimer = 0;
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
      `clip=${decision.clip} · ${OPENING_CLIP_DURATION_MS}ms · file=${decision.src}\n` +
      `held for: ended / stall ${decision.timings.stallTimeoutMs}ms / load ceiling ${decision.timings.loadCeilingMs}ms / backstop ${decision.timings.hardCeilingMs}ms\n` +
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

  const settle = () => {
    // A one-shot preview override (`static`, `force`, …) is spent the moment
    // this opening ends, so a tap on the dev page can never strand the device.
    clearOpeningRuntimeOverride();
    // Whatever happened, the opening has been on screen: `done`, never
    // `skipped` — `skipped` is reserved for a decision not to show it at all,
    // and the offline-rescue path keys off that distinction.
    splash.style.display = "none";
    setState("done");
    paint();
  };

  const floorRemaining = () => Math.max(0, decision.timings.minVisibleMs - (now() - start));

  /**
   * Hand the app over. The visible floor and the hold on the final frame are
   * applied BEFORE the fade, never after it, so the last beat of the clip is
   * never eaten by the transition.
   */
  const releaseNow = (release: OpeningRelease) => {
    if (releasing) return;
    releasing = true;
    clearTimers();
    if (firstFrameAt === null && release.kind !== "ended") {
      // The clip never produced a frame: the brand card carries the opening for
      // the rest of the window instead of the screen going blank.
      setState("fallback");
      showCard();
    }
    const holdAfterEnd = release.kind === "ended" && decision.mode === "video" ? decision.timings.holdAfterEndMs : 0;
    const fade = decision.mode === "static" || prefersReducedMotion() ? 0 : decision.timings.fadeMs;
    minTimer = window.setTimeout(() => {
      splash.dataset.hiding = "1";
      hideTimer = window.setTimeout(settle, fade);
    }, Math.max(0, release.waitMs) + holdAfterEnd);
  };

  /**
   * The single place that decides whether the opening may end, asked on every
   * media event and on every watchdog tick. A clip that is advancing is never
   * cut: `ended` (or a hard failure / dead buffer) is the only exit.
   */
  const evaluate = () => {
    const elapsedMs = now() - start;
    const release = shouldReleaseOpening({
      mode: decision.mode,
      elapsedMs,
      sinceProgressMs: elapsedMs - lastProgressAt,
      firstFrameMs: firstFrameAt,
      ended: Boolean(video?.ended),
      error: Boolean(video?.error),
      buffering: Boolean(video && !video.ended && video.paused && video.readyState < 3 && navigator.onLine !== false),
      timings: decision.timings,
    });
    if (release) releaseNow(release);
  };

  /** Decide at the visible floor, then keep checking while the clip runs. */
  const armWatchdog = () => {
    clearTimers();
    minTimer = window.setTimeout(() => {
      evaluate();
      if (!releasing) watchdogTimer = window.setInterval(evaluate, decision.timings.watchdogMs);
    }, floorRemaining());
  };

  /**
   * @param fromStart rewind to frame one (a fresh opening) — a *resume* after a
   *  stall must never rewind, or the clip would restart instead of finishing.
   */
  const startVideo = (fromStart = true) => {
    if (!video) return;
    video.muted = true;
    if (fromStart) {
      try {
        if (video.currentTime > 0) video.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
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
        // A rejected play() with no media error is a policy hiccup, not a
        // broken clip: releasing here is what made the opening show one frame
        // and hand over. The watchdog (load ceiling → fallback card) decides,
        // and the gesture / metadata listeners retry.
        lastError = `play() rejected (${errorName}) — waiting for the clip, not giving up`;
        paint();
      });
    }
  };

  const run = () => {
    clearTimers();
    releasing = false;
    firstFrameAt = null;
    lastProgressAt = 0;
    lastTimeSeen = 0;
    lastError = null;
    // JS is in charge — drop the CSS failsafe and any prior hide.
    splash.style.animation = "none";
    splash.style.display = "";
    delete splash.dataset.hiding;

    if (!decision.show) {
      clearOpeningRuntimeOverride();
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
    // The watchdog decides when the floor is done, so both modes share one
    // release path.
    if (decision.mode === "static" || !video) {
      splash.dataset.motion = "reduce";
      if (video) {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
      }
      armWatchdog();
      paint();
      return;
    }

    splash.dataset.motion = "full";
    if (video.getAttribute("src") !== decision.src) {
      video.setAttribute("src", decision.src);
      video.load();
    }
    startVideo();
    armWatchdog();
    paint();
    if (debug) probeClip();
  };

  // Media listeners are attached ONCE, so replay() cannot stack handlers.
  if (video) {
    let lastPaintAt = 0;
    const markFrame = () => {
      const first = firstFrameAt === null;
      if (first) {
        firstFrameAt = now() - start;
        hideCard();
        if (state === "pending" || state === "fallback") setState("playing");
      }
      lastProgressAt = now() - start;
      // `requestVideoFrameCallback` is the only signal that a frame actually
      // reached the compositor, so it is armed until frame one exists (and
      // afterwards only while the debug badge wants live numbers). After that
      // `timeupdate` carries the stall clock at ~4 Hz — re-arming per frame
      // would run a 60 Hz loop for ten seconds to paint nothing new.
      if (first || debug) watchNextFrame();
      if (debug && now() - lastPaintAt > 240) {
        lastPaintAt = now();
        paint();
      } else if (first) {
        paint();
      }
    };
    const watchNextFrame = () => {
      const requestFrame = (
        video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }
      ).requestVideoFrameCallback;
      if (typeof requestFrame !== "function") return;
      try {
        requestFrame.call(video, () => markFrame());
      } catch {
        /* unsupported engine — loadeddata/timeupdate still drive it */
      }
    };
    video.addEventListener("loadstart", watchNextFrame);
    video.addEventListener("loadedmetadata", () => {
      // The usual reason for a refused play() at boot is that the element was
      // not ready yet; retry once the track is known.
      if (video.paused && !video.ended && firstFrameAt === null) startVideo();
    });
    video.addEventListener("loadeddata", markFrame);
    video.addEventListener("playing", markFrame);
    video.addEventListener("timeupdate", () => {
      if (video.currentTime > lastTimeSeen + 0.001) {
        lastTimeSeen = video.currentTime;
        lastProgressAt = now() - start;
      }
      if (video.currentTime > 0.04 && firstFrameAt === null) markFrame();
    });
    video.addEventListener("ended", () => {
      if (state === "skipped" || state === "done") return;
      evaluate();
    });
    video.addEventListener("error", () => {
      lastError = video.error ? `media error: ${mediaErrorMessage(video.error.code)}` : "media error";
      evaluate();
      paint();
    });
    // A buffer that refills must not be mistaken for a finished clip, and a
    // paused-by-policy element must not hang the app: nudge and re-check.
    video.addEventListener("progress", () => {
      // Data arrived while the element sat paused (buffer refill): resume from
      // where it stopped — `fromStart = false` is the difference between
      // finishing the clip and replaying it from frame one.
      if (video.paused && firstFrameAt !== null && !video.ended) startVideo(false);
      evaluate();
    });
  }

  // First tap rescues a deferred autoplay (iOS/Safari, data-saver Chrome).
  window.addEventListener(
    "pointerdown",
    () => {
      if (decision.show && decision.mode === "video" && video && video.paused && !video.ended) startVideo(firstFrameAt === null);
    },
    { passive: true },
  );

  window.addEventListener("online", () => {
    // Offline boot skipped the opening; hand it back while still booting.
    if (state === "skipped" && decision.reason.startsWith("offline")) {
      decision = resolveOpeningDecision(currentInput(injectedTimings));
      run();
    }
    paint();
  });

  // Deliberately NOT re-picking the clip on resize: the boot script already
  // committed to the phone or the wide file, `currentInput()` locks to it, and
  // swapping mid-play would reload the 5 MB file and restart the animation —
  // which is exactly the "it did not finish" symptom. Only the debug badge
  // refreshes.
  window.addEventListener("resize", () => paint());

  if (typeof window.matchMedia === "function") {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    motion.addEventListener?.("change", () => {
      decision = resolveOpeningDecision(currentInput(injectedTimings));
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
      decision = resolveOpeningDecision(currentInput(injectedTimings));
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
      releaseNow({ kind: "hard-ceiling", waitMs: 0 });
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
/**
 * Adopt (or create) the live opening controller. Idempotent: React
 * StrictMode double-mounts and HMR reuse the same instance, so nothing can
 * ever start a second driver over the same <video> (that abort used to be read
 * as "the clip finished"). `timings` exists for the tests and the dev sandbox —
 * it is ignored once a controller is live.
 */
export function attachOpeningSplash(timings?: Partial<OpeningTimings>): OpeningController | null {
  if (!isBrowser()) return null;
  const host = window as unknown as { __eduosOpening?: OpeningController };
  if (host.__eduosOpening) return host.__eduosOpening;
  const els = ensureElements();
  if (!els) return null;
  const controller = createController(els, timings);
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
