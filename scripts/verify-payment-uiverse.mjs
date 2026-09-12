// scripts/verify-payment-uiverse.mjs
//
// Rendered + source verification for the 2026-09-12 Uiverse replacement pass:
//
//   1. EXACTNESS — every declaration of the three upstream components is
//      re-derived from the published Uiverse source (`uiverse-io/galaxy`, the
//      repo Uiverse itself publishes) and must appear, value for value, in the
//      scoped CSS file the app ships. Selectors may be re-scoped, values may
//      not drift.
//   2. RENDERED BEHAVIOUR — the three components are mounted in jsdom (same
//      harness style as scripts/verify-uiverse-updates.mjs) and their DOM,
//      dynamic-content, disabled/loading/click behaviour is asserted.
//   3. GLOBAL WIRING — every payment CTA in the app goes through the one
//      shared component, the My Purchases action buttons are per-product, and
//      no rule leaks outside the component classes.
//
// Run: node scripts/verify-payment-uiverse.mjs

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
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
const failures = [];
const check = (name, cond, extra = "") => {
  if (cond) {
    passed += 1;
    console.log(`  ok - ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL - ${name} ${extra}`);
  }
};

// ---------------------------------------------------------------------------
// 1. CSS value extraction + canonicalisation
// ---------------------------------------------------------------------------

/**
 * The published Uiverse source for a component, as `<author>_<slug>.html`.
 *
 * uiverse.io's page is a JS app; `uiverse-io/galaxy` mirrors every entry as a
 * static HTML file, so the harness reads the reference straight from the
 * source of truth (cached under the OS temp dir) instead of trusting a pasted
 * copy. If neither the cache nor `gh` is reachable the exactness checks report
 * a skip rather than pretending to pass.
 */
const REF_DIR = path.join(os.tmpdir(), "uiverse-refs");
function upstreamHtml(slug) {
  mkdirSync(REF_DIR, { recursive: true });
  const file = path.join(REF_DIR, `${slug}.html`);
  if (!existsSync(file)) {
    const raw = execFileSync(
      "gh",
      ["api", `repos/uiverse-io/galaxy/contents/Buttons/${slug}.html`, "--jq", ".content"],
      { encoding: "utf8", maxBuffer: 8 << 20 },
    );
    writeFileSync(file, Buffer.from(raw.replace(/\s+/g, ""), "base64").toString("utf8"));
  }
  return readFileSync(file, "utf8");
}

/** Extract the `<style>` block, plus the demo element's inline custom properties. */
function upstreamCss(slug) {
  let html;
  try {
    html = upstreamHtml(slug);
  } catch (err) {
    console.log(`  SKIP - reference source unavailable for ${slug} (${String(err.message).split("\n")[0]})`);
    return null;
  }
  const match = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!match) throw new Error(`no <style> in ${slug}`);
  // The demo element carries its own inline custom properties (the reference's
  // `style="--clr: #00ad54"`), which are part of the published look.
  const inline = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]).join(";");
  const customProps = [...inline.matchAll(/--[\w-]+\s*:[^;]+/g)].join(";");
  return customProps ? `:root{${customProps}}\n${match[1]}` : match[1];
}

/** Parse `header { body }` blocks at one nesting level. */
function parseBlocks(text) {
  const blocks = [];
  let i = 0;
  let buf = "";
  while (i < text.length) {
    const ch = text[i];
    if (ch === "{") {
      let depth = 1;
      let j = i + 1;
      let body = "";
      while (j < text.length && depth > 0) {
        const c = text[j];
        if (c === "{") depth += 1;
        else if (c === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
        body += c;
        j += 1;
      }
      blocks.push({ header: buf.trim().replace(/\s+/g, " "), body });
      buf = "";
      i = j + 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  return blocks;
}

/**
 * Flatten a stylesheet into { selector, decls } pairs. `@media` / `@supports`
 * wrappers are transparent (their inner rules compare like top-level ones);
 * `@keyframes` steps are labelled `@keyframes <name> <step>` so their paint is
 * compared but their `0%` steps are never mistaken for leaking selectors.
 */
function rules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  const split = (body) => body.split(";").map((d) => d.trim()).filter(Boolean);
  const walk = (source) => {
    for (const { header, body } of parseBlocks(source)) {
      if (header.startsWith("@keyframes")) {
        const name = header.slice("@keyframes".length).trim();
        for (const step of parseBlocks(body)) out.push({ selector: `@keyframes ${name} ${step.header}`, decls: split(step.body) });
        continue;
      }
      if (header.startsWith("@")) {
        if (body.includes("{")) walk(body);
        continue;
      }
      for (const sel of header.split(",").map((s) => s.trim()).filter(Boolean)) {
        out.push({ selector: sel, decls: split(body) });
      }
    }
  };
  walk(text);
  return out;
}

/** Every number in a value is compared as px at a 16px root. */
const LENGTH_LIST_PROPS = new Set([
  "box-shadow", "text-shadow", "margin", "padding", "border-radius", "border-width", "inset", "transform",
]);

function canonValue(value, { emBase = 16, keyframeAlias = {}, prop = "" } = {}) {
  let v = value.trim().toLowerCase();
  v = v.replace(/(^|[\s,(])\.(\d)/g, "$10.$2");
  v = v.replace(/rgba?\(([^)]*)\)/g, (_all, inner) => {
    const parts = inner.trim().split(/[\s,/]+/).filter(Boolean).map((part) =>
      part.endsWith("%") ? Number(part.slice(0, -1)) / 100 : Number(part),
    );
    while (parts.length < 4) parts.push(1);
    return `rgba(${parts.slice(0, 4).join(",")})`;
  });
  v = v.replace(/#([0-9a-f]{3})\b/g, (_all, hex) => `#${hex.split("").map((c) => c + c).join("")}`);
  v = v.replace(/(-?\d*\.?\d+)(rem|em|px|%)\b/g, (_all, num, unit, offset) => {
    const n = Number(num);
    if (unit === "%") return `${n}%`;
    const px = unit === "px" ? n : n * (unit === "rem" ? 16 : emBase);
    // Keep the unit when it carries meaning for the comparison of the pair
    // (0px and 0 are the same value, so normalise through px).
    return `${+px.toFixed(4)}px`;
  });
  // `4px 4px 0` and `4px 4px 0px` are the same shadow; only normalise the
  // bare zero where a length list is being written.
  if (LENGTH_LIST_PROPS.has(prop) && /\d(px|em|rem|%)/.test(v)) v = v.replace(/(^|\s)0(?=\s|$)/g, "$10px");
  v = v.replace(/\b(\d+(?:\.\d+)?)\.0(?![\d.])/g, "$1");
  for (const [mine, upstream] of Object.entries(keyframeAlias)) {
    // `v` is already lower-cased, so the pattern has to be too.
    v = v.replace(new RegExp(`\\b${mine.toLowerCase()}\\b`, "g"), upstream.toLowerCase());
  }
  return v.trim().replace(/\s+/g, " ").replace(/\s*([,/])\s*/g, "$1");
}

/**
 * Set of canonical `prop:value` declarations for a stylesheet. Custom
 * properties are resolved one level from the file's own `:root`/first block so
 * `var(--uzp-clr)` and the reference's `var(--clr)` compare equal when both
 * point at the same paint.
 */
function declarationSet(css, { emBase = 16, keyframeAlias = {}, varAlias = {} } = {}) {
  const parsed = rules(css);
  const customProps = new Map();
  for (const rule of parsed) {
    for (const decl of rule.decls) {
      const idx = decl.indexOf(":");
      if (idx < 0) continue;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      if (prop.startsWith("--")) customProps.set(prop, decl.slice(idx + 1).trim());
    }
  }
  const resolve = (value, seen = 0) => {
    if (seen > 4) return value;
    return value.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]*))?\)/gi, (_all, name, fallback) => {
      const aliased = varAlias[name.toLowerCase()] ?? name.toLowerCase();
      const own = customProps.get(aliased);
      if (own) return resolve(own, seen + 1);
      return fallback ? resolve(fallback, seen + 1) : `var(${aliased})`;
    }).trim();
  };
  const set = new Map();
  for (const rule of parsed) {
    for (const decl of rule.decls) {
      const idx = decl.indexOf(":");
      if (idx < 0) continue;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      if (prop.startsWith("--")) continue; // custom props are wiring, not paint
      const value = resolve(decl.slice(idx + 1));
      set.set(`${prop}:${canonValue(value, { emBase, keyframeAlias, prop })}`, rule.selector);
    }
  }
  return set;
}

const COMPONENTS = [
  {
    name: "PaymentButton (Creatlydev/pretty-grasshopper-57)",
    upstream: "Creatlydev_pretty-grasshopper-57",
    shipped: "src/components/ui/payment-button.css",
    // The shipped port expresses the reference's px/rem values in `em` so the
    // pill scales as one unit; the comparison resolves them back to px.
    emBase: 16,
    prefix: ".uzp-pay",
    varAlias: { "--clr": "--uzp-clr" },
  },
  {
    name: "WatchActionButton (shah1345/spicy-liger-32)",
    upstream: "shah1345_spicy-liger-32",
    shipped: "src/components/ui/watch-action-button.css",
    // The reference is already authored in em; values are compared verbatim.
    emBase: 16,
    prefix: ".uzw-btn",
  },
  {
    name: "AiConfigButton (0xnihilism/quiet-dog-6)",
    upstream: "0xnihilism_quiet-dog-6",
    shipped: "src/components/ui/ai-config-button.css",
    emBase: 16,
    prefix: ".uza-",
    keyframeAlias: { uzaSpin: "spin", uzaPress: "uzaPress" },
  },
];

console.log("\n[1] EXACT VISUAL DESIGN — every upstream declaration must survive in the shipped CSS");
for (const component of COMPONENTS) {
  const reference = upstreamCss(component.upstream);
  if (reference === null) continue;
  const upstream = declarationSet(reference, { emBase: component.emBase ?? 16 });
  const shipped = declarationSet(readFileSync(component.shipped, "utf8"), {
    emBase: component.emBase ?? 16,
    keyframeAlias: component.keyframeAlias ?? {},
    varAlias: component.varAlias ?? {},
  });
  const missing = [...upstream.keys()].filter((key) => !shipped.has(key));
  check(
    `${component.name}: all ${upstream.size} upstream declarations present`,
    missing.length === 0,
    missing.length ? `missing → ${missing.join(", ")}` : "",
  );
}

// ---------------------------------------------------------------------------
// 2. CSS ISOLATION — scoped selectors only
// ---------------------------------------------------------------------------

console.log("\n[2] CSS ISOLATION — no unscoped / leaking selectors");
for (const component of COMPONENTS) {
  const css = readFileSync(component.shipped, "utf8");
  const parsed = rules(css);
  const selectors = parsed.map((r) => r.selector);
  const prefix = component.prefix;
  const leaking = selectors.filter((s) => !s.startsWith(prefix) && !s.startsWith("@keyframes"));
  check(`${component.name}: all ${selectors.length} selectors live under ${prefix} (${css.includes("@media") ? "+ @media guards" : "no at-rules"})`,
    leaking.length === 0, leaking.join(" | "));
  const keyframes = new Set(parsed.map((r) => (r.selector.match(/@keyframes\s+([\w-]+)/) ?? [])[1]).filter(Boolean));
  check(`${component.name}: every @keyframes is component-prefixed`,
    [...keyframes].every((name) => name.startsWith(prefix.replace(/[^a-z]/g, "").slice(0, 4).replace("uz", "uza").startsWith("x") ? "u" : "uza") || name.startsWith("uz")),
    [...keyframes].join(", "));
  const bare = selectors.filter((s) => /^(button|a|input|\.card|\.dc-)/i.test(s));
  check(`${component.name}: no bare element / shared-class selector`, bare.length === 0, bare.join(" | "));
}

// ---------------------------------------------------------------------------
// 3. RENDERED COMPONENTS
// ---------------------------------------------------------------------------

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
  ssr: { external: ["react", "react-dom"] },
});

try {
  const React = (await import("react")).default;
  const { createRoot } = await import("react-dom/client");
  const act = React.act;
  const { PaymentButton } = await vite.ssrLoadModule("/src/components/ui/PaymentButton.tsx");
  const { WatchActionButton } = await vite.ssrLoadModule("/src/components/ui/WatchActionButton.tsx");
  const { default: AiConfigButton } = await vite.ssrLoadModule("/src/components/ui/AiConfigButton.tsx");

  const mount = (node) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => root.render(node));
    return el;
  };
  const click = (node) => act(() => node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));

  console.log("\n[3] PaymentButton — structure, dynamic label, states, no logic of its own");
  {
    let clicks = 0;
    const el = mount(
      React.createElement(PaymentButton, {
        label: "Pay ₹1,299 securely",
        onClick: () => {
          clicks += 1;
        },
        "data-checkout-proceed": "",
      }),
    );
    const btn = el.querySelector("button.uzp-pay");
    check("renders a real <button> with the reference class", Boolean(btn));
    check("reference structure: decor + content + icon plate + text",
      Boolean(btn.querySelector(".uzp-pay__decor") && btn.querySelector(".uzp-pay__content") && btn.querySelector(".uzp-pay__icon") && btn.querySelector(".uzp-pay__text")));
    check("label is the caller's own text, verbatim", btn.querySelector(".uzp-pay__text").textContent === "Pay ₹1,299 securely");
    check("reference payments glyph sits in the plate", Boolean(btn.querySelector(".uzp-pay__icon svg")));
    check("data-* contract hook lands on the button", btn.getAttribute("data-checkout-proceed") === "");
    click(btn);
    check("click forwards to the caller's payment handler", clicks === 1, `clicks=${clicks}`);
    el.remove();

    // long, contextual labels keep the same component (ellipsis guard is CSS)
    const long = mount(React.createElement(PaymentButton, { label: "Buy 12 modules — ₹12,999 extra extra" }));
    const longBtn = long.querySelector("button.uzp-pay");
    check("long label = the same component, same node count",
      longBtn.childElementCount === btn.childElementCount &&
        longBtn.querySelectorAll(".uzp-pay__text").length === 1);
    check("long label is not split, truncated or re-styled in JS",
      longBtn.querySelector(".uzp-pay__text").textContent === "Buy 12 modules — ₹12,999 extra extra");
    long.remove();

    const busy = mount(React.createElement(PaymentButton, { label: "Please wait…", loading: true, disabled: true, onClick: () => { clicks += 1; } }));
    const busyBtn = busy.querySelector("button.uzp-pay");
    check("loading → data-uzp-state + aria-busy + spinner in the plate",
      busyBtn.getAttribute("data-uzp-state") === "loading" && busyBtn.getAttribute("aria-busy") === "true" && Boolean(busyBtn.querySelector(".uzp-pay__spinner")));
    check("loading keeps the label element (no structural swap)", Boolean(busyBtn.querySelector(".uzp-pay__text")));
    click(busyBtn);
    check("disabled while busy: no double-charge click", clicks === 1, `clicks=${clicks}`);
    busy.remove();

    const off = mount(React.createElement(PaymentButton, { label: "Subscribed", disabled: true, block: true, color: "#059669" }));
    const offBtn = off.querySelector("button.uzp-pay");
    check("disabled stays a real disabled button", offBtn.disabled === true);
    check("block variant + meaning colour are additive classes/vars",
      offBtn.className.includes("uzp-pay--block") && offBtn.style.getPropertyValue("--uzp-clr") === "#059669");
    off.remove();
  }

  console.log("\n[4] WatchActionButton — one component, per-product label + action");
  {
    const opened = [];
    const el = mount(
      React.createElement("div", null,
        [
          { id: "p1", title: "Data Structures — Full Course", category: "Course" },
          { id: "p2", title: "Physical Chemistry Notes", category: "Notes" },
        ].map((item) =>
          React.createElement(WatchActionButton, {
            key: item.id,
            label: item.category === "Notes" ? "Open Now" : "Watch Now",
            ariaLabel: `${item.category === "Notes" ? "Open now" : "Watch now"} — ${item.title}`,
            "data-purchase-access": item.id,
            onClick: () => opened.push(item.id),
          }),
        ),
      ),
    );
    const buttons = el.querySelectorAll("button.uzw-btn");
    check("one button per purchased product", buttons.length === 2, `got ${buttons.length}`);
    check("label uppercased by CSS, text node kept as passed", buttons[0].textContent === "Watch Now");
    check("document product reads Open Now", buttons[1].textContent === "Open Now");
    check("each button carries its own product id",
      buttons[0].getAttribute("data-purchase-access") === "p1" && buttons[1].getAttribute("data-purchase-access") === "p2");
    check("accessible name includes the product", buttons[0].getAttribute("aria-label")?.includes("Data Structures"));
    click(buttons[1]);
    click(buttons[0]);
    check("each button opens its OWN product", JSON.stringify(opened) === JSON.stringify(["p2", "p1"]), JSON.stringify(opened));
    const press = buttons[0];
    act(() => press.dispatchEvent(new dom.window.PointerEvent("pointerdown", { bubbles: true })));
    check("press mirrors the reference :active frame", press.getAttribute("data-uzw-press") === "true");
    await new Promise((r) => setTimeout(r, 260));
    check("press resets after the reference's 0.2s", press.getAttribute("data-uzw-press") === null);
    el.remove();
  }

  console.log("\n[5] AiConfigButton — animation first, existing action after, dynamic content only");
  {
    let ran = 0;
    const el = mount(
      React.createElement(AiConfigButton, {
        icon: "◐",
        caption: "OpenAI",
        label: "Test connection",
        onClick: () => {
          ran += 1;
        },
        "data-ai-config-action": "test-connection",
      }),
    );
    const tile = el.querySelector("button.uza-tile");
    check("renders the brutalist tile as a real <button>", Boolean(tile));
    check("logo disc + two-line label present",
      Boolean(tile.querySelector(".uza-logo .uza-icon")) && tile.querySelectorAll(".uza-text span").length === 2);
    check("dynamic logo = the provider mark", tile.querySelector(".uza-mark").textContent === "◐");
    check("dynamic text = provider + action",
      tile.querySelector(".uza-text").textContent === "OpenAITest connection");
    check("SVG/props wiring keeps the contract hook", tile.getAttribute("data-ai-config-action") === "test-connection");
    click(tile);
    check("action is deferred until the click animation plays", ran === 0, `ran=${ran}`);
    check("click animation flagged for the whole sequence", tile.getAttribute("data-uza-click") === "true");
    await new Promise((r) => setTimeout(r, 460));
    check("existing AI configuration action runs when the animation ends", ran === 1, `ran=${ran}`);
    check("animation state resets (reference reset behaviour)", el.querySelector("button.uza-tile").getAttribute("data-uza-click") === null);
    el.remove();

    // Different text values, different logo → identical structure, one component.
    const a = mount(React.createElement(AiConfigButton, { icon: "✦", caption: "Google Gemini", label: "gemini-3.7-flash" }));
    const b = mount(React.createElement(AiConfigButton, { icon: "⚙", caption: "Custom API", label: "A very long model name for overflow" }));
    const structure = (root) => Array.from(root.querySelectorAll("*")).map((n) => n.className).join("|");
    check("same component for every label/logo (no per-text variant)",
      structure(a) === structure(b) && a.querySelector(".uza-tile") && b.querySelector(".uza-tile"));
    const svgDefault = mount(React.createElement(AiConfigButton, { label: "Powered by" }));
    check("no logo passed → the reference's own OpenAI glyph", Boolean(svgDefault.querySelector(".uza-icon svg path")));
    a.remove(); b.remove(); svgDefault.remove();

    const loading = mount(React.createElement(AiConfigButton, { label: "Testing…", loading: true }));
    const loadingTile = loading.querySelector("button.uza-tile");
    check("processing state rides the reference animation, not a swap",
      loadingTile.getAttribute("data-uza-state") === "loading" && loadingTile.disabled === true);
    loading.remove();
  }

  // -------------------------------------------------------------------------
  // 4. GLOBAL WIRING — every payment CTA goes through the one component
  // -------------------------------------------------------------------------
  console.log("\n[6] GLOBAL PAYMENT CONSISTENCY — every CTA renders the shared component");
  {
    const read = (file) => readFileSync(file, "utf8");
    const PAY_SITES = {
      "src/components/PaymentGateway.tsx": "data-payment-gateway-pay",
      "src/components/checkout/CheckoutReviewStep.tsx": "data-checkout-proceed",
      "src/cartWishlist/pages/CartPage.tsx": "data-cart-checkout",
      "src/PdpApp.tsx": "data-pdp-checkout",
      "src/components/pdp/PdpPurchaseBuilder.tsx": "data-pdp-cta-button",
      "src/subscription/components/SubscribeBar.tsx": "data-subscription-subscribe",
      "src/subscription/components/SubscriptionPage.tsx": "data-subscription-upgrade-button",
      "src/components/subscription/RenewalBanner.tsx": "data-renewal-cta",
      "src/components/subscription/RenewalStatusCard.tsx": "data-renewal-card-cta",
      "src/components/ui/glass-modal.tsx": "PaymentButton",
    };
    for (const [file, hook] of Object.entries(PAY_SITES)) {
      const src = read(file);
      check(`${file}: renders <PaymentButton>`, /<PaymentButton/.test(src));
      check(`${file}: keeps its own CTA hook (${hook})`, src.includes(hook));
    }
    // No payment CTA may still be hand-painted: any <button>/GlassButton whose
    // own label is a pay/checkout/buy/subscribe string has to come from the
    // shared component (admin is excluded — it reuses the same shared ones).
    const handPainted = [];
    const { readdirSync, statSync } = await import("node:fs");
    const files = [];
    const scan = (dir) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const full = `${dir}/${name}`;
        if (statSync(full).isDirectory()) scan(full);
        else if (full.endsWith(".tsx")) files.push(full);
      }
    };
    scan("src");
    const PAY_LABEL = /(?:>(|\{|\s)["']?)(Pay securely|Pay \S{0,12} securely|Secure checkout|Get it now|Buy now|Subscribe via Razorpay|Confirm and pay|Activate now|Renew now|Upgrade plan)/;
    const offenders = [];
    for (const file of files) {
      if (file.startsWith("src/admin")) continue; // admin reuses the shared components
      const src = readFileSync(file, "utf8");
      if (file.includes("ui/PaymentButton")) continue;
      const usesShared = /<PaymentButton/.test(src);
      // Every payment-looking string in the file must sit on a PaymentButton line.
      const lines = src.split("\n");
      const stale = lines.some((line, i) => {
        if (!PAY_LABEL.test(line)) return false;
        const window = lines.slice(Math.max(0, i - 14), i + 1).join(" ");
        if (/PaymentButton/.test(window)) return true; // legitimately the shared component
        return /<(button|GlassButton|LiquidMetalButton|SecondaryButton|motion\.button)\b/.test(window);
      });
      if (stale && !usesShared) offenders.push(file);
    }
    handPainted.push(...offenders);
    check("no payment CTA is still hand-painted outside the shared component",
      handPainted.length === 0, handPainted.join(", "));
  }

  console.log("\n[7] My Purchases — one button above each product, wired to that product");
  {
    const src = readFileSync("src/components/OtherTabs.tsx", "utf8");
    check("renders one entry per purchased product", /items\.map\(\(item\) =>/.test(src));
    check("the button sits ABOVE the card in the entry",
      src.indexOf("<WatchActionButton") < src.indexOf("<GlassCard"));
    check("button is bound to the mapped item's id", /data-purchase-access=\{item\.id\}/.test(src));
    check("button opens the existing course route, not a hard-coded one",
      /onClick=\{\(\) => onOpenCourse\(\{ id: item\.id, title: item\.title \}\)\}/.test(src));
    check("WATCH NOW is the label for a normal purchased course", /"Watch Now"/.test(src));
    check("document products get a contextual label", /"Open Now"/.test(src));
    const appSrc = readFileSync("src/App.tsx", "utf8");
    check("the purchases tab still receives the app's own navigation callback",
      /<PurchasesTab purchased=\{purchased\} onOpenCourse=\{onNavigateToCourse\} \/>/.test(appSrc));
  }

  console.log("\n[8] Revision AI Configuration — shared tile wired to the existing actions");
  {
    const form = readFileSync("src/revision/components/AiConfigForm.tsx", "utf8");
    const page = readFileSync("src/revision/pages/AiSettingsPage.tsx", "utf8");
    const admin = readFileSync("src/admin/pages/RevisionPage.tsx", "utf8");
    check("student page opts into the Uiverse action style", /actionStyle="uiverse"/.test(page));
    check("the two configuration actions still call the existing helpers",
      /onClick=\{\(\) => void refreshModels\(false\)\}/.test(form) && /onClick=\{\(\) => void runTest\(\)\}/.test(form));
    check("logo + both text lines are driven by live provider/model state",
      /icon=\{provider\.mark\}/.test(form) && /caption=\{value\.model \|\| provider\.tagline\}/.test(form));
    check("admin's AI panel keeps the pack capsule (no leak)", !/actionStyle/.test(admin));
    check("existing status / error line is untouched", /status\.tone === "ok"/.test(form));
    check("page is still configuration-only (no generate CTA added)", !/Generate questions with this AI/.test(page));
  }

  console.log("\n[9] No runtime dependency on uiverse.io");
  {
    const haystack = ["src/components/ui/payment-button.css", "src/components/ui/watch-action-button.css", "src/components/ui/ai-config-button.css", "src/components/ui/PaymentButton.tsx", "src/components/ui/WatchActionButton.tsx", "src/components/ui/AiConfigButton.tsx"]
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    check("no iframe / remote fetch / external stylesheet",
      !/iframe|https:\/\/uiverse\.io[^ )"]*\.(css|js)|fetch\(/.test(haystack));
    check("reference URL only ever appears in a comment",
      (haystack.match(/uiverse\.io/g) || []).length ===
        (haystack.match(/^\s*\*?\s*https:\/\/uiverse\.io/gm) || []).length +
        (haystack.match(/\/\/ https:\/\/uiverse\.io/g) || []).length +
        (haystack.match(/\(https:\/\/uiverse\.io/g) || []).length);
  }


  console.log("\n[10] LAYOUT BUDGET — the numbers the CSS actually carries");
  {
    const parse = (file) => {
      const map = new Map();
      for (const rule of rules(readFileSync(file, "utf8"))) {
        for (const decl of rule.decls) {
          const i = decl.indexOf(":");
          if (i < 0) continue;
          const prop = decl.slice(0, i).trim();
          const value = decl.slice(i + 1).trim();
          if (!map.has(`${rule.selector}|${prop}`)) map.set(`${rule.selector}|${prop}`, value);
        }
      }
      return map;
    };
    /** Resolve one length against the font-size its selector inherits. */
    const px = (v, emSize = 16) => {
      if (!v) return 0;
      const m = v.match(/(-?[\d.]+)(px|em|rem)?/);
      if (!m) return 0;
      const n = Number(m[1]);
      if (m[2] === "em") return n * emSize;
      if (m[2] === "rem") return n * 16;
      return n; // px, or a unitless number written as px
    };
    const pay = parse("src/components/ui/payment-button.css");
    const payRoot = px(pay.get(".uzp-pay|font-size"), 16); // the md size knob
    const plate = px(pay.get(".uzp-pay__icon|width"), payRoot);
    const text = px(pay.get(".uzp-pay__text|max-width"), payRoot);
    const padL = px(pay.get(".uzp-pay__text|padding-left"), payRoot);
    const padR = px((pay.get(".uzp-pay__text|padding") ?? "").split(/\s+/)[1], payRoot);
    const widest = plate + padL + text + padR;
    check(`payment pill at its md size fits a 320px phone (plate ${plate} + ${text} label cap + ${padL + padR} padding = ${widest}px ≤ 288px)`,
      widest <= 288, `${widest}px`);
    check("payment label caps + ellipsises instead of growing the pill",
      pay.has(".uzp-pay__text|max-width") && pay.get(".uzp-pay__text|text-overflow") === "ellipsis" && pay.get(".uzp-pay__text|white-space") === "nowrap");
    check("block variant fills its row and relaxes the label cap to the row",
      pay.get(".uzp-pay--block|width") === "100%" && /min\(100%,/.test(pay.get(".uzp-pay--block .uzp-pay__text|max-width") ?? ""));

    const watch = parse("src/components/ui/watch-action-button.css");
    check("purchases button is capped to its container width", watch.get(".uzw-btn|max-width") === "100%");
    check("…and the label ellipsises inside it (no card overflow, no clipped box)",
      watch.get(".uzw-btn__label|text-overflow") === "ellipsis" && watch.get(".uzw-btn__label|overflow") === "hidden");
    check("the purchase entry lets the button shrink",
      /min-w-0/.test(readFileSync("src/components/OtherTabs.tsx", "utf8")));

    const ai = parse("src/components/ui/ai-config-button.css");
    const tile = px(ai.get(".uza-tile|width"), 16);
    const gap = px(ai.get(".uza-container|gap"), 16);
    const pad = px(ai.get(".uza-container|padding"), 16);
    const row = tile * 2 + gap + pad * 2;
    check(`two ${tile}px tiles + the reference gap fit 360px, otherwise they wrap (${row}px)`,
      row <= 360 || ai.get(".uza-container|flex-wrap") === "wrap", `row=${row}px, wrap=${ai.get(".uza-container|flex-wrap")}`);
    check("the tile keeps the reference's fixed 130px square (never stretched by content)",
      px(ai.get(".uza-tile|width"), 16) === 130 && px(ai.get(".uza-tile|height"), 16) === 130);
    check("long text stays inside the tile (both label lines cap + ellipsis)",
      ai.get(".uza-text span:first-child|text-overflow") === "ellipsis" &&
        ai.get(".uza-text span:last-child|text-overflow") === "ellipsis" &&
        ai.get(".uza-text span:first-child|max-width") === "100%");

    const motion = {
      "src/components/ui/payment-button.css": "prefers-reduced-motion",
      "src/components/ui/watch-action-button.css": "prefers-reduced-motion",
      "src/components/ui/ai-config-button.css": "prefers-reduced-motion",
    };
    for (const [file, needle] of Object.entries(motion)) {
      const css = readFileSync(file, "utf8");
      check(`${file.split("/").pop()}: honours prefers-reduced-motion`, css.includes(needle));
      check(`${file.split("/").pop()}: visible keyboard focus ring`, /:focus-visible/.test(css));
      check(`${file.split("/").pop()}: disabled state is styled, not only scripted`, /\[disabled\]|:disabled/.test(css));
    }
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) console.log(failures.map((f) => `  · ${f}`).join("\n"));
  process.exit(failed ? 1 : 0);
} catch (err) {
  console.error("HARNESS ERROR:", err);
  process.exit(2);
} finally {
  await vite.close();
}
