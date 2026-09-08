// src/strata-shim/compose.ts
// `strata-game-library/compose` → the scoped core package's compose barrel.
// See src/strata-shim/core.ts for why this shim exists, and why the barrel is
// reached through the `@strata-core-dist` alias rather than a package subpath.
export * from "@strata-core-dist/compose/index.js";
