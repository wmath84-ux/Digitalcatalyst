import { DEFAULT_HOME_HOLD_DURATION } from "../../hooks/useHomeHold";

const RING_R = 18;
const RING_C = 2 * Math.PI * RING_R;

/**
 * A circular progress ring shown while the footer Home button is held down.
 * It is absolutely positioned at (50%, 50%) of the button's icon pill and
 * pulled back by half its own size, so the ring hugs the button instead of
 * dropping below it. The fill grows over the hold duration to show how much
 * of the long-press remains.
 *
 * The animation length follows `durationMs` (default: DEFAULT_HOME_HOLD_DURATION)
 * so the ring always matches the active hold timer (1s for FlowPath).
 */
export function HoldRing({
  holding,
  durationMs = DEFAULT_HOME_HOLD_DURATION,
}: {
  holding: boolean;
  durationMs?: number;
}) {
  return (
    <svg
      className="pointer-events-none absolute"
      viewBox="0 0 40 40"
      style={{
        left: "50%",
        top: "50%",
        width: 46,
        height: 46,
        transform: "translate(-50%, -50%) rotate(-90deg)",
      }}
      aria-hidden="true"
    >
      {/* Background ring track */}
      <circle
        cx="20"
        cy="20"
        r={RING_R}
        fill="none"
        stroke="rgba(99, 102, 241, 0.15)"
        strokeWidth="2.5"
      />
      {/* Animated progress ring */}
      <circle
        cx="20"
        cy="20"
        r={RING_R}
        fill="none"
        stroke="url(#hold-ring-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={RING_C}
        strokeDashoffset={holding ? 0 : RING_C}
        style={{
          transition: holding
            ? `stroke-dashoffset ${durationMs}ms linear`
            : "stroke-dashoffset 0.18s ease",
          filter: holding ? "drop-shadow(0 0 5px rgba(99, 102, 241, 0.9))" : "none",
        }}
      />
      <defs>
        <linearGradient id="hold-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
  );
}
