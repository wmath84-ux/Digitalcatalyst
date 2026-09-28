import { useEffect, useMemo, useState } from "react";
import "./social-profile-card.css";
import { SocialLinkIcon } from "../../components/ui/SocialPlatformIcon";
import { GlassCard } from "../../components/ui/GlassCard";
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
 *
 * ── MATERIAL (owner, 2026-09-28) ────────────────────────────────────────
 * "Home page per sabse niche jo social card hai use card ko design glass
 * card karo exactly like store page product card … Keval design aur look
 * ki baat kar raha hai … edges ko vaise hi rahane dena jaise abhi hai."
 *
 * So the card is now a real `GlassCard` wearing the STORE's material class
 * (`.dc-store-glass`): light-blue lens, 46% frost, pack sheen, white rim —
 * byte-for-byte the surface every product card on the Store page paints
 * (src/store-glass.css + the tokens in src/glass.css). The teal fill and
 * the 4px teal frame are gone; the ROUNDING did not move (10 / 12 / 14 px,
 * exactly the ladder this card had before) and neither did a single size:
 * the reserved 520 / 640 / 740 box, the internal metric ramp, the icon
 * hooks and the tooltips are all untouched.
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
      <GlassCard
        /* The store's invocation, verbatim (src/components/ProductCard.tsx):
           tint 0.62 over the light blue → the pinned 26% lens, `blur={0}`
           because src/store-glass.css owns the 46% frost through the
           `--dc-store-glass-blur` token. The radius is the card's own 10px
           step; CSS raises it to 12 / 14 at the two breakpoints without
           touching a single size in the ramp. */
        tint={0.62}
        tintColor="173,216,255"
        blur={0}
        radius={10}
        contentClassName="flex h-full w-full min-h-0 flex-col items-center justify-center"
        className="dc-store-glass dc-scene-ink dc-social-card"
        data-home-social-card
        data-home-social-card-linked
      >
        {content}
      </GlassCard>
    );
  }

  return (
    <GlassCard
      /* The admin preview keeps the reference's hover lift so what the
         owner sees while editing is what a learner gets; the live card
         with NO account configured stays calm (no lift, nothing to click).
         Same store material as the live card — the owner edits on the real
         surface, never on a stand-in. */
      tint={0.62}
      tintColor="173,216,255"
      blur={0}
      radius={10}
      contentClassName="flex h-full w-full min-h-0 flex-col items-center justify-center"
      className={`dc-store-glass dc-scene-ink dc-social-card ${preview ? "dc-social-card--preview" : "dc-social-card--static"}`}
      data-home-social-card
      data-home-social-card-static
      aria-label="Brand profile card"
    >
      {content}
    </GlassCard>
  );
}

// Last-resort name so the card never renders empty (the branding context
// already falls back to the app default, this covers direct prop misuse).
const DEFAULT_BRAND_NAME_FALLBACK = "Eduvora";
