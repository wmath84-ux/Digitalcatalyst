# Original threejs-world integration

## Source and reproducibility

- Upstream: https://github.com/imsarah/threejs-world.git
- Pinned commit: `398320e9bcf74bf4c15532fafff4c565f7729b37`.
- `vendor/threejs-world/` contains the pinned upstream source plus documented mobile optimizations, tooling,
  configuration, package lock, README, MIT license and reference documentation.
- Only `shots/` (164 MB of generated upstream QA screenshots, not runtime assets)
  is omitted. `vendor/threejs-world.upstream.json` records SHA-256 hashes of every
  included upstream file. `threejs-world.local.json` records the explicit local
  modifications and their hashes; untouched files still match upstream. Nothing
  is cloned from a moving branch during builds.
- Runtime terrain, meshes, materials, vegetation, water and skies are generated
  procedurally by the original engine, not approximated using the README image.

## One desktop world on every device

The existing Game header buttons launch the **same desktop entry** on desktop,
phone and tablet:

```
/game-world/index.html?scene=world&nogate=1
```

`nogate=1` is upstream's documented switch to bypass the device/browser gate. It
lets tablets and phones attempt the full desktop world. The engine still probes WebGPU; unsupported browsers/GPUs see the original
failure diagnostics. This flag does NOT add WebGPU support or improve performance.

The same world now selects conservative mobile/tablet rendering budgets, uses
adaptive resolution and provides touch controls. See
[Mobile optimization](game-world-mobile-optimization.md) for exact tradeoffs,
implemented techniques, validation and limitations. The seed, world dimensions,
heightfield generation, walking spawn and time of day are preserved. The upstream
`mobile.html` entry remains vendored but is **not used by any Game button**.

The linked README image depicts this engine, not a guaranteed identical starting
frame. Upstream's current default walking spawn is used. Its bookmarks (1–9) and
flythrough (F) are available with the original keyboard controls.

## Build and run

```
npm ci
npm run dev
# or
npm run build
```

Both commands run `scripts/build-game-world.mjs` first. It installs the upstream
locked dependencies with npm in an isolated directory (Three 0.184.0, independent
of the learning app's Three version), type-checks the local engine, and builds the full-world
entry with CLI overrides for a relative asset base and output directory.
`public/game-world/` is generated and ignored by Git. Vite serves it in development
and copies it to `dist/game-world/` for deployment and Capacitor sync. Dependency
installation needs registry access on a clean build. The learning app's pnpm
workspace/lockfile does not manage or alter these isolated upstream dependencies.

`npm run build:game-world` rebuilds just the vendor output after intentional changes.
MIT notices for the world and Three.js ship alongside the generated files.

## Integration lifecycle / opening fix

- All three headers (Home, shared phone header, DesktopShell global toolbar)
  call the same launcher. DesktopShell now has its own Game action, including
  routes where the per-page header is hidden.
- Game uses a normal full-page navigation to the local world. It no longer needs
  a React custom-event listener, a mounted portal, native dialog support, or an
  iframe. Leaving the learning app also releases its active rendering workload.
- The launcher remembers the app URL in sessionStorage when available. The game
  HTML has a persistent same-origin-validated **Back to app** link and **Restart
  world** button, independent of the engine bundle successfully loading.
- Native browser Back also returns to the app. Returning reloads the app route;
  unsaved component-local state is not preserved by the standalone navigation.
- Boot progress, missing-file errors and a slow-generation notice are visible.
  WebGPU failures keep their original diagnostics, with navigation above them.
- The service worker no longer substitutes cached app HTML for failed game
  navigation. Offline users see an explicit connection-required page instead.
- The old custom GameEnvironment and React GameWorldHost/iframe implementation
  are deleted. The upstream scene chooser is removed and `mobile.html` is no
  longer a build entry. Its reference source remains vendored but is not deployed.
- The renderer now receives a device from the same core adapter whose capabilities
  were probed, rather than letting Three make a second compatibility-mode request
  with potentially different limits.

## Verification

Run the integration contracts and DOM lifecycle tests:

```
node --test tests/gameEnvironmentRemovalContract.test.mjs tests/gameWorldIntegrationContract.test.mjs tests/gameWorldRuntime.test.mjs
```

Browser tests confirmed real Game-tab navigation and Back on desktop/tablet/phone
profiles, including the unsupported-WebGPU diagnostic. They do not claim full-world
GPU rendering/performance validation. Visual fidelity,
WebGPU driver support, touch usability and frame rate require testing on real target
phones/tablets/desktops before claiming performance targets are met.
