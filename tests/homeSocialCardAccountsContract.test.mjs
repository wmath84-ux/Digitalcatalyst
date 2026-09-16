// tests/homeSocialCardAccountsContract.test.mjs
//
// Contract tests for the Home page's bottom social profile card —
// a 1:1 port of https://uiverse.io/abrahamcalsin/grumpy-ape-40 — and
// for the admin Branding page section that feeds it.
//
// What changed, and why it is pinned here:
//
//   • The card used to carry ONE social URL (Branding → Social profile
//     was a single text field) and the whole card was that link, so the
//     reference's icon row could never hold more than one icon. It now
//     renders one icon per linked account, each linking to its own URL,
//     each with its own tooltip — the reference's own structure.
//   • The admin panel had no place to link several accounts. Branding →
//     Social profile is now a list: one row per account (URL, pinned
//     icon, tooltip text, reorder, remove) plus a quick-add rail and an
//     "Any other URL" button.
//   • Icons are the reference's Font Awesome brand marks and are picked
//     from each URL's hostname, so any newly added URL adds the right
//     new icon automatically; an unknown domain still gets an icon
//     (a globe, with the domain as its tooltip) and still links.
//
// These are pure code-shape tests — no React, no DOM — so they fail fast
// if the port is reverted or the multi-account surface is removed. The
// rendered behaviour itself is asserted by
// `node scripts/verify-uiverse-updates.mjs`.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const card = fs.readFileSync("src/home/components/SocialProfileCard.tsx", "utf8");
const cardCss = fs.readFileSync("src/home/components/social-profile-card.css", "utf8");
const platforms = fs.readFileSync("src/utils/socialPlatform.ts", "utf8");
const glyphs = fs.readFileSync("src/utils/socialPlatformIcons.ts", "utf8");
const icon = fs.readFileSync("src/components/ui/SocialPlatformIcon.tsx", "utf8");
const branding = fs.readFileSync("src/utils/branding.ts", "utf8");
const admin = fs.readFileSync("src/admin/pages/BrandingPage.tsx", "utf8");
const home = fs.readFileSync("src/home/App.tsx", "utf8");
const indexHtml = fs.readFileSync("index.html", "utf8");

/* ------------------------------------------------------------------ */
/* The card: one icon per linked account                                */
/* ------------------------------------------------------------------ */

test("the card takes the whole list of linked accounts (and still honours the legacy single URL)", () => {
  assert.match(card, /socialLinks\?: SocialLink\[\]/);
  assert.match(card, /socialUrl\?: string/);
  assert.match(card, /resolveSocialLinks/);
  // The list wins; the legacy prop is the fallback.
  assert.match(card, /Array\.isArray\(socialLinks\) && socialLinks\.length > 0/);
});

test("the card renders one link per account, each with its own icon and tooltip", () => {
  assert.match(card, /links\.map\(\(link\)/);
  assert.match(card, /className: `dc-social-link\$\{asLink \? "" : preview \? " dc-social-link--preview" : ""\}`/);
  assert.match(card, /<SocialPlatformIcon platform=\{link\.platform\} \/>/);
  assert.match(card, /className="dc-social-tooltip"/);
  assert.match(card, /\{link\.tooltip\}/);
  // Every icon is its own external link, in the admin's order.
  assert.match(card, /href=\{link\.url\}/);
  assert.match(card, /target: "_blank", rel: "noopener noreferrer"/);
  // mailto: / tel: rows must not be forced into a new tab.
  assert.match(card, /const external = \/\^https\?:\/i\.test\(link\.url\)/);
});

test("the card keeps the reference structure (card › picture › name+span › icon row)", () => {
  assert.match(card, /className=\{`dc-social-card/);
  assert.match(card, /className="dc-social-pic"/);
  assert.match(card, /className="dc-social-pic-img"/);
  assert.match(card, /className="dc-social-name" data-home-social-card-name/);
  assert.match(card, /<span data-home-social-card-bio>/);
  assert.match(card, /className="dc-social-media" data-home-social-card-media/);
  // The reference's own person glyph is the last-resort logo.
  assert.match(card, /SOCIAL_GLYPHS\.user/);
});

test("one account → the card itself is the link, so no anchor is ever nested in one", () => {
  assert.match(card, /const cardLink = !preview && links\.length === 1 \? links\[0\] : null/);
  assert.match(card, /const asLink = !preview && !cardLink/);
  assert.match(card, /className="dc-social-card dc-social-card--linked"/);
  assert.match(card, /data-home-social-card-clickable/);
  // Its tooltip then follows the card's own hover/focus.
  assert.match(cardCss, /\.dc-social-card--linked:hover \.dc-social-tooltip,\s*\.dc-social-card--linked:focus-visible \.dc-social-tooltip \{/);
});

test("nothing linked → the clean non-clickable state, never a broken icon", () => {
  assert.match(card, /data-home-social-card-static/);
  assert.match(card, /dc-social-card--static/);
  assert.match(card, /const iconRow = hasLinks \? \(/);
});

test("the admin preview shows the icons without turning them into live links", () => {
  assert.match(card, /preview = false/);
  assert.match(card, /dc-social-link--preview/);
  assert.match(card, /const asLink = !preview && !cardLink/);
});

/* ------------------------------------------------------------------ */
/* The stylesheet: the reference's exact values                          */
/* ------------------------------------------------------------------ */

test("the stylesheet keeps the reference card's exact paint values", () => {
  assert.match(cardCss, /background: #2cb5a0/);
  assert.match(cardCss, /width: 13rem/);
  assert.match(cardCss, /border: 4px solid #7cdacc/);
  assert.match(cardCss, /box-shadow: 0 6px 10px rgba\(207, 212, 222, 1\)/);
  assert.match(cardCss, /border-radius: 10px/);
  assert.match(cardCss, /"Poppins"/);
  assert.match(cardCss, /transition: all 0\.3s ease/);
  assert.match(cardCss, /transform: translateY\(-10px\)/);
});

test("the stylesheet keeps the reference picture, type and divider", () => {
  assert.match(cardCss, /\.dc-social-pic \{[\s\S]*?width: 5rem;[\s\S]*?height: 5rem;[\s\S]*?border: 4px solid #7cdacc;[\s\S]*?border-radius: 999px/);
  assert.match(cardCss, /\.dc-social-pic svg \{[\s\S]*?width: 2\.5rem/);
  assert.match(cardCss, /margin-top: 20px;\s*font-weight: 600;\s*font-size: 18px/);
  assert.match(cardCss, /\.dc-social-name span \{[\s\S]*?font-weight: 200;[\s\S]*?font-size: 16px/);
  // The divider is the reference's .social-media:before bar — and the row is
  // a BLOCK container, so the bar can span the card (a flex row here was the
  // original bug: the bar and the icon fought for the same line).
  assert.match(cardCss, /\.dc-social-media \{\s*display: block;/);
  assert.match(cardCss, /\.dc-social-media::before \{[\s\S]*?height: 2px;[\s\S]*?margin: 20px 0;[\s\S]*?background: #7cdacc/);
});

test("the stylesheet keeps the reference icon row and tooltip", () => {
  assert.match(cardCss, /\.dc-social-link \{[\s\S]*?position: relative;[\s\S]*?margin-right: 15px;[\s\S]*?text-decoration: none;[\s\S]*?color: inherit/);
  assert.match(cardCss, /\.dc-social-link:last-child \{\s*margin-right: 0/);
  assert.match(cardCss, /\.dc-social-link svg \{[\s\S]*?width: 1\.1rem;[\s\S]*?fill: currentColor/);
  assert.match(cardCss, /\.dc-social-tooltip \{[\s\S]*?background: #262626;[\s\S]*?border-radius: 5px;[\s\S]*?font-size: 0\.8rem;[\s\S]*?font-weight: 600;[\s\S]*?opacity: 0/);
  assert.match(cardCss, /border-width: 10px 10px 0 10px/);
  assert.match(cardCss, /border-top-color: #262626/);
  // The tooltip belongs to ONE icon: it rises on that icon's hover/focus,
  // exactly like the reference's `.social-media a:hover .tooltip-social`.
  assert.match(cardCss, /\.dc-social-link:hover \.dc-social-tooltip,\s*\.dc-social-link:focus-visible \.dc-social-tooltip \{[\s\S]*?opacity: 1;[\s\S]*?transform: translate\(-50%, -130%\)/);
  assert.doesNotMatch(cardCss, /\.dc-social-card:hover \.dc-social-tooltip/);
});

test("a long list of accounts wraps instead of overflowing the 13rem card", () => {
  assert.match(cardCss, /\.dc-social-link \{[\s\S]*?display: inline-flex/);
  assert.match(cardCss, /margin-bottom: 12px/);
  assert.match(cardCss, /margin-bottom: -12px/);
  assert.match(cardCss, /prefers-reduced-motion/);
});

/* ------------------------------------------------------------------ */
/* The platform registry: any URL → its own icon                        */
/* ------------------------------------------------------------------ */

test("the registry carries a real brand glyph + host list per platform", () => {
  assert.match(platforms, /import \{ SOCIAL_GLYPHS, type SocialGlyph, type SocialGlyphId \} from "\.\/socialPlatformIcons"/);
  for (const id of ["instagram", "facebook", "x", "youtube", "whatsapp", "telegram", "linkedin", "discord", "tiktok", "snapchat", "reddit", "threads", "pinterest", "github", "generic"]) {
    assert.match(platforms, new RegExp(`\\{ id: "${id}", glyph: `));
  }
  // Hostname matching is exact-host or subdomain, so notinstagram.com and
  // evilx.com can never borrow a brand icon.
  assert.match(platforms, /hostname === host \|\| hostname\.endsWith\(`\.\$\{host\}`\)/);
  // Self-hosted Fediverse instances match per label, so notmastodon.com does not.
  assert.match(platforms, /hostname\.split\("\."\)\.some\(\(label\) => label\.startsWith\("mastodon"\)/);
  // mailto: / tel: resolve by scheme.
  assert.match(platforms, /lower\.startsWith\("mailto:"\)/);
  assert.match(platforms, /lower\.startsWith\("tel:"\)/);
});

test("the glyph data is the Font Awesome brand set, with attribution and viewBoxes", () => {
  assert.match(glyphs, /Font Awesome Free/);
  assert.match(glyphs, /CC BY 4\.0/);
  assert.match(glyphs, /export interface SocialGlyph \{[\s\S]*?viewBox: string;[\s\S]*?d: string;/);
  // The reference's own four icons, at their official proportions.
  assert.match(glyphs, /instagram: \{\s*viewBox: "0 0 448 512"/);
  assert.match(glyphs, /facebook: \{\s*viewBox: "0 0 512 512"/);
  assert.match(glyphs, /x: \{\s*viewBox: "0 0 448 512"/);
  assert.match(glyphs, /linkedin: \{\s*viewBox: "0 0 448 512"/);
  assert.match(glyphs, /user: \{/);
  // Every glyph in the file keeps a viewBox + a path.
  const glyphCount = (glyphs.match(/viewBox: "0 0 \d+ \d+"/g) || []).length;
  assert.ok(glyphCount >= 45, `expected ≥45 glyphs, found ${glyphCount}`);
  assert.equal((glyphs.match(/    d: "/g) || []).length, glyphCount);
});

test("the icon component draws the glyph at its official aspect ratio", () => {
  assert.match(icon, /const \{ viewBox, d, fillRule \} = resolved\.glyph/);
  assert.match(icon, /viewBox=\{viewBox\}/);
  assert.match(icon, /fill="currentColor"/);
  assert.match(icon, /aria-hidden="true"/);
});

test("URL sanitising keeps the admin's URL usable and never executable", () => {
  assert.match(platforms, /export function sanitizeSocialUrl/);
  assert.match(platforms, /parsed\.protocol === "http:" \|\| parsed\.protocol === "https:"/);
  // A bare domain gets the implied https:// instead of being thrown away.
  assert.match(platforms, /function withImplicitScheme/);
  assert.match(platforms, /BARE_DOMAIN/);
  assert.match(platforms, /MAIL_ADDRESS/);
  assert.match(platforms, /PHONE_NUMBER/);
});

test("the link list is normalised: stable ids, no duplicates, capped", () => {
  assert.match(platforms, /export function normalizeSocialLinks/);
  assert.match(platforms, /export const MAX_SOCIAL_LINKS = 12/);
  assert.match(platforms, /export function stableSocialLinkId/);
  assert.match(platforms, /if \(seen\.has\(key\)\) continue/);
  assert.match(platforms, /out\.length >= MAX_SOCIAL_LINKS/);
  // A pinned platform beats hostname detection when the card renders.
  assert.match(platforms, /isSocialPlatformId\(pinned\) \? SOCIAL_PLATFORMS\[pinned as string\] : detectSocialPlatform\(url\)/);
});

/* ------------------------------------------------------------------ */
/* Branding: the list is the single source of truth                     */
/* ------------------------------------------------------------------ */

test("branding stores the list of accounts and mirrors the first one for old readers", () => {
  assert.match(branding, /socialLinks: SocialLink\[\]/);
  assert.match(branding, /socialUrl: string/);
  assert.match(branding, /socialLinks: \[\]/);
  assert.match(branding, /normalizeSocialLinks\(data\?\.socialLinks\)/);
  assert.match(branding, /stableSocialLinkId\(legacySocialUrl\)/);
  assert.match(branding, /socialUrl: socialLinks\[0\]\?\.url \?\? ""/);
});

test("the home page feeds the card from branding", () => {
  assert.match(home, /socialLinks=\{branding\.socialLinks\}/);
  assert.match(home, /data-home-social-card-section/);
});

test("index.html loads Poppins, the face the reference specifies", () => {
  assert.match(indexHtml, /family=Poppins:wght@200;400;600;700/);
});

/* ------------------------------------------------------------------ */
/* Admin · Branding → Social profile: the multi-account surface          */
/* ------------------------------------------------------------------ */

test("the admin social section is a list of accounts with add / remove / reorder", () => {
  assert.match(admin, /\{ key: "social", label: "Social profile"/);
  assert.match(admin, /data-branding-social-links/);
  assert.match(admin, /data-branding-social-link-row/);
  assert.match(admin, /const addSocialLink = /);
  assert.match(admin, /const updateSocialLink = /);
  assert.match(admin, /const removeSocialLink = /);
  assert.match(admin, /const moveSocialLink = /);
  assert.match(admin, /draft\.socialLinks\.map\(\(link, index\)/);
});

test("the admin can add an account for any platform, or any other URL", () => {
  assert.match(admin, /data-branding-social-quick-add/);
  assert.match(admin, /POPULAR_SOCIAL_PLATFORMS\.map/);
  assert.match(admin, /data-branding-social-link-add/);
  assert.match(admin, /Any other URL/);
  // A freshly added row is focused, like every other admin rail.
  assert.match(admin, /socialUrlInputs\.current\.get\(id\)\?\.focus\(\)/);
  assert.match(admin, /MAX_SOCIAL_LINKS/);
});

test("each row shows what the card will do with it", () => {
  assert.match(admin, /data-branding-social-link-url/);
  assert.match(admin, /data-branding-social-link-platform/);
  assert.match(admin, /data-branding-social-link-label/);
  assert.match(admin, /data-branding-social-link-icon/);
  assert.match(admin, /Auto-detect from the URL/);
  assert.match(admin, /data-branding-social-link-error/);
  assert.match(admin, /data-branding-social-link-open/);
  assert.match(admin, /duplicateUrls/);
});

test("the admin previews the real card with the draft accounts", () => {
  assert.match(admin, /data-branding-social-card-preview/);
  assert.match(admin, /socialLinks=\{draft\.socialLinks\}/);
  assert.match(admin, /preview\n/);
  assert.match(admin, /data-branding-social-link-count/);
});

test("saving writes the whole list (and the legacy mirror), reset clears it", () => {
  assert.match(admin, /const socialLinks = normalizeSocialLinks\(merged\.socialLinks\)/);
  assert.match(admin, /const socialUrl = socialLinks\[0\]\?\.url \?\? ""/);
  assert.match(admin, /homeGradientTo, socialLinks, socialUrl, supportEmail, supportPhone, updatedAt: serverTimestamp\(\)/);
  assert.match(admin, /supportPhone, socialLinks, socialUrl \}\)/);
  assert.match(admin, /socialLinks: DEFAULT_BRANDING\.socialLinks/);
  // A row the card cannot use is reported instead of silently dropped.
  assert.match(admin, /skippedLinks/);
  assert.match(admin, /Save branding/);
  assert.match(admin, /Reset default/);
});
