#!/usr/bin/env node
// Build the Markdown/math editor support for the shipped My Day workspace.
//
// The surrounding workspace is a static iframe app under public/, so its
// formatting code and KaTeX stylesheet must be bundled as static assets too.
// This uses the root package's existing Marked, KaTeX and esbuild dependencies;
// it does not install or vendor a second editor/parser/math library.

import { build } from "esbuild";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const WORKSPACE = path.join(ROOT, "public/my-day-workspace");
const entry = path.join(ROOT, "src/joplin/myDayNoteFormatting.ts");

await mkdir(WORKSPACE, { recursive: true });
await build({
  entryPoints: [entry],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "DCMyDayNoteFormatting",
  target: ["es2020"],
  outfile: path.join(WORKSPACE, "noteFormatting.js"),
  minify: true,
  legalComments: "none",
  assetNames: "fonts/[name]-[hash]",
  loader: { ".woff2": "file", ".woff": "file", ".ttf": "file", ".eot": "file" },
  logLevel: "info",
});

const indexPath = path.join(WORKSPACE, "index.html");
let indexHtml = await readFile(indexPath, "utf8");
if (!indexHtml.includes("noteFormatting.css")) {
  indexHtml = indexHtml.replace(
    /(<link\s+rel="stylesheet"\s+href="\.\/app\.bundle\.css"\s*\/>)/,
    '$1\n  <link rel="stylesheet" href="./noteFormatting.css" />',
  );
}
if (!indexHtml.includes("noteFormatting.js")) {
  indexHtml = indexHtml.replace(
    /(<script\s+src="\.\/app\.bundle\.js"><\/script>)/,
    '<script src="./noteFormatting.js"></script>\n  $1',
  );
}
await writeFile(indexPath, indexHtml, "utf8");

const manifestPath = path.join(WORKSPACE, "dc-workspace.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const files = [];
const walk = async (directory, relative = "") => {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const nextRelative = relative ? `${relative}/${item.name}` : item.name;
    if (item.isDirectory()) await walk(path.join(directory, item.name), nextRelative);
    else if (nextRelative !== "index.html" && nextRelative !== "dc-workspace.json") files.push(nextRelative);
  }
};
await walk(WORKSPACE);
manifest.assets = files.sort();
manifest.builtAt = new Date().toISOString();
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`[myday:formatting] bundled note formatter + KaTeX into ${path.relative(ROOT, WORKSPACE)}`);
