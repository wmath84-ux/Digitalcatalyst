// scripts/render-social-card-qa-page.mjs
//
// Builds `docs/social-profile-card-qa.html` — a self-contained visual QA
// sheet for the Home page bottom social profile card (the Uiverse
// "grumpy-ape-40" port).
//
// It is not a mock-up: the markup is produced by rendering the SHIPPED React
// component through Vite's SSR pipeline and the shipped stylesheet is inlined
// verbatim, so what the page shows is what the app paints. Each shot puts the
// card beside a box with the exact geometry of the feedback wall, which is the
// size the card must match at every breakpoint.
//
// Run: node scripts/render-social-card-qa-page.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const vite = await createServer({
  root,
  configFile: path.join(root, "vite.config.ts"),
  logLevel: "error",
  server: { middlewareMode: true },
});

try {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: SocialProfileCard } = await vite.ssrLoadModule("/src/home/components/SocialProfileCard.tsx");
  const { SOCIAL_PLATFORMS } = await vite.ssrLoadModule("/src/utils/socialPlatform.ts");

  // The card's own CSS plus the two sheets the STORE's material lives in
  // (owner, 2026-09-28: the card is a glass card "exactly like store page
  // product card"). Order matters — it is the order the app loads them in
  // (see src/main.tsx): the pack's glass, then the store lens, then the card.
  const cardCss = readFileSync(path.join(root, "src/home/components/social-profile-card.css"), "utf8");
  const glassCss = readFileSync(path.join(root, "src/glass.css"), "utf8");
  const storeGlassCss = readFileSync(path.join(root, "src/store-glass.css"), "utf8");
  const css = [cardCss, glassCss, storeGlassCss].join("\n\n");
  // The real app icon, inlined so the sheet renders from a plain file:// open.
  const logo = `data:image/png;base64,${readFileSync(path.join(root, "public/icons/icon-192x192.png")).toString("base64")}`;

  const brand = { logoUrl: logo, name: "Eduvora", bio: "Digital Catalyst" };

  // One account per platform the owner links first, plus a brand-new URL on a
  // host no glyph ships for (it must still get its own icon).
  const accounts = [
    { id: "1", url: "https://instagram.com/yourbrand", platform: "", customIcon: "", label: "" },
    { id: "2", url: "https://youtube.com/@yourbrand", platform: "", customIcon: "", label: "" },
    { id: "3", url: "https://wa.me/919999999999", platform: "", customIcon: "", label: "" },
    { id: "4", url: "https://x.com/yourbrand", platform: "", customIcon: "", label: "" },
    { id: "5", url: "https://linkedin.com/company/yourbrand", platform: "", customIcon: "", label: "" },
    { id: "6", url: "https://t.me/yourbrand", platform: "", customIcon: "", label: "" },
    { id: "7", url: "https://facebook.com/yourbrand", platform: "", customIcon: "", label: "" },
    { id: "8", url: "https://mybrand.example/course", platform: "", customIcon: "", label: "" },
  ];

  const cardLive = renderToStaticMarkup(React.createElement(SocialProfileCard, { ...brand, links: accounts }));
  const cardEmpty = renderToStaticMarkup(React.createElement(SocialProfileCard, { ...brand, links: [] }));

  // Media queries use the viewport, not the outer QA page's width. Render
  // each shot in a fixed-width iframe so 420px is below the ramp, 520px is
  // genuinely at/above 640px, and 600px is genuinely at/above 768px.
  const escapeAttribute = (value) => value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  const shotDocument = (height, markup) => `<!doctype html>
<html lang="en" data-glass="on">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
${css}
  /* The winter scene the card actually sits on, compressed to one gradient:
     the frost layer has something to blur and the light-blue tint reads the
     way it does on Home. */
  html, body { margin: 0; padding: 0; width: 100%; color: #e6e8f0;
    background:
      radial-gradient(120% 90% at 78% 8%, rgba(126, 176, 235, 0.55) 0%, rgba(16, 26, 48, 0) 58%),
      radial-gradient(130% 100% at 12% 100%, rgba(232, 240, 252, 0.5) 0%, rgba(10, 16, 32, 0) 60%),
      linear-gradient(180deg, #0a1020 0%, #0d1526 52%, #131d33 100%); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start;
         width: 100%; height: ${height}px; }
  .wall { display: grid; place-items: center; min-width: 0; height: 100%; border-radius: 2rem;
          border: 1px solid rgba(255,255,255,.12); background: #0F0F12; color: #626a80;
          font: 600 12px/1.4 Inter, ui-sans-serif, system-ui, sans-serif; }
  .slot { position: relative; min-width: 0; height: 100%; }
  .slot > .dc-social-card { position: absolute; inset: 0; }
</style>
</head>
<body>
  <div class="row">
    <div class="wall"><span>feedback wall box · ${height}px</span></div>
    <div class="slot">${markup}</div>
  </div>
${fallbackScript}
</body>
</html>`;

  const shot = (height, viewportWidth, caption, markup) => `
  <figure class="shot">
    <figcaption>${caption} · fixed ${viewportWidth}px viewport</figcaption>
    <div class="frame-shell">
      <iframe class="shot-frame" title="${caption}" width="${viewportWidth}" height="${height}"
        srcdoc="${escapeAttribute(shotDocument(height, markup))}"></iframe>
    </div>
  </figure>`;

  // The app swaps a failed icon image for the neutral globe glyph in React;
  // this sheet is static markup, so the same fallback runs here as a tiny
  // script — the sheet must never show a broken-image mark.
  const generic = SOCIAL_PLATFORMS.generic;
  const fallbackScript = `
  <script>
    (function () {
      var GLYPH = ${JSON.stringify({ viewBox: generic.viewBox, path: generic.path, fillRule: generic.fillRule })};
      function swap(img) {
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", GLYPH.viewBox);
        svg.setAttribute("width", img.getAttribute("width") || 18);
        svg.setAttribute("height", img.getAttribute("height") || 18);
        svg.setAttribute("fill", "currentColor");
        svg.setAttribute("aria-hidden", "true");
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", GLYPH.path);
        if (GLYPH.fillRule) path.setAttribute("fill-rule", GLYPH.fillRule);
        svg.appendChild(path);
        img.replaceWith(svg);
      }
      document.querySelectorAll("img[data-social-icon-image]").forEach(function (img) {
        if (img.complete && img.naturalWidth === 0) swap(img);
        else img.addEventListener("error", function () { swap(img); });
      });
    })();
  </script>
`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Home social profile card — QA sheet (store glass)</title>
<style>
${css}
  :root { color-scheme: dark; }
  body { margin: 0; padding: 24px; background: #08080c; color: #e6e8f0;
         font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  p.lead { color: #9aa1b4; font-size: 13px; line-height: 1.6; margin: 0 0 20px; max-width: 72ch; }
  figure.shot { margin: 0 0 28px; }
  figcaption { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
               color: #9aa1b4; margin-bottom: 8px; }
  .frame-shell { overflow-x: auto; border: 1px solid rgba(255,255,255,.12); border-radius: 10px;
                 background: #08080c; padding: 0; }
  .shot-frame { display: block; max-width: none; border: 0; background: #08080c; }
  .note { border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 14px 16px; margin-bottom: 24px;
          background: rgba(255,255,255,.03); font-size: 12px; line-height: 1.7; color: #b6bccd; }
  .note b { color: #fff; }
  code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 11px; color: #cbd5e1; }
</style>
</head>
<body>
  <h1>Home page social profile card — QA sheet</h1>
  <p class="lead">
    Server-rendered from the shipped component
    (<code>src/home/components/SocialProfileCard.tsx</code>) and stylesheet
    (<code>src/home/components/social-profile-card.css</code>). Left column: the feedback wall box.
    Right column: the social profile card in an identical box.
  </p>
  <div class="note">
    <b>Size parity</b> — both boxes use the height steps the page uses
    (<code>h-[520px] sm:h-[640px] md:h-[740px]</code>) and the same full width, so the two cards
    measure exactly the same at every screen size; the profile block is centred inside the box.<br />
    <b>Internal scaling</b> — the fixed-width frames deliberately use 390px (520 step), 700px
    (640 step, triggering <code>min-width: 640px</code>) and 900px (740 step, triggering
    <code>min-width: 768px</code>) viewports. The internals follow <code>s = boxHeight / 520</code>:
    1.00 → 1.2308 → 1.4231.<br />
    <b>Design (owner, 2026-09-28)</b> — the card now wears the STORE's glass
    (<code>.dc-store-glass</code>, inlined above with <code>src/glass.css</code>): light-blue lens
    <code>rgb(173,216,255)</code> at 26%, frost 18.4px (46% of the 40px ceiling), the pack sheen and
    the white rim — byte-for-byte the surface a store product card paints. What did NOT move: the
    rounding (10px / 12px / 14px at 640 / 768, exactly the ladder the card had before), the
    <code>h-[…]</code> box, the internal metric ramp, the icon hooks and the
    <code>#262626</code> tooltips. The old teal fill, the 4px teal frame and the pale shadow are gone.<br />
    <b>Icons</b> — one link + one icon per account. Instagram, YouTube, WhatsApp, X, LinkedIn, Telegram
    and Facebook render their brand glyph; the last account (<code>mybrand.example</code>) is a brand-new
    URL on a host no glyph ships for, so it renders that site's own <code>/favicon.ico</code> in the same
    uniform white (and falls back to the globe glyph if that image fails). Hover an icon for its tooltip,
    hover the card for the reference lift.
  </div>
${shot(520, 390, "Phone · 520px", cardLive)}
${shot(640, 700, "Small / tablet · 640px", cardLive)}
${shot(740, 900, "Desktop · 740px", cardLive)}
${shot(520, 390, "No account configured · the same glass, nothing to click", cardEmpty)}
</body>
</html>
`;

  mkdirSync(path.join(root, "docs"), { recursive: true });
  const out = path.join(root, "docs", "social-profile-card-qa.html");
  writeFileSync(out, html);
  console.log(`wrote ${path.relative(root, out)} (${(html.length / 1024).toFixed(1)} kB)`);
} finally {
  await vite.close();
}
