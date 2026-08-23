import { adminDb } from "./firebaseAdmin.js";

export const BRANDING_COLLECTION = "settings";
export const BRANDING_DOC_ID = "branding";

/**
 * Static fallback icons shipped in /public. These are used both when no custom
 * logo has been uploaded and as the offline/error fallback for the dynamic
 * brand-icon endpoint.
 */
export const DEFAULT_ICONS = {
  192: "/icons/icon-192x192.png",
  512: "/icons/icon-512x512.png",
  maskable: "/icons/maskable-icon-512x512.svg",
} as const;

export type ResolvedBranding = {
  logoUrl: string | null;
  /**
   * Opaque version string for the current logo. Bumped whenever the logo
   * changes so CDNs and browsers refetch the manifest/icon instead of serving
   * a stale cached copy.
   */
  version: string;
};

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  // Convert to an unsigned, base36 string.
  return (hash >>> 0).toString(36);
}

/**
 * Reads the live brand settings from Firestore. Returns `logoUrl: null` when
 * the admin has not uploaded a custom logo (or reset to the default). Never
 * throws — a Firestore outage should not take down the PWA manifest.
 */
export async function getBranding(): Promise<ResolvedBranding> {
  try {
    const snap = await adminDb()
      .collection(BRANDING_COLLECTION)
      .doc(BRANDING_DOC_ID)
      .get();
    const data = snap.data() || {};
    const raw = typeof data.logoUrl === "string" ? data.logoUrl.trim() : "";
    const logoUrl = /^https?:\/\//i.test(raw) || raw.startsWith("/") ? raw : null;

    // Prefer the Firestore update timestamp (changes on every save), fall
    // back to a hash of the URL itself.
    const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined;
    const millis = typeof updatedAt?.toMillis === "function" ? updatedAt.toMillis() : 0;
    const version = millis ? String(millis) : logoUrl ? hashString(logoUrl) : "default";

    return { logoUrl, version };
  } catch (error) {
    console.error("[branding] could not read branding settings", error);
    return { logoUrl: null, version: "default" };
  }
}

/**
 * Upgrade protocol-relative/cloud-storage URLs to https and reject anything
 * that is not http(s). Prevents SSRF through the icon proxy.
 */
export function normalizeImageUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}
