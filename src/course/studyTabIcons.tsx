// src/course/studyTabIcons.tsx
//
// Custom dock-tab glyphs for the Course Player's study pane.
//
// The dock's icon contract is `{ size, className, style }` (the same props a
// lucide icon takes), so these components drop straight into the TABS list in
// src/course/CourseOverlay.tsx and into the study peek rail.

import type { CSSProperties } from "react";

interface TabIconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The AI tab's own mark — a violet→cyan spark with two orbiting nodes. It is
 * deliberately NOT a stock sparkle: the gradient + satellite dots read as
 * "AI" at 15px (peek rail) as well as at 22px (dock plate), and the gradient
 * is painted in-SVG so the glyph keeps its identity on any plate colour.
 */
export function AiTabIcon({ size = 22, className, style }: TabIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
      data-study-tab-icon="ai"
    >
      <defs>
        <linearGradient id="dc-ai-tab-glyph" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#B388FF" />
          <stop offset="0.55" stopColor="#7DD3FC" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      {/* The spark — a four-point star with a soft waist, the AI cue. */}
      <path
        d="M12 1.8c.78 4.9 2.72 6.84 7.62 7.62-4.9.78-6.84 2.72-7.62 7.62-.78-4.9-2.72-6.84-7.62-7.62 4.9-.78 6.84-2.72 7.62-7.62Z"
        fill="url(#dc-ai-tab-glyph)"
      />
      {/* The circuit tail — two nodes trailing the spark, the "thinking" cue. */}
      <path
        d="M6.2 15.4c1.7.5 3.1 1.2 4.4 2.4"
        stroke="url(#dc-ai-tab-glyph)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="5" cy="15" r="1.5" fill="url(#dc-ai-tab-glyph)" />
      <circle cx="12.4" cy="19.4" r="1.9" fill="url(#dc-ai-tab-glyph)" />
      <circle cx="19.4" cy="17.6" r="1.1" fill="url(#dc-ai-tab-glyph)" opacity="0.7" />
    </svg>
  );
}
