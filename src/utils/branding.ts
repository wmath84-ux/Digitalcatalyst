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
}
