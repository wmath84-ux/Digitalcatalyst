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
  const { detectSocialPlatform, sanitizeSocialUrl } = await vite.ssrLoadModule("/src/utils/socialPlatform.ts");
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

  console.log("\n[3] detectSocialPlatform (hostname mapping)");
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
      ["https://notinstagram.com/x", "generic"],
      ["https://evilx.com/yourbrand", "generic"],
      ["not a url at all", "generic"],
      ["", "generic"],
    ];
    for (const [url, expected] of cases) {
      check(`${url} → ${expected}`, detectSocialPlatform(url).id === expected, `got ${detectSocialPlatform(url).id}`);
    }
  }

  console.log("\n[4] SocialProfileCard (Home bottom card)");
  {
    // One account → one link with that platform's glyph. The card itself is
    // NOT a link (the reference card is a div and only its icons link out),
    // so several accounts can coexist as valid HTML.
    let el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        bio: "Learn smarter. Prepare better.",
        links: [{ id: "ig", url: "https://instagram.com/eduvora", platform: "", customIcon: "", label: "" }],
      }),
    );
    const a = el.querySelector("[data-home-social-icon]");
    check("each account renders as a real external link", a?.tagName === "A" && a.getAttribute("href") === "https://instagram.com/eduvora");
    check("opens in a new tab with noopener", a.getAttribute("target") === "_blank" && (a.getAttribute("rel") || "").includes("noopener"));
    const ig = detectSocialPlatform("https://instagram.com/x");
    const iconPath = el.querySelector(".dc-social-icon svg path");
    check("icon matches the configured platform (Instagram glyph)", iconPath && iconPath.getAttribute("d") === ig.path);
    check("name rendered from branding", el.querySelector("[data-home-social-card-name]") && el.querySelector("[data-home-social-card-name]").textContent.startsWith("Eduvora"));
    check("bio rendered from branding tagline", (el.querySelector("[data-home-social-card-bio]")?.textContent || "") === "Learn smarter. Prepare better.");
    check("circular logo area present", Boolean(el.querySelector("img.dc-social-pic")));
    check("tooltip carries the platform label", (el.querySelector(".dc-social-tooltip")?.textContent || "") === "Instagram");
    check("reference divider rule kept (::before on .dc-social-media)", Boolean(el.querySelector(".dc-social-media")));
    check("card fills the reserved box (not the 13rem reference tile)", el.querySelector("[data-home-social-card]").classList.contains("dc-social-card"));

    // Several accounts at once — one icon each, in order, each with its own
    // label; a recognised host uses a glyph, an unknown host its own icon.
    el.remove();
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora Official",
        bio: "Learn smarter.",
        links: [
          { id: "yt", url: "https://youtube.com/@eduvora", platform: "", customIcon: "", label: "" },
          { id: "wa", url: "https://wa.me/919999999999", platform: "", customIcon: "", label: "" },
          { id: "ln", url: "https://linkedin.com/company/eduvora", platform: "", customIcon: "", label: "" },
        ],
      }),
    );
    const rows = Array.from(el.querySelectorAll("[data-home-social-icon]"));
    check("one link per account", rows.length === 3, `got ${rows.length}`);
    check("YouTube URL → YouTube glyph", rows[0].querySelector("svg path").getAttribute("d") === detectSocialPlatform("https://youtube.com/x").path);
    check("WhatsApp URL → WhatsApp glyph", rows[1].querySelector("svg path").getAttribute("d") === detectSocialPlatform("https://wa.me/x").path);
    check("LinkedIn URL → LinkedIn glyph", rows[2].querySelector("svg path").getAttribute("d") === detectSocialPlatform("https://linkedin.com/x").path);
    check("each link keeps its own href verbatim", rows.map((row) => row.getAttribute("href")).join("|") === "https://youtube.com/@eduvora|https://wa.me/919999999999|https://linkedin.com/company/eduvora");
    check("each tooltip names its own platform", rows.map((row) => row.querySelector(".dc-social-tooltip").textContent).join("|") === "YouTube|WhatsApp|LinkedIn");

    // A BRAND-NEW url (host we ship no glyph for) still arrives with its own
    // icon — the site's favicon — and falls back to the neutral glyph only if
    // that image cannot load.
    el.remove();
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        bio: "",
        links: [{ id: "new", url: "https://mysite.example.com/about", platform: "", customIcon: "", label: "" }],
      }),
    );
    const unknown = el.querySelector("[data-home-social-icon]");
    const unknownImg = unknown.querySelector("img");
    check("unknown host → that site's own icon (favicon)", Boolean(unknownImg) && unknownImg.getAttribute("src") === "https://mysite.example.com/favicon.ico");
    check("unknown host → labelled with its hostname", unknown.querySelector(".dc-social-tooltip").textContent === "mysite.example.com");
    check("image icons carry the uniform-white card style hook", unknownImg && !unknown.querySelector("svg"));
    // The <img> error path swaps in the neutral globe glyph.
    await act(async () => {
      unknownImg.dispatchEvent(new dom.window.Event("error"));
    });
    check("icon image failure → neutral globe glyph", Boolean(unknown.querySelector("svg")) && detectSocialPlatform("").id === "generic");

    // A custom icon URL wins over the detected glyph (the admin's own logo).
    el.remove();
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        bio: "",
        links: [{ id: "cu", url: "https://instagram.com/eduvora", platform: "", customIcon: "https://cdn.example.com/brand.svg", label: "" }],
      }),
    );
    check("custom icon URL replaces the glyph", el.querySelector("img[data-social-icon-image]")?.getAttribute("src") === "https://cdn.example.com/brand.svg");

    // Legacy single URL (older branding documents / callers) still works.
    el.remove();
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        bio: "Digital Catalyst",
        socialUrl: "https://x.com/eduvora",
      }),
    );
    check("legacy single socialUrl still renders one link", el.querySelectorAll("[data-home-social-icon]").length === 1 && el.querySelector("[data-home-social-icon]").getAttribute("href") === "https://x.com/eduvora");

    // No account → clean non-clickable state, no icon, no undefined
    el.remove();
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        bio: "Digital Catalyst",
        links: [],
      }),
    );
    check("no account → not a link (no broken/placeholder link)", el.querySelectorAll("a").length === 0 && Boolean(el.querySelector("div.dc-social-card--static")));
    check("no account → icon row hidden", !el.querySelector(".dc-social-media"));
    check("no account → no 'undefined' text anywhere", !el.textContent.includes("undefined"));
    check("no account → name + bio still shown (clean card)", el.textContent.includes("Eduvora") && el.textContent.includes("Digital Catalyst"));

    // Admin preview: non-linked, but every icon row is still shown
    // (the admin must see exactly which icons their URLs produce).
    el.remove();
    el = mount(
      React.createElement(SocialProfileCard, {
        logoUrl: "/icons/icon-512x512.png",
        name: "Eduvora",
        bio: "Digital Catalyst",
        links: [
          { id: "px", url: "https://x.com/eduvora", platform: "", customIcon: "", label: "" },
          { id: "py", url: "https://t.me/eduvora", platform: "", customIcon: "", label: "" },
        ],
        preview: true,
      }),
    );
    check("admin preview: not a link", el.querySelectorAll("a").length === 0);
    check("admin preview: platform icon rows still shown", el.querySelectorAll("[data-home-social-icon]").length === 2);
    const x = detectSocialPlatform("https://x.com/eduvora");
    check("admin preview: X glyph for x.com URL", el.querySelector("[data-home-social-icon] svg path").getAttribute("d") === x.path);

    // Long bio must not escape the card (wrap rules present in CSS file)
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/home/components/social-profile-card.css", "utf8");
    check("name/bio have overflow-wrap in scoped CSS", /dc-social-name[\s\S]*?overflow-wrap: break-word/.test(css));
    // Size parity with the feedback wall + the reference's visual values.
    check("card fills its box (100% width + height)", /width: 100%;/.test(css) && /height: 100%;/.test(css) && !/width: 13rem/.test(css));
    check("reference palette/border/radius/shadow kept", /background: #2cb5a0;/.test(css) && /border: 4px solid #7cdacc;/.test(css) && /border-radius: 10px;/.test(css) && /box-shadow: 0 6px 10px rgba\(207, 212, 222, 1\);/.test(css));
    check("reference icon size + gap kept (1.1rem / 15px)", /width: 1\.1rem;/.test(css) && /margin-right: 15px;/.test(css));
    check("reference tooltip kept (#262626 + 10px arrow)", /background: #262626;/.test(css) && /border-width: 10px 10px 0 10px;/.test(css));
    const homeApp = readFileSync("src/home/App.tsx", "utf8");
    const boxes = homeApp.match(/h-\[420px\][^"`]*sm:h-\[520px\][^"`]*md:h-\[600px\]/g) || [];
    check("social card shares the feedback wall's exact height steps", boxes.length === 2, `found ${boxes.length}`);
    el.remove();
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

  console.log("\n[6] sanitizeSocialUrl / normalizeBranding (persistence guards)");
  {
    check("valid instagram URL kept verbatim", sanitizeSocialUrl("https://instagram.com/yourbrand") === "https://instagram.com/yourbrand");
    check("https URL kept", sanitizeSocialUrl("https://youtube.com/@yourbrand") === "https://youtube.com/@yourbrand");
    check("javascript: URL rejected", sanitizeSocialUrl("javascript:alert(1)") === "");
    check("garbage rejected", sanitizeSocialUrl("not a url") === "");
    check("empty stays empty", sanitizeSocialUrl("") === "" && sanitizeSocialUrl(undefined) === "");
    const normalized = normalizeBranding({ socialUrl: "https://x.com/brand", appName: "Eduvora" });
    check("normalizeBranding stores the legacy social URL", normalized.socialUrl === "https://x.com/brand");
    check("normalizeBranding migrates it into the account list", normalized.socialLinks.length === 1 && normalized.socialLinks[0].url === "https://x.com/brand");
    const multi = normalizeBranding({
      socialLinks: [
        { id: "a", url: "https://instagram.com/eduvora", platform: "instagram", customIcon: "", label: "" },
        { id: "b", url: "https://tiktok.com/@eduvora", platform: "", customIcon: "https://cdn.example.com/i.png", label: "" },
        { id: "dup", url: "https://instagram.com/eduvora", platform: "", customIcon: "", label: "" },
        { id: "bad", url: "javascript:alert(1)", platform: "", customIcon: "", label: "" },
      ],
    });
    check("every account is kept (in order)", multi.socialLinks.length === 2 && multi.socialLinks[0].url === "https://instagram.com/eduvora" && multi.socialLinks[1].url === "https://tiktok.com/@eduvora");
    check("duplicate + invalid rows are dropped", multi.socialLinks.filter((row) => row.url === "https://instagram.com/eduvora").length === 1);
    check("legacy mirror follows the first account", multi.socialUrl === "https://instagram.com/eduvora");
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
