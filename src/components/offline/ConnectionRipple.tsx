/**
 * Connection / energy field around the EduOS mark.
 *
 * Adapted from Magic UI Ripple (MIT) — concentric rings that pulse behind a
 * focal element — restyled to EduOS cyan / violet glass. The `lost` phase
 * fades the rings away so the field itself communicates a dropped connection.
 *
 * Source: https://magicui.design/docs/components/ripple
 */

import { cn } from "@/lib/utils";

type ConnectionRippleProps = {
  /** `live` = energy field pulsing. `lost` = rings gently disappearing. */
  connection: "live" | "lost";
  mainCircleSize?: number;
  mainCircleOpacity?: number;
  numCircles?: number;
  className?: string;
};

export default function ConnectionRipple({
  connection,
  mainCircleSize = 92,
  mainCircleOpacity = 0.4,
  numCircles = 5,
  className,
}: ConnectionRippleProps) {
  return (
    <div
      aria-hidden="true"
      data-connection={connection}
      className={cn(
        "eduos-ripple-field pointer-events-none absolute inset-0 overflow-visible",
        className,
      )}
    >
      {Array.from({ length: numCircles }, (_, i) => {
        const size = mainCircleSize + i * 34;
        const opacity = Math.max(0.06, mainCircleOpacity - i * 0.05);
        const isLast = i === numCircles - 1;
        return (
          <div
            key={i}
            className={cn(
              "eduos-ripple-ring absolute rounded-full border shadow-[0_0_24px_rgba(34,211,238,0.12)]",
              "transition-opacity duration-700 ease-out",
              connection === "lost" ? "opacity-0" : "",
            )}
            style={{
              width: size,
              height: size,
              opacity: connection === "lost" ? 0 : opacity,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%) scale(1)",
              borderStyle: isLast ? "dashed" : "solid",
              borderWidth: 1,
              borderColor: i % 2 === 0
                ? `rgba(34, 211, 238, ${0.22 + i * 0.04})`
                : `rgba(167, 139, 250, ${0.2 + i * 0.03})`,
              ["--i" as string]: i,
              ["--eduos-ripple-duration" as string]: `${2.2 + i * 0.12}s`,
              transitionDelay: connection === "lost" ? `${i * 90}ms` : "0ms",
            }}
          />
        );
      })}
    </div>
  );
}
