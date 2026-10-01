// scripts/render-profile-qa-page.mjs
//
// Builds `docs/profile-card-qa.html` — a self-contained visual QA sheet for the
// Profile page (owner brief 2026-09-30: "home page ke card ka design … profile
// ke cards per apply karo … ekadam clean professional aur classic").
//
// It is not a mock-up: the markup is the SHIPPED `ProfileLayout` rendered
// through Vite's SSR pipeline with realistic mock data, and the CSS inlined is
// the stylesheet the build actually emits (dist/assets/*.css — Tailwind plus
// every material sheet), so what the sheet shows is what the app paints.
//
// Media queries resolve against the viewport, not the sheet, so each shot is a
// fixed-width iframe (390px phone, 720px tablet, 1280px desktop) — the same
// device the breakpoint was written for.
//
// Run: npm run build && node scripts/render-profile-qa-page.mjs

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const readBuiltCss = () => {
  const assets = path.join(root, "dist", "assets");
  const files = existsSync(assets) ? readdirSync(assets).filter((name) => name.endsWith(".css")) : [];
  if (!files.length) throw new Error("dist/assets/*.css not found — run `npm run build` first.");
  return files.map((name) => readFileSync(path.join(assets, name), "utf8")).join("\n");
};

const vite = await createServer({
  root,
  configFile: path.join(root, "vite.config.ts"),
  logLevel: "error",
  server: { middlewareMode: true },
});

try {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: ProfileLayout } = await vite.ssrLoadModule("/src/profile/ProfileLayout.tsx");
  const { ProfileCard } = await vite.ssrLoadModule("/src/profile/ProfileCard.tsx");

  const css = readBuiltCss();

  // Stand-ins for the two shared cards the page mounts (My Day + AI quota):
  // the same surface + ramp the real components render after the copy diet.
  const myDayCard = React.createElement(
    ProfileCard,
    { key: "myday", "data-myday-allowance-card": "true", "data-myday-allowance-state": "free" },
    React.createElement(
      "div",
      { className: "flex items-center gap-3" },
      React.createElement("span", { className: "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white" }, "☀"),
      React.createElement(
        "div",
        { className: "min-w-0" },
        React.createElement("p", { className: "dc-profile-card-accent" }, "My Day allowance · Free"),
        React.createElement("h3", { className: "dc-profile-card-title mt-0.5" }, "2 of 3 free creations left today"),
      ),
    ),
    React.createElement(
      "div",
      { className: "dc-profile-bar mt-3" },
      React.createElement("div", { className: "h-full w-1/3 rounded-full bg-indigo-500" }),
    ),
    React.createElement("p", { className: "dc-profile-card-meta mt-2" }, "Resets in 5h 20m · 12:00 AM"),
  );

  const aiQuotaCard = React.createElement(
    ProfileCard,
    { key: "ai", "data-ai-quota-card": "true" },
    React.createElement(
      "div",
      { className: "flex items-center gap-3" },
      React.createElement("span", { className: "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30" }, "AI"),
      React.createElement(
        "div",
        { className: "min-w-0" },
        React.createElement("p", { className: "dc-profile-card-accent" }, "School AI allowance · Premium Plan"),
        React.createElement("h3", { className: "dc-profile-card-title mt-0.5" }, "AI tokens today · 2M / 5M used"),
      ),
    ),
    React.createElement(
      "div",
      { className: "dc-profile-bar mt-3" },
      React.createElement("div", { className: "h-full w-2/5 rounded-full bg-violet-500" }),
    ),
    React.createElement("p", { className: "dc-profile-card-meta mt-2" }, "3M left · resets in 5h 20m · 12:00 AM"),
  );

  const props = {
    name: "Aarav Sharma",
    email: "aarav.sharma@eduvora.app",
    bio: "Product engineer and lifelong learner. Building calm tools for curious minds — and finishing one course every month.",
    initials: "AS",
    memberSince: "March 2024",
    onEdit: () => undefined,
    membership: {
      tier: "premium",
      subscriber: true,
      active: true,
      expired: false,
      tierLabel: "Premium",
      planLabel: "Premium Plan",
      subscription: { status: "active", expiresAt: Date.now() + 18 * 86400000, cycle: "yearly", planId: "premium", reminderOptOut: false },
    },
    membershipBadge: React.createElement(
      "span",
      {
        "data-profile-membership-status": "active",
        className: "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-200 ring-1 ring-emerald-400/30",
      },
      "Active",
    ),
    onOpenPlans: () => undefined,
    onOpenSubscriberExperience: () => undefined,
    stats: {
      ownedCount: 7,
      favoriteCount: 12,
      cartCount: 2,
      onOpenPurchases: () => undefined,
      onOpenFavorites: () => undefined,
      onOpenCart: () => undefined,
    },
    referral: { code: "AARAV24", used: false, onCopy: () => undefined },
    renewal: {
      tier: "premium",
      subscription: { status: "active", expiresAt: Date.now() + 18 * 86400000, cycle: "yearly", planId: "premium", reminderOptOut: false },
      now: Date.now(),
      onRenew: () => undefined,
      onToggleReminders: () => undefined,
    },
    myDayCard,
    aiQuotaCard,
    onOpenStudyLibrary: () => undefined,
    library: {
      items: [
        { id: "1", title: "Mastering React in 2026", image: "" },
        { id: "2", title: "The Product Designer's Toolkit", image: "" },
        { id: "3", title: "Data Structures, Simply Explained", image: "" },
      ],
      ownedCount: 7,
      onOpenCourse: () => undefined,
      onOpenPurchases: () => undefined,
    },
    onOpenSettings: () => undefined,
    saving: false,
    onLogout: () => undefined,
    isAdmin: true,
    onOpenDashboard: () => undefined,
  };

  const layout = renderToStaticMarkup(React.createElement(ProfileLayout, props));
  // The image-less course rows in the QA sheet keep their box: a transparent
  // 1×1 GIF keeps the <img> real (and its ring) without a network fetch.
  const blank = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  const markup = layout.replaceAll('src=""', `src="${blank}"`);

  // Each shot is its own document so the width is a real viewport width. The
  // document is written into the frame from the parent rather than shipped as
  // an inline attribute, so the ~600 kB stylesheet exists once in the file
  // instead of once per shot.
  const shotFrame = (label, width, height) => `
  <figure class="shot">
    <figcaption>${label}</figcaption>
    <iframe class="shot-frame" data-shot title="${label}" width="${width}" height="${height}"></iframe>
  </figure>`;

  const inject = `
  (function () {
    var CSS = __CSS__;
    var MARKUP = __MARKUP__;
    var CHROME = [
      "html{color-scheme:dark}",
      "html,body{margin:0;padding:0;width:100%}",
      "body{background:radial-gradient(120% 80% at 50% 0%,#1d2a4a 0%,rgba(13,20,36,0) 60%),linear-gradient(180deg,#0a1020 0%,#0d1526 52%,#131d33 100%)}"
    ].join("");
    var PAGE = '<div data-profile-page class="min-h-screen text-white">'
      + '<main data-profile-content class="relative z-[1]">' + MARKUP + '</main></div>';
    var FIT = '<script>(function(){function f(){var h=document.documentElement.scrollHeight;'
      + 'if(window.frameElement)window.frameElement.style.height=(h+2)+"px";}'
      + 'window.addEventListener("load",f);setTimeout(f,60);setTimeout(f,400);})();<\\/script>';
    var DOC = '<!doctype html><html lang="en" data-glass="on"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<style>' + CSS + '</style><style>' + CHROME + '</style></head><body>'
      + PAGE + FIT + '</body></html>';
    Array.prototype.forEach.call(document.querySelectorAll("iframe[data-shot]"), function (frame) {
      var doc = frame.contentDocument;
      doc.open(); doc.write(DOC); doc.close();
      frame.style.visibility = "visible";
    });
  })();
  `.replace("__CSS__", JSON.stringify(css).replaceAll("</", "<\\/"))
    .replace("__MARKUP__", JSON.stringify(markup).replaceAll("</", "<\\/"));



  const html = `<!doctype html>
<html lang="en" data-glass="on">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Profile page — Home card material QA</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 28px; font-family: "Poppins", Inter, ui-sans-serif, system-ui, sans-serif; background: #07070d; color: #f4f4f6; }
  .sheet-head { max-width: 1400px; margin: 0 auto 22px; }
  .sheet-head h1 { font-size: 20px; margin: 0 0 6px; }
  .sheet-head p { margin: 0; color: rgba(255,255,255,.62); font-size: 13px; line-height: 1.6; }
  .row { display: flex; flex-wrap: wrap; gap: 26px; align-items: flex-start; justify-content: center; max-width: 1400px; margin: 0 auto; }
  .shot { margin: 0; }
  .shot figcaption { font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: rgba(255,255,255,.55); margin-bottom: 10px; text-align: center; }
  .shot-frame { display: block; border: 1px solid rgba(255,255,255,.12); border-radius: 26px; background: transparent; visibility: hidden; }
  @media (max-width: 820px) { .shot-frame { max-width: 100%; } }
</style>
</head>
<body>
  <div class="sheet-head">
    <h1>Profile page — Home's card, Home's type, less text</h1>
    <p>Shipped <code>ProfileLayout</code> rendered through Vite SSR over the built stylesheet, in real fixed-width viewports. Owner brief 2026-09-30: every card is the
    Home page's card (<code>.dc-scene-plate</code> · tint 0.25 · blur 0 · radius 24 · Home's copy ramp) and the page's long copy is gone.</p>
  </div>
  <div class="row">
    ${shotFrame("Phone · 390px", 390, 1500)}
    ${shotFrame("Tablet · 720px", 720, 1100)}
    ${shotFrame("Desktop · 1280px", 1280, 900)}
  </div>
  <script>${inject}</script>
</body>
</html>`;

  const out = path.join(root, "docs", "profile-card-qa.html");
  writeFileSync(out, html);
  console.log(`wrote ${path.relative(root, out)} (${Math.round(html.length / 1024)} kB)`);
} finally {
  await vite.close();
}
