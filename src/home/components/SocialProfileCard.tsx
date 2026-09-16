import { useEffect, useMemo, useState } from "react";
import "./social-profile-card.css";
import { SocialPlatformIcon } from "../../components/ui/SocialPlatformIcon";
import { SOCIAL_GLYPHS } from "../../utils/socialPlatformIcons";
import { resolveSocialLinks, type SocialLink } from "../../utils/socialPlatform";
import { DEFAULT_LOGO_URL } from "../../utils/branding";

interface SocialProfileCardProps {
  /** Branding → Logo. Shown inside the circular logo area. */
  logoUrl: string;
  /** Branding → Identity · App name. */
  name: string;
  /** Branding → Identity · Tagline (the card's bio line). */
  bio?: string;
  /**
   * Branding → Social profile · every linked account, in the admin's own
   * order. One icon per entry; the icon follows each URL's hostname (or the
   * admin's pinned platform), so a newly added URL adds a new icon here.
   */
  socialLinks?: SocialLink[];
  /**
   * Legacy single-URL prop. Still honoured when `socialLinks` is absent —
   * it becomes the card's only icon (and the whole card links to it).
   */
  socialUrl?: string;
  /**
   * Admin preview mode: renders the card non-interactive (icons are not
   * links), exactly as a learner would see it for the given values.
   */
  preview?: boolean;
}

// Last-resort name so the card never renders empty (the branding context
// already falls back to the app default, this covers direct prop misuse).
const DEFAULT_BRAND_NAME_FALLBACK = "Eduvora";

/**
 * The Home page bottom social-media profile card — a faithful port of
 * https://uiverse.io/abrahamcalsin/grumpy-ape-40 (see
 * social-profile-card.css): the teal card, the circular picture, the
 * name + bio, the divider and the row of brand icons with their dark
 * tooltips.
 *
 * ONE source of truth: every visible value is a prop fed by the admin
 * Branding settings (useBranding). Each social URL is respected verbatim
 * (never rewritten) and opens in its own tab; its platform icon is
 * detected from the URL's hostname, so an admin URL change re-points the
 * link AND re-syncs the icon automatically — and a newly added account
 * simply adds one more icon to the row.
 *
 * Link shape: with several accounts every icon is its own <a> (the
 * reference's own markup). With exactly one account the card itself is the
 * link — one big tap target on a phone — and its icon is a span, so no
 * anchor is ever nested inside another.
 *
 * With no links the card renders its clean non-clickable state — no broken
 * icon, no placeholder link, never "undefined".
 */
export default function SocialProfileCard({
  logoUrl,
  name,
  bio,
  socialLinks,
  socialUrl,
  preview = false,
}: SocialProfileCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [defaultLogoFailed, setDefaultLogoFailed] = useState(false);

  // A changed/removed logo URL must re-arm the <img> (and re-arm the
  // fallback path when the admin switches back to the default logo).
  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  const links = useMemo(() => {
    if (Array.isArray(socialLinks) && socialLinks.length > 0) return resolveSocialLinks(socialLinks);
    const legacy = (socialUrl || "").trim();
    return resolveSocialLinks(legacy ? [{ id: "primary", url: legacy, platform: "", label: "" }] : []);
  }, [socialLinks, socialUrl]);

  const hasLinks = links.length > 0;
  const displayName = (name || "").trim() || DEFAULT_BRAND_NAME_FALLBACK;
  const displayBio = (bio || "").trim();

  // Exactly one account (and not the admin preview) → the card itself is
  // the link, exactly as the one-link card always behaved.
  const cardLink = !preview && links.length === 1 ? links[0] : null;

  // The circular picture: the admin's logo, else the app default, else the
  // reference's own person glyph (the card never shows a broken image).
  const customLogo = (logoUrl || "").trim();
  const usingDefaultLogo = !customLogo || logoFailed;
  const logoSrc = usingDefaultLogo ? DEFAULT_LOGO_URL : customLogo;
  const showPersonGlyph = usingDefaultLogo && defaultLogoFailed;

  const picture = (
    <span className="dc-social-pic" data-home-social-card-logo>
      {showPersonGlyph ? (
        <svg viewBox={SOCIAL_GLYPHS.user.viewBox} fill="currentColor" aria-hidden="true" focusable="false">
          <path d={SOCIAL_GLYPHS.user.d} />
        </svg>
      ) : (
        <img
          className="dc-social-pic-img"
          src={logoSrc}
          alt=""
          width={80}
          height={80}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => (usingDefaultLogo ? setDefaultLogoFailed(true) : setLogoFailed(true))}
        />
      )}
    </span>
  );

  const heading = (
    <p className="dc-social-name" data-home-social-card-name>
      {displayName}
      {displayBio ? <span data-home-social-card-bio>{displayBio}</span> : null}
    </p>
  );

  /* Reference: .social-media — the divider bar, then one entry per linked
     account, each with its own brand icon and tooltip. */
  const iconRow = hasLinks ? (
    <div className="dc-social-media" data-home-social-card-media>
      {links.map((link) => {
        // When the card itself is the link, the icon must not be a nested
        // <a> — it keeps the same look and its tooltip.
        const asLink = !preview && !cardLink;
        const external = /^https?:/i.test(link.url);
        const shared = {
          className: `dc-social-link${asLink ? "" : preview ? " dc-social-link--preview" : ""}`,
          "data-home-social-card-icon": true,
          "data-social-platform": link.platform.id,
          "data-social-url": link.url,
        };
        const children = (
          <>
            <SocialPlatformIcon platform={link.platform} />
            <span className="dc-social-tooltip" aria-hidden="true">
              {link.tooltip}
            </span>
          </>
        );
        return asLink ? (
          <a
            key={link.id}
            {...shared}
            href={link.url}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            aria-label={`${link.tooltip} — ${displayName}`}
          >
            {children}
          </a>
        ) : (
          <span key={link.id} {...shared}>
            {children}
          </span>
        );
      })}
    </div>
  ) : null;

  const dataAttrs = {
    "data-home-social-card": true,
    "data-home-social-card-link-count": String(links.length),
    "data-home-social-card-clickable": cardLink ? "true" : "false",
    ...(!hasLinks ? { "data-home-social-card-static": true } : {}),
  };

  if (cardLink) {
    const external = /^https?:/i.test(cardLink.url);
    return (
      <a
        className="dc-social-card dc-social-card--linked"
        {...dataAttrs}
        href={cardLink.url}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        aria-label={`Visit ${cardLink.tooltip}: ${displayName}`}
      >
        {picture}
        {heading}
        {iconRow}
      </a>
    );
  }

  return (
    <div
      className={`dc-social-card${hasLinks && !preview ? "" : " dc-social-card--static"}`}
      {...dataAttrs}
      aria-label="Brand profile card"
    >
      {picture}
      {heading}
      {iconRow}
    </div>
  );
}
