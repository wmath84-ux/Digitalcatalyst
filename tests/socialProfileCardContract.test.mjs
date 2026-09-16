// tests/socialProfileCardContract.test.mjs
//
// Contract for the Home page bottom social profile card
// (src/home/components/SocialProfileCard.tsx + social-profile-card.css)
// and the Admin → App branding → Social profile editor that feeds it.
//
// Three things are pinned here, because all three were explicitly asked
// for and are easy to break by accident:
//
//  1. SIZE — the card takes the exact geometry of the feedback wall box
//     above it (same width, same 520 / 640 / 740 height steps, same
//     section padding), at every screen size.
//  2. DESIGN — every visual value of the reference card
//     (https://uiverse.io/abrahamcalsin/grumpy-ape-40) is kept verbatim.
//  3. BEHAVIOUR — one account per row (link + icon), the icon follows the
//     URL (known network → brand glyph, unknown host → that site's own
//     icon, custom icon URL wins), and a newly added URL therefore shows
//     up with a new icon without any code change.
//
// The component is bundled with the repo's esbuild and mounted in jsdom so
// the assertions run the SHIPPED markup, not a copy of it.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "node_modules/.tmp-social-card-contract");
fs.mkdirSync(OUT_DIR, { recursive: true });

const cardSource = fs.readFileSync("src/home/components/SocialProfileCard.tsx", "utf8");
const iconSource = fs.readFileSync("src/components/ui/SocialPlatformIcon.tsx", "utf8");
const platformSource = fs.readFileSync("src/utils/socialPlatform.ts", "utf8");
const css = fs.readFileSync("src/home/components/social-profile-card.css", "utf8");
const homeApp = fs.readFileSync("src/home/App.tsx", "utf8");
const brandingPage = fs.readFileSync("src/admin/pages/BrandingPage.tsx", "utf8");
const brandingUtil = fs.readFileSync("src/utils/branding.ts", "utf8");

/* ------------------------------------------------------------------ */
/* 1 · SIZE — identical geometry to the feedback wall                   */
/* ------------------------------------------------------------------ */

test("the social card box matches the feedback wall box at every breakpoint", () => {
  // Same height steps, in the same order, on both the wall and the slot
  // the social card lives in (one for each).
  const boxes = homeApp.match(/h-\[520px\][^"`]*sm:h-\[640px\][^"`]*md:h-\[740px\]/g) || [];
  assert.equal(boxes.length, 2, "the wall and the social slot share the same height steps");
  // Same full width on both.
  assert.equal(boxes.filter((box) => box.includes("w-full")).length, 2);
  // Same horizontal padding on both sections, so the two cards line up
  // edge to edge on every screen size.
  assert.match(homeApp, /data-home-sticker-wall className="mt-8 px-4 md:px-8"/);
  assert.match(homeApp, /data-home-social-card-section className="mt-8 px-4[^"]*md:px-8"/);
  assert.match(homeApp, /data-home-social-slot/);
});

test("the card fills that box instead of keeping its own 13rem tile", () => {
  assert.match(css, /\.dc-social-card \{[\s\S]*?width: 100%;/);
  assert.match(css, /\.dc-social-card \{[\s\S]*?height: 100%;/);
  // The reference's fixed tile width is gone — the box decides the size.
  assert.doesNotMatch(css, /width: 13rem/);
  // Content stays centred in the taller box.
  assert.match(css, /\.dc-social-card \{[\s\S]*?justify-content: center;/);
});

/* ------------------------------------------------------------------ */
/* 2 · DESIGN — the reference values, verbatim                          */
/* ------------------------------------------------------------------ */

test("every visual value of the reference card is kept", () => {
  // Card: fill, 4px ring, 10px radius, rim shadow, padding, type.
  assert.match(css, /background: #2cb5a0;/);
  assert.match(css, /border: 4px solid #7cdacc;/);
  assert.match(css, /box-shadow: 0 6px 10px rgba\(207, 212, 222, 1\);/);
  assert.match(css, /border-radius: 10px;/);
  assert.match(css, /padding-top: 25px;/);
  assert.match(css, /padding-bottom: 25px;/);
  assert.match(css, /padding-left: 20px;/);
  assert.match(css, /padding-right: 20px;/);
  assert.match(css, /color: #fff;/);
  assert.match(css, /font-family: "Poppins",/);
  assert.match(css, /transition: all 0\.3s ease;/);
  assert.match(css, /\.dc-social-card:hover \{\n  transform: translateY\(-10px\);/);
  // Picture: 18rem circle (double the previous Home 9rem) with the same
  // 4px ring, centred — the brand logo is the card's hero on every
  // phone / tablet / desktop size.
  assert.match(css, /width: 18rem;/);
  assert.match(css, /height: 18rem;/);
  assert.match(css, /border-radius: 999px;/);
  assert.match(css, /\.dc-social-pic \{[\s\S]*?margin: auto;/);
  // Type scale: 22px name, 18px weight-200 bio line.
  assert.match(css, /\.dc-social-name \{[\s\S]*?font-size: 22px;/);
  assert.match(css, /\.dc-social-name span \{[\s\S]*?font-size: 18px;/);
  assert.match(css, /\.dc-social-name span \{[\s\S]*?font-weight: 200;/);
  // Divider: 2px #7cdacc rule with 16px above and below.
  assert.match(css, /\.dc-social-media::before \{[\s\S]*?height: 2px;/);
  assert.match(css, /\.dc-social-media::before \{[\s\S]*?margin: 16px 0;/);
  assert.match(css, /\.dc-social-media::before \{[\s\S]*?background: #7cdacc;/);
  // Icons: 1.5rem, currentColor, 18px apart.
  assert.match(css, /\.dc-social-icon svg,\n\.dc-social-icon img \{[\s\S]*?width: 1\.5rem;/);
  assert.match(css, /fill: currentColor;/);
  assert.match(css, /margin-right: 18px;/);
  // Tooltip: dark plate, 0.9rem/600, 12px arrow, -130% on hover.
  assert.match(css, /\.dc-social-tooltip \{[\s\S]*?background: #262626;/);
  assert.match(css, /\.dc-social-tooltip \{[\s\S]*?font-size: 0\.9rem;/);
  assert.match(css, /\.dc-social-tooltip \{[\s\S]*?font-weight: 600;/);
  assert.match(css, /border-width: 12px 12px 0 12px;/);
  assert.match(css, /border-top-color: #262626;/);
  assert.match(css, /transform: translate\(-50%, -130%\);/);
});

test("image-based icons paint in the same uniform white as the glyphs", () => {
  assert.match(css, /\.dc-social-icon img \{[\s\S]*?filter: brightness\(0\) invert\(1\);/);
});

/* ------------------------------------------------------------------ */
/* 3 · BEHAVIOUR — the shipped component, mounted for real              */
/* ------------------------------------------------------------------ */

// Both bundles live inside the repo so their bare `react` import resolves
// to the very same React instance react-dom uses (a second copy gives the
// component its own hook dispatcher).
const OUT_BUNDLE = path.join(OUT_DIR, "SocialProfileCard.mjs");
await build({
  entryPoints: ["src/home/components/SocialProfileCard.tsx"],
  outfile: OUT_BUNDLE,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  external: ["react", "react/jsx-runtime"],
  loader: { ".css": "empty" },
  absWorkingDir: ROOT,
  logLevel: "silent",
});

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "Event", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "localStorage", "matchMedia"]) {
  globalThis[key] = window[key];
}
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { default: SocialProfileCard } = await import(OUT_BUNDLE);

const tick = () => new Promise((resolve) => window.setTimeout(resolve, 20));

/** Mount the card with `props` and return its root element. */
async function renderCard(props) {
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  const root = createRoot(container);
  root.render(React.createElement(SocialProfileCard, props));
  await tick();
  return { container, root };
}

after(() => {
  dom.window.close();
});

test("each account renders one link with the icon that matches its URL", async () => {
  const { container, root } = await renderCard({
    logoUrl: "https://cdn.example.com/logo.png",
    name: "Eduvora",
    bio: "Digital Catalyst",
    links: [
      { id: "a", url: "https://instagram.com/yourbrand", platform: "", customIcon: "", label: "" },
      { id: "b", url: "https://mybrand.example/course", platform: "", customIcon: "", label: "" },
    ],
  });

  const card = container.querySelector("[data-home-social-card]");
  assert.ok(card, "the card renders");
  assert.ok(card.classList.contains("dc-social-card"));
  assert.ok(card.hasAttribute("data-home-social-card-linked"), "accounts make the card live");
  assert.equal(container.querySelector(".dc-social-pic").getAttribute("src"), "https://cdn.example.com/logo.png");
  assert.equal(container.querySelector("[data-home-social-card-name]").textContent, "EduvoraDigital Catalyst");
  assert.equal(container.querySelector("[data-home-social-card-bio]").textContent, "Digital Catalyst");

  const icons = container.querySelectorAll("[data-home-social-icon]");
  assert.equal(icons.length, 2, "one icon per account");

  // Known network → brand glyph.
  assert.equal(icons[0].tagName, "A");
  assert.equal(icons[0].getAttribute("href"), "https://instagram.com/yourbrand");
  assert.equal(icons[0].getAttribute("target"), "_blank");
  assert.equal(icons[0].getAttribute("rel"), "noopener noreferrer");
  assert.equal(icons[0].getAttribute("data-social-platform"), "instagram");
  assert.ok(icons[0].querySelector('svg[data-social-glyph="instagram"]'), "Instagram glyph");
  assert.equal(icons[0].querySelector(".dc-social-tooltip").textContent, "Instagram");
  assert.doesNotMatch(icons[0].querySelector(".dc-social-tooltip").getAttribute("class") || "", /sr-only/);

  // A brand-new URL on a host we have no glyph for still gets its own
  // icon: the site's favicon, labelled with the hostname.
  assert.equal(icons[1].getAttribute("data-social-platform"), "generic");
  const image = icons[1].querySelector("img");
  assert.ok(image, "unknown host falls back to the site's own icon");
  assert.equal(image.getAttribute("src"), "https://mybrand.example/favicon.ico");
  assert.equal(icons[1].querySelector(".dc-social-tooltip").textContent, "mybrand.example");

  root.unmount();
  container.remove();
});

test("a forced platform and a custom icon override the detection", async () => {
  const { container, root } = await renderCard({
    logoUrl: "",
    name: "Eduvora",
    links: [
      { id: "a", url: "https://example.com/profile", platform: "youtube", customIcon: "", label: "" },
      { id: "b", url: "https://example.com/other", platform: "", customIcon: "https://cdn.example.com/my-icon.png", label: "" },
    ],
  });
  const icons = container.querySelectorAll("[data-home-social-icon]");
  assert.ok(icons[0].querySelector('svg[data-social-glyph="youtube"]'), "the admin's platform choice wins");
  assert.equal(icons[1].querySelector("img").getAttribute("src"), "https://cdn.example.com/my-icon.png");
  root.unmount();
  container.remove();
});

test("the legacy single URL still renders one link (older branding documents)", async () => {
  const { container, root } = await renderCard({
    logoUrl: "",
    name: "Eduvora",
    socialUrl: "https://youtube.com/@yourbrand",
  });
  const icons = container.querySelectorAll("[data-home-social-icon]");
  assert.equal(icons.length, 1);
  assert.equal(icons[0].getAttribute("href"), "https://youtube.com/@yourbrand");
  assert.ok(icons[0].querySelector('svg[data-social-glyph="youtube"]'));
  root.unmount();
  container.remove();
});

test("no account keeps the card clickable-free and icon-free", async () => {
  const { container, root } = await renderCard({ logoUrl: "", name: "Eduvora", bio: "Digital Catalyst" });
  const card = container.querySelector("[data-home-social-card]");
  assert.ok(card.hasAttribute("data-home-social-card-static"));
  assert.equal(container.querySelectorAll("[data-home-social-icon]").length, 0);
  assert.equal(container.querySelector("[data-home-social-links]"), null);
  assert.equal(container.querySelectorAll("a").length, 0, "nothing to click, no broken link");
  root.unmount();
  container.remove();
});

test("the admin preview renders the exact card but never navigates", async () => {
  const { container, root } = await renderCard({
    logoUrl: "",
    name: "Eduvora",
    bio: "Digital Catalyst",
    links: [{ id: "a", url: "https://instagram.com/yourbrand", platform: "", customIcon: "", label: "" }],
    preview: true,
  });
  assert.equal(container.querySelectorAll("[data-home-social-icon]").length, 1);
  assert.equal(container.querySelectorAll("a").length, 0, "preview stays inert");
  assert.ok(container.querySelector("[data-home-social-card]").classList.contains("dc-social-card--preview"));
  root.unmount();
  container.remove();
});

/* ------------------------------------------------------------------ */
/* 4 · Admin editor + branding wiring                                   */
/* ------------------------------------------------------------------ */

test("the card is fed by the branding account list, not a single URL", () => {
  assert.match(homeApp, /links=\{branding\.socialLinks\}/);
  assert.match(brandingUtil, /const socialLinks = normalizeSocialLinks\(data\?\.socialLinks, data\?\.socialUrl\)/);
  // The legacy single field is mirrored from the first account so older
  // readers keep working; the list is authoritative.
  assert.match(brandingUtil, /socialUrl: sanitizeSocialUrl\(data\?\.socialUrl\) \|\| socialLinks\[0\]\?\.url \|\| ""/);
  assert.match(brandingUtil, /socialLinks: \[\]/);
});

test("the branding editor can add, edit and remove social accounts", () => {
  // One row per account with its own URL, platform and icon controls.
  assert.match(brandingPage, /data-branding-social-row/);
  assert.match(brandingPage, /data-branding-social-url/);
  assert.match(brandingPage, /data-branding-social-platform/);
  assert.match(brandingPage, /data-branding-social-icon/);
  assert.match(brandingPage, /data-branding-social-remove/);
  // The "+" that adds another account (and focuses it).
  assert.match(brandingPage, /data-branding-social-add/);
  assert.match(brandingPage, /\+ Add social account/);
  // Every supported platform is offered by id, straight from the catalogue.
  assert.match(brandingPage, /SOCIAL_PLATFORM_PICKER_ORDER\.map/);
  assert.match(brandingPage, /SOCIAL_PLATFORMS\[id\]\.label/);
  // The preview is the real card, at the real Home size.
  assert.match(brandingPage, /<SocialProfileCard[\s\S]*?preview/);
  assert.match(brandingPage, /h-\[520px\] w-full sm:h-\[640px\] md:h-\[740px\]/);
  // Saving persists the list (plus the legacy mirror).
  assert.match(brandingPage, /socialUrl, socialLinks, supportEmail/);
  assert.match(brandingPage, /const socialUrl = socialLinks\[0\]\?\.url \|\| "";/);
});

test("each popular network gets its own one-tap field + placeholder", () => {
  // The seven networks the owner links first are pinned as chips; tapping
  // one adds an account row already locked to that platform, whose URL
  // field shows that platform's own example placeholder.
  assert.match(brandingPage, /data-branding-social-quick-add/);
  assert.match(brandingPage, /POPULAR_SOCIAL_PLATFORMS\.map/);
  assert.match(brandingPage, /data-branding-social-quick-add-platform=\{id\}/);
  assert.match(brandingPage, /addSocialLink\(id\)/);
  assert.match(brandingPage, /SOCIAL_URL_EXAMPLES\[row\.platform\]/);
  // Every offered platform carries an example URL for its placeholder.
  for (const id of ["instagram", "youtube", "facebook", "x", "whatsapp", "telegram", "linkedin", "tiktok", "discord", "github"]) {
    assert.match(platformSource, new RegExp(`${id}: "https://`), `${id} has a placeholder example`);
  }
  assert.match(platformSource, /POPULAR_SOCIAL_PLATFORMS: SocialPlatformId\[\] = \[/);
});

test("the popular networks, and any new URL, all resolve to an icon", () => {
  // Every platform the admin requested has a glyph, a label and hosts.
  for (const id of ["instagram", "youtube", "facebook", "x", "whatsapp", "telegram", "linkedin"]) {
    assert.match(platformSource, new RegExp(`\\n  ${id}: \\{`), `${id} is in the catalogue`);
  }
  for (const host of ["instagram.com", "youtube.com", "facebook.com", "x.com", "whatsapp.com", "t.me", "linkedin.com"]) {
    assert.match(platformSource, new RegExp(`"${host.replace(/\./g, "\\.")}"`), `${host} is detected`);
  }
  // Unknown hosts fall back to their own icon — no code change needed.
  assert.match(platformSource, /favicon\.ico/);
  // The card icon component honours that image, then falls back to a glyph.
  assert.match(iconSource, /data-social-icon-image/);
  assert.match(iconSource, /SOCIAL_PLATFORMS\.generic/);
  assert.match(cardSource, /resolveSocialLink/);
});

test("every platform glyph is a real single-path drawing", () => {
  const entries = platformSource.match(/path: "[^"]+"/g) || [];
  assert.ok(entries.length >= 22, `catalogue has a glyph per platform (found ${entries.length})`);
  for (const entry of entries) {
    assert.ok(entry.length > 40, "glyph paths are real path data");
  }
  assert.doesNotMatch(platformSource, /path: ""/);
});
