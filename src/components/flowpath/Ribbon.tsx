import { memo } from "react";
import { buildSmoothPath, type Point } from "../../flowpath/lib/layout";

interface RibbonProps {
  width: number;
  height: number;
  visibleChunks: Point[][];
  isDarkMode?: boolean;
}

function RibbonInner({ width, height, visibleChunks, isDarkMode = true }: RibbonProps) {
  if (width <= 0 || height <= 0) return null;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <defs>
        <linearGradient id="fp-core-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isDarkMode ? "#8b7bff" : "#6366f1"} stopOpacity={isDarkMode ? "0.85" : "0.75"} />
          <stop offset="45%" stopColor={isDarkMode ? "#5eead4" : "#06b6d4"} stopOpacity={isDarkMode ? "0.7" : "0.65"} />
          <stop offset="100%" stopColor={isDarkMode ? "#8b7bff" : "#6366f1"} stopOpacity={isDarkMode ? "0.85" : "0.75"} />
        </linearGradient>
        <filter id="fp-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={isDarkMode ? "7" : "5"} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {visibleChunks.map((pts, i) => {
        if (pts.length < 2) return null;
        const d = buildSmoothPath(pts);
        return (
          <g key={i}>
            {/* volumetric outer glow */}
            <path
              d={d}
              stroke="url(#fp-core-grad)"
              strokeWidth={22}
              fill="none"
              strokeLinecap="round"
              opacity={0.12}
              filter="url(#fp-glow)"
            />
            {/* translucent ribbon body */}
            <path
              d={d}
              stroke={"rgba(255,255,255,0.06)"}
              strokeWidth={12}
              fill="none"
              strokeLinecap="round"
            />
            {/* glowing inner core */}
            <path
              d={d}
              stroke="url(#fp-core-grad)"
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
              opacity={0.9}
            />
          </g>
        );
      })}
    </svg>
  );
}

export const Ribbon = memo(RibbonInner);
