# Character provenance and deployment notice

The complete `VeryHotShark/RealisticThirdPersonCharacter` reference was downloaded
and inspected at `bf56bcd56c5dd149590d1e5a0dc45575ae2fa95c` (Unreal Engine 5.1).
Its several-GB checkout stays in ignored `.cache/upstream/`; reproduce it with
`npm run character:reference`. It is not bundled in this application.

The reference contains Katiusza, FemaleAnimsetPro and Mixamo assets but no
project-level LICENSE or portable character GLB/FBX export. A public source
checkout and the reference plugin's third-party licenses do not themselves
establish rights to redistribute/deploy these character packs.

**This folder now contains the original Katiusza character-only model**, converted
directly from those pinned UE 5.1 editor-source assets: original mesh, complete
outfit, source textures (downsampled to 2K for web), the 84-bone rig and original
animation clips. The user explicitly confirmed export, web-deployment and
redistribution rights on 2026-10-01; `manifest.json` therefore carries
`licenseConfirmed: true`, and `SOURCE.json` records the acknowledgement, source
commit, mesh SHA-256 and GLB SHA-256. No upstream map, land, sky, houses or
native plugins are imported into the Sanctuary environment. Native Unreal cloth,
ragdoll, Control Rig and Blueprint/AnimGraph behaviour are NOT included.

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

## Web delivery pass (2026-10-01)

The first deployment shipped the full 43.2 MB export. Over a normal connection it
took so long to arrive that the world kept showing a substitute figure, which
made the failure impossible to see. Two changes:

1. **Textures only** were re-encoded for the web: base maps <=2048 px, every
   normal/specular/occlusion map <=1024 px, all as WebP q0.9.
   Textures 33.4 MB -> 2.8 MB; the whole model 43.2 MB -> 11.1 MB.
   Every non-image byte is untouched: mesh, 84-bone skeleton, skin weights,
   materials and all 26 animation clips (all 12013 non-image buffer views are
   byte-identical, verified by SHA-256).
2. **The procedural stand-in figure is deleted.** The Sanctuary now draws the
   authorized character or nothing at all, and the HUD says which.
