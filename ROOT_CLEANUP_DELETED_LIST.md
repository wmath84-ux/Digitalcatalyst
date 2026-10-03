# Root Folder Cleanup — Deletion List

**Branch:** `arena/01a0e209-digitalcatalyst`
**Date:** 2026-09-27

> Historical inventory: the Sanctuary scene/assets and the two Blender source
> files listed as retained below were removed in a later cleanup on 2026-10-03.
> References to `public/sanctuary/` and those source files describe the state at
> the time of this report, not the current checkout.
**Total: 18 files deleted, ~94,276,882 bytes (≈ 89.9 MiB) freed**

Every file below was verified to have **zero requirement in the code, the app,
the website, or the APK** before deletion — confirmed by grepping `src/`, `api/`,
`utils/`, `ops/`, `scripts/`, `tests/`, `docs/`, `public/`, `android/` (the
Capacitor/APK tree), `vite.config.ts`, `capacitor.config.ts`, `index.html` and
`.github/`.

---

## 1. ZIP / RAR archives (6 files — 77,776,864 B)

Owner-supplied **source downloads that had already been converted to glTF/GLB
and committed under `public/sanctuary/models/`**. The converted outputs are what
the app loads; the archives were dead weight in Git history.

| # | Deleted file | Size | Converted output that replaces it |
|---|--------------|------|-----------------------------------|
| 1 | `rusty-roof-house-3d-model-free.zip` | 34,743,461 B | `public/sanctuary/models/rusty_roof_house.glb` |
| 2 | `the-landscape-is-a-forest-in-the-mountains.zip` | 33,647,995 B | `public/sanctuary/models/mountain_forest.glb` |
| 3 | `Lowpoly+plants+tropical+blend.rar` | 3,378,414 B | `public/sanctuary/models/tropical/*.glb` (6 files) |
| 4 | `shrub_sorrell_01_1k.blend.zip` | 2,123,062 B | `public/sanctuary/models/shrub_sorrell_01_1k.gltf` + `.bin` |
| 5 | `grass_medium_02_1k.blend.zip` | 2,032,791 B | `public/sanctuary/models/grass_medium_02_v1..v5.gltf` + `.bin` |
| 6 | `moss_01_1k.blend.zip` | 1,851,141 B | `public/sanctuary/models/moss_01.gltf` + `.bin` |

## 2. Junk / unrelated TXT files (2 files)

| # | Deleted file | Size | Why it was junk |
|---|--------------|------|-----------------|
| 7 | `Google app script.txt` | 14,945 B | Stray 385-line **draft copy** of the Apps Script, superseded by `gatePersonalAccess.gs` (101 lines). Zero references. **Security note:** it carried hardcoded Razorpay test keys (`rzp_test_…`) plus a key secret, spreadsheet IDs and the admin email in plaintext — worth purging from history, not just the tree. |
| 8 | `my-day-report-2026-08-11.txt` | 1,866 B | A generated *sample output* of the "My Day" feature (personal study data). Zero references — a leftover export, not project input. |

## 3. Broken Git-LFS stub (1 file)

| # | Deleted file | Size | Why it was junk |
|---|--------------|------|-----------------|
| 9 | `plane_crash_by_a_brothel_in_nevada.glb` | 134 B | Not a real model — a **Git-LFS pointer stub** whose body was only `oid sha256:…` / `size 192574980`, pointing at a 192 MB object that was never fetched. Zero references. Accidentally committed. |

## 4. Converted-source GLBs (2 files — 8,698,092 B)

Both had their content already extracted into shipped JPEGs; the GLBs were
cited **only in code comments as provenance**, never imported or loaded.

| # | Deleted file | Size | Shipped replacement |
|---|--------------|------|---------------------|
| 10 | `small_flat_cube_of_water.glb` | 6,000,536 B | `public/sanctuary/water_surface.jpg` + `water_caustics.jpg` + `water_roughness.png`, loaded via `textures.loadWaterPhotos` |
| 11 | `free_-_skybox_anime_sky.glb` | 2,697,556 B | `public/sanctuary/skybox_anime_sky.jpg`, loaded as `ANIME_SKY_URL` in `scene.ts` |

## 5. Stray prototype & Blender asset (2 files — 1,177,986 B)

| # | Deleted file | Size | Why it was junk |
|---|--------------|------|-----------------|
| 12 | `3d_morning_nature_oasis_wildlife.html` | 69,722 B | A standalone Three.js/CDN demo prototype, not part of the Vite app. Zero references in code, config, or the APK tree. |
| 13 | `StylizedWellAsset.blend` | 1,108,264 B | Stray Blender asset. Zero references anywhere — no script reads it, no test names it. |

## 6. Screenshots / AI-generated images (5 files — 6,607,004 B)

| # | Deleted file | Size | Why it was junk |
|---|--------------|------|-----------------|
| 14 | `ChatGPT Image Sep 10, 2026, 08_44_48 PM.png` | 1,783,179 B | Loose AI-generated image dumped in the repo root. Zero references. |
| 15 | `ChatGPT Image Sep 10, 2026, 08_49_44 PM.png` | 1,698,211 B | Same. |
| 16 | `ChatGPT Image Sep 10, 2026, 10_22_36 AM.png` | 1,610,386 B | Same. |
| 17 | `ChatGPT Image Sep 10, 2026, 10_47_53 AM.png` | 1,479,726 B | Same. |
| 18 | `SmartSelect_20260905_222710_Chrome.jpg` | 35,493 B | Android screenshot. Zero references. |

---

## Verification

**Full suite, before vs. after — identical.**

| | Tests | Pass | Fail | Skip |
|---|---|---|---|---|
| Baseline (`HEAD`, pristine worktree) | 2595 | 2487 | 64 | 44 |
| After cleanup (this branch) | 2595 | 2487 | 64 | 44 |

The 64 failures are **pre-existing** and caused solely by `node_modules` not
being installed in this sandbox (several suites `import` from `node_modules`
and self-report *"dependencies not installed — run pnpm install"*). The sorted
list of failing test names was diffed between the two runs and is
**byte-for-byte identical** — this cleanup introduced zero regressions.

Also confirmed after deletion:
- At the time of this report, the converted scene outputs were present in `public/sanctuary/`; they have since been removed with the 3D feature.
- `public/sanctuary/models/rusty_roof_house.CREDIT.txt` reworded so its
  provenance line no longer points at the deleted zip (attribution preserved,
  now cites the upstream CGTrader download).

---

## Deliberately KEPT

| File | Reason |
|------|--------|
| `gatePersonalAccess.gs` | Read directly by `tests/drivePersonalCopyContract.test.mjs:106`. |
| `pahadon ke upar gras replace hill.blend` and `Beach+House_Pack+JSGraphics_CGTrader.blend` | Kept at the time for scene authoring; both were later removed together with the 3D scene and its authoring scripts. |
| `mobile_pricing_page.html` | Cited as the colour/design reference in `src/subscription/components/PricingGlassCard.tsx` and `SubscriptionPage.tsx`. |
| `google01732aa339b62388.html` | Google Search Console site-verification token. |
| `index.html`, `package.json`, `firebase.ts`, `firebase.json`, `.firebaserc`, `vite.config.ts`, `tsconfig*.json`, `firestore.rules`, `storage.rules`, `capacitor.config.ts`, `metadata.json`, `vercel.json`, `.env.example`, `.npmrc`, `pnpm-*.yaml`, `run_tests.sh`, `google-services.json`, `components.json`, `package-lock.json`, `pnpm-lock.yaml`, `firestore.indexes.json` | Live project configuration — not junk. |
| `*.md` reports (`README.md`, `SANCTUARY_*.md`, etc.) | Documentation. |
| `tsconfig.tsbuildinfo` | TypeScript incremental-build cache. Harmless; left alone as it is regenerated on build. |
