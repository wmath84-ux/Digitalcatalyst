// src/classroom3d/surfaceScale.ts
//
// THE ONE NUMBER THAT DECIDES WHETHER A BOARD SHOWS ANYTHING.
//
// Every live surface in the room (the lecture board, the notes wall, the mind
// wall, the desk tablet) is real DOM welded onto a slab with drei's
// <Html transform>. That component does NOT map one CSS pixel to one world
// unit — it maps DOM pixels to world units through a fixed ratio baked into
// its transform maths:
//
//     drei/web/Html.js, transform branch:
//       transformInnerRef.current.style.transform =
//         getObjectCSSMatrix(matrix, 1 / ((distanceFactor || 10) / 400))
//
//     getObjectCSSMatrix(matrix, f) scales the matrix BASIS by 1 / f
//     (translations are left alone), so with `distanceFactor` unset:
//
//       f = 1 / (10 / 400) = 40   →   basis × 1/40
//
// drei states the same ratio itself when it sizes the optional occlusion
// mesh: `const ratio = (distanceFactor || 10) / 400; w = el.clientWidth * ratio`.
//
// So: **40 CSS pixels = 1 world unit (metre) at scale 1.**
//
// A panel authored at `pixelWidth` px therefore measures
// `pixelWidth / 40 * scale` metres on the slab, and the scale that makes it
// land exactly on a slab `widthMetres` wide is:
//
//     scale = widthMetres / pixelWidth * 40
//
// ── The bug this constant exists to prevent ────────────────────────────────
// Parts 1–14 shipped `scale = widthMetres / pixelWidth`, i.e. the ratio
// WITHOUT the 40. Every surface was therefore rendered at 1/40 of its slab:
// the 6.4 m lecture board carried a 16 cm sliver of DOM, the desk tablet a
// 3 cm one. Nothing was broken, nothing threw, nothing logged — the panels
// were simply drawn too small to see, so all four surfaces read as "the board
// is there but the content never renders". Anything that ever changes
// `pixelWidth`, a slab size or the `distanceFactor` prop must go through the
// helper below, so the mapping can never drift out of sync again.

/**
 * CSS pixels per world unit inside a drei `<Html transform>` whose
 * `distanceFactor` is left unset. Derived from drei's own transform maths —
 * see the file header. Changing `distanceFactor` on a surface invalidates it.
 */
export const HTML_PX_PER_UNIT = 40;

/**
 * The `scale` a `<Html transform>` panel needs so its authored pixel width
 * covers exactly `widthMetres` of slab.
 *
 * @param widthMetres physical width of the surface in the room
 * @param pixelWidth  CSS pixel width the DOM panel is authored at
 */
export const surfaceScale = (widthMetres: number, pixelWidth: number): number =>
  (widthMetres / pixelWidth) * HTML_PX_PER_UNIT;
