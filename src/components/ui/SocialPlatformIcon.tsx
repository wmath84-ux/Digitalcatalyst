import type { SocialPlatform } from "@/utils/socialPlatform";

/**
 * Filled brand glyph for a resolved social platform (16×16 viewBox,
 * `fill: currentColor` like the reference card's icons). Purely visual —
 * decorative at the call site (aria-hidden), the surrounding link/label
 * carries the meaning.
 */
export function SocialPlatformIcon({
  platform,
  size = 18,
  className,
}: {
  platform: SocialPlatform;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={platform.path} fillRule={platform.fillRule} />
    </svg>
  );
}
