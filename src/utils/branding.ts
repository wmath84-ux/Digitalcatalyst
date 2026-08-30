export const BRANDING_DOC_PATH = { collection: "settings", id: "branding" } as const;
export const DEFAULT_LOGO_URL = "/icons/icon-192x192.svg";
export const DEFAULT_APP_NAME = "Eduvora";
export const DEFAULT_TAGLINE = "Digital Catalyst";
export const DEFAULT_SUPPORT_EMAIL = "support@learnpro.app";
export const DEFAULT_SUPPORT_PHONE = "+1 (800) 123-4567 · Mon–Fri 9–6 EST";
// The web app icon (/icons/icon-*.svg) is a diagonal indigo → violet blend.
// The home page header gradient defaults to these very colours so the app
// chrome and the icon always read as one brand.
export const DEFAULT_HOME_GRADIENT_FROM = "#4f46e5";
export const DEFAULT_HOME_GRADIENT_TO = "#7c3aed";

export type Branding = {
  logoUrl: string;
  appName: string;
  tagline: string;
  /** Controls the animated app-opening splash screen. Default is off. */
  openingAnimationEnabled: boolean;
  /**
   * Hides the thin horizontal separator lines at the edges of the app chrome:
   * the line between the status bar / app header and the content (top) and
   * the line between the content and the bottom navigation bar (bottom).
   * Hidden by default.
   */
  hideFrameBorders: boolean;
  /**
   * Start colour of the home page header gradient. Defaults to the web app
   * icon's indigo so the header matches the installed PWA icon out of the
   * box. Customisable from the admin branding page.
   */
  homeGradientFrom: string;
  /** End colour of the home page header gradient (app icon violet). */
  homeGradientTo: string;
  /**
   * Support contact shown in the subscription Help & FAQ overlay's "Still
   * need help?" section. Customisable from the admin branding page.
   */
  supportEmail: string;
  supportPhone: string;
};

export const DEFAULT_BRANDING: Branding = {
  logoUrl: DEFAULT_LOGO_URL,
  appName: DEFAULT_APP_NAME,
  tagline: DEFAULT_TAGLINE,
  openingAnimationEnabled: false,
  hideFrameBorders: true,
  homeGradientFrom: DEFAULT_HOME_GRADIENT_FROM,
  homeGradientTo: DEFAULT_HOME_GRADIENT_TO,
  supportEmail: DEFAULT_SUPPORT_EMAIL,
  supportPhone: DEFAULT_SUPPORT_PHONE,
};

// v2 cache stores the full branding object (v1 only stored the logo URL).
const BRAND_CACHE_KEY = "eduvora.branding.v2";
const LEGACY_LOGO_CACHE_KEY = "eduvora.brandLogoUrl.v1";
export const BRANDING_CHANGE_EVENT = "eduvora:branding-change";

function sanitize(value: unknown, fallback: string, max = 60): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return text.slice(0, max);
}

// Hex colours only — a malformed value can never reach the stylesheet.
function sanitizeColor(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text) ? text : fallback;
}

export function normalizeBranding(data: Partial<Record<keyof Branding, unknown>> | null | undefined): Branding {
  const logoRaw = typeof data?.logoUrl === "string" ? data.logoUrl.trim() : "";
  const logoUrl = /^https?:\/\//.test(logoRaw) || logoRaw.startsWith("/") ? logoRaw : DEFAULT_LOGO_URL;
  return {
    logoUrl,
    appName: sanitize(data?.appName, DEFAULT_APP_NAME),
    tagline: sanitize(data?.tagline, DEFAULT_TAGLINE, 80),
    openingAnimationEnabled: data?.openingAnimationEnabled === true,
    // Hidden by default: only an explicit `false` (toggle turned off in the
    // admin panel) brings the top/bottom separator lines back.
    hideFrameBorders: data?.hideFrameBorders !== false,
    homeGradientFrom: sanitizeColor(data?.homeGradientFrom, DEFAULT_HOME_GRADIENT_FROM),
    homeGradientTo: sanitizeColor(data?.homeGradientTo, DEFAULT_HOME_GRADIENT_TO),
    supportEmail: sanitize(data?.supportEmail, DEFAULT_SUPPORT_EMAIL, 120),
    supportPhone: sanitize(data?.supportPhone, DEFAULT_SUPPORT_PHONE, 160),
  };
}

export function readCachedBranding(): Branding {
  if (typeof window === "undefined") return DEFAULT_BRANDING;
  try {
    // Migrate the v1 logo-only cache on first read.
    const legacy = window.localStorage.getItem(LEGACY_LOGO_CACHE_KEY);
    const raw = window.localStorage.getItem(BRAND_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Branding>;
      return normalizeBranding(parsed);
    }
    if (legacy && (/^https?:\/\//.test(legacy) || legacy.startsWith("/"))) {
      return { ...DEFAULT_BRANDING, logoUrl: legacy };
    }
  } catch {
    /* private mode / corrupt JSON */
  }
  return DEFAULT_BRANDING;
}

export function writeCachedBranding(branding: Branding) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(branding));
    // Keep the legacy key in sync (and cleared on reset) for any code that
    // still reads it; it is harmless once everything is on v2.
    if (branding.logoUrl === DEFAULT_LOGO_URL) {
      window.localStorage.removeItem(LEGACY_LOGO_CACHE_KEY);
    } else {
      window.localStorage.setItem(LEGACY_LOGO_CACHE_KEY, branding.logoUrl);
    }
  } catch {
    /* ignore */
  }

  // localStorage's native `storage` event does not fire in the tab that made
  // the change. Emit a same-tab event so an admin toggle updates every mounted
  // header/footer immediately instead of waiting for Firestore's snapshot.
  window.dispatchEvent(new CustomEvent<Branding>(BRANDING_CHANGE_EVENT, { detail: branding }));
}

// Backwards-compatible helpers (some older call sites still import these).
export const readCachedLogoUrl = (): string => readCachedBranding().logoUrl;
export const writeCachedLogoUrl = (url: string | null | undefined): void => {
  const current = readCachedBranding();
  writeCachedBranding({
    ...current,
    logoUrl: typeof url === "string" && url.trim() ? url.trim() : DEFAULT_LOGO_URL,
  });
};

const STATIC_MANIFEST_HREF = "/manifest.webmanifest";

function isInstallableManifest(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const manifest = data as {
    name?: unknown;
    short_name?: unknown;
    icons?: unknown;
    display?: unknown;
  };
  const name = typeof manifest.name === "string"
    ? manifest.name
    : typeof manifest.short_name === "string"
      ? manifest.short_name
      : "";
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const display = typeof manifest.display === "string" ? manifest.display : "";
  return Boolean(name)
    && icons.length > 0
    && ["standalone", "fullscreen", "minimal-ui"].includes(display);
}

/**
 * Force the browser to re-fetch the dynamic PWA manifest after branding
 * changes. The live document is `/api/manifest?v=` — but only after a probe
 * confirms it is a real web-app manifest. A rewrite miss used to serve the
 * referral leaderboard JSON here, which made Chrome refuse "Install app".
 * Fall back to the static /manifest.webmanifest in that case so install
 * still works.
 */
function refreshManifestLink(version: string) {
  if (typeof document === "undefined") return;
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!manifest) return;
  const dynamicUrl = `/api/manifest?v=${encodeURIComponent(version)}`;
  void (async () => {
    try {
      const res = await fetch(dynamicUrl, {
        headers: { Accept: "application/manifest+json, application/json" },
      });
      if (!res.ok) {
        manifest.href = STATIC_MANIFEST_HREF;
        return;
      }
      const data = await res.json();
      if (!isInstallableManifest(data)) {
        manifest.href = STATIC_MANIFEST_HREF;
        return;
      }
      manifest.href = dynamicUrl;
    } catch {
      manifest.href = STATIC_MANIFEST_HREF;
    }
  })();
}

function applyBootSplash(branding: Branding) {
  if (typeof document === "undefined") return;
  const bootIcon = document.getElementById("boot-brand-icon") as HTMLImageElement | null;
  if (bootIcon) bootIcon.src = branding.logoUrl;
  if (bootIcon) bootIcon.alt = branding.appName;
  const bootTitle = document.querySelector(".app-boot-title");
  if (bootTitle) bootTitle.textContent = branding.appName;
  const splash = document.querySelector(".app-boot-splash");
  if (splash) splash.setAttribute("aria-label", `Loading ${branding.appName}`);
}

function announceBrandingToServiceWorker(branding: Branding) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const payload = {
    type: "branding-update" as const,
    appName: branding.appName,
    logoUrl: branding.logoUrl,
  };
  // The controlling SW may not exist on the very first install, so also push
  // to every ready registration once it activates.
  const send = (reg: ServiceWorkerContainer | ServiceWorkerRegistration) => {
    const worker = (reg as ServiceWorkerRegistration).active;
    if (worker) worker.postMessage(payload);
    else navigator.serviceWorker.controller?.postMessage(payload);
  };
  navigator.serviceWorker.controller?.postMessage(payload);
  void navigator.serviceWorker.ready.then(send).catch(() => undefined);
  try {
    sessionStorage.setItem("eduvora.swBranding", JSON.stringify({ appName: branding.appName, logoUrl: branding.logoUrl }));
  } catch {
    /* ignore */
  }
}

/**
 * Applies the resolved branding to the document: favicon, apple-touch-icon,
 * title, boot splash, and the PWA manifest link. Called both by the branding
 * context (live) and by the hydration script (before React mounts).
 */
export function applyDocumentBranding(branding: Branding) {
  if (typeof document === "undefined") return;

  // This document-level flag is the reliable source for all app shells,
  // including route-specific/custom headers. Component-local Tailwind classes
  // remain useful, while this attribute also removes accidental borders or
  // inset separator shadows added by a page layout.
  document.documentElement.dataset.hideFrameBorders = String(branding.hideFrameBorders);

  const href = branding.logoUrl || DEFAULT_LOGO_URL;
  const ensure = (rel: string) => {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"][data-brand-icon="true"]`);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      link.setAttribute("data-brand-icon", "true");
      document.head.appendChild(link);
    }
    link.href = href;
  };
  ensure("icon");
  ensure("apple-touch-icon");
  const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]:not([data-brand-icon])');
  if (apple) apple.href = href;

  document.title = branding.tagline
    ? `${branding.appName} | ${branding.tagline}`
    : branding.appName;

  applyBootSplash(branding);
  announceBrandingToServiceWorker(branding);
  refreshManifestLink(`${branding.appName}-${Date.now().toString(36)}`);
}

// Backwards-compatible alias used by the original BrandingContext.
export const applyDocumentBrandIcons = (url: string): void => {
  const cached = readCachedBranding();
  applyDocumentBranding({ ...cached, logoUrl: url || DEFAULT_LOGO_URL });
};
