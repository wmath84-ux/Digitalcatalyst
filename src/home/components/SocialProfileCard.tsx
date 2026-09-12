import { useEffect, useState } from "react";
import "./social-profile-card.css";
import { SocialPlatformIcon } from "../../components/ui/SocialPlatformIcon";
import { detectSocialPlatform } from "../../utils/socialPlatform";
import { DEFAULT_LOGO_URL } from "../../utils/branding";

interface SocialProfileCardProps {
  /** Branding → Logo. Shown inside the circular logo area. */
  logoUrl: string;
  /** Branding → Identity · App name. */
  name: string;
  /** Branding → Identity · Tagline (the card's bio line). */
  bio?: string;
  /** Branding → Social profile · Social media URL (optional). */
  socialUrl?: string;
  /**
   * Admin preview mode: renders the card non-interactive (no link),
   * exactly as a learner would see it for the given values.
   */
  preview?: boolean;
}

/**
 * The Home page bottom social-media profile card
 * (https://uiverse.io/abrahamcalsin/grumpy-ape-40 port, see
 * social-profile-card.css).
 *
 * ONE source of truth: every visible value is a prop fed by the admin
 * Branding settings (useBranding). The social URL is respected verbatim
 * (never rewritten); the platform icon is detected from its hostname,
 * so an admin URL change re-points the link AND re-syncs the icon
 * automatically. With no URL the card renders its clean non-clickable
 * state — no broken icon, no placeholder link, never "undefined".
 */
export default function SocialProfileCard({
  logoUrl,
  name,
  bio,
  socialUrl,
  preview = false,
}: SocialProfileCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  // A changed/removed logo URL must re-arm the <img> (and re-arm the
  // fallback path when the admin switches back to the default logo).
  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  const url = (socialUrl || "").trim();
  // A URL always shows the platform icon (the admin preview must show it
  // too); only the LINK behaviour is disabled in preview mode.
  const hasUrl = url !== "";
  const hasLink = !preview && hasUrl;
  const platform = detectSocialPlatform(url);

  const displayName = (name || "").trim();
  const displayBio = (bio || "").trim();
  const logoSrc = (logoUrl || "").trim() || DEFAULT_LOGO_URL;
  const visibleLogo = !logoFailed && logoSrc ? logoSrc : DEFAULT_LOGO_URL;

  const inner = (
    <>
      <img
        className="dc-social-pic"
        src={visibleLogo}
        alt=""
        width={80}
        height={80}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setLogoFailed(true)}
      />
      <p className="dc-social-name" data-home-social-card-name>
        {displayName || DEFAULT_BRAND_NAME_FALLBACK}
        {displayBio ? <span data-home-social-card-bio>{displayBio}</span> : null}
      </p>
      {hasUrl ? (
        <span className="dc-social-media">
          <span className="dc-social-icon" data-home-social-card-icon>
            <SocialPlatformIcon platform={platform} />
            <span className="dc-social-tooltip" aria-hidden="true">
              {platform.label}
            </span>
          </span>
        </span>
      ) : null}
    </>
  );

  if (hasLink) {
    return (
      <a
        className="dc-social-card"
        data-home-social-card
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Visit ${platform.label} profile: ${displayName || DEFAULT_BRAND_NAME_FALLBACK}`}
      >
        {inner}
      </a>
    );
  }

  return (
    <div
      className="dc-social-card dc-social-card--static"
      data-home-social-card
      data-home-social-card-static
      aria-label="Brand profile card"
    >
      {inner}
    </div>
  );
}

// Last-resort name so the card never renders empty (the branding context
// already falls back to the app default, this covers direct prop misuse).
const DEFAULT_BRAND_NAME_FALLBACK = "Eduvora";
