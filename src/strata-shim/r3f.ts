// src/strata-shim/r3f.ts
//
// `strata-game-library/r3f` — the React Three Fiber component surface.
//
// Upstream this is the `@strata-game-library/r3f` package, which is NOT
// published to npm (only core / presets / shaders are). Every R3F component
// the vendored examples actually use — ProceduralSky, Water, AdvancedWater —
// ships inside `@strata-game-library/core/components`, so this shim points
// there and the example imports resolve unchanged.
//
// The r3f-only game-shell exports (StrataGame, RuntimeCreature, RuntimeProp,
// createGameHUD, createPauseMenu) have no published home, which is why the
// two upstream examples that need them (api-showcase, declarative-game) are
// not vendored.
export * from "@strata-game-library/core/components";
