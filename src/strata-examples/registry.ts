// src/strata-examples/registry.ts
//
// Loader boundary for the vendored Strata examples.
//
// Everything under `src/strata-examples/` except this file is vendored
// VERBATIM from jbcom/strata-game-library so the scenes run exactly as
// upstream ships them. Those sources target the library's git HEAD, which is
// ahead of the published npm packages in a few signatures (`fbm` gained a 5th
// argument, `BiomeData` changed shape, a couple of imports went unused). They
// RUN correctly against the installed packages — every code path they exercise
// is present — but they do not typecheck against them, and patching them would
// defeat the point of installing them as-is.
//
// `tsconfig.json` therefore excludes the folder. A static `import()` of an
// excluded file would drag it back into the program, so the specifiers are
// built through `import.meta.glob`, which Vite resolves at build time while
// TypeScript only ever sees an opaque record of loader functions.

import type { ComponentType } from "react";

type ExampleModule = { App: ComponentType };

/** Every vendored example's entry component, keyed by folder name. */
const modules = import.meta.glob<ExampleModule>("./*/App.tsx");

/** Load one example's `App` component, or throw if the id is unknown. */
export async function loadExample(id: string): Promise<ComponentType> {
  const loader = modules[`./${id}/App.tsx`];
  if (!loader) {
    throw new Error(`Unknown Strata example "${id}".`);
  }
  const mod = await loader();
  return mod.App;
}
