// scripts/vite-plugin-strata-resolve.mjs
//
// Resolver shim for the published @strata-game-library/* packages.
//
// THE PROBLEM
//   Those packages are built as ESM ("type": "module") but their emitted code
//   uses TypeScript-style EXTENSIONLESS DIRECTORY specifiers throughout:
//
//     export * from './compose';        // really ./compose/index.js
//     export * from './components/ai';  // really ./components/ai/index.js
//
//   There are ~240 of these across @strata-game-library/core alone. That is
//   invalid ESM: Node rejects it with ERR_UNSUPPORTED_DIR_IMPORT, and Vite's
//   SSR pass and dependency pre-bundling fail the same way. It is a packaging
//   bug upstream, not something the app can fix by importing differently.
//
// THE FIX
//   Intercept relative specifiers coming from inside those packages and finish
//   the resolution the way the TypeScript compiler would have: try the path
//   with `.js`, then `/index.js`. Everything else is left untouched, so this
//   cannot affect the app's own modules.

import fs from "node:fs";
import path from "node:path";

const PACKAGE_MARKER = `${path.sep}@strata-game-library${path.sep}`;

/** Resolve `./foo` → `./foo.js` or `./foo/index.js`, mirroring tsc's output. */
function resolveCandidate(absolutePath) {
  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
    return absolutePath;
  }
  const withJs = `${absolutePath}.js`;
  if (fs.existsSync(withJs)) return withJs;

  const indexJs = path.join(absolutePath, "index.js");
  if (fs.existsSync(indexJs)) return indexJs;

  return null;
}

export default function strataResolve() {
  return {
    name: "strata-game-library-dir-imports",
    enforce: "pre",

    resolveId(source, importer) {
      if (!importer || !importer.includes(PACKAGE_MARKER)) return null;
      if (!source.startsWith(".")) return null;
      // Already a concrete file specifier — nothing to repair.
      if (path.extname(source)) return null;

      const resolved = resolveCandidate(path.resolve(path.dirname(importer), source));
      return resolved ?? null;
    },
  };
}
