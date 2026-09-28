# Sanctuary: board playback and occlusion fix

## Root causes

1. `pinFace` moved the portal surface from its CSS3D host to the overlay with
   `appendChild`; `clearPin` moved it back. Moving an existing iframe between
   parents destroys/recreates its browsing context in browsers. Keeping the
   React component mounted did not prevent YouTube reloading.
2. Visibility was treated as media suspension (`display:none`). Camera/frustum
   changes should control painting, not a player's lifetime.
3. `boardIsOccluded` hid the entire page when the centre sightline, or just two
   perimeter samples, intersected approximate tree/building/terrain bounds.
   The dark physical backing then looked like a suddenly black board.

## Implementation

- Hosts and portal surfaces mount once and remain connected until disposal.
- World view uses a homogeneous CSS matrix derived from the Three camera and
  board transform. Framed view changes only the same host's styles to a native
  2D rectangle. There is no DOM reparenting or renderer transform-cache handoff.
- Back-face/frustum culling hides paint using `visibility`, without removing the
  iframe or changing its URL. Audio/playback intentionally remains player-owned.
- WebGL now composites above the DOM with alpha enabled. Three depth-tested
  zero-alpha board apertures reveal the pages. Real foreground geometry covers
  only its own pixels; the old sampled all-or-nothing occlusion is removed.
- Apertures render in the opaque depth pass with a minimal shader (stock opaque
  MeshBasicMaterial would force alpha to one). They do not cast shadows.
- Aperture visibility updates before WebGL rendering. Resize, zoom/projection,
  board scaling and camera pose invalidate the projection cache.

## Verification

- `npx tsc --noEmit --pretty false`: passed.
- `npm run build`: passed.
- `node --test tests/nature3dBoardPinRuntime.test.mjs`: six tests passed.
- `tests/nature3dBoardBrowser.test.mjs`: passed in real headless Chromium with
  software WebGL. Checks actual framebuffer alpha under a foreground box,
  uncovered board pixels, iframe window/document identity and load count across
  pin/unpin/view/zoom cycles, retained iframe state, and native iframe clicks.
- Browser test requires `npx playwright install chromium`, or an installed binary
  supplied through `BOARD_TEST_CHROMIUM`; it explicitly skips if none is present.
- Broad Sanctuary source-contract suite has 16 failures, also reproduced against
  the unchanged HEAD sources (old FPP/walking/UI contracts). No new failures.
- Winter runtime suite: 8 passed, one unrelated existing furniture mesh-count
  assertion failed (`shaders.length > 10`); its tested modules were unchanged.

The browser fixture is local and deterministic, not a live YouTube integration
check. A signed-in device check with a real course/YouTube video remains useful:
play midway, switch to Desk and back, zoom out/in, pass behind trees/houses, and
verify continuity plus partial occlusion on reading, notes and mind-map boards.
