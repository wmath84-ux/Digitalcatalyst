// src/components/ui/SafeImage.tsx
//
// <img> for user photos, brand logos and remote thumbnails that must never
// render as a broken icon inside the Android APK:
//   • "/api/..." paths are routed through apiUrl(), so inside the native shell
//     they reach the production API instead of the device itself.
//   • Remote images are requested with referrerPolicy="no-referrer" (Google
//     profile photos and many CDNs reject the internal https://localhost
//     referrer that the APK WebView sends).
//   • If the image still fails, the fallback is rendered (initials, logo, …)
//     instead of the browser's broken-image glyph.

import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { apiUrl } from "@/utils/apiBase";

export function resolveImageSrc(src: string | null | undefined): string {
  const value = (src ?? "").trim();
  if (!value) return "";
  return value.startsWith("/api/") ? apiUrl(value) : value;
}

type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src: string | null | undefined;
  /** Rendered when the image is empty or fails to load. */
  fallback?: ReactNode;
  /** Optional second source tried before the fallback (e.g. the bundled default logo). */
  secondarySrc?: string;
};

export function SafeImage({ src, fallback = null, secondarySrc, referrerPolicy, ...rest }: SafeImageProps) {
  const primary = resolveImageSrc(src);
  const secondary = resolveImageSrc(secondarySrc);
  // Remember every failed candidate, not only the most recent one. Otherwise
  // primary -> secondary -> primary loops forever when both fail in a WebView.
  const sourceKey = JSON.stringify([primary, secondary]);
  const [attempt, setAttempt] = useState<{ key: string; failed: string[] }>({ key: sourceKey, failed: [] });
  const failed = attempt.key === sourceKey ? attempt.failed : [];

  useEffect(() => {
    // A real reconnect permits one new attempt; never retry on an error loop.
    const retry = () => setAttempt({ key: sourceKey, failed: [] });
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [sourceKey]);

  const current = [primary, secondary].find((candidate) => candidate && !failed.includes(candidate));
  if (!current) return <>{fallback}</>;

  return (
    <img
      {...rest}
      key={`${sourceKey}:${current}`}
      src={current}
      referrerPolicy={referrerPolicy ?? "no-referrer"}
      onError={() => setAttempt((previous) => ({
        key: sourceKey,
        failed: [...new Set([...(previous.key === sourceKey ? previous.failed : []), current])],
      }))}
    />
  );
}
