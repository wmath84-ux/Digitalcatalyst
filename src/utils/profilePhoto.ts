/**
 * Normalize Google-hosted avatars for embedded WebViews, where the default
 * image size can occasionally return 403 when a localhost Referer is sent.
 * Other image providers (including Firebase Storage) keep their URL as-is.
 */
export function profilePhotoSrc(url?: string): string {
  const src = String(url || "").trim();
  if (!src) return "";
  if (/googleusercontent\.com/i.test(src)) {
    if (/=s\d+/.test(src)) return src.replace(/=s\d+(-c)?/, "=s256-c");
    return `${src}${src.includes("?") ? "" : "=s256-c"}`;
  }
  return src;
}
