import {
  SOCIAL_PLATFORMS,
  isSocialPlatformId,
  type SocialPlatform,
} from "@/utils/socialPlatform";

/**
 * Filled brand glyph for a resolved social platform, drawn from the official
 * Font Awesome brand path data (see utils/socialPlatformIcons) — the same
 * icon set as the reference card
 * (https://uiverse.io/abrahamcalsin/grumpy-ape-40), so every icon in the
 * Home page social row looks exactly like the design.
 *
 * The glyph keeps its source viewBox (448×512 Instagram, 576×512 YouTube …)
 * and is sized by HEIGHT with the width following the official aspect ratio,
 * so no brand mark is ever stretched into a square box.
 *
 * Purely visual — decorative at the call site (aria-hidden); the surrounding
 * link / tooltip carries the meaning.
 */
export function SocialPlatformIcon({
  platform,
  size = 18,
  className,
}: {
  /** A resolved platform, or a platform id from the admin picker. */
  platform: SocialPlatform | string;
  size?: number;
  className?: string;
}) {
  const resolved: SocialPlatform =
    typeof platform === "string"
      ? isSocialPlatformId(platform)
        ? SOCIAL_PLATFORMS[platform]
        : SOCIAL_PLATFORMS.generic
      : platform;
  const { viewBox, d, fillRule } = resolved.glyph;
  const [, , rawWidth, rawHeight] = viewBox.split(/[\s,]+/).map(Number);
  const height = size;
  // Width follows the glyph's own proportions (NaN-safe: fall back to square).
  const width = rawWidth > 0 && rawHeight > 0 ? Math.round(size * (rawWidth / rawHeight) * 100) / 100 : size;

  return (
    <svg
      viewBox={viewBox}
      width={width}
      height={height}
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} fillRule={fillRule} />
    </svg>
  );
}

export default SocialPlatformIcon;
