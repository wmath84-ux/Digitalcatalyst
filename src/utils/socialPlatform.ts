// Social platform detection — the single source of truth for the
// Home page social profile card (and the Admin Branding preview).
//
// The admin links ANY number of accounts in Branding → Social profile.
// For every stored URL this module resolves:
//   · which brand icon the Home page card shows
//   · the label used in the icon tooltip / aria text
//
// Resolution is by HOSTNAME (never by guessing at the path text), or by
// URL scheme for `mailto:` / `tel:` links. Adding a new URL in the admin
// panel therefore adds a new icon to the card automatically; unknown
// hosts fall back to a generic globe glyph so the card never shows the
// wrong brand.
//
// Glyph path data lives in ./socialPlatformIcons (Font Awesome Free,
// CC BY 4.0) — the same brand set the reference card uses:
// https://uiverse.io/abrahamcalsin/grumpy-ape-40

import { SOCIAL_GLYPHS, type SocialGlyph, type SocialGlyphId } from "./socialPlatformIcons";

export type { SocialGlyph };

export interface SocialPlatform {
  /** Stable id, used as a data-attribute / style hook. */
  id: string;
  /** Human label ("Instagram", "X (Twitter)", …). */
  label: string;
  /** Brand glyph (official viewBox + path), filled with currentColor. */
  glyph: SocialGlyph;
  /** Hosts / schemes that resolve to this platform. */
  hosts: string[];
  /** Example URL shown as the admin field's placeholder. */
  template: string;
  /** Shown in the admin quick-add rail. */
  popular?: boolean;
}

interface PlatformDef {
  id: string;
  glyph: SocialGlyphId;
  label: string;
  template: string;
  hosts: string[];
  popular?: boolean;
}

/**
 * Curated order = the order of the admin's platform picker and quick-add
 * rail (most-used first). Every entry keeps its real brand hosts so a
 * pasted URL is recognised without the admin picking anything.
 */
const PLATFORM_DEFS: PlatformDef[] = [
  { id: "instagram", glyph: "instagram", label: "Instagram", template: "https://instagram.com/yourbrand", hosts: ["instagram.com", "instagr.am"], popular: true },
  { id: "youtube", glyph: "youtube", label: "YouTube", template: "https://youtube.com/@yourbrand", hosts: ["youtube.com", "youtu.be"], popular: true },
  { id: "whatsapp", glyph: "whatsapp", label: "WhatsApp", template: "https://wa.me/919999999999", hosts: ["whatsapp.com", "wa.me", "wa.link"], popular: true },
  { id: "facebook", glyph: "facebook", label: "Facebook", template: "https://facebook.com/yourbrand", hosts: ["facebook.com", "fb.com", "fb.me", "fb.watch", "m.me"], popular: true },
  { id: "x", glyph: "x", label: "X (Twitter)", template: "https://x.com/yourbrand", hosts: ["x.com", "twitter.com", "t.co"], popular: true },
  { id: "telegram", glyph: "telegram", label: "Telegram", template: "https://t.me/yourbrand", hosts: ["t.me", "telegram.me", "telegram.org", "telegram.dog"], popular: true },
  { id: "linkedin", glyph: "linkedin", label: "LinkedIn", template: "https://linkedin.com/in/yourbrand", hosts: ["linkedin.com", "lnkd.in"], popular: true },
  { id: "tiktok", glyph: "tiktok", label: "TikTok", template: "https://tiktok.com/@yourbrand", hosts: ["tiktok.com", "vm.tiktok.com"], popular: true },
  { id: "discord", glyph: "discord", label: "Discord", template: "https://discord.gg/yourserver", hosts: ["discord.com", "discord.gg", "discordapp.com"], popular: true },
  { id: "snapchat", glyph: "snapchat", label: "Snapchat", template: "https://snapchat.com/add/yourbrand", hosts: ["snapchat.com"] },
  { id: "reddit", glyph: "reddit", label: "Reddit", template: "https://reddit.com/r/yourcommunity", hosts: ["reddit.com", "redd.it"] },
  { id: "threads", glyph: "threads", label: "Threads", template: "https://threads.net/@yourbrand", hosts: ["threads.net", "threads.com"] },
  { id: "pinterest", glyph: "pinterest", label: "Pinterest", template: "https://pinterest.com/yourbrand", hosts: ["pinterest.com", "pinterest.in", "pinterest.co.uk", "pin.it"] },
  { id: "github", glyph: "github", label: "GitHub", template: "https://github.com/yourbrand", hosts: ["github.com", "gist.github.com"] },
  { id: "bluesky", glyph: "bluesky", label: "Bluesky", template: "https://bsky.app/profile/yourbrand.bsky.social", hosts: ["bsky.app", "bsky.social"] },
  { id: "mastodon", glyph: "mastodon", label: "Mastodon", template: "https://mastodon.social/@yourbrand", hosts: ["mastodon.social", "mastodon.online", "fosstodon.org", "hachyderm.io", "mstdn.social", "infosec.exchange", "mastodon.cloud"] },
  { id: "medium", glyph: "medium", label: "Medium", template: "https://medium.com/@yourbrand", hosts: ["medium.com"] },
  { id: "twitch", glyph: "twitch", label: "Twitch", template: "https://twitch.tv/yourbrand", hosts: ["twitch.tv"] },
  { id: "spotify", glyph: "spotify", label: "Spotify", template: "https://open.spotify.com/artist/…", hosts: ["spotify.com", "spotify.link"] },
  { id: "linktree", glyph: "linktree", label: "Linktree", template: "https://linktr.ee/yourbrand", hosts: ["linktr.ee"] },
  { id: "appstore", glyph: "appstore", label: "App Store", template: "https://apps.apple.com/app/id…", hosts: ["apps.apple.com", "itunes.apple.com", "apple.co", "testflight.apple.com"] },
  { id: "googleplay", glyph: "googleplay", label: "Google Play", template: "https://play.google.com/store/apps/…", hosts: ["play.google.com"] },
  { id: "google", glyph: "google", label: "Google", template: "https://g.page/yourbrand", hosts: ["google.com", "g.page", "goo.gl", "business.google.com", "maps.app.goo.gl"] },
  { id: "tumblr", glyph: "tumblr", label: "Tumblr", template: "https://yourbrand.tumblr.com", hosts: ["tumblr.com", "tumblr.co", "t.umblr.com"] },
  { id: "vimeo", glyph: "vimeo", label: "Vimeo", template: "https://vimeo.com/yourbrand", hosts: ["vimeo.com"] },
  { id: "behance", glyph: "behance", label: "Behance", template: "https://behance.net/yourbrand", hosts: ["behance.net"] },
  { id: "dribbble", glyph: "dribbble", label: "Dribbble", template: "https://dribbble.com/yourbrand", hosts: ["dribbble.com"] },
  { id: "slack", glyph: "slack", label: "Slack", template: "https://yourworkspace.slack.com", hosts: ["slack.com"] },
  { id: "skype", glyph: "skype", label: "Skype", template: "https://join.skype.com/invite/…", hosts: ["skype.com"] },
  { id: "quora", glyph: "quora", label: "Quora", template: "https://quora.com/profile/Yourbrand", hosts: ["quora.com", "qr.ae"] },
  { id: "stackoverflow", glyph: "stackoverflow", label: "Stack Overflow", template: "https://stackoverflow.com/users/…", hosts: ["stackoverflow.com", "stackexchange.com"] },
  { id: "wordpress", glyph: "wordpress", label: "WordPress", template: "https://yourbrand.wordpress.com", hosts: ["wordpress.com", "wordpress.org", "wp.me"] },
  { id: "blogger", glyph: "blogger", label: "Blogger", template: "https://yourbrand.blogspot.com", hosts: ["blogger.com", "blogspot.com"] },
  { id: "notion", glyph: "notion", label: "Notion", template: "https://yourbrand.notion.so", hosts: ["notion.so", "notion.site"] },
  { id: "figma", glyph: "figma", label: "Figma", template: "https://figma.com/@yourbrand", hosts: ["figma.com"] },
  { id: "hashnode", glyph: "hashnode", label: "Hashnode", template: "https://yourbrand.hashnode.dev", hosts: ["hashnode.com", "hashnode.dev"] },
  { id: "devto", glyph: "devto", label: "DEV", template: "https://dev.to/yourbrand", hosts: ["dev.to"] },
  { id: "codepen", glyph: "codepen", label: "CodePen", template: "https://codepen.io/yourbrand", hosts: ["codepen.io"] },
  { id: "signal", glyph: "signal", label: "Signal", template: "https://signal.me/#p/+91…", hosts: ["signal.me", "signal.art", "signal.group"] },
  { id: "wechat", glyph: "wechat", label: "WeChat", template: "https://wechat.com/", hosts: ["wechat.com", "weixin.qq.com"] },
  { id: "line", glyph: "line", label: "LINE", template: "https://line.me/ti/p/~yourbrand", hosts: ["line.me", "lin.ee"] },
  { id: "patreon", glyph: "patreon", label: "Patreon", template: "https://patreon.com/yourbrand", hosts: ["patreon.com"] },
  { id: "kickstarter", glyph: "kickstarter", label: "Kickstarter", template: "https://kickstarter.com/projects/…", hosts: ["kickstarter.com"] },
  { id: "etsy", glyph: "etsy", label: "Etsy", template: "https://etsy.com/shop/yourbrand", hosts: ["etsy.com"] },
  { id: "shopify", glyph: "shopify", label: "Shopify store", template: "https://yourbrand.myshopify.com", hosts: ["myshopify.com", "shopify.com"] },
  { id: "amazon", glyph: "amazon", label: "Amazon", template: "https://amazon.in/shop/yourbrand", hosts: ["amazon.com", "amazon.in", "amazon.co.uk", "amzn.to"] },
  { id: "steam", glyph: "steam", label: "Steam", template: "https://steamcommunity.com/id/yourbrand", hosts: ["steampowered.com", "steamcommunity.com", "s.team"] },
  // Scheme-based (not host-based) — the admin can link a mail address or a
  // phone number from the very same row, with the matching icon.
  { id: "email", glyph: "email", label: "Email", template: "mailto:hello@yourbrand.com", hosts: ["mailto:"] },
  { id: "phone", glyph: "phone", label: "Phone call", template: "tel:+919999999999", hosts: ["tel:"] },
  /** Unknown / unsupported host — a neutral globe, never a wrong brand. */
  { id: "generic", glyph: "website", label: "Website", template: "https://your-website.com", hosts: [] },
];

export const SOCIAL_PLATFORMS: Record<string, SocialPlatform> = Object.fromEntries(
  PLATFORM_DEFS.map((def) => [
    def.id,
    {
      id: def.id,
      label: def.label,
      glyph: SOCIAL_GLYPHS[def.glyph],
      hosts: def.hosts,
      template: def.template,
      popular: def.popular,
    } satisfies SocialPlatform,
  ]),
);

/** Every platform in curated order (admin picker + quick-add rail). */
export const SOCIAL_PLATFORM_LIST: SocialPlatform[] = PLATFORM_DEFS.map((def) => SOCIAL_PLATFORMS[def.id]);

/** The quick-add rail: the platforms most admins link first. */
export const POPULAR_SOCIAL_PLATFORMS: SocialPlatform[] = SOCIAL_PLATFORM_LIST.filter((platform) => platform.popular);

export type SocialPlatformId = keyof typeof SOCIAL_PLATFORMS;

export function isSocialPlatformId(value: unknown): value is string {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SOCIAL_PLATFORMS, value);
}

/**
 * One linked account. `url` is the admin's URL verbatim (valid http(s),
 * mailto: or tel:); `platform` optionally pins an icon (empty = detected
 * from the URL); `label` optionally overrides the tooltip text.
 */
export interface SocialLink {
  /** Stable id (React key + admin reorder handle). */
  id: string;
  url: string;
  /** Admin-pinned platform id; "" = auto-detect from the URL. */
  platform: string;
  /** Admin tooltip override; "" = the platform's own label. */
  label: string;
}

/** Most a card can carry before it stops reading like the reference. */
export const MAX_SOCIAL_LINKS = 12;

function hostnameMatches(hostname: string, host: string): boolean {
  return hostname === host || hostname.endsWith(`.${host}`);
}

/** Hosts that resolve by pattern instead of a fixed domain list. */
function matchesByPattern(hostname: string): SocialPlatform | null {
  // Fediverse instances are self-hosted under thousands of domains
  // (mastodon.social, fosstodon.org, mstdn.jp, …). Match per LABEL so
  // `notmastodon.com` can never borrow the icon.
  if (hostname.split(".").some((label) => label.startsWith("mastodon") || label.startsWith("mstdn"))) {
    return SOCIAL_PLATFORMS.mastodon;
  }
  return null;
}

/**
 * Resolve the platform for a social URL by hostname (or scheme for
 * mailto:/tel:). Never throws — an unparseable URL resolves to the
 * generic globe glyph.
 */
export function detectSocialPlatform(url: string): SocialPlatform {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return SOCIAL_PLATFORMS.generic;

  const lower = raw.toLowerCase();
  if (lower.startsWith("mailto:")) return SOCIAL_PLATFORMS.email;
  if (lower.startsWith("tel:")) return SOCIAL_PLATFORMS.phone;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return SOCIAL_PLATFORMS.generic;
  }
  const hostname = parsed.hostname.toLowerCase();
  for (const platform of SOCIAL_PLATFORM_LIST) {
    if (platform.hosts.some((host) => hostnameMatches(hostname, host))) return platform;
  }
  return matchesByPattern(hostname) ?? SOCIAL_PLATFORMS.generic;
}

/* ------------------------------------------------------------------ */
/* URL sanitising                                                       */
/* ------------------------------------------------------------------ */

const BARE_DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+([/?#][^\s]*)?$/i;
const MAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_NUMBER = /^\+?[0-9 ()[.\]-]{6,24}$/;

/**
 * Add the scheme the admin probably meant: `instagram.com/brand` and
 * `discord.gg/abc` are stored as real https URLs instead of being thrown
 * away. Anything that already carries a scheme is left untouched.
 */
function withImplicitScheme(text: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
  const bare = text.replace(/^\/\//, "");
  return BARE_DOMAIN.test(bare) ? `https://${bare}` : text;
}

/**
 * Validate + normalise a social URL for storage. Returns the admin's URL
 * (trimmed, never rewritten beyond an implied https://) when it is a
 * valid http(s) / mailto: / tel: URL, otherwise the empty string — the
 * card then skips the row instead of rendering a broken link.
 */
export function sanitizeSocialUrl(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";

  const candidate = withImplicitScheme(text);
  const lower = candidate.toLowerCase();

  if (lower.startsWith("mailto:")) {
    const address = candidate.slice("mailto:".length).split("?")[0];
    return MAIL_ADDRESS.test(address) ? `mailto:${address}` : "";
  }
  if (lower.startsWith("tel:")) {
    const number = candidate.slice("tel:".length).split("?")[0];
    return PHONE_NUMBER.test(number) ? `tel:${number.replace(/[^\d+]/g, "")}` : "";
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return candidate;
  } catch {
    /* not a URL */
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Link lists (Branding → Social profile)                               */
/* ------------------------------------------------------------------ */

/**
 * Deterministic id for a link with none (legacy `socialUrl` docs, pasted
 * arrays). Deriving it from the URL keeps React keys — and the admin's
 * input focus — stable across every Firestore snapshot.
 */
export function stableSocialLinkId(url: string): string {
  const text = (url || "").trim().toLowerCase().replace(/\/+$/, "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return `s${(hash >>> 0).toString(36)}`;
}

/** A fresh, empty row for the admin's "+ Add social account" button. */
export function createSocialLink(partial: Partial<SocialLink> = {}): SocialLink {
  const url = typeof partial.url === "string" ? partial.url.trim() : "";
  return {
    id:
      typeof partial.id === "string" && partial.id.trim()
        ? partial.id.trim()
        : `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    url,
    platform: isSocialPlatformId(partial.platform) ? (partial.platform as string) : "",
    label: typeof partial.label === "string" ? partial.label.trim().slice(0, 40) : "",
  };
}

function coerceSocialLink(value: unknown): SocialLink | null {
  // Firestore stores maps; a plain array of URL strings is also accepted
  // (hand-edited docs, imports, older shapes).
  if (typeof value === "string") {
    const url = sanitizeSocialUrl(value);
    return url ? { id: stableSocialLinkId(url), url, platform: "", label: "" } : null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const url = sanitizeSocialUrl(record.url);
  if (!url) return null;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : stableSocialLinkId(url);
  return {
    id,
    url,
    platform: isSocialPlatformId(record.platform) ? (record.platform as string) : "",
    label: typeof record.label === "string" ? record.label.trim().slice(0, 40) : "",
  };
}

/** Same link, ignoring case / trailing slash — used to drop duplicates. */
function linkKey(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Parse + clean the admin's list of linked accounts: invalid URLs drop
 * out, duplicates collapse, the list is capped, and every entry keeps a
 * stable id. Empty list in → empty list out (the card renders its clean
 * non-clickable state).
 */
export function normalizeSocialLinks(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return [];
  const out: SocialLink[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (out.length >= MAX_SOCIAL_LINKS) break;
    const link = coerceSocialLink(entry);
    if (!link) continue;
    const key = linkKey(link.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}

/** A link, resolved for rendering (platform object + tooltip text). */
export interface ResolvedSocialLink {
  id: string;
  url: string;
  /** The resolved platform — pinned by the admin, else detected from the URL. */
  platform: SocialPlatform;
  /** The admin's pinned platform id ("" = auto-detected from the hostname). */
  pinnedPlatformId: string;
  /** Tooltip / aria text: the admin's label, else the platform's name. */
  tooltip: string;
  /** The admin's tooltip override ("" = none). */
  label: string;
}

/**
 * Resolve a whole list for the card / admin preview: a pinned platform wins,
 * otherwise the hostname decides. Invalid rows are dropped so the card can
 * never render an empty icon or a dead link.
 */
export function resolveSocialLinks(links: SocialLink[] | undefined | null): ResolvedSocialLink[] {
  if (!Array.isArray(links)) return [];
  const out: ResolvedSocialLink[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const url = sanitizeSocialUrl(link?.url);
    if (!url) continue;
    const key = linkKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const pinned = link?.platform;
    const platform = isSocialPlatformId(pinned) ? SOCIAL_PLATFORMS[pinned as string] : detectSocialPlatform(url);
    const custom = (link?.label || "").trim();
    let tooltip = custom || platform.label;
    // An unrecognised host is far more useful as its own domain than as
    // the generic word "Website".
    if (!custom && platform.id === "generic") {
      try {
        tooltip = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        tooltip = platform.label;
      }
    }
    out.push({
      id: link?.id || stableSocialLinkId(url),
      url,
      platform,
      pinnedPlatformId: isSocialPlatformId(pinned) ? (pinned as string) : "",
      tooltip,
      label: custom,
    });
  }
  return out;
}

/**
 * Host (or address) shown next to a row in the admin panel — lets the
 * admin see at a glance where a link actually points.
 */
export function socialUrlHost(url: string): string {
  const text = (url || "").trim();
  if (!text) return "";
  if (text.toLowerCase().startsWith("mailto:")) return text.slice("mailto:".length);
  if (text.toLowerCase().startsWith("tel:")) return text.slice("tel:".length);
  try {
    return new URL(text).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
