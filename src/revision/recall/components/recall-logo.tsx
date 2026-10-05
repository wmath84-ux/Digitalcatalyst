import { useMemo } from "react";
import { useRecallStore } from "../stores/recall-store";
import type { Theme } from "../types";
import { revisionBrandMarkUrl } from "../../../utils/publicAsset";

/**
 * Recall brand logo (lettermark) from the new design system.
 *
 * Resolved through the shared public-asset resolver (src/utils/publicAsset):
 * every variant points at the single committed brand glyph, so the image
 * loads reliably in development, production, Netlify sub-path deploys and the
 * Capacitor WebView, with transparency preserved and no CSS colour inversion.
 */
export function RecallLogo({
  className,
  variant,
}: {
  className?: string;
  variant?: "light" | "dark" | "auto" | "transparent";
}): JSX.Element {
  const theme = useRecallStore((s) => s.settings.theme) as Theme;
  const resolved = useMemo(
    () => revisionBrandMarkUrl(variant ?? (theme === "dark" || theme === "high-contrast" ? "transparent" : "light")),
    [variant, theme],
  );

  return (
    <img
      src={resolved}
      alt="Recall"
      className={className ?? "h-8 w-8 object-contain"}
      draggable={false}
    />
  );
}
