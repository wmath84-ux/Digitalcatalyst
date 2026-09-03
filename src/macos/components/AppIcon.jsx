/**
 * EMBED: shared, fail-safe app icon.
 *
 * Upstream points every dock / Launchpad icon at a third-party CDN
 * (macosicons.com, upload.wikimedia.org) with a bare `<img>` and no error
 * handling. Those are hotlinks to hosts we do not control, so any of the
 * usual failures — the CDN being down or rate-limiting, a corporate network
 * or privacy extension blocking it, an offline user — collapses all 24 icons
 * to 0x0 broken images at once.
 *
 * In the dock that is especially confusing: its background is transparent
 * glass, so with no icons inside it the dock reads as "the dock disappeared",
 * even though the element is still mounted and still clickable.
 *
 * This component keeps the CDN icon as the happy path and falls back to a
 * lettered tile. The hue is derived from the app id, so each app keeps the
 * same colour across reloads and stays recognisable by position + colour.
 */

import React, { useState } from "react";

export default function AppIcon({ src, label, id, className = "", fontSize = "45%" }) {
  const [failed, setFailed] = useState(false);

  // Reset if the icon URL itself changes, so a later valid src can recover.
  const [lastSrc, setLastSrc] = useState(src);
  if (src !== lastSrc) {
    setLastSrc(src);
    setFailed(false);
  }

  if (failed || !src) {
    const key = id || label || "?";
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    const hue = hash % 360;
    return (
      <div
        className={`w-full h-full rounded-xl flex items-center justify-center font-semibold text-white select-none ${className}`}
        style={{
          background: `linear-gradient(160deg, hsl(${hue} 62% 58%), hsl(${(hue + 32) % 360} 62% 44%))`,
          fontSize,
        }}
        role="img"
        aria-label={label}
        title={label}
      >
        {String(label || "?").slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={label}
      className={className || "w-full h-full object-cover rounded-xl"}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
