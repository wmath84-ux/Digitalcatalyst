import { useEffect, useState } from "react";
import { SOCIAL_PLATFORMS, type ResolvedSocialLink, type SocialPlatform } from "@/utils/socialPlatform";

/**
 * Filled brand glyph for a resolved social platform (Simple Icons 24×24 /
 * Bootstrap Icons 16×16, see src/utils/socialPlatform.ts) drawn with
 * `fill: currentColor` exactly like the reference profile card's icons.
 * Purely visual — decorative at the call site (aria-hidden); the
 * surrounding link/label carries the meaning.
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
      viewBox={platform.viewBox}
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-social-glyph={platform.id}
    >
      <path d={platform.path} fillRule={platform.fillRule} />
    </svg>
  );
}

/**
 * The icon of ONE social account on the Home page card.
 *
 * A recognised host renders its brand glyph. Anything else renders that
 * URL's own icon — the admin's custom icon when they set one, otherwise
 * the site's own /favicon.ico — so a brand-new URL pasted into Branding →
 * Social profile always shows an icon without a code change. Both image
 * paths paint in the same uniform white as the glyphs (the card's icon
 * style), and if the image cannot be loaded the neutral globe glyph takes
 * over so the row never shows a broken-image mark.
 */
export function SocialLinkIcon({
  link,
  size = 18,
  className,
}: {
  link: ResolvedSocialLink;
  size?: number;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  // A changed URL / custom icon must re-arm the <img>.
  useEffect(() => {
    setImageFailed(false);
  }, [link.imageUrl]);

  if (link.imageUrl && !imageFailed) {
    return (
      <img
        className={className}
        src={link.imageUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        aria-hidden="true"
        data-social-icon-image
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <SocialPlatformIcon
      platform={imageFailed ? SOCIAL_PLATFORMS.generic : link.platform}
      size={size}
      className={className}
    />
  );
}
