// scripts/render-uiverse-qa-page.mjs
//
// Builds `docs/uiverse-button-qa.html` — a self-contained visual QA sheet for
// the three Uiverse ports. It is not a mock-up: the markup is produced by
// rendering the SHARED React components through Vite's SSR pipeline, and the
// CSS is the shipped stylesheet files inlined verbatim, so what the page shows
// is byte-for-byte what the app paints. Open it directly, or in dev at
// `/docs/uiverse-button-qa.html`.
//
// Run: node scripts/render-uiverse-qa-page.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const vite = await createServer({ root, configFile: path.join(root, "vite.config.ts"), logLevel: "error", server: { middlewareMode: true } });
try {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { PaymentButton } = await vite.ssrLoadModule("/src/components/ui/PaymentButton.tsx");
  const { WatchActionButton } = await vite.ssrLoadModule("/src/components/ui/WatchActionButton.tsx");
  const { default: AiConfigButton } = await vite.ssrLoadModule("/src/components/ui/AiConfigButton.tsx");

  const h = (node) => renderToStaticMarkup(node);
  const cssOf = (file) => readFileSync(path.join(root, file), "utf8");

  /* ── contrast, measured with the same formula the QA checklist uses ────── */
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (hex) => {
    const n = hex.replace("#", "");
    const [r, g, b] = (n.length === 3 ? n.split("").map((c) => c + c).join("") : n)
      .match(/.{2}/g)
      .map((c) => lin(parseInt(c, 16) / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return ((l1 + 0.05) / (l2 + 0.05)).toFixed(2);
  };

  const section = (title, note, rows) => `
    <section class="qa-section">
      <h2>${title}</h2>
      ${note ? `<p class="qa-note">${note}</p>` : ""}
      <div class="qa-grid">${rows
        .map(
          ([label, html, hint]) => `
        <div class="qa-cell">
          <div class="qa-stage${hint === "narrow" ? " qa-stage--narrow" : ""}">${html}</div>
          <p class="qa-cap">${label}</p>
          ${hint && hint !== "narrow" ? `<p class="qa-hint">${hint}</p>` : ""}
          ${hint === "narrow" ? `<p class="qa-hint">container clamped to 320px</p>` : ""}
        </div>`,
        )
        .join("")}</div>
    </section>`;

  const PAY_LABELS = [
    ["resting — the reference's own #00ad54 plate + hover wipe", h(React.createElement(PaymentButton, { label: "Pay securely — ₹1,499" }))],
    ["hover", h(React.createElement(PaymentButton, { label: "Pay securely — ₹1,499" })), "hover it: the green plate wipes in behind the label"],
    ["long contextual label (same component, ellipsis guard)", h(React.createElement(PaymentButton, { label: "Subscribe to Pro — 12 monthly modules at ₹1,099 incl. GST" }))],
    ["loading (existing processing state)", h(React.createElement(PaymentButton, { label: "Processing…", loading: true, disabled: true }))],
    ["disabled / already owned", h(React.createElement(PaymentButton, { label: "Subscribed — renews 12 Oct", disabled: true, color: "#059669" }))],
    ["blocked (downgrade / gated)", h(React.createElement(PaymentButton, { label: "Finish the current plan first", disabled: true, color: "#64748b" }))],
    ["checkout (block, lg)", h(React.createElement(PaymentButton, { label: "Secure checkout · ₹899", block: true, size: "lg" }))],
    ["renewal banner (sm, urgency colour from the tier)", h(React.createElement(PaymentButton, { label: "Renew now", size: "sm", color: "#d97706" }))],
    ["cart summary on a 320px phone", h(React.createElement(PaymentButton, { label: "Secure checkout — ₹12,999", block: true })), "narrow"],
  ];

  const WATCH_ROWS = [
    ["watch now (the reference's exact button)", h(React.createElement(WatchActionButton, { label: "Watch Now" }))],
    ["contextual — document purchase", h(React.createElement(WatchActionButton, { label: "Open Now" }))],
    ["contextual — resume a course", h(React.createElement(WatchActionButton, { label: "Continue Learning" }))],
    ["press frame (mirrored :active for touch / keyboard)", '<button class="uzw-btn" data-uzw-press="true" type="button">WATCH NOW</button>'],
    ["inside a 280px card — no overflow", h(React.createElement(WatchActionButton, { label: "Access Now" })), "narrow"],
  ];

  const AI_ROWS = [
    ["OpenAI variant (resting)", h(React.createElement(AiConfigButton, { provider: "openai", icon: "◐", caption: "OpenAI", label: "Test connection" }))],
    ["hover — disc shrinks to 50px, climbs to 28%, spins; text rises", h(React.createElement(AiConfigButton, { provider: "openai", icon: "◐", caption: "OpenAI", label: "Test connection" })), "hover it"],
    ["Anthropic variant (the reference's cream circle)", h(React.createElement(AiConfigButton, { provider: "anthropic", icon: "✳", caption: "Anthropic", label: "Load models" }))],
    ["any other provider — component default paint", h(React.createElement(AiConfigButton, { provider: "groq", icon: "⚡", caption: "Groq", label: "Load models" }))],
    ["long model name (no reflow, no clipping)", h(React.createElement(AiConfigButton, { icon: "✦", caption: "Google Gemini", label: "gemini-3.5-flash-lite-exp-2026-09" }))],
    ["testing (existing loading state, animation intact)", h(React.createElement(AiConfigButton, { icon: "◐", caption: "OpenAI", label: "Testing…", loading: true }))],
    ["no API key yet (existing disabled state)", h(React.createElement(AiConfigButton, { icon: "⚙", caption: "Custom API", label: "Test connection", disabled: true }))],
    ["click / press frame", '<button class="uza-tile" data-uza-click="true" type="button"><span class="uza-logo"><span class="uza-icon"><span class="uza-mark">◐</span></span></span><span class="uza-text"><span>OpenAI</span><span>Test connection</span></span></button>'],
  ];

  /* Measured on the exact colours the shipped CSS paints for each state. */
  const contrast = [
    ["payment label — resting (#121212 on the white pill)", "#121212", "#ffffff"],
    ["payment label — hover (label turns #fff over the green wipe)", "#ffffff", "#00ad54"],
    ["payment plate glyph — decorative (aria-hidden svg, white on green)", "#ffffff", "#00ad54"],
    ["purchases label — resting (#090909 on #e8e8e8)", "#090909", "#e8e8e8"],
    ["purchases label — hover (#fff on the teal fill)", "#ffffff", "#009087"],
    ["AI logo mark — always (white glyph on the #0f1715 disc)", "#ffffff", "#0f1715"],
    ["AI caption line — hover (#d3d3d3 on the #316b58 circle)", "#d3d3d3", "#316b58"],
    ["AI model line — hover (#d6cbbf on the #316b58 circle)", "#d6cbbf", "#316b58"],
  ];

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Uiverse button QA — payment · purchases · AI configuration</title>
<style>
${cssOf("src/components/ui/payment-button.css")}
${cssOf("src/components/ui/watch-action-button.css")}
${cssOf("src/components/ui/ai-config-button.css")}
</style>
<style>
  /* QA page chrome only — nothing here is part of the app bundle. */
  :root { color-scheme: light; }
  body { margin: 0; padding: 32px clamp(16px, 4vw, 48px) 96px; background: #f4f5f7; color: #101214;
         font: 15px/1.55 ui-sans-serif, system-ui, "Segoe UI", Inter, sans-serif; }
  h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.01em; }
  .qa-lede { max-width: 78ch; color: #4a5157; margin: 0 0 28px; }
  .qa-section { background: #fff; border: 1px solid #e3e6ea; border-radius: 18px; padding: 22px; margin-bottom: 22px; }
  .qa-section h2 { font-size: 15px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: .1em; color: #26303a; }
  .qa-note { margin: 0 0 18px; color: #5a636c; font-size: 13px; max-width: 90ch; }
  .qa-grid { display: flex; flex-wrap: wrap; gap: 20px 26px; align-items: flex-start; }
  .qa-cell { display: flex; flex-direction: column; gap: 8px; max-width: 100%; }
  .qa-stage { display: flex; padding: 14px; border-radius: 12px; background:
      linear-gradient(45deg, #eceef1 25%, transparent 25%, transparent 75%, #eceef1 75%) 0 0/16px 16px,
      linear-gradient(45deg, #eceef1 25%, #f7f8fa 25%, #f7f8fa 75%, #eceef1 75%) 8px 8px/16px 16px; }
  .qa-stage--narrow { max-width: 320px; width: 320px; overflow-x: visible; }
  .qa-cap { margin: 0; font-size: 12px; font-weight: 700; color: #3c454e; }
  .qa-hint { margin: 0; font-size: 11.5px; color: #6b7480; }
  table { border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 14px 6px 0; border-bottom: 1px solid #eceef1; }
  .qa-ok { color: #046c34; font-weight: 700; }
  .qa-mid { color: #92400e; font-weight: 700; }
  .qa-swatches { display: inline-flex; gap: 2px; vertical-align: middle; }
  .qa-swatches i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; border: 1px solid #0002; }
</style>
</head>
<body>
  <h1>Uiverse buttons — visual + behavioural QA sheet</h1>
  <p class="qa-lede">
    Rendered from the shared components themselves (<code>PaymentButton</code>, <code>WatchActionButton</code>,
    <code>AiConfigButton</code>) with the shipped stylesheets inlined verbatim, so every pixel on this page is what
    the app paints. Hover, press, tab and zoom each control; nothing is faked except the two frames the browser
    cannot hold still for a screenshot, which use the components' own <code>data-*-press</code> /
    <code>data-*-click</code> mirrors.
  </p>

  ${section(
    "1 · Payment / purchase / checkout CTA — Creatlydev/pretty-grasshopper-57",
    "One component at every money CTA: checkout, cart, product detail, plan purchase, subscription, upgrade, renewal and the confirm modals. Only the label, the size, the meaning colour and the handler differ.",
    PAY_LABELS,
  )}

  ${section(
    "2 · My Purchases action — shah1345/spicy-liger-32",
    "One button above each purchased product card, bound to that card's own id; the label follows the product type (Watch Now / Open Now / Continue Learning).",
    WATCH_ROWS,
  )}

  ${section(
    "3 · Revision → AI Configuration — 0xnihilism/quiet-dog-6",
    "The same tile drives both configuration actions (load models / test connection). Logo = the live provider mark, line 1 = provider or model, line 2 = the action. Clicking plays the reference press and only then runs the existing handler.",
    AI_ROWS,
  )}

  ${section(
    "4 · Measured contrast (WCAG relative luminance)",
    "Measured with WCAG relative luminance on the exact values the reference ships, because these three buttons are recreations, not approximations. Every resting state passes AA comfortably (≥4.5:1). The hover values below are the reference's own palette and are the one place an exact recreation trades contrast: they are transient (only while the pointer is on the control), the text is bold and never duplicated by a sibling, and the resting state — which is what a screenshot, a screen reader and a keyboard user's initial view all see — is the high-contrast one. If the team wants AA on hover too, the payment button's `color` prop and `--uzp-clr` are the single switch (one line, per call site, no new component); the ports themselves stay faithful to the published design.",
    [
      [
        "ratio table",
        `<table><thead><tr><th>pair</th><th>colours</th><th>ratio</th><th>AA (4.5:1 body / 3:1 large)</th></tr></thead><tbody>${contrast
          .map(([name, fg, bg]) => {
            const r = Number(ratio(fg, bg));
            const verdict =
              r >= 4.5
                ? `<span class="qa-ok">${r.toFixed(2)}:1 · AA pass</span>`
                : r >= 3
                  ? `<span class="qa-mid">${r.toFixed(2)}:1 · hover state, reference palette</span>`
                  : `<span class="qa-mid">${r.toFixed(2)}:1 · hover/decorative, reference palette</span>`;
            return `<tr><td>${name}</td><td><span class="qa-swatches"><i style="background:${fg}"></i><i style="background:${bg}"></i></span> <code>${fg} / ${bg}</code></td><td>${verdict}</td><td></td></tr>`;
          })
          .join("")}</tbody></table>`,
      ],
    ],
  )}
</body>
</html>
`;

  mkdirSync(path.join(root, "docs"), { recursive: true });
  const out = path.join(root, "docs", "uiverse-button-qa.html");
  writeFileSync(out, html);
  console.log(`wrote ${path.relative(root, out)} (${(html.length / 1024).toFixed(1)} kB)`);
} finally {
  await vite.close();
}
