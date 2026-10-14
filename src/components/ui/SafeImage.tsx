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
  const [failed, setFailed] = useState<string | null>(null);

  // A changed URL must re-arm the image.
  useEffect(() => {
    setFailed(null);
  }, [primary]);

  const current = !primary || failed === primary ? secondary : primary;
  if (!current || failed === current) return <>{fallback}</>;

  return (
    <img
      {...rest}
      src={current}
      referrerPolicy={referrerPolicy ?? "no-referrer"}
      onError={() => setFailed(current)}
    />
  );
}
