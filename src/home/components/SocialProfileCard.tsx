import { useEffect, useMemo, useState } from "react";
import "./social-profile-card.css";
import { SocialLinkIcon } from "../../components/ui/SocialPlatformIcon";
import { resolveSocialLink, type SocialLink } from "../../utils/socialPlatform";
import { DEFAULT_LOGO_URL } from "../../utils/branding";

interface SocialProfileCardProps {
  /** Branding → Logo. Shown inside the circular logo area. */
  logoUrl: string;
  /** Branding → Identity · App name. */
  name: string;
  /** Branding → Identity · Tagline (the card's bio line). */
  bio?: string;
  /**
   * Branding → Social profile · every linked account, in order. Each row
   * renders its own icon: the platform's brand glyph for a recognised
   * host, the admin's custom icon, or (for any other URL) that site's own
   * favicon — so a newly added URL always shows up here with an icon.
   */
  links?: SocialLink[];
  /**
   * Legacy single social URL. Honoured when `links` is empty so an
   * un-migrated caller / older branding document still renders its link.
   */
  socialUrl?: string;
  /**
   * Admin preview mode: renders the card non-interactive (no links),
   * exactly as a learner would see it for the given values.
   */
  preview?: boolean;
}

/**
 * The Home page bottom social-media profile card
 * (https://uiverse.io/abrahamcalsin/grumpy-ape-40 port — every value and
 * proportion of the reference is kept verbatim, see
 * social-profile-card.css).
 *
 * ONE source of truth: every visible value is a prop fed by the admin
 * Branding settings (useBranding) — logo, app name, tagline and the list
 * of social accounts. Each account's icon follows its URL automatically
 * (the platform is detected from the hostname), so changing or adding a
 * URL in the admin panel re-points the link AND re-syncs its icon with no
 * code change. With no accounts configured the card renders its clean
 * non-clickable state — no broken icon, no placeholder link, never
 * "undefined".
 */
export default function SocialProfileCard({
  logoUrl,
  name,
  bio,
  links,
  socialUrl,
  preview = false,
}: SocialProfileCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  // A changed/removed logo URL must re-arm the <img> (and re-arm the
  // fallback path when the admin switches back to the default logo).
  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  // Every account that has a usable URL, resolved to glyph + label. The
  // legacy single URL still counts when no list was passed (older branding
  // documents), so nothing that used to show disappears.
  const accounts = useMemo(() => {
    const rows = Array.isArray(links) && links.length
      ? links
      : socialUrl
        ? [{ id: "legacy", url: socialUrl, platform: "", customIcon: "", label: "" }]
        : [];
    return rows
      .map((row) => resolveSocialLink(row))
      .filter((row) => row.url !== "");
  }, [links, socialUrl]);

  // Links are only real in the live card; the admin preview stays inert.
  const interactive = !preview && accounts.length > 0;

  const displayName = (name || "").trim();
  const displayBio = (bio || "").trim();
  const logoSrc = (logoUrl || "").trim() || DEFAULT_LOGO_URL;
  const visibleLogo = !logoFailed && logoSrc ? logoSrc : DEFAULT_LOGO_URL;
  const brandName = displayName || DEFAULT_BRAND_NAME_FALLBACK;

  const content = (
    <>
      <img
        className="dc-social-pic"
        src={visibleLogo}
        alt=""
        width={288}
        height={288}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setLogoFailed(true)}
      />
      <p className="dc-social-name" data-home-social-card-name>
        {brandName}
        {displayBio ? <span data-home-social-card-bio>{displayBio}</span> : null}
      </p>
      {accounts.length > 0 ? (
        <div className="dc-social-media" data-home-social-links>
          {accounts.map((account) => {
            const icon = (
              <>
                <SocialLinkIcon link={account} size={18} />
                <span className="dc-social-tooltip" aria-hidden="true">
                  {account.label}
                </span>
              </>
            );
            // `key` is passed directly (never spread: React 19 rejects a
            // spread props object that carries it).
            return interactive ? (
              <a
                key={account.id}
                className="dc-social-icon"
                data-home-social-icon
                data-social-platform={account.platform.id}
                href={account.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Visit ${account.label} — ${brandName}`}
              >
                {icon}
              </a>
            ) : (
              <span
                key={account.id}
                className="dc-social-icon"
                data-home-social-icon
                data-social-platform={account.platform.id}
                aria-label={account.label}
              >
                {icon}
              </span>
            );
          })}
        </div>
      ) : null}
    </>
  );

  if (interactive) {
    return (
      <div className="dc-social-card" data-home-social-card data-home-social-card-linked>
        {content}
      </div>
    );
  }

  return (
    <div
      // The admin preview keeps the reference's hover lift so what the
      // owner sees while editing is what a learner gets; the live card
      // with NO account configured stays calm (no lift, nothing to click).
      className={`dc-social-card ${preview ? "dc-social-card--preview" : "dc-social-card--static"}`}
      data-home-social-card
      data-home-social-card-static
      aria-label="Brand profile card"
    >
      {content}
    </div>
  );
}

// Last-resort name so the card never renders empty (the branding context
// already falls back to the app default, this covers direct prop misuse).
const DEFAULT_BRAND_NAME_FALLBACK = "Eduvora";
