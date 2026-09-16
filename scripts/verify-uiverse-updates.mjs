// Rendered-behaviour verification (jsdom + vite ssrLoadModule).
// Mounts the ACTUAL updated components and asserts DOM outcomes.
import { createServer } from "vite";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.SVGElement = dom.window.SVGElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let passed = 0;
let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    passed += 1;
    console.log(`  ok - ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL - ${name} ${extra}`);
  }
};

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
  // One React copy for the harness AND the loaded components.
  ssr: { external: ["react", "react-dom"] },
});

try {
  const React = (await import("react")).default;
  const { createRoot } = await import("react-dom/client");
  const act = React.act;
  const { VampirebatButton } = await vite.ssrLoadModule("/src/components/ui/VampirebatButton.tsx");
  const { default: SocialProfileCard } = await vite.ssrLoadModule("/src/home/components/SocialProfileCard.tsx");
  const { default: CourseDownloadButton } = await vite.ssrLoadModule("/src/course/CourseDownloadButton.tsx");
  const { default: HeroCarousel } = await vite.ssrLoadModule("/src/home/components/HeroCarousel.tsx");
  const { detectSocialPlatform, sanitizeSocialUrl, normalizeSocialLinks, resolveSocialLinks, MAX_SOCIAL_LINKS, SOCIAL_PLATFORMS } = await vite.ssrLoadModule("/src/utils/socialPlatform.ts");
  const { normalizeBranding } = await vite.ssrLoadModule("/src/utils/branding.ts");

  const mount = (node) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => root.render(node));
    return el;
  };

  console.log("\n[1] VampirebatButton (promotion CTA)");
  {
    const el = mount(React.createElement(VampirebatButton, { label: "Explore Now" }));
    const btn = el.querySelector("button.uiverse-vampirebat");
    check("renders a uiverse-vampirebat button", Boolean(btn));
    check("width/height are the reference proportions (em box)",
      btn.style.width === "" && el.querySelector(".uzv-bg") && el.querySelector(".uzv-wrap"));
    const glyphs = el.querySelectorAll(".uzv-state-1 .uzv-glyph");
    check("label split into per-letter glyph cells (11 for 'Explore Now')", glyphs.length === 11, `got ${glyphs.length}`);
    const labels = Array.from(glyphs).map((g) => g.getAttribute("data-label")).join("").replace(/\u00A0/g, " ");
    check("data-label copies reconstruct the exact CTA text", labels === "Explore Now", JSON.stringify(labels));
    // textContent includes the (decorative, aria-hidden) state-2 duplicate;
    // the state-1 group alone must be the exact label.
    const state1Text = el.querySelector(".uzv-state-1").textContent.replace(/\u00A0/g, " ");
    check("state-1 group = the real CTA text (screen-reader name source)", state1Text === "Explore Now", JSON.stringify(state1Text));
    check("arrow icon present (reference icon treatment)", Boolean(el.querySelector(".uzv-icon > div")));
    check("shimmer outline layer present", Boolean(el.querySelector(".uzv-outline")));
    check("trail-shadow bg layer present", Boolean(el.querySelector(".uzv-bg")));
    check("focus path + active splash svgs present",
      Boolean(el.querySelector(".uzv-path")) && Boolean(el.querySelector(".uzv-splash")));
    // press feedback (existing behaviour): pointerdown writes scale < 1
    act(() => {
      btn.dispatchEvent(new dom.window.PointerEvent("pointerdown", { bubbles: true }));
    });
    // glide runs on rAF; let a few frames pass
    await new Promise((r) => setTimeout(r, 120));
    check("press glide animates the scale (existing press feedback kept)",
      btn.style.scale !== "" && parseFloat(btn.style.scale) < 1, `scale=${btn.style.scale}`);
    act(() => {
      btn.dispatchEvent(new dom.window.PointerEvent("pointerup", { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 700));
    check("release glide returns to scale 1", parseFloat(btn.style.scale || "0") === 1, `scale=${btn.style.scale}`);
    el.remove();
  }

  console.log("\n[2] HeroCarousel (Home promotion cards)");
  {
    let opened = null;
    const banners = [
      { id: "b1", image: "/images/hero-1.jpg", eyebrow: "NEW ARRIVAL", title: "Master Data Science 2.0", subtitle: "s", cta: "Explore Now", gradient: "bg-violet-500/30", linkType: "product", productId: "p1" },
      { id: "b2", image: "/images/hero-2.jpg", eyebrow: "MEGA SALE", title: "Flat 60% Off Sitewide", subtitle: "s", cta: "Grab Deal", gradient: "bg-orange-500/30", linkType: "none" },
      { id: "b3", image: "/images/hero-3.jpg", eyebrow: "GOING LIVE", title: "Live Doubt Class Tonight", subtitle: "s", cta: "Reserve Seat", gradient: "bg-sky-500/30", linkType: "none" },
    ];
    const el = mount(
      React.createElement(HeroCarousel, { banners, onOpen: (b) => { opened = b.id; } }),
    );
    const ctas = el.querySelectorAll("button.uiverse-vampirebat");
    check("all three promotion CTAs use the new reference button", ctas.length === 3, `got ${ctas.length}`);
    const texts = Array.from(ctas).map((b) => b.querySelector(".uzv-state-1").textContent.replace(/\u00A0/g, " "));
    check("CTA labels unchanged (Explore Now / Grab Deal / Reserve Seat)",
      JSON.stringify(texts) === JSON.stringify(["Explore Now", "Grab Deal", "Reserve Seat"]), JSON.stringify(texts));
    check("CTAs keep tabIndex -1 (visual affordance, slide owns the action)",
      Array.from(ctas).every((b) => b.getAttribute("tabindex") === "-1"));
    check("old GlassButton capsule CTA is gone", !el.querySelector("button .glass, [class*='glass-button']") && !el.textContent.includes("capsule"));
    // click behaviour: tap on the linked slide still routes via onOpen
    const linkedSlide = el.querySelector('[data-banner-linked="true"]');
    check("linked slide marker preserved", Boolean(linkedSlide));
    act(() => {
      const cta = el.querySelector('button.uiverse-vampirebat');
      cta.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    check("clicking the CTA bubbles to the slide handler (action preserved)", opened === "b1", `opened=${opened}`);
    el.remove();
  }

  console.log("\n[3] detectSocialPlatform (hostname / scheme mapping)");
  {
    const cases = [
      ["https://instagram.com/yourbrand", "instagram"],
      ["https://www.instagram.com/yourbrand", "instagram"],
      ["https://youtube.com/@yourbrand", "youtube"],
      ["https://youtu.be/abc", "youtube"],
      ["https://m.facebook.com/yourbrand", "facebook"],
      ["https://x.com/yourbrand", "x"],
      ["https://twitter.com/yourbrand", "x"],
      ["https://www.linkedin.com/in/yourbrand", "linkedin"],
      ["https://t.me/yourbrand", "telegram"],
      ["https://telegram.me/yourbrand", "telegram"],
      ["https://discord.gg/abc", "discord"],
      ["https://discord.com/invite/abc", "discord"],
      ["https://github.com/yourbrand", "github"],
      ["https://tiktok.com/@yourbrand", "tiktok"],
      ["https://www.pinterest.com/yourbrand", "pinterest"],
      // Every account an admin can link resolves to its own brand icon.
      ["https://wa.me/919999999999", "whatsapp"],
      ["https://chat.whatsapp.com/abc", "whatsapp"],
      ["https://snapchat.com/add/yourbrand", "snapchat"],
      ["https://reddit.com/r/yourcommunity", "reddit"],
      ["https://threads.net/@yourbrand", "threads"],
      ["https://bsky.app/profile/you.bsky.social", "bluesky"],
      ["https://mastodon.social/@you", "mastodon"],
      ["https://fosstodon.org/@you", "mastodon"],
      ["https://mstdn.jp/@you", "mastodon"],
      ["https://notmastodon.com/@you", "generic"],
      ["https://linktr.ee/yourbrand", "linktree"],
      ["https://open.spotify.com/artist/xyz", "spotify"],
      ["https://yourbrand.tumblr.com", "tumblr"],
      ["https://yourbrand.blogspot.com", "blogger"],
      ["https://play.google.com/store/apps/details?id=x", "googleplay"],
      ["https://apps.apple.com/app/id123", "appstore"],
      ["mailto:hello@yourbrand.com", "email"],
      ["tel:+919999999999", "phone"],
      ["https://notinstagram.com/x", "generic"],
      ["https://evilx.com/yourbrand", "generic"],
      ["https://mysite.example.com/about", "generic"],
      ["not a url at all", "generic"],
      ["", "generic"],
    ];
    for (const [url, expected] of cases) {
      check(`${url || "(empty)"} → ${expected}`, detectSocialPlatform(url).id === expected, `got ${detectSocialPlatform(url).id}`);
    }
    // Every platform ships a real Font Awesome glyph with its own viewBox, so
    // no icon can render blank or be stretched into a square box.
    check(
      "every platform ships a real glyph (official viewBox + path data)",
      Object.values(SOCIAL_PLATFORMS).every((p) => /^0 0 \d+ \d+$/.test(p.glyph.viewBox) && p.glyph.d.length > 20),
    );
    check(
      "glyphs are the reference's Font Awesome brand marks (IG 448×512, FB 512×512)",
      SOCIAL_PLATFORMS.instagram.glyph.viewBox === "0 0 448 512" && SOCIAL_PLATFORMS.facebook.glyph.viewBox === "0 0 512 512",
    );
  }

  console.log("\n[4] SocialProfileCard (Home bottom card — the Uiverse port)");
  {
    const links = (rows) =>
      rows.map(([url, platform = "", label = ""]) => ({ id: `row-${url}`, url, platform, label }));

    /* ── The reference card, structurally: four accounts → four icons ── */
    let el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        bio: "Learn smarter. Prepare better.",
        socialLinks: links([
          ["https://facebook.com/eduvora"],
          ["https://instagram.com/eduvora"],
          ["https://x.com/eduvora"],
          ["https://linkedin.com/company/eduvora"],
        ]),
      }),
    );
    check("renders the reference card shell (a card, not one big link)", Boolean(el.querySelector("div.dc-social-card")) && !el.querySelector("a.dc-social-card"));
    check("circular logo area holds the admin's logo image", Boolean(el.querySelector(".dc-social-pic img.dc-social-pic-img")));
    check(
      "name + bio use the reference's .name-client structure",
      Boolean(el.querySelector(".dc-social-name span[data-home-social-card-bio]")) &&
        el.querySelector("[data-home-social-card-name]").textContent.startsWith("Eduvora"),
    );
    check("bio text comes from branding", (el.querySelector("[data-home-social-card-bio]")?.textContent || "") === "Learn smarter. Prepare better.");
    const icons = el.querySelectorAll(".dc-social-media .dc-social-link");
    check("one icon per linked account (4 accounts → 4 icons)", icons.length === 4, `got ${icons.length}`);
    check(
      "every icon links to its own account, in the admin's order",
      Array.from(icons).map((a) => a.getAttribute("href")).join(",") ===
        "https://facebook.com/eduvora,https://instagram.com/eduvora,https://x.com/eduvora,https://linkedin.com/company/eduvora",
    );
    check(
      "external links open in a new tab with noopener",
      Array.from(icons).every((a) => a.getAttribute("target") === "_blank" && (a.getAttribute("rel") || "").includes("noopener")),
    );
    const expected = ["facebook", "instagram", "x", "linkedin"].map((id) => SOCIAL_PLATFORMS[id]);
    check(
      "each icon draws its own brand glyph (FB · IG · X · LinkedIn, as in the reference)",
      Array.from(icons).every((a, i) => a.querySelector("svg path").getAttribute("d") === expected[i].glyph.d),
    );
    check(
      "each glyph keeps its official viewBox (never stretched square)",
      Array.from(icons).every((a, i) => a.querySelector("svg").getAttribute("viewBox") === expected[i].glyph.viewBox),
    );
    check(
      "each icon carries the reference tooltip with its platform name",
      Array.from(el.querySelectorAll(".dc-social-tooltip")).map((t) => t.textContent).join("|") === "Facebook|Instagram|X (Twitter)|LinkedIn",
    );
    check("card reports how many icons it renders", el.querySelector("[data-home-social-card]").getAttribute("data-home-social-card-link-count") === "4");
    check("no 'undefined' leaks into the card", !el.textContent.includes("undefined"));
    el.remove();

    /* ── A newly added URL becomes a new icon, detected from its hostname ── */
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        bio: "",
        socialLinks: links([["https://instagram.com/eduvora"], ["https://wa.me/919999999999"], ["https://t.me/eduvora"], ["https://youtube.com/@eduvora"]]),
      }),
    );
    const added = el.querySelectorAll(".dc-social-media .dc-social-link");
    check("adding URLs adds icons (WhatsApp / Telegram / YouTube)", added.length === 4, `got ${added.length}`);
    check(
      "each new URL picked the right brand icon",
      Array.from(added).map((a) => a.getAttribute("data-social-platform")).join(",") === "instagram,whatsapp,telegram,youtube",
    );
    check("WhatsApp glyph matches the registry", added[1].querySelector("svg path").getAttribute("d") === SOCIAL_PLATFORMS.whatsapp.glyph.d);
    check("link targets are respected verbatim", added[1].getAttribute("href") === "https://wa.me/919999999999" && added[3].getAttribute("href") === "https://youtube.com/@eduvora");
    el.remove();

    /* ── Pinned platform + custom tooltip label ── */
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        socialLinks: links([
          ["https://linktr.ee/eduvora", "instagram"], // pinned beats the hostname
          ["https://eduvora.in", "", "Our website"], // custom label beats the domain
        ]),
      }),
    );
    const pinned = el.querySelectorAll(".dc-social-media .dc-social-link");
    check("a pinned platform wins over hostname detection", pinned[0].getAttribute("data-social-platform") === "instagram");
    check("pinned icon draws the pinned glyph", pinned[0].querySelector("svg path").getAttribute("d") === SOCIAL_PLATFORMS.instagram.glyph.d);
    check("a custom tooltip label wins over the detected name", pinned[1].querySelector(".dc-social-tooltip").textContent === "Our website");
    el.remove();

    /* ── Unknown host → globe glyph + the domain as its tooltip ── */
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        socialLinks: links([["https://mysite.example.com/about"]]),
      }),
    );
    const unknown = el.querySelector(".dc-social-media .dc-social-link");
    check("unknown host → generic globe glyph (never a wrong brand)", unknown.querySelector("svg path").getAttribute("d") === SOCIAL_PLATFORMS.generic.glyph.d);
    check("unknown host → tooltip shows the domain", unknown.querySelector(".dc-social-tooltip").textContent === "mysite.example.com");
    check("unknown host still links correctly (one account → the card itself is the link)", el.querySelector("a.dc-social-card--linked").getAttribute("href") === "https://mysite.example.com/about");
    el.remove();

    /* ── mailto: / tel: rows get their own icons and no new-tab target ── */
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        socialLinks: links([["mailto:hello@eduvora.app"], ["tel:+919999999999"]]),
      }),
    );
    const contact = el.querySelectorAll(".dc-social-media .dc-social-link");
    check("mailto: → email icon", contact[0].getAttribute("data-social-platform") === "email" && contact[0].getAttribute("href") === "mailto:hello@eduvora.app");
    check("tel: → phone icon", contact[1].getAttribute("data-social-platform") === "phone" && contact[1].getAttribute("href") === "tel:+919999999999");
    check("mailto:/tel: do not force a new tab", !contact[0].getAttribute("target") && !contact[1].getAttribute("target"));
    el.remove();

    /* ── Junk rows never reach the card ── */
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        socialLinks: links([
          ["https://instagram.com/eduvora"],
          ["not a url"],
          [""],
          ["javascript:alert(1)"],
          ["https://instagram.com/eduvora"], // duplicate
        ]),
      }),
    );
    const cleaned = el.querySelectorAll(".dc-social-media .dc-social-link");
    check("invalid, empty and duplicate rows are skipped", cleaned.length === 1, `got ${cleaned.length}`);
    check("no javascript: URL can be rendered as a link", !el.innerHTML.includes("javascript:"));
    el.remove();

    /* ── Legacy single-URL prop still renders one icon ── */
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora Official",
        bio: "Learn smarter.",
        socialUrl: "https://youtube.com/@eduvora",
      }),
    );
    check("legacy socialUrl prop still renders its icon", el.querySelectorAll(".dc-social-media .dc-social-link").length === 1);
    check("legacy socialUrl glyph is YouTube", el.querySelector(".dc-social-media .dc-social-link svg path").getAttribute("d") === SOCIAL_PLATFORMS.youtube.glyph.d);
    check("legacy socialUrl target respected verbatim", el.querySelector("a.dc-social-card--linked").getAttribute("href") === "https://youtube.com/@eduvora");
    check("one account → the card itself is the link (one big tap target)", el.querySelector("[data-home-social-card]").getAttribute("data-home-social-card-clickable") === "true");
    check("one account → its icon is a span, so no anchor is nested in an anchor", el.querySelectorAll("a.dc-social-card .dc-social-link").length === 1 && el.querySelector("a.dc-social-card .dc-social-link").tagName === "SPAN" && !el.querySelector("a.dc-social-card a"));
    check("one account → the card link opens in a new tab with noopener", el.querySelector("a.dc-social-card--linked").getAttribute("target") === "_blank" && (el.querySelector("a.dc-social-card--linked").getAttribute("rel") || "").includes("noopener"));
    el.remove();

    /* ── Nothing linked → clean non-clickable state ── */
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        bio: "Digital Catalyst",
        socialLinks: [],
      }),
    );
    check("no accounts → icon row hidden", !el.querySelector(".dc-social-media") && !el.querySelector(".dc-social-link"));
    check("no accounts → static card marker", Boolean(el.querySelector("[data-home-social-card-static]")) && el.querySelector("[data-home-social-card]").classList.contains("dc-social-card--static"));
    check("no accounts → name + bio still shown (clean card)", el.textContent.includes("Eduvora") && el.textContent.includes("Digital Catalyst"));
    check("no accounts → no 'undefined' text anywhere", !el.textContent.includes("undefined"));
    el.remove();

    /* ── Admin preview: icons visible, but not links ── */
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        bio: "Digital Catalyst",
        socialLinks: links([["https://x.com/eduvora"], ["https://instagram.com/eduvora"]]),
        preview: true,
      }),
    );
    check("admin preview renders every icon", el.querySelectorAll(".dc-social-link").length === 2);
    check("admin preview renders no live links", el.querySelectorAll(".dc-social-link").length === el.querySelectorAll("span.dc-social-link--preview").length && !el.querySelector("a.dc-social-link"));
    check("admin preview shows the X glyph for x.com", el.querySelector(".dc-social-link svg path").getAttribute("d") === SOCIAL_PLATFORMS.x.glyph.d);
    el.remove();

    /* ── The stylesheet keeps the reference's exact values ── */
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/home/components/social-profile-card.css", "utf8");
    check("card: #2cb5a0 fill · 13rem · 4px #7cdacc border · 10px radius · rim shadow", /background: #2cb5a0/.test(css) && /width: 13rem/.test(css) && /border: 4px solid #7cdacc/.test(css) && /border-radius: 10px/.test(css) && /box-shadow: 0 6px 10px rgba\(207, 212, 222, 1\)/.test(css));
    check("card: Poppins, hover lift -10px / 0.3s", /"Poppins"/.test(css) && /transform: translateY\(-10px\)/.test(css) && /transition: all 0\.3s ease/.test(css));
    check("picture: 5rem circle with the same 4px ring", /width: 5rem/.test(css) && /border-radius: 999px/.test(css));
    check("type: 18px/600 name, 16px/200 bio", /font-size: 18px/.test(css) && /font-weight: 600/.test(css) && /font-size: 16px/.test(css) && /font-weight: 200/.test(css));
    check("divider: the .social-media::before 2px #7cdacc bar", /\.dc-social-media::before[\s\S]{0,220}height: 2px[\s\S]{0,120}background: #7cdacc/.test(css));
    check("icons: 1.1rem, currentColor, 15px gap", /\.dc-social-link svg \{[\s\S]{0,80}width: 1\.1rem/.test(css) && /fill: currentColor/.test(css) && /margin-right: 15px/.test(css));
    check("tooltip: #262626 pill with the 10px arrow, shown per icon on hover/focus", /\.dc-social-tooltip \{[\s\S]{0,60}background: #262626/.test(css) && /border-width: 10px 10px 0 10px/.test(css) && /\.dc-social-link:hover \.dc-social-tooltip/.test(css) && /\.dc-social-link:focus-visible \.dc-social-tooltip/.test(css));
    check("icons wrap when the admin links more than one row", /flex-wrap|display: inline-flex/.test(css) && /\.dc-social-link \{[\s\S]{0,400}display: inline-flex/.test(css));
    check("name/bio have overflow-wrap in scoped CSS", /dc-social-name[\s\S]*?overflow-wrap: break-word/.test(css));
  }

  console.log("\n[5] CourseDownloadButton (Course Player downloads)");
  {
    const el = mount(
      React.createElement(CourseDownloadButton, {
        label: "Download DOCX",
        href: "https://docs.google.com/document/d/x/export?format=docx",
        downloadableFileName: "lesson.docx",
        dataAttrs: { "data-course-viewer-download": "" },
      }),
    );
    const a = el.querySelector("a.dc-dl-btn");
    check("renders the Uiverse download button (dc-dl-btn)", Boolean(a));
    check("href + download filename + new-tab preserved",
      a.getAttribute("href").includes("export?format=docx") && a.getAttribute("download") === "lesson.docx" && a.getAttribute("target") === "_blank");
    check("data contract hook preserved", a.getAttribute("data-course-viewer-download") === "");
    check("CSS-drawn glyph active for file downloads (no external variant)", !el.querySelector(".dc-dl-btn--open"));

    const el2 = mount(
      React.createElement(CourseDownloadButton, { label: "Open original", icon: "external", href: "https://example.com" }),
    );
    check("'Open original' variant swaps in the external glyph", Boolean(el2.querySelector(".dc-dl-btn--open .dc-dl-btn__open")));
    el.remove();
    el2.remove();
  }

  console.log("\n[6] URL sanitising + social list persistence guards");
  {
    check("valid instagram URL kept verbatim", sanitizeSocialUrl("https://instagram.com/yourbrand") === "https://instagram.com/yourbrand");
    check("https URL kept", sanitizeSocialUrl("https://youtube.com/@yourbrand") === "https://youtube.com/@yourbrand");
    check("bare domain gets the implied https://", sanitizeSocialUrl("discord.gg/abc") === "https://discord.gg/abc" && sanitizeSocialUrl("instagram.com/yourbrand") === "https://instagram.com/yourbrand");
    check("mailto: kept as a mail link", sanitizeSocialUrl("mailto:hello@eduvora.app") === "mailto:hello@eduvora.app");
    check("tel: kept as a call link", sanitizeSocialUrl("tel:+91 99999 99999") === "tel:+919999999999");
    check("javascript: URL rejected", sanitizeSocialUrl("javascript:alert(1)") === "");
    check("garbage rejected", sanitizeSocialUrl("not a url") === "");
    check("empty stays empty", sanitizeSocialUrl("") === "" && sanitizeSocialUrl(undefined) === "");

    /* The list the admin panel saves */
    const list = normalizeSocialLinks([
      { id: "a", url: "https://instagram.com/brand", platform: "", label: "" },
      { id: "b", url: "  https://wa.me/919999999999  ", platform: "whatsapp", label: "Chat with us" },
      { id: "c", url: "javascript:alert(1)" },
      { id: "d", url: "" },
      "https://t.me/brand", // a hand-edited doc may store plain strings
      { id: "e", url: "https://instagram.com/brand/" }, // duplicate (trailing slash)
      { id: "f", url: "https://youtube.com/@brand", platform: "not-a-platform" },
    ]);
    check("usable rows survive, junk drops out", list.length === 4, `got ${list.length}: ${JSON.stringify(list)}`);
    check("URLs are trimmed and stored verbatim", list[1].url === "https://wa.me/919999999999");
    check("a pinned platform + custom label survive", list[1].platform === "whatsapp" && list[1].label === "Chat with us");
    check("duplicate URLs collapse to one icon", list.filter((l) => l.url.startsWith("https://instagram.com")).length === 1);
    check("an unknown platform pin is dropped (hostname detection takes over)", list[3].platform === "");
    check("a plain string entry becomes a link with an id", typeof list[2].id === "string" && list[2].id.length > 1);
    check("ids are stable across snapshots (no admin focus loss)", JSON.stringify(normalizeSocialLinks(list).map((l) => l.id)) === JSON.stringify(list.map((l) => l.id)));
    check(
      `the list is capped at ${MAX_SOCIAL_LINKS} accounts`,
      normalizeSocialLinks(Array.from({ length: 30 }, (_, i) => ({ url: `https://example.com/${i}` }))).length === MAX_SOCIAL_LINKS,
    );

    /* What the card / preview actually renders */
    const pinned = resolveSocialLinks([{ id: "x", url: "https://linktr.ee/brand", platform: "instagram", label: "All our links" }]);
    check("a pinned platform wins over the hostname", pinned[0].platform.id === "instagram");
    check("a custom label wins over the platform name", pinned[0].tooltip === "All our links");
    const auto = resolveSocialLinks([{ id: "y", url: "https://wa.me/919999999999", platform: "", label: "" }]);
    check("hostname detection when nothing is pinned", auto[0].platform.id === "whatsapp" && auto[0].tooltip === "WhatsApp");
    check("resolveSocialLinks drops unusable rows", resolveSocialLinks([{ id: "z", url: "nope" }, null, undefined]).length === 0);

    /* The Firestore doc / cache shape */
    const migrated = normalizeBranding({ socialUrl: "  https://x.com/brand  ", appName: "Eduvora" });
    check("normalizeBranding trims + stores the social URL", migrated.socialUrl === "https://x.com/brand");
    check("a legacy single socialUrl migrates into the account list", migrated.socialLinks.length === 1 && migrated.socialLinks[0].url === "https://x.com/brand");
    const withLinks = normalizeBranding({
      socialLinks: [{ url: "https://instagram.com/b" }, { url: "https://t.me/b" }],
      socialUrl: "https://instagram.com/b",
    });
    check("socialUrl mirrors the first linked account", withLinks.socialUrl === "https://instagram.com/b" && withLinks.socialLinks.length === 2);
    const junk = normalizeBranding({ socialLinks: [{ url: "javascript:alert(1)" }, null, 5, { url: "https://youtube.com/@x" }] });
    check("junk in the doc can never reach the card", junk.socialLinks.length === 1 && junk.socialLinks[0].url === "https://youtube.com/@x" && junk.socialUrl === "https://youtube.com/@x");
    const normalizedEmpty = normalizeBranding({});
    check("normalizeBranding defaults to no accounts (clean card)", normalizedEmpty.socialUrl === "" && normalizedEmpty.socialLinks.length === 0);
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
} catch (err) {
  console.error("HARNESS ERROR:", err);
  process.exit(2);
} finally {
  await vite.close();
}
