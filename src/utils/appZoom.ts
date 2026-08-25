// Globally applied default zoom for the whole app.
//
// The default is 110% (set from the admin panel). The admin can customise
// it from a safe range, and the value is then locked for the end user:
// in-page pinch / ctrl-wheel / keyboard zoom are blocked by
// `disablePageZoom`, and the viewport meta loads the app at the configured
// scale and refuses every user-scale value, so the document never drifts
// above or below the configured default without an admin changing the
// setting.

export const APP_ZOOM_DOC_PATH = { collection: "settings", id: "appZoom" } as const;

/** Default zoom applied when no admin value has ever been saved. */
export const DEFAULT_APP_ZOOM = 110;
/** Safe customisable range for the admin panel. */
export const MIN_APP_ZOOM = 50;
export const MAX_APP_ZOOM = 200;

export const APP_ZOOM_CHANGE_EVENT = "eduvora:app-zoom-change";
const APP_ZOOM_CACHE_KEY = "eduvora.appZoom.v1";

export type AppZoomSetting = {
  /** Whole-number zoom percentage (110 = 110%). */
  zoom: number;
};

export const DEFAULT_APP_ZOOM_SETTING: AppZoomSetting = {
  zoom: DEFAULT_APP_ZOOM,
};

/** Coerce any incoming value to a whole-number zoom inside the safe range. */
export function normalizeAppZoom(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_APP_ZOOM;
  return Math.min(MAX_APP_ZOOM, Math.max(MIN_APP_ZOOM, Math.round(parsed)));
}

export function normalizeAppZoomSetting(
  data: Partial<Record<keyof AppZoomSetting, unknown>> | null | undefined,
): AppZoomSetting {
  return { zoom: normalizeAppZoom(data?.zoom) };
}

export function readCachedAppZoom(): AppZoomSetting {
  if (typeof window === "undefined") return DEFAULT_APP_ZOOM_SETTING;
  try {
    const raw = window.localStorage.getItem(APP_ZOOM_CACHE_KEY);
    if (!raw) return DEFAULT_APP_ZOOM_SETTING;
    const parsed = JSON.parse(raw) as Partial<AppZoomSetting>;
    return normalizeAppZoomSetting(parsed);
  } catch {
    // Private mode / corrupt cache — keep the safe default.
    return DEFAULT_APP_ZOOM_SETTING;
  }
}

export function writeCachedAppZoom(setting: AppZoomSetting) {
  if (typeof window === "undefined") return;
  const next = normalizeAppZoomSetting(setting);
  try {
    window.localStorage.setItem(APP_ZOOM_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Restricted storage is fine — the Firestore value still streams in.
  }
  // localStorage's native `storage` event does not fire in the tab that made
  // the change, so emit a same-tab event to update mounted consumers.
  window.dispatchEvent(new CustomEvent<AppZoomSetting>(APP_ZOOM_CHANGE_EVENT, { detail: next }));
}

const VIEWPORT_SELECTOR = 'meta[name="viewport"]';

/** The zoom applied by the most recent `applyDocumentZoom` call. */
let currentZoom = DEFAULT_APP_ZOOM;

const scaleFor = (zoomPercent: number): number => normalizeAppZoom(zoomPercent) / 100;

/**
 * Build a viewport meta content string that loads the document at the
 * configured zoom and refuses any user scaling away from it.
 *
 * Existing `initial-scale` / `user-scalable` / `minimum-scale` /
 * `maximum-scale` tokens are removed first so two different consumers can
 * never disagree about zoom.
 */
export function viewportContentLockedToZoom(content: string, zoomPercent: number = currentZoom): string {
  const scale = scaleFor(zoomPercent);
  const tokens = content
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^(initial-scale|user-scalable|minimum-scale|maximum-scale)=/i.test(token));
  tokens.push(`initial-scale=${scale}`);
  tokens.push("user-scalable=no");
  tokens.push(`minimum-scale=${scale}`);
  tokens.push(`maximum-scale=${scale}`);
  return tokens.join(", ");
}

/**
 * Point the viewport meta at the current app zoom and lock user scaling.
 * Called by the hydration script (before React mounts), by
 * AppZoomProvider (live), by `disablePageZoom` (gesture defence) and by the
 * Course Player's desktop/mobile width switch.
 */
export function lockViewportScaling(): void {
  if (typeof document === "undefined") return;
  const meta = document.querySelector<HTMLMetaElement>(VIEWPORT_SELECTOR);
  if (!meta) return;
  const next = viewportContentLockedToZoom(meta.content, currentZoom);
  if (meta.content !== next) meta.content = next;
}

/**
 * Record the configured zoom and lock the viewport to it.
 *
 * The app is a mobile-first PWA, so zoom is applied through the viewport
 * (the same mechanism a browser uses for "default zoom"). Applying the CSS
 * `zoom` property to the document root would double-scale viewport-sized
 * app frames (`100dvh` / `100vw`) and push full-screen courses/checkouts
 * off-screen, so we deliberately keep this at the viewport level.
 */
export function applyDocumentZoom(zoomPercent: number): void {
  if (typeof document === "undefined") return;
  currentZoom = normalizeAppZoom(zoomPercent);
  document.documentElement.dataset.appZoom = String(currentZoom);
  lockViewportScaling();
}

export function applyDocumentAppZoom(setting: AppZoomSetting): void {
  applyDocumentZoom(normalizeAppZoomSetting(setting).zoom);
}
