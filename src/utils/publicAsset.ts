// src/utils/publicAsset.ts
//
// ONE resolver for every static asset that ships from the `public/` folder.
//
// ── Why this module exists (the Revision PNG incident) ──────────────────
// Small PNGs referenced from the Revision / Recall surfaces were built by
// string-concatenating `${import.meta.env.BASE_URL}` onto a file name, and a
// few other spots hard-coded a leading-slash path (`/images/…`). Two failure
// modes fell out of that:
//
//   1. FRAGILE JOINING — `BASE_URL` is `/` in the root deployment but can be
//      `./` or `/sub/` on Netlify branch deploys and inside the Capacitor
//      WebView. A naïve `${BASE_URL}foo.png` double-slashes on `/` and drops
//      the slash on `./`, producing a URL that 404s on exactly those targets.
//   2. MISSING FILES — the resolver alone cannot save an asset that was never
//      committed. The Recall lettermark variants were referenced at runtime
//      but never landed in `public/`, so the browser had nothing to fetch and
//      painted a broken-image box. Every consumer now points at a REAL,
//      committed asset (see `REVISION_BRAND_MARK`) and a contract test
//      (`tests/revisionPublicAssetsContract.test.mjs`) fails the build if any
//      referenced `public/` path stops existing on disk.
//
// The contract: pass a path relative to `public/` with or without a leading
// slash; get back an absolute URL that is correct in development, production
// builds, Netlify sub-path deploys and the Capacitor/Android WebView. This is
// a pure URL computation — it never touches the file, never applies a CSS
// filter, and never changes what the PNG looks like.

const rawBase =
  typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env.BASE_URL === "string"
    ? import.meta.env.BASE_URL
    : "/";

/** The deployment base, normalised to always end in exactly one "/". */
const BASE = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

/**
 * Resolve a `public/`-relative asset path to an absolute URL.
 *
 * @param path Path relative to `public/`, e.g. `"images/gen-concept.png"` or
 *             `"/images/gen-concept.png"`. Both forms are accepted.
 */
export function publicAssetUrl(path: string): string {
  const clean = String(path ?? "").replace(/^\/+/, "").replace(/^\.\/+/, "");
  // Join without ever producing a double slash regardless of BASE shape.
  return BASE === "/" ? `/${clean}` : `${BASE}${clean}`;
}

/**
 * The canonical Revision / Recall brand mark.
 *
 * The Recall lettermark light/dark/transparent variants were once referenced
 * as three separate PNGs that never existed in `public/`. The one real,
 * committed brand glyph that reads on any surface (it is a saturated mark on a
 * transparent channel) is the branding source. Every Recall surface resolves
 * its logo / mascot through this single path, so there is exactly one file to
 * ship and exactly one place it can go missing.
 */
export const REVISION_BRAND_MARK = "branding/logo-source.png";

/**
 * Resolve the Recall brand mark for a requested presentation variant.
 * All variants map to the single committed glyph — the colour mark is
 * legible on light, dark and tinted surfaces, so no per-theme PNG (and no CSS
 * inversion) is required.
 */
export function revisionBrandMarkUrl(
  _variant: "light" | "dark" | "transparent" | "auto" = "auto",
): string {
  return publicAssetUrl(REVISION_BRAND_MARK);
}
