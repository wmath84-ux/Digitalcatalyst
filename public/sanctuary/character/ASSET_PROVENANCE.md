# Character provenance and deployment notice

The complete `VeryHotShark/RealisticThirdPersonCharacter` reference was downloaded
and inspected at `bf56bcd56c5dd149590d1e5a0dc45575ae2fa95c` (Unreal Engine 5.1).
Its several-GB checkout stays in ignored `.cache/upstream/`; reproduce it with
`npm run character:reference`. It is not bundled in this application.

The reference contains Katiusza, FemaleAnimsetPro and Mixamo assets but no
project-level LICENSE or portable character GLB/FBX export. A public source
checkout and the reference plugin's third-party licenses do not themselves
establish rights to redistribute/deploy these character packs.

**No original Katiusza mesh or paid animation assets are currently distributed
here.** `manifest.json` deliberately has `modelUrl: null` and
`licenseConfirmed: false`. The live six-foot figure is the original procedural
Sanctuary web guide, not Katiusza. No upstream map, land, sky, houses or native
plugins are imported into the Sanctuary environment.

For an authorized character-only GLB, use the explicit `--license-confirmed`
installer and retain its SHA-256/rights acknowledgement in `SOURCE.json`.
The operator must verify export, web deployment and distribution rights before
publishing; this notice grants no third-party asset rights. Never publish paid
source packs as standalone archives.

Native Unreal Blueprint/Control Rig, physical-animation ragdoll and skirt cloth
systems do not execute merely because a GLB is imported. Exact original
appearance and full native behavior are pending, not claimed as completed.
See `docs/sanctuary-character-integration.md` in the source repository for the
feature matrix, authorized export pipeline, controls and regression checks.
