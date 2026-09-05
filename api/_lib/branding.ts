import { adminDb } from "./firebaseAdmin.js";

export const BRANDING_COLLECTION = "settings";
export const BRANDING_DOC_ID = "branding";

export const DEFAULT_APP_NAME = "Eduvora";
export const DEFAULT_TAGLINE = "Digital Catalyst";
export const DEFAULT_DESCRIPTION =
  "Student learning app for notes, courses, and digital study resources.";

/**
 * Static fallback icons shipped in /public. Used both when no custom logo has
 * been uploaded and as the offline/error fallback for the dynamic brand-icon
 * endpoint.
 */
export const DEFAULT_ICONS = {
  192: "/icons/icon-192x192.png",
  512: "/icons/icon-512x512.png",
  maskable: "/icons/maskable-icon-512x512.png",
} as const;

export type ResolvedBranding = {
  logoUrl: string | null;
  appName: string;
  tagline: string;
  description: string;
  /**
   * Opaque version string for the current branding. Bumped whenever branding
   * changes so CDNs and browsers refetch the manifest/icon instead of serving
   * a stale cached copy.
   */
  version: string;
};

const sanitize = (value: unknown, fallback: string, max = 60): string => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return text.slice(0, max);
};

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Reads the live brand settings from Firestore. Never throws — a Firestore
 * outage should not take down the PWA manifest.
 */
export async function getBranding(): Promise<ResolvedBranding> {
  const defaults: ResolvedBranding = {
    logoUrl: null,
    appName: DEFAULT_APP_NAME,
    tagline: DEFAULT_TAGLINE,
    description: `${DEFAULT_APP_NAME} ${DEFAULT_DESCRIPTION}`,
    version: "default",
  };
  try {
    const snap = await adminDb()
      .collection(BRANDING_COLLECTION)
      .doc(BRANDING_DOC_ID)
      .get();
    const data = snap.data() || {};
    const rawLogo = typeof data.logoUrl === "string" ? data.logoUrl.trim() : "";
    const logoUrl = /^https?:\/\//i.test(rawLogo) || rawLogo.startsWith("/") ? rawLogo : null;
    const appName = sanitize(data.appName, DEFAULT_APP_NAME, 40);
    const tagline = sanitize(data.tagline, DEFAULT_TAGLINE, 80);
    const description = sanitize(
      data.description,
      `${appName} ${DEFAULT_DESCRIPTION}`,
      200,
    );

    const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined;
    const millis = typeof updatedAt?.toMillis === "function" ? updatedAt.toMillis() : 0;
    const version = millis
      ? String(millis)
      : hashString(`${appName}|${tagline}|${logoUrl || ""}`);

    return { logoUrl, appName, tagline, description, version };
  } catch (error) {
    console.error("[branding] could not read branding settings", error);
    return defaults;
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

/**
 * Live logo used on every system / Web Push notification. Absolute https
 * logos (Cloudinary uploads from the admin Branding page) are sent as-is so
 * Android/Chrome can fetch them even when the app is closed. Relative or
 * missing logos go through /api/brand-icon, which always proxies the current
 * branding image (or 308s to the shipped PNG).
 */
export const NOTIFICATION_ICON_PATH = "/api/brand-icon?size=192";
export const NOTIFICATION_BADGE_PATH = "/icons/badge-96x96.png";

export type NotificationBrandChrome = {
  icon: string;
  badge: string;
  appName: string;
};

export function notificationIconFromBranding(logoUrl: string | null | undefined): string {
  const raw = typeof logoUrl === "string" ? logoUrl.trim() : "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return NOTIFICATION_ICON_PATH;
}

let brandChromeCache: { value: NotificationBrandChrome; at: number } | null = null;
const BRAND_CHROME_TTL_MS = 60_000;

/** Cached read so a cron/push fan-out does not hit Firestore once per device. */
export async function getNotificationBrandChrome(): Promise<NotificationBrandChrome> {
  if (brandChromeCache && Date.now() - brandChromeCache.at < BRAND_CHROME_TTL_MS) {
    return brandChromeCache.value;
  }
  const branding = await getBranding();
  const value: NotificationBrandChrome = {
    icon: notificationIconFromBranding(branding.logoUrl),
    badge: NOTIFICATION_BADGE_PATH,
    appName: branding.appName,
  };
  brandChromeCache = { value, at: Date.now() };
  return value;
}
