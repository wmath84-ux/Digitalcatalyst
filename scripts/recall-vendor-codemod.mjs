// Codemod: rewrite Recall's path aliases (`@/…`), third-party UI imports and
// the `dark:` variant in the vendored Recall tree so the ported source compiles
// inside Digitalcatalyst without a second bundler alias.
//
// Run:  node scripts/recall-vendor-codemod.mjs
//
// What it does
//  1. `@/x`  ->  relative path to the vendored copy of `x`
//     (the vendored tree mirrors Recall's original `src/` layout, so the
//     mapping is deterministic: `src/<x>` became `<vendor>/<x>`).
//  2. Third-party modules that Digitalcatalyst deliberately replaces with
//     in-tree equivalents are rewritten to the vendored shim:
//       sonner                     -> <vendor>/shims/toast
//       react-i18next              -> <vendor>/shims/i18n
//       i18next / detector         -> <vendor>/shims/i18n
//       virtual:pwa-register/react -> <vendor>/shims/pwa-register
//  3. `dark:<utility>` inside CLASS STRINGS -> `recall-dark:<utility>`.
//     Upstream sets `darkMode: ["class"]`; Digitalcatalyst already ships a
//     global `dark` class on <html> (src/lib/glassScheme.ts), so a class-based
//     dark variant would be permanently on inside Revision and the feature's
//     own light / high-contrast theme switch could never win. The ported tree
//     therefore uses a namespaced variant bound to the Revision shell in
//     `recall-theme.css`; global `dark:` semantics are untouched (§22).
//
// Both rewrites are restricted to the *contents of string literals*, located
// with the TypeScript compiler API, so an object type member such as
// `{ light: string; dark: string }` or a JSON key can never be rewritten.
// Edits are position based and applied in reverse, which preserves the ported
// files' original formatting byte-for-byte everywhere else — important, because
// the vendored tree should stay diffable against upstream.
//
// `@tauri-apps/*` dynamic imports are left untouched: every one of them sits
// inside an `await import(...)` guard whose `catch` path is the browser
// implementation, and the integrations layer supplies browser replacements.
//
// The script is idempotent: running it twice produces no further changes.

import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const vendorRoot = path.join(repoRoot, "src", "revision", "recall");

/** Modules replaced by in-tree shims, keyed by the bare specifier. */
const SHIMS = {
  sonner: "shims/toast",
  "react-i18next": "shims/i18n",
  i18next: "shims/i18n",
  "i18next-browser-languagedetector": "shims/i18n",
  "virtual:pwa-register/react": "shims/pwa-register",
  // Browser replacements for the Tauri desktop APIs (see shims/tauri.ts).
  "@tauri-apps/plugin-dialog": "shims/tauri",
  "@tauri-apps/plugin-fs": "shims/tauri",
  "@tauri-apps/plugin-sql": "shims/tauri",
  "@tauri-apps/plugin-notification": "shims/tauri",
  "@tauri-apps/plugin-updater": "shims/tauri",
  "@tauri-apps/api/core": "shims/tauri",
  "@tauri-apps/api/path": "shims/tauri",
  "@tauri-apps/api/event": "shims/tauri",
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Resolve `@/x` to the vendored location, or null when it is out of tree. */
function resolveAlias(spec) {
  const target = path.join(vendorRoot, spec.slice(2));
  const candidates = [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    path.join(target, "index.ts"),
    path.join(target, "index.tsx"),
    path.join(target, "index.json"),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function relative(fromFile, toFile) {
  let rel = path.relative(path.dirname(fromFile), toFile).replace(/\.(tsx?|json)$/, "");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

/**
 * Collect the [start, end) range of every string-literal *body* in a file,
 * i.e. the characters between the delimiters. Template literal parts keep
 * their `${…}` holes outside the returned range, so a hole can never be
 * rewritten.
 */
function stringBodyRanges(file, source) {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const ranges = [];

  const visit = (node) => {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        ranges.push([node.getStart(sourceFile) + 1, node.end - 1]);
        break;
      case ts.SyntaxKind.TemplateHead:
        ranges.push([node.getStart(sourceFile) + 1, node.end - 2]);
        break;
      case ts.SyntaxKind.TemplateMiddle:
        ranges.push([node.getStart(sourceFile) + 1, node.end - 2]);
        break;
      case ts.SyntaxKind.TemplateTail:
        ranges.push([node.getStart(sourceFile) + 1, node.end - 1]);
        break;
      default:
        break;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return ranges;
}

/**
 * True when the character offset sits inside a string literal / template
 * chunk. `stringBodyRanges` already tells us where those are — this is the
 * guard that keeps a TYPE ANNOTATION such as `{ light: string; dark: string }`
 * (which a naive regex rewrites into `recall-dark: string`) out of reach.
 */
function insideStringBody(offset, ranges) {
  return ranges.some(([start, end]) => offset > start && offset < end);
}

let changedFiles = 0;

for (const file of walk(vendorRoot)) {
  const original = readFileSync(file, "utf8");
  const edits = [];

  const ranges = stringBodyRanges(file, original);

  for (const [start, end] of ranges) {
    const body = original.slice(start, end);

    // ── 3. `dark:` variant inside class strings ───────────────────────────
    if (!body.includes("recall-dark:") && /(?<![\w:-])dark:/.test(body)) {
      edits.push({ start, end, replacement: body.replace(/(?<![\w:-])dark:/g, "recall-dark:") });
      continue;
    }

    // ── 2. Bare shim specifiers (`import { toast } from "sonner"`) ────────
    if (SHIMS[body]) {
      const target = resolveAlias(`@/${SHIMS[body]}`);
      if (target) edits.push({ start, end, replacement: relative(file, target) });
      continue;
    }

    // ── 1. `@/` alias ─────────────────────────────────────────────────────
    if (body.includes("@/")) {
      const replacement = body.replace(/(^|[^\w./-])@\/([\w./-]+)/g, (match, lead, spec) => {
        const target = resolveAlias(`@/${spec}`);
        if (!target) return match;
        return `${lead}${relative(file, target)}`;
      });
      if (replacement !== body) edits.push({ start, end, replacement });
    }
  }

  if (edits.length === 0) continue;

  let next = original;
  edits
    .sort((a, b) => b.start - a.start)
    .forEach(({ start, end, replacement }) => {
      next = next.slice(0, start) + replacement + next.slice(end);
    });

  if (next !== original) {
    writeFileSync(file, next);
    changedFiles += 1;
  }
}

// ── 4. Port overrides ──────────────────────────────────────────────────────
// A few upstream modules cannot be made to work in a web/PWA/Capacitor app by
// rewriting specifiers alone (they write theme state onto <html>, or they call
// the Tauri desktop notification plugin). Those live as complete, reviewable
// files under `scripts/recall-port-overrides/` and are copied in on every run,
// so re-syncing the vendored tree can never silently drop the port.
const overridesRoot = path.join(repoRoot, "scripts", "recall-port-overrides");
let overriddenFiles = 0;

if (existsSync(overridesRoot)) {
  for (const source of walk(overridesRoot)) {
    const relativePath = path.relative(overridesRoot, source);
    const destination = path.join(vendorRoot, relativePath);
    copyFileSync(source, destination);
    overriddenFiles += 1;
  }
}

console.log(
  `[recall-vendor-codemod] rewrote imports in ${changedFiles} file(s); applied ${overriddenFiles} port override(s)`,
);
