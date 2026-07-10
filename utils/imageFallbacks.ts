export type ImageFallbackAspect = 'square' | 'video' | 'portrait' | 'wide' | 'original' | 'auto';

export interface ImageFallbackOptions {
  title?: string;
  badge?: string;
  message?: string;
  icon?: string;
  aspect?: ImageFallbackAspect;
}

const FALLBACK_SIZES: Record<ImageFallbackAspect, readonly [number, number]> = {
  square: [800, 800],
  video: [1280, 720],
  portrait: [720, 960],
  wide: [1440, 640],
  original: [1200, 800],
  auto: [1200, 800],
};

const cleanText = (value: unknown, fallback: string, maxLength: number): string => {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (normalized || fallback).slice(0, maxLength);
};

const escapeXml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const buildImageFallbackDataUrl = ({
  title,
  badge,
  message,
  icon,
  aspect = 'video',
}: ImageFallbackOptions = {}): string => {
  const [width, height] = FALLBACK_SIZES[aspect] ?? FALLBACK_SIZES.video;
  const safeTitle = escapeXml(cleanText(title, 'Digital Catalyst', 52));
  const safeBadge = escapeXml(cleanText(badge, 'Learning resource', 30).toUpperCase());
  const safeMessage = escapeXml(cleanText(message, 'Image preview unavailable', 64));
  const safeIcon = escapeXml(cleanText(icon, '🎓', 4));
  const compact = height <= 700;
  const iconY = compact ? Math.round(height * 0.38) : Math.round(height * 0.4);
  const badgeY = Math.round(height * 0.16);
  const titleY = compact ? Math.round(height * 0.62) : Math.round(height * 0.64);
  const messageY = compact ? Math.round(height * 0.72) : Math.round(height * 0.73);
  const iconSize = Math.max(70, Math.round(Math.min(width, height) * 0.16));
  const titleSize = Math.max(34, Math.round(Math.min(width, height) * 0.064));
  const messageSize = Math.max(22, Math.round(Math.min(width, height) * 0.035));
  const badgeSize = Math.max(18, Math.round(Math.min(width, height) * 0.028));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeTitle}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#071A3D"/>
      <stop offset="0.58" stop-color="#17458D"/>
      <stop offset="1" stop-color="#8B6B2A"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.18" cy="0.12" r="0.9">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <rect x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.07)}" width="${Math.round(width * 0.86)}" height="${Math.round(height * 0.86)}" rx="${Math.round(Math.min(width, height) * 0.055)}" fill="#FFFFFF" fill-opacity="0.07" stroke="#FFFFFF" stroke-opacity="0.18"/>
  <text x="50%" y="${badgeY}" text-anchor="middle" dominant-baseline="middle" fill="#F7DFA3" font-family="Arial, Helvetica, sans-serif" font-size="${badgeSize}" font-weight="700" letter-spacing="3">${safeBadge}</text>
  <text x="50%" y="${iconY}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="${iconSize}">${safeIcon}</text>
  <text x="50%" y="${titleY}" text-anchor="middle" dominant-baseline="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="800">${safeTitle}</text>
  <text x="50%" y="${messageY}" text-anchor="middle" dominant-baseline="middle" fill="#D9E6FF" font-family="Arial, Helvetica, sans-serif" font-size="${messageSize}" font-weight="500">${safeMessage}</text>
</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};
