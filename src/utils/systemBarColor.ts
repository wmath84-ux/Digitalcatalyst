// src/utils/systemBarColor.ts
//
// Pure colour maths for the system bars (no DOM, no Capacitor), so it can be
// unit-tested directly. See systemBars.ts for how the colours are used.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

export const OPAQUE_WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
export const OPAQUE_BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

/** Parse `rgb()/rgba()` (what getComputedStyle returns) or `#rgb` / `#rrggbb`. */
export function parseCssColor(value: string | null | undefined): Rgba | null {
  if (!value) return null;
  const text = value.trim().toLowerCase();
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const rgb = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : rgb[5] ? Number(rgb[4]) / 100 : Number(rgb[4]);
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: Math.min(1, Math.max(0, alpha)),
    };
  }
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].split("").map((ch) => ch + ch).join("") : hex[1];
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 1,
    };
  }
  return null;
}

/** `top` drawn over `under` (source-over). */
export function compositeOver(top: Rgba, under: Rgba): Rgba {
  const a = top.a + under.a * (1 - top.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, u: number) => (t * top.a + u * under.a * (1 - top.a)) / a;
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a };
}

export function toHex({ r, g, b }: Rgba): string {
  const part = (channel: number) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG relative luminance of an opaque colour (0 = black, 1 = white). */
export function relativeLuminance({ r, g, b }: Rgba): number {
  const lin = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Dark icons (black glyphs) when they give the better contrast against this
 * background — the WCAG rule of picking whichever of black / white contrasts
 * more. A light background therefore gets dark icons and a dark one light icons.
 */
export function prefersDarkIcons(color: Rgba): boolean {
  const L = relativeLuminance(color);
  const contrastWithBlack = (L + 0.05) / 0.05;
  const contrastWithWhite = 1.05 / (L + 0.05);
  return contrastWithBlack > contrastWithWhite;
}

