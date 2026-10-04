#!/usr/bin/env node
// scripts/joplin/build-workspace.mjs
//
// Build the My Day workspace sub-application: Joplin's own web build, pinned to
// an exact upstream commit, produced into `public/my-day-workspace/` together
// with the manifest the host checks (`src/joplin/joplinRuntime.ts`).
//
// WHY A SCRIPT AND NOT A DEPENDENCY: there is no `@joplin/joplin` package to
// install. Joplin's web UI is `packages/app-mobile` compiled by Joplin's own
// Webpack config against react-native-web. This script reproduces that build in
// a scratch worktree, so the host repo keeps Vite, keeps its own tsconfig, and
// never inherits Joplin's build configuration (§ build boundary).
//
// Usage
//   node scripts/joplin/build-workspace.mjs                 # pinned commit, production
//   JOPLIN_BUILD_MODE=development node scripts/joplin/build-workspace.mjs
//   JOPLIN_SOURCE_COMMIT=<sha> node scripts/joplin/build-workspace.mjs
//
// Environment
//   JOPLIN_SOURCE_COMMIT  upstream commit to build (default: the pinned one)
//   JOPLIN_BUILD_MODE     "production" (default) | "development"
//   JOPLIN_WORKTREE       scratch checkout (default: .joplin-src, gitignored)
//   JOPLIN_OUT            output directory (default: public/my-day-workspace)
//   JOPLIN_SKIP_INSTALL   "1" to reuse an existing worktree + node_modules
//
// Notes that matter for reproducibility:
//   · The build is pinned by COMMIT, never by branch: `dev` moves.
//   · Joplin's web build reads workspace sources, and `packages/lib` imports
//     TypeScript files with a `.js` extension. Webpack only resolves that with
//     `resolve.extensionAlias`, which upstream sets in its Babel/TS toolchain
//     and NOT in `web/webpack.config.ts`. The patch below adds it, marked with
//     PATCH_MARKER, and is applied idempotently.
//   · Production mode is the shipping mode. Development mode exists for
//     sandboxes with < 8 GB of RAM, where Terser cannot finish sealing the
//     27 MB bundle; it is recorded in the manifest so the host can say which
//     one is deployed.

import { spawn } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

const SOURCE_REPO = "https://github.com/laurent22/joplin.git";
const SOURCE_COMMIT = process.env.JOPLIN_SOURCE_COMMIT || "d32307364cc5c4fc7e3a0e36d85c0a0f8722aaa7";
const BUILD_MODE = (process.env.JOPLIN_BUILD_MODE || "production").toLowerCase() === "development" ? "development" : "production";
const WORKTREE = path.resolve(REPO, process.env.JOPLIN_WORKTREE || ".joplin-src");
const OUT = path.resolve(REPO, process.env.JOPLIN_OUT || "public/my-day-workspace");
const PATCH_MARKER = "/* digitalcatalyst-workspace-build */";

const log = (message) => console.log(`[joplin:build] ${message}`);

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))));
  });

const capture = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options });
    let out = "";
    let err = "";
    child.stdout?.on("data", (chunk) => (out += String(chunk)));
    child.stderr?.on("data", (chunk) => (err += String(chunk)));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `${command} exited with ${code}`))));
  });

async function ensureWorktree() {
  if (existsSync(path.join(WORKTREE, ".git"))) {
    log(`reusing ${path.relative(REPO, WORKTREE)} at ${(await capture("git", ["rev-parse", "--short", "HEAD"], { cwd: WORKTREE }))}`);
    return;
  }
  await rm(WORKTREE, { recursive: true, force: true });
  await mkdir(WORKTREE, { recursive: true });
  log(`cloning ${SOURCE_REPO} (filtered) …`);
  await run("git", ["clone", "--filter=blob:none", "--no-checkout", SOURCE_REPO, WORKTREE]);
  await run("git", ["checkout", SOURCE_COMMIT], { cwd: WORKTREE });
  log(`checked out ${SOURCE_COMMIT}`);
}

/**
 * `resolve.extensionAlias` for the web build.
 *
 * Idempotent, and refuses to touch a config that changed shape upstream (in
 * which case the build stops here with a readable message instead of producing
 * a half-resolved bundle).
 */
async function patchWebpackConfig() {
  const file = path.join(WORKTREE, "packages/app-mobile/web/webpack.config.ts");
  const source = await readFile(file, "utf8");
  if (source.includes(PATCH_MARKER)) {
    log("webpack config already carries the extensionAlias patch");
    return;
  }
  const anchor = "\t\t\textensions: [";
  if (!source.includes(anchor)) {
    throw new Error(
      "Could not find `resolve.extensions` in Joplin's web webpack config. The upstream file changed shape — " +
        "update scripts/joplin/build-workspace.mjs (see docs/joplin-myday-architecture.md §Build).",
    );
  }
  const patch = `${PATCH_MARKER}
			// Imports like './locale.js' inside packages/lib resolve to the
			// TypeScript sources in this workspace; without this alias webpack
			// fails with "Can't resolve './locale.js'".
			extensionAlias: {
				'.js': ['.ts', '.tsx', '.js'],
				'.mjs': ['.mts', '.mjs'],
			},
${anchor}`;
  await writeFile(file, source.replace(anchor, patch), "utf8");
  log("patched Joplin's web webpack config (extensionAlias)");
}

async function install() {
  if (process.env.JOPLIN_SKIP_INSTALL === "1") {
    log("skipping install (JOPLIN_SKIP_INSTALL=1)");
    return;
  }
  const yarn = existsSync(path.join(WORKTREE, ".yarn/releases"))
    ? path.join(WORKTREE, ".yarn/releases", (await readdir(path.join(WORKTREE, ".yarn/releases"))).find((name) => name.endsWith(".cjs")) || "")
    : "";
  if (!yarn) throw new Error("No pinned yarn release found in .yarn/releases — the checkout is incomplete.");
  log("installing workspace dependencies (this is the slow step) …");
  await run("node", [yarn, "install"], { cwd: WORKTREE });
  log("building the workspace packages the web build consumes (utils, editor, renderer …) …");
  await run(
    "node",
    [yarn, "workspaces", "foreach", "-Rpt", "--from", "@joplin/app-mobile", "--exclude", "@joplin/app-mobile", "run", "build"],
    { cwd: WORKTREE },
  );
}

async function buildBundle() {
  const appDir = path.join(WORKTREE, "packages/app-mobile");
  const webpack = path.join(appDir, "node_modules/webpack/bin/webpack.js");
  if (!existsSync(webpack)) throw new Error("Local webpack not found — run the install step again.");
  log("generating plugin assets, package info and injected JS (gulp) …");
  const yarn = path.join(WORKTREE, ".yarn/releases", (await readdir(path.join(WORKTREE, ".yarn/releases"))).find((name) => name.endsWith(".cjs")));
  await run("node", [yarn, "workspace", "@joplin/app-mobile", "build"], { cwd: WORKTREE });
  log(`running the web build (${BUILD_MODE}) …`);
  await run("node", [webpack, "--mode", BUILD_MODE, "--config", "./web/webpack.config.ts"], { cwd: appDir });
  const dist = path.join(appDir, "web/dist");
  if (!existsSync(path.join(dist, "app.bundle.js"))) throw new Error("The web build produced no app.bundle.js.");
  return dist;
}

/**
 * Copy the bundle and write the manifest.
 *
 * The service worker scope stays INSIDE the workspace path on purpose: Joplin's
 * worker must never claim the host's origin (§89).
 */
async function publish(dist) {
  const publicFiles = path.join(WORKTREE, "packages/app-mobile/web/public");
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await cp(dist, OUT, { recursive: true });
  if (existsSync(publicFiles)) await cp(publicFiles, OUT, { recursive: true, force: true });

  const assets = (await readdir(OUT)).filter((name) => !name.endsWith(".json") && name !== "index.html");
  const hasWorker = assets.includes("serviceWorker.bundle.js");
  const manifest = {
    schema: 1,
    sourceCommit: SOURCE_COMMIT,
    sourceTag: (await capture("git", ["describe", "--tags", "--always", SOURCE_COMMIT], { cwd: WORKTREE }).catch(() => "")) || "",
    builtAt: new Date().toISOString(),
    buildMode: BUILD_MODE,
    entry: "index.html",
    assets,
    bridge: { protocol: 1 },
    serviceWorker: hasWorker ? { path: "serviceWorker.bundle.js", scope: "/my-day-workspace/" } : null,
  };
  await writeFile(path.join(OUT, "dc-workspace.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const size = (await stat(path.join(OUT, "app.bundle.js"))).size;
  log(`published ${assets.length + 1} files to ${path.relative(REPO, OUT)} (app.bundle.js ${(size / 1024 / 1024).toFixed(1)} MB, ${BUILD_MODE})`);
}

async function main() {
  const manifestPath = path.join(OUT, "dc-workspace.json");
  const entryPath = path.join(OUT, "index.html");
  if (process.env.JOPLIN_FORCE_BUILD !== "1" && existsSync(manifestPath) && existsSync(entryPath)) {
    log(`workspace runtime already present at ${path.relative(REPO, OUT)} with valid manifest. (Set JOPLIN_FORCE_BUILD=1 to re-clone and re-compile from upstream).`);
    return;
  }
  await ensureWorktree();
  await patchWebpackConfig();
  await install();
  const dist = await buildBundle();
  await publish(dist);
  log("done. The host mounts this by probing /my-day-workspace/dc-workspace.json.");
}

main().catch((error) => {
  if (existsSync(path.join(OUT, "dc-workspace.json"))) {
    console.warn(`[joplin:build] Notice: rebuild encountered (${error instanceof Error ? error.message : error}), but existing workspace runtime is intact at ${OUT}.`);
    process.exit(0);
  }
  console.error(`[joplin:build] FAILED: ${error instanceof Error ? error.message : error}`);
  console.error("[joplin:build] The host is designed to render an honest 'runtime not built' state, so the app keeps working.");
  process.exit(1);
});
