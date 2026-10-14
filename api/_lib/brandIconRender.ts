// api/_lib/brandIconRender.ts
//
// The sharp-backed half of the brand icon pipeline (see imageTools.ts for the
// geometry and the reasoning). Kept in its own module so the pure placement
// maths can be unit-tested on a machine without a native sharp build, and so a
// platform that ships the function without sharp can degrade to proxying the
// original image instead of failing the request.
//
// sharp is loaded lazily and its failure is a VALUE (`null`), never an
// exception: /api/brand-icon must keep returning an icon no matter what the
// runtime image contains.

import { ICON_PLATE, planBrandIconImage, type IconVariant, type RgbaImage } from "./imageTools.js";

type SharpModule = typeof import("sharp");

let sharpPromise: Promise<SharpModule | null> | null = null;

/** Resolved once per instance; `null` when sharp is unavailable. */
export function loadSharp(): Promise<SharpModule | null> {
  if (!sharpPromise) {
    sharpPromise = import("sharp")
      .then((module) => (module as unknown as { default?: SharpModule }).default ?? (module as unknown as SharpModule))
      .catch((error) => {
        console.warn("[brand-icon] sharp is unavailable in this runtime — serving the original image", error);
        return null;
      });
  }
  return sharpPromise;
}

/** Decode any sharp-readable buffer into straight RGBA. */
export async function decodeToRgba(sharp: SharpModule, buffer: Buffer): Promise<RgbaImage> {
  const { data, info } = await sharp(buffer)
    .rotate() // honour EXIF orientation (a phone photo logo can be sideways)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 4 };
}

/**
 * Render one icon variant as exactly `size × size` PNG. Returns `null` only
 * when the source cannot be decoded, so the caller can fall back to the raw
 * file. The declared `sizes` in the manifest are a promise to Chrome — an icon
 * that is not the size it claims is rejected for installability — so a TILE is
 * resized to the canvas (`cover`) rather than passed through at its own size.
 */
export async function renderBrandIcon(
  sharp: SharpModule,
  buffer: Buffer,
  options: { size: number; variant: IconVariant },
): Promise<{ body: Buffer; contentType: string } | null> {
  const image = await decodeToRgba(sharp, buffer);
  const plan = planBrandIconImage({ image, size: options.size, variant: options.variant });

  // An opaque upload is a finished square design: fill the canvas, no padding.
  if (plan.kind === "passthrough") {
    const body = await sharp(buffer)
      .rotate()
      .resize(plan.size, plan.size, { fit: "cover", kernel: "lanczos3" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { body, contentType: "image/png" };
  }

  const cropped = await sharp(buffer)
    .rotate()
    .ensureAlpha()
    .extract({ left: plan.bounds.left, top: plan.bounds.top, width: plan.bounds.width, height: plan.bounds.height })
    .resize(plan.width, plan.height, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  const background = plan.plate ?? { r: 0, g: 0, b: 0, alpha: 0 };
  const body = await sharp({ create: { width: plan.size, height: plan.size, channels: 4, background } })
    .composite([{ input: cropped, left: plan.left, top: plan.top }])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();

  return { body, contentType: "image/png" };
}

export { ICON_PLATE };
