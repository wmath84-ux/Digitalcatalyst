#!/usr/bin/env node
/**
 * Liquid Glass adoption + regression census.
 *
 *   node scripts/glass-coverage.mjs            # print the table, fail on regression
 *   node scripts/glass-coverage.mjs --write    # re-record the current numbers as the baseline
 *   node scripts/glass-coverage.mjs --json     # machine-readable output, no baseline check
 *
 * No dependencies — node builtins only, so it runs before `npm install`.
 *
 * What it measures (docs/liquid-glass-v2-brief.md §7):
 *   · per-item usage of all 22 registry components in app code, reported two
 *     ways — `direct-imports` (context only) and `render-sites` (the ratchet)
 *   · bare primitives that should migrate to the pack: <button>, <input>,
 *     <textarea>, hand-painted `rounded-* bg-white` panels, native `title=`
 *   · backdrop-blur-* sites, split into fixed chrome (allowed) and the
 *     scrolling middle band (must go to 0 — a live blur on scrolling content
 *     is recomputed on every frame)
 *   · viewport units: a bare `100vh` is only acceptable as a fallback paired
 *     with a `100dvh` upgrade (the pattern at src/index.css:988)
 *   · build output: `oklch(` must be fully downlevelled out of dist/index.html;
 *     `in oklab` is a recorded ceiling that may only decrease
 *   · fixed-layer invariants: the backdrop may not carry a filter, an
 *     animation or an !important; `background-attachment: fixed` must stay at
 *     0 (it is broken on iOS Safari)
 *
 * The numbers this script prints are AUTHORITATIVE. The figures published in
 * §6 of the brief were measured by a different, earlier method and are
 * superseded — compare wave to wave against docs/baselines/, not against the
 * brief.
 *
 * Two rules this script holds itself to, both learned the hard way in the
 * first rollout:
 *   1. Comments are stripped before every match — three false positives in the
 *      previous rollout came from greps matching the author's own prose.
 *   2. src/admin/** and src/components/admin/** are never scanned. Admin has
 *      its own background logic and its own layout project.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const UI_DIR = path.join("src", "components", "ui");
const BASELINE_FILE = path.join(ROOT, "docs", "baselines", "glass-coverage-baseline.json");
const DIST_INDEX = path.join(ROOT, "dist", "index.html");

/** Admin is out of scope for the whole rollout — never scanned, never counted. */
const EXCLUDED_DIRS = new Set([path.join("src", "admin"), path.join("src", "components", "admin")]);

/**
 * The 22 registry items, in the order `verify-glass-registry.mjs` lists them.
 * `module` is the file the item installs; usage is counted by resolving that
 * module's import specifiers and counting the JSX they appear in.
 */
const REGISTRY_ITEMS = [
  { item: "glass", modules: ["glass", "glass-motion"] },
  ...[
    "glass-button",
    "glass-switch",
    "glass-slider",
    "glass-tabs",
    "glass-tooltip",
    "glass-input",
    "glass-popover",
    "glass-dialog",
    "glass-dock",
    "glass-tile",
    "glass-swatch",
    "glass-card",
    "glass-checkbox",
    "glass-radio",
    "glass-toggle-group",
    "glass-accordion",
    "glass-dropdown-menu",
    "glass-select",
    "glass-sheet",
    "glass-toast",
    "glass-command",
  ].map((m) => ({ item: m, modules: [m] })),
];

/**
 * Fixed chrome and portalled surfaces are allowed to keep a real backdrop
 * blur: their backdrop is static, so the blur is cached rather than recomputed
 * while scrolling. Everything else is the scrolling middle band.
 */
const CHROME_SURFACE =
  /(Header|Topbar|Footer|BottomNav|Dock|Modal|Dialog|Sheet|Popover|Tooltip|Command|Select|DropdownMenu|Toast|MacWindow|overlayBounds)/i;

/* ── source walking ─────────────────────────────────────────────────────── */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(ROOT, path.join(dir, entry.name));
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(rel)) walk(path.join(dir, entry.name), out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Strip block and line comments before any matching. The line-comment pattern
 * is anchored so it cannot eat `https://` or a `//` inside a string.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`\\])\/\/[^\n]*/g, "$1");
}

const count = (source, re) => (source.match(re) || []).length;

const allFiles = walk(SRC).sort();
const appFiles = allFiles.filter((f) => !f.startsWith(UI_DIR + path.sep) && f !== UI_DIR);
const sources = new Map(allFiles.map((f) => [f, stripComments(readFileSync(path.join(ROOT, f), "utf8"))]));

/* ── registry adoption ──────────────────────────────────────────────────── */

/**
 * Split an import clause into the local names it binds, default specifier
 * included. `import PageTabs, { type PageTabItem } from "…"` binds `PageTabs`;
 * counting only the braces would miss every default-imported wrapper.
 */
function parseImportClause(clause) {
  const names = [];
  const head = clause.split(/[{*]/)[0].replace(/,\s*$/, "").trim();
  if (/^[A-Za-z0-9_$]+$/.test(head) && head !== "type") names.push({ local: head, isDefault: true });
  const braces = clause.match(/\{([\s\S]*)\}/);
  if (braces) {
    for (const raw of braces[1].split(",")) {
      const spec = raw.trim();
      if (!spec || spec.startsWith("type ")) continue;
      const local = (spec.split(/\s+as\s+/)[1] || spec.split(/\s+as\s+/)[0]).trim();
      if (local) names.push({ local, isDefault: false });
    }
  }
  return names;
}

const IMPORT_RE = /import\s+([^;]*?)\s+from\s+["']([^"']+)["']/g;
const moduleNameOf = (from) => from.split("/").pop()?.replace(/\.tsx?$/, "");

/** `import { A, B as C } from "…/glass-select"` -> [{item, local}] */
function importedRegistryNames(source) {
  const found = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const entry = REGISTRY_ITEMS.find((r) => r.modules.includes(moduleNameOf(m[2])));
    if (!entry) continue;
    for (const { local } of parseImportClause(m[1])) found.push({ item: entry.item, local });
  }
  return found;
}

const jsxUses = (source, local) => count(source, new RegExp(`<${local.replace(/[$]/g, "\\$&")}[\\s>/]`, "g"));

const packDirect = new Map(REGISTRY_ITEMS.map((r) => [r.item, 0]));
for (const file of appFiles) {
  const source = sources.get(file);
  for (const { item, local } of importedRegistryNames(source)) {
    // JSX opening tags only — an identifier that is merely imported but never
    // rendered is not adoption.
    packDirect.set(item, packDirect.get(item) + jsxUses(source, local));
  }
}

/**
 * Some registry items are only ever reached through an app-layer wrapper in
 * src/components/ui/ (GlassCard pins light-ink defaults over the pack's
 * white-on-dark card; PageTabs, ConfirmDialog, MacWindowModal and Toast do the
 * same for tabs/dialog/toast). Counting only direct imports would report those
 * items as 0 — the brief marks them "hidden inside wrappers" — so attribute a
 * wrapper's render sites back to the items it wraps.
 */
const WRAPPERS = allFiles
  .filter((f) => f.startsWith(UI_DIR + path.sep) && !/\/glass(-[a-z-]+)?\.(tsx|ts)$/.test(f))
  .map((file) => {
    const source = sources.get(file);
    const items = [...new Set(importedRegistryNames(source).map((n) => n.item))];
    const exported = new Set();
    for (const m of source.matchAll(/export\s+(?:function|const|class)\s+([A-Za-z0-9_$]+)/g)) exported.add(m[1]);
    for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const raw of m[1].split(",")) {
        const spec = raw.trim();
        if (!spec || spec.startsWith("type ")) continue;
        exported.add((spec.split(/\s+as\s+/)[1] || spec.split(/\s+as\s+/)[0]).trim());
      }
    }
    return {
      file,
      module: path.basename(file).replace(/\.tsx?$/, ""),
      items,
      exported,
      hasDefault: /export\s+default\b/.test(source),
    };
  })
  .filter((w) => w.items.length > 0 && (w.exported.size > 0 || w.hasDefault));

const packViaWrapper = new Map(REGISTRY_ITEMS.map((r) => [r.item, 0]));
for (const file of appFiles) {
  const source = sources.get(file);
  for (const m of source.matchAll(IMPORT_RE)) {
    const wrapper = WRAPPERS.find((w) => w.module === moduleNameOf(m[2]));
    if (!wrapper) continue;
    for (const { local, isDefault } of parseImportClause(m[1])) {
      if (!isDefault && !wrapper.exported.has(local)) continue;
      if (isDefault && !wrapper.hasDefault) continue;
      const uses = jsxUses(source, local);
      for (const item of wrapper.items) {
        packViaWrapper.set(item, packViaWrapper.get(item) + uses);
      }
    }
  }
}

const packTotal =
  [...packDirect.values()].reduce((a, b) => a + b, 0) + [...packViaWrapper.values()].reduce((a, b) => a + b, 0);

/* ── bare primitives ────────────────────────────────────────────────────── */

/** `rounded-…` and `bg-white` inside one className literal == a hand-painted panel. */
function paintedPanels(source) {
  let n = 0;
  for (const m of source.matchAll(/className\s*=\s*{?\s*[`"']([\s\S]*?)[`"']/g)) {
    const value = m[1];
    const rounded = /\brounded(-[a-z0-9[\]\w()-]+)?\b/.test(value);
    const white = /\bbg-white\b/.test(value);
    if (rounded && white) n++;
  }
  return n;
}

const sum = (files, fn) => files.reduce((n, f) => n + fn(sources.get(f)), 0);

const bare = {
  button: sum(appFiles, (s) => count(s, /<button[\s>/]/g)),
  input: sum(appFiles, (s) => count(s, /<input[\s>/]/g)),
  textarea: sum(appFiles, (s) => count(s, /<textarea[\s>/]/g)),
  paintedPanel: sum(appFiles, paintedPanels),
  nativeTitle: sum(appFiles, (s) => count(s, /\btitle\s*=\s*["'{]/g)),
};

/* ── live blur: fixed chrome vs the scrolling middle band ───────────────── */

let blurChrome = 0;
let blurContent = 0;
for (const file of appFiles) {
  const n = count(sources.get(file), /backdrop-blur-(?!none\b)/g);
  if (n === 0) continue;
  if (CHROME_SURFACE.test(path.basename(file))) blurChrome += n;
  else blurContent += n;
}

/* ── viewport units ─────────────────────────────────────────────────────── */

/**
 * A bare `100vh` is fine as a fallback; it is a bug when nothing upgrades it
 * to a dynamic viewport unit for engines that have one.
 *
 * The check is per utility, not per file: a frame that already carries an
 * unrelated `h-[100dvh]` would otherwise look "paired" while its
 * `sm:h-[calc(100vh-3rem)]` pin was still bare (that is exactly what
 * CartWishlistApp.tsx did before Wave 0).
 */
const VH_UTILITY = /((?:[a-z0-9-]+:)*)((?:min-h|max-h|h)-\[[^\]]*100vh[^\]]*\])/g;

function unpairedVhUtilities(source) {
  let unpaired = 0;
  for (const m of source.matchAll(/className\s*=\s*{?\s*[`"']([\s\S]*?)[`"']/g)) {
    const value = m[1];
    for (const u of value.matchAll(VH_UTILITY)) {
      const upgrade = `${u[1]}supports-[height:100dvh]:${u[2].replace("100vh", "100dvh")}`;
      if (!value.includes(upgrade)) unpaired++;
    }
  }
  return unpaired;
}

const viewport = {
  bareVh: sum(allFiles, (s) => count(s, /100vh/g)),
  unpairedVh: sum(allFiles, unpairedVhUtilities),
};

/* ── layout + palette census (context for the later waves) ──────────────── */

const layout = {
  fixedInset0: sum(appFiles, (s) => count(s, /fixed\s+inset-0/g)),
  bgGradientTo: sum(appFiles, (s) => count(s, /bg-gradient-to-/g)),
  minWidthBreakpoint: sum(appFiles, (s) => count(s, /min-\[\d+px\]/g)),
};

/* ── CSS-wide invariants (src/**\/*.css) ────────────────────────────────── */

function walkCss(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(ROOT, path.join(dir, entry.name));
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(rel)) walkCss(path.join(dir, entry.name), out);
    } else if (/\.css$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const cssSources = walkCss(SRC).map((f) => ({ file: f, css: stripComments(readFileSync(path.join(ROOT, f), "utf8")) }));

/** Rule bodies belonging to the fixed backdrop layer, wherever it is defined. */
function backdropRules(css) {
  const bodies = [];
  const selectorRe = /[^{}]*\.dc-backdrop[^{}]*\{/g;
  for (const m of css.matchAll(selectorRe)) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    bodies.push({ selector: m[0].trim(), body: css.slice(start, i - 1) });
  }
  return bodies;
}

let backdropRulesSeen = 0;
const backdropViolations = [];
for (const { file, css } of cssSources) {
  for (const rule of backdropRules(css)) {
    backdropRulesSeen++;
    if (/\bfilter\s*:/.test(rule.body)) backdropViolations.push(`${file}: filter on ${rule.selector}`);
    if (/animation\s*:/.test(rule.body)) backdropViolations.push(`${file}: animation on ${rule.selector}`);
    if (/backdrop-filter\s*:/.test(rule.body)) backdropViolations.push(`${file}: backdrop-filter on ${rule.selector}`);
    if (/!important/.test(rule.body)) backdropViolations.push(`${file}: !important on ${rule.selector}`);
  }
  if (/@keyframes[^{]*\{[\s\S]*?dc-backdrop/.test(css)) backdropViolations.push(`${file}: @keyframes targeting the backdrop`);
}

const fixedLayer = {
  backdropRulesSeen,
  backdropViolations: backdropViolations.length,
  backgroundAttachmentFixed: cssSources.reduce((n, { css }) => n + count(css, /background-attachment\s*:\s*fixed/g), 0),
};

/* ── build output ───────────────────────────────────────────────────────── */

const distHtml = existsSync(DIST_INDEX) ? readFileSync(DIST_INDEX, "utf8") : null;
const build = {
  distPresent: distHtml != null,
  /* Tailwind v4 emits oklch() for its whole palette; Lightning CSS lowers all
     of it at the browserslist floor. Hard-capped at 0 — see Wave 0. */
  oklchInDist: distHtml == null ? null : count(distHtml, /oklch\(/g),
  /* Tailwind also writes `--tw-gradient-position: to bottom in oklab`, which
     Lightning CSS will NOT strip (custom-property values are opaque to it, and
     it leaves the keyword alone even when it can see it directly). Engines
     without gradient colour-space interpolation — Chrome <111, Safari <16.2,
     Firefox <113 — drop the whole linear-gradient().

     Owner decision 2026-09-01 (option c): no post-pass strip (it regresses
     banding on modern engines) and no 0-ceiling. The decorative sites are
     deleted in Waves 3–5 and the surviving identity gradients are hand-written
     in src/glass-theme.css with a solid fallback first, so this number is a
     RECORDED CEILING that may only ever go down. */
  inOklabInDist: distHtml == null ? null : count(distHtml, /in oklab/g),
};

/* ── report ─────────────────────────────────────────────────────────────── */

/** direction: "down" = lower is better (regression when it rises). */
const METRICS = [
  { group: "bare primitives", key: "bare.button", label: "<button>", direction: "down" },
  { group: "bare primitives", key: "bare.input", label: "<input>", direction: "down" },
  { group: "bare primitives", key: "bare.textarea", label: "<textarea>", direction: "down" },
  { group: "bare primitives", key: "bare.paintedPanel", label: "rounded-* bg-white panels", direction: "down" },
  { group: "bare primitives", key: "bare.nativeTitle", label: "native title=", direction: "down" },
  { group: "live blur", key: "blur.content", label: "backdrop-blur in scrolling content", direction: "down" },
  { group: "live blur", key: "blur.chrome", label: "backdrop-blur in fixed chrome (allowed)", direction: "flat" },
  { group: "viewport", key: "viewport.unpairedVh", label: "unpaired 100vh (no dvh upgrade)", direction: "down" },
  { group: "viewport", key: "viewport.bareVh", label: "100vh occurrences (fallbacks ok)", direction: "flat" },
  { group: "layout", key: "layout.fixedInset0", label: "fixed inset-0 overlays", direction: "down" },
  { group: "layout", key: "layout.bgGradientTo", label: "bg-gradient-to-*", direction: "down" },
  { group: "layout", key: "layout.minWidthBreakpoint", label: "ad-hoc min-[Npx] breakpoints", direction: "down" },
  { group: "fixed layer", key: "fixedLayer.backgroundAttachmentFixed", label: "background-attachment: fixed", direction: "down", max: 0 },
  { group: "fixed layer", key: "fixedLayer.backdropViolations", label: "backdrop filter/animation/!important", direction: "down", max: 0 },
  { group: "build", key: "build.oklchInDist", label: "oklch( in dist/index.html", direction: "down", max: 0 },
  { group: "build", key: "build.inOklabInDist", label: "in oklab in dist (ceiling, not 0)", direction: "down" },
  { group: "adoption", key: "pack.renderSites", label: "render-sites (RATCHET)", direction: "up" },
  { group: "adoption", key: "pack.directImports", label: "direct-imports (report only)", direction: "flat" },
  { group: "adoption", key: "pack.viaWrapper", label: "  of which via app wrapper", direction: "flat" },
];

const current = {
  files: { nonAdmin: allFiles.length, appCode: appFiles.length },
  bare,
  blur: { content: blurContent, chrome: blurChrome },
  viewport,
  layout,
  fixedLayer,
  build,
  pack: {
    /**
     * Two numbers, on purpose (owner decision 2026-09-01):
     *
     *   directImports — JSX rendered from a symbol imported straight out of a
     *     `glass-*` registry module. Report only: it reads 0 for glass-card,
     *     glass-dialog and glass-tabs purely because this app reaches them
     *     through an app-layer wrapper (ProductCard / CartItemCard /
     *     FavoriteCard → GlassCard; PageTabs; Toast), which is legitimate
     *     adoption and must never look like a regression.
     *
     *   renderSites — directImports + wrapper-mediated renders. THIS is the
     *     ratchet; it is the count that has to climb across Waves 3–6.
     */
    directImports: [...packDirect.values()].reduce((a, b) => a + b, 0),
    viaWrapper: [...packViaWrapper.values()].reduce((a, b) => a + b, 0),
    renderSites: packTotal,
    perItem: Object.fromEntries(
      [...packDirect.keys()].map((item) => [
        item,
        { direct: packDirect.get(item), viaWrapper: packViaWrapper.get(item) },
      ]),
    ),
  },
};

const get = (obj, dotted) => dotted.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

function main() {
  const argv = new Set(process.argv.slice(2));
  const asJson = argv.has("--json");
  const write = argv.has("--write");

  if (asJson) {
    process.stdout.write(JSON.stringify({ generatedAt: new Date().toISOString(), ...current }, null, 2) + "\n");
    return 0;
  }

  let baseline = null;
  if (existsSync(BASELINE_FILE)) baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));

  const pad = (s, n) => String(s).padEnd(n);
  const rows = [];
  const regressions = [];
  const hardFailures = [];

  let group = "";
  for (const m of METRICS) {
    if (m.group !== group) {
      group = m.group;
      rows.push("");
      rows.push(`  ${group}`);
    }
    const now = get(current, m.key);
    const before = baseline ? get(baseline, m.key) : null;
    let delta = "";
    if (before == null) delta = baseline ? "new" : "";
    else if (now > before) delta = `+${now - before}`;
    else if (now < before) delta = `${now - before}`;
    else delta = "=";

    if (now != null && m.max != null && now > m.max) {
      hardFailures.push(`${m.label} = ${now} (hard cap ${m.max})`);
    }
    if (baseline && before != null) {
      if (m.direction === "down" && now > before) regressions.push(`${m.label}: ${before} → ${now}`);
      if (m.direction === "up" && now < before) regressions.push(`${m.label}: ${before} → ${now}`);
    }
    rows.push(`    ${pad(m.label, 46)} ${pad(now ?? "—", 7)} ${pad(delta, 7)} ${before ?? ""}`);
  }

  const out = [];
  out.push("Liquid Glass coverage");
  out.push(`  scope: src/** minus src/admin + src/components/admin (comments stripped)`);
  out.push(`  files: ${current.files.nonAdmin} non-admin · ${current.files.appCode} app code (excl. src/components/ui)`);
  if (!build.distPresent) out.push("  note: dist/index.html missing — run `npm run build` to check the oklch gate");
  out.push("");
  out.push(pad("  metric", 50) + pad("now", 7) + pad("delta", 7) + "baseline");
  out.push("  " + "-".repeat(72));
  out.push(...rows);
  out.push("");
  out.push("  registry component usage in app code (JSX actually rendered)");
  out.push(`    ${pad("item", 24)} ${pad("direct", 8)} ${pad("wrapper", 9)} render-sites`);
  const itemNames = [...packDirect.keys()].sort(
    (a, b) => packDirect.get(b) + packViaWrapper.get(b) - (packDirect.get(a) + packViaWrapper.get(a)) || a.localeCompare(b),
  );
  for (const item of itemNames) {
    const direct = packDirect.get(item);
    const wrapped = packViaWrapper.get(item);
    out.push(`    ${pad(item, 24)} ${pad(direct, 8)} ${pad(wrapped, 9)} ${direct + wrapped}`);
  }
  out.push(
    `    ${pad("TOTAL", 24)} ${pad(current.pack.directImports, 8)} ${pad(current.pack.viaWrapper, 9)} ${current.pack.renderSites}`,
  );
  out.push("    (direct-imports is reported for context only; render-sites is the ratchet)");

  if (backdropViolations.length > 0) {
    out.push("");
    out.push("  fixed-layer violations:");
    for (const v of backdropViolations) out.push(`    ! ${v}`);
  }

  process.stdout.write(out.join("\n") + "\n");

  if (write) {
    mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
    writeFileSync(BASELINE_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), ...current }, null, 2) + "\n");
    process.stdout.write(`\nbaseline written to ${path.relative(ROOT, BASELINE_FILE)}\n`);
    return 0;
  }

  if (!baseline) {
    process.stdout.write(`\nno baseline at ${path.relative(ROOT, BASELINE_FILE)} — run with --write to record one.\n`);
    return 0;
  }

  if (hardFailures.length > 0) {
    process.stdout.write("\nHARD CAP BREACHED:\n" + hardFailures.map((f) => `  ! ${f}`).join("\n") + "\n");
  }
  if (regressions.length > 0) {
    process.stdout.write("\nREGRESSIONS:\n" + regressions.map((r) => `  ! ${r}`).join("\n") + "\n");
  }
  if (hardFailures.length === 0 && regressions.length === 0) {
    process.stdout.write("\nOK — no regression against the baseline.\n");
  }
  return hardFailures.length > 0 || regressions.length > 0 ? 1 : 0;
}

process.exit(main());
