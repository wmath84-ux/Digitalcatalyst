// src/strata-shim/presets.ts
//
// `strata-game-library/presets` → the published scoped presets package.
// See src/strata-shim/core.ts for why this shim exists.
//
// The presets package's ROOT barrel only re-exports the creature / structure /
// collectible / obstacle / equipment / vehicle authoring helpers. The terrain
// and vegetation generators the examples use live behind their own subpath
// exports, so they are folded back in here — which is what the upstream
// umbrella package's `presets` entry exposes as one surface.
export * from "@strata-game-library/presets";
export * from "@strata-game-library/presets/vegetation";
export * from "@strata-game-library/presets/terrain";
