export const BRANDING_DOC_PATH = { collection: "settings", id: "branding" } as const;
export const DEFAULT_LOGO_URL = "/icons/icon-192x192.svg";
export const DEFAULT_APP_NAME = "Eduvora";
export const DEFAULT_TAGLINE = "Digital Catalyst";

export type Branding = {
  logoUrl: string;
  appName: string;
  tagline: string;
  /** Controls the animated app-opening splash screen. Default is off. */
  openingAnimationEnabled: boolean;
};

export const DEFAULT_BRANDING: Branding = {
  logoUrl: DEFAULT_LOGO_URL,
  appName: DEFAULT_APP_NAME,
  tagline: DEFAULT_TAGLINE,
  openingAnimationEnabled: false,
};

// v2 cache stores the full branding object (v1 only stored the logo URL).
const BRAND_CACHE_KEY = "eduvora.branding.v2";
const LEGACY_LOGO_CACHE_KEY = "eduvora.brandLogoUrl.v1";

function sanitize(value: unknown, fallback: string, max = 60): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return text.slice(0, max);
}

export function normalizeBranding(data: Partial<Record<keyof Branding, unknown>> | null | undefined): Branding {
  const logoRaw = typeof data?.logoUrl === "string" ? data.logoUrl.trim() : "";
  const logoUrl = /^https?:\/\//.test(logoRaw) || logoRaw.startsWith("/") ? logoRaw : DEFAULT_LOGO_URL;
  return {
    logoUrl,
    appName: sanitize(data?.appName, DEFAULT_APP_NAME),
    tagline: sanitize(data?.tagline, DEFAULT_TAGLINE, 80),
    openingAnimationEnabled: data?.openingAnimationEnabled === true,
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

/**
 * Force the browser to re-fetch the dynamic PWA manifest after branding
 * changes. The manifest is served from /api/manifest with a `?v=` cache-buster
 * so Chrome/Android re-read the name + icons.
 */
function refreshManifestLink(version: string) {
  if (typeof document === "undefined") return;
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!manifest) return;
  manifest.href = `/api/manifest?v=${encodeURIComponent(version)}`;
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
