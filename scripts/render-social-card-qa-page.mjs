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

  const css = readFileSync(path.join(root, "src/home/components/social-profile-card.css"), "utf8");
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
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
${css}
  html, body { margin: 0; padding: 0; width: 100%; background: #08080c; color: #e6e8f0; }
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
<title>Home social profile card — QA sheet (grumpy-ape-40 port)</title>
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
    (<code>h-[420px] sm:h-[520px] md:h-[600px]</code>) and the same full width, so the two cards
    measure exactly the same at every screen size; the profile block is centred inside the box.<br />
    <b>Internal scaling</b> — the fixed-width frames deliberately use 390px (420 step), 700px
    (520 step, triggering <code>min-width: 640px</code>) and 900px (600 step, triggering
    <code>min-width: 768px</code>) viewports. The internals follow <code>s = boxHeight / 420</code>:
    1.00 → 1.238 → 1.4286.<br />
    <b>Design</b> — every value of the reference card is kept at the 420px baseline: <code>#2cb5a0</code>
    fill, 4px <code>#7cdacc</code> ring, 10px radius, <code>0 6px 10px rgba(207,212,222,1)</code>
    shadow, 5rem circular logo, 18px/16px type, 2px divider with 20px gaps, 1.1rem icons 15px apart,
    <code>#262626</code> tooltip with the 10px arrow, −10px hover lift over 0.3s.<br />
    <b>Icons</b> — one link + one icon per account. Instagram, YouTube, WhatsApp, X, LinkedIn, Telegram
    and Facebook render their brand glyph; the last account (<code>mybrand.example</code>) is a brand-new
    URL on a host no glyph ships for, so it renders that site's own <code>/favicon.ico</code> in the same
    uniform white (and falls back to the globe glyph if that image fails). Hover an icon for its tooltip,
    hover the card for the reference lift.
  </div>
${shot(420, 390, "Phone · 420px", cardLive)}
${shot(520, 700, "Small / tablet · 520px", cardLive)}
${shot(600, 900, "Desktop · 600px", cardLive)}
${shot(420, 390, "No account configured · card stays clickable-free", cardEmpty)}
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
