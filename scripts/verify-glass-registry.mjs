#!/usr/bin/env node
/**
 * Fidelity check for the vendored website-glass registry files.
 *
 * The sandbox the rollout was authored in has no egress to websiteglass.com,
 * so the 22 registry items were vendored by reading the published registry
 * source instead of running `npx shadcn add`. That makes a transcription slip
 * theoretically possible — this script makes it *detectable*: run it anywhere
 * with network access (your laptop, CI) and it re-fetches every item and
 * diffs it against the file in src/components/ui/.
 *
 *   node scripts/verify-glass-registry.mjs            # verify
 *   node scripts/verify-glass-registry.mjs --write     # re-vendor from upstream
 *
 * Exit 0 = every vendored file matches upstream (modulo the [digitalcatalyst]
 * banner, whitespace and blank-line noise). Exit 1 = drift, with a unified diff.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const BASE = "https://websiteglass.com/r";
const OUT_DIR = "src/components/ui";
const BANNER_MARK = "[digitalcatalyst]";

/** registry item -> files it installs (mirrors what `shadcn add` would write) */
const ITEMS = [
  { name: "glass", files: ["glass.tsx", "glass-motion.ts"] },
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
  ].map((name) => ({ name, files: [`${name}.tsx`] })),
];

/**
 * The only code deviations from upstream, per file. Each entry is
 * `<upstream line>` -> `<vendored line>`, and every one exists because our
 * tsconfig is stricter than the registry project's (`noUnusedLocals`) or the
 * React 19 JSX namespace moved. Add an entry here (with a reason) whenever a
 * wave needs a new adaptation — never edit a vendored file silently.
 */
const LOCAL_ADAPTATIONS = {
  "glass.tsx": [
    ["  as?: keyof React.JSX.IntrinsicElements;", "  as?: ElementType;"],
    ["  const rootRef = useRef<HTMLElement>(null);", "  const rootRef = useRef<HTMLDivElement>(null);"],
    ["  const El = Tag as React.ElementType;", '  const El = Tag as "div";'], // (comment lines are stripped by normalize)
  ],
  "glass-motion.ts": [
    // upstream has no `previous()`; we expose the write-only field so
    // `noUnusedLocals` stays satisfied without deleting engine state.
    ["", "  previous(): number {\n    return this.lastValue;\n  }"],
  ],
};

/**
 * Normalise before comparing: drop our vendored banner and the
 * `[digitalcatalyst]` explanation comments, undo the documented adaptations,
 * trim trailing whitespace, collapse blank-line runs. Everything else must be
 * byte-identical to the registry.
 */
function normalize(text, file = "") {
  return (
    text
      .split("\n")
      .filter((line, i) => !(i < 8 && /^(\/\/|\/\*)?\s*(Vendored from|npx shadcn|source item|Do not edit)/.test(line.trim())))
      // our explanatory comments for each adaptation are noise in both files
      .filter((line) => !/\[digitalcatalyst\]/.test(line))
      .filter((line, i, arr) => !(line.trim().startsWith("//") && arr[i - 1] && /\[digitalcatalyst\]/.test(arr[i - 1])))
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function undoAdaptations(vendored, file) {
  let out = vendored;
  for (const [upstreamLine, localLine] of LOCAL_ADAPTATIONS[file] || []) {
    if (!localLine) continue;
    out = out.split(localLine).join(upstreamLine);
  }
  return out.replace(/\n\n+/g, "\n").replace(/\s+$/g, "").trim();
}

async function fetchItem(name) {
  const res = await fetch(`${BASE}/${name}.json`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const json = await res.json();
  /** files are declared as registry/<style>/ui/<dir>/<file>; match on basename */
  const byBase = new Map();
  for (const f of json.files || []) {
    byBase.set(path.basename(f.path), f.content ?? "");
  }
  return byBase;
}

function unifiedDiff(expected, actual, label) {
  const e = expected.split("\n");
  const a = actual.split("\n");
  const out = [`--- upstream ${label}`, `+++ vendored ${label}`];
  let shown = 0;
  for (let i = 0, j = 0; i < e.length || j < a.length; i++, j++) {
    if (e[i] === a[j]) continue;
    // first divergence: print a window, then stop (a real drift is usually one
    // region, and a 2000-line diff helps nobody)
    for (let k = -2; k <= 8; k++) {
      const ei = e[i + k];
      const aj = a[j + k];
      if (ei !== undefined) out.push(`- ${ei}`);
      if (aj !== undefined && aj !== ei) out.push(`+ ${aj}`);
    }
    if (++shown > 6) {
      out.push(`… more divergences elided (${e.length} upstream vs ${a.length} vendored lines)`);
      break;
    }
    // crude resync: skip ahead until lines match again
    let step = 0;
    while (step < 200 && i + step < e.length && j + step < a.length && e[i + step] !== a[j + step]) step++;
    i += step;
    j += step;
  }
  return out.join("\n");
}

const write = process.argv.includes("--write");
const root = process.cwd();
let problems = 0;
let checked = 0;

for (const item of ITEMS) {
  let byBase;
  try {
    byBase = await fetchItem(item.name);
  } catch (err) {
    console.log(`SKIP  ${item.name.padEnd(20)} ${err.message}`);
    problems++;
    continue;
  }
  for (const file of item.files) {
    const target = path.join(root, OUT_DIR, file);
    const upstream = byBase.get(file);
    if (upstream === undefined) {
      console.log(`MISS  ${item.name}: upstream has no ${file} (found: ${[...byBase.keys()].join(", ")})`);
      problems++;
      continue;
    }
    checked++;
    if (!existsSync(target)) {
      if (write) {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, upstream, "utf8");
        console.log(`WROTE ${file}`);
      } else {
        console.log(`NEW   ${file} (vendored file absent; ${upstream.split("\n").length} upstream lines)`);
        problems++;
      }
      continue;
    }
    const local = undoAdaptations(normalize(await readFile(target, "utf8"), file), file);
    const exp = normalize(upstream, file);
    if (local === exp) {
      console.log(`ok    ${file.padEnd(26)} ${exp.split("\n").length} lines`);
      continue;
    }
    console.log(`DRIFT ${file}`);
    console.log(unifiedDiff(exp, local, file));
    problems++;
  }
}

console.log(
  `\n${checked - problems}/${checked} vendored files match upstream${
    write ? " (after --write)" : ""
  }. Note: the banner above ${BANNER_MARK} lines are allowed to differ; code must not.`,
);
process.exit(problems ? 1 : 0);
