// src/strata-shim/core.ts
//
// `strata-game-library/core` — verbatim re-export shim.
//
// WHY THIS FILE EXISTS
//   The Strata repo ships an umbrella package called `strata-game-library`
//   whose only job is to re-export the scoped `@strata-game-library/*`
//   packages (see packages/strata-game-library/src/*.ts in
//   jbcom/strata-game-library). That umbrella package is NOT published to npm
//   — only the scoped packages are — so the upstream examples, which import
//   from `strata-game-library/...`, cannot resolve out of the box.
//
//   These shim modules reproduce the umbrella package's mapping, and
//   `vite.config.ts` aliases `strata-game-library/*` onto them. That lets the
//   upstream example apps in `src/strata-examples/` be vendored
//   BYTE-FOR-BYTE with their original imports intact.
//
// WHY THE SUBMODULES ARE LISTED ONE BY ONE
//   `@strata-game-library/core`'s own root barrel (dist/index.js) re-exports
//   with EXTENSIONLESS DIRECTORY specifiers (`export * from './compose'`),
//   which is invalid ESM — Node throws ERR_UNSUPPORTED_DIR_IMPORT and Vite's
//   SSR/prebundle passes fail the same way. Importing each submodule's
//   `index.js` explicitly sidesteps that packaging bug while exposing exactly
//   the same surface: compose + core + game + hooks + shaders + utils + world.
//
//   The `./api` subpath is a narrower curated barrel that omits the world
//   systems (createWorldGraph, createRegionSystem, createSpawnSystem,
//   createConnectionSystem) and instancing helpers the examples rely on, so it
//   is deliberately not used here.
//
//   `@strata-core-dist/*` is a Vite alias onto that package's dist folder,
//   because the package's `exports` map does not expose these deep paths.

export * from "@strata-core-dist/compose/index.js";
export * from "@strata-core-dist/core/index.js";
export * from "@strata-core-dist/game/index.js";
export * from "@strata-core-dist/hooks/index.js";
export * from "@strata-core-dist/shaders/index.js";
export * from "@strata-core-dist/utils/index.js";
export * from "@strata-core-dist/world/index.js";
