#!/usr/bin/env node
/**
 * Production build wrapper for `npm run build`.
 *
 * The Revision feature vendors the Recall application (MIT) into
 * `src/revision/recall/**`, which grows the module graph enough that Rollup's
 * chunk-rendering step can exceed Node's *default* old-space limit on machines
 * with ~4 GB of RAM — the build dies with "Ineffective mark-compacts near heap
 * limit" even though every module transformed successfully.
 *
 * Rather than pin a fixed `--max-old-space-size` (too little on big CI runners,
 * too much on small laptops), scale it to the machine and only override it when
 * the caller has not already chosen a limit. The build itself is unchanged: this
 * script just spawns the project's own Vite binary with a larger heap.
 *
 * Any extra arguments are forwarded, e.g. `npm run build -- --minify false`.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";

const require = createRequire(import.meta.url);

/** Vite's package exports do not expose `bin/vite.js`, so resolve by path. */
function resolveViteBin() {
  const candidates = [];
  try {
    candidates.push(path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js"));
  } catch {
    /* vite may be hoisted elsewhere — fall through to the project-local paths */
  }
  candidates.push(path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js"));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    console.error("[build] Could not locate the Vite binary. Run `npm install` first.");
    process.exit(1);
  }
  return found;
}

const totalMb = Math.floor(os.totalmem() / (1024 * 1024));
const heapMb = Math.max(2048, Math.min(4096, Math.floor(totalMb * 0.75)));

const existing = process.env.NODE_OPTIONS ?? "";
const nodeOptions = /--max-old-space-size/.test(existing)
  ? existing
  : `${existing} --max-old-space-size=${heapMb}`.trim();

console.log(`[build] heap ${heapMb} MB (machine ${totalMb} MB) — vite build ${process.argv.slice(2).join(" ")}`.trim());

const result = spawnSync(process.execPath, [resolveViteBin(), "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

if (result.error) {
  console.error("[build] failed to start Vite:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
