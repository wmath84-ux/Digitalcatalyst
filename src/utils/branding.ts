export const BRANDING_DOC_PATH = { collection: "settings", id: "branding" } as const;
export const DEFAULT_LOGO_URL = "/icons/icon-192x192.svg";
export const BRAND_LOGO_CACHE_KEY = "eduvora.brandLogoUrl.v1";

export function readCachedLogoUrl(): string {
  if (typeof window === "undefined") return DEFAULT_LOGO_URL;
  try {
    const stored = window.localStorage.getItem(BRAND_LOGO_CACHE_KEY);
    if (stored && /^https?:\/\//.test(stored)) return stored;
    if (stored && stored.startsWith("/")) return stored;
  } catch {
    /* private mode */
  }
  return DEFAULT_LOGO_URL;
}

export function writeCachedLogoUrl(url: string | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    const next = typeof url === "string" && url.trim() ? url.trim() : "";
    if (!next) {
      window.localStorage.removeItem(BRAND_LOGO_CACHE_KEY);
      return;
    }
    window.localStorage.setItem(BRAND_LOGO_CACHE_KEY, next);
  } catch {
    /* ignore */
  }
}

/**
 * Force the browser to re-fetch the dynamic PWA manifest after a logo change.
 * The manifest is served from /api/manifest with a `?v=` cache-buster; updating
 * its href makes Chrome/Android re-read the icon list and refresh the installed
 * / "Add to Home screen" icon on the next launch.
 */
function refreshManifestLink(version: string) {
  if (typeof document === "undefined") return;
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!manifest) return;
  const base = "/api/manifest";
  manifest.href = `${base}?v=${encodeURIComponent(version)}`;
}

/**
 * The boot splash in index.html uses a static <img id="boot-brand-icon"> so it
 * paints before React hydrates. Once branding resolves, swap its src too so a
 * custom logo is visible during reloads.
 */
function applyBootSplashIcon(href: string) {
  if (typeof document === "undefined") return;
  const bootIcon = document.getElementById("boot-brand-icon") as HTMLImageElement | null;
  if (bootIcon && bootIcon.src !== href) bootIcon.src = href;
}

export function applyDocumentBrandIcons(url: string) {
  if (typeof document === "undefined") return;
  const href = url || DEFAULT_LOGO_URL;
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

  applyBootSplashIcon(href);

  // Cache-bust the dynamic PWA manifest so the new icon is picked up by
  // installable surfaces. The version is a timestamp when available, otherwise
  // a short hash of the URL — either way it changes whenever the logo does.
  refreshManifestLink(Date.now().toString(36));
}
