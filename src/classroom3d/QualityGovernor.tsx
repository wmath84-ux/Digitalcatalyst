// src/classroom3d/QualityGovernor.tsx
//
// The room's auto-graphics-settings (Part 13): a <PerformanceMonitor> that
// watches real frame times and steps the room down (or back up) a quality
// ladder — snow, lights, spill, resolution — with averaged sampling windows
// so it never flickers between levels.
//
// ── Why a governor instead of plain drei components ───────────────────────
// drei's <AdaptiveDpr>/<AdaptiveEvents> read the FIBER store's
// `performance.current`, but drei 10's <PerformanceMonitor> deliberately no
// longer writes it (it only reports through its callbacks). So the governor
// is the bridge: every factor change maps to a tier, the tier is written to
// the fiber store (AdaptiveDpr/AdaptiveEvents react on their own), and the
// room is told only when the TIER changes — a handful of renders per session,
// never per frame.
//
// The initial tier comes from quality.ts's one-time probe (persisted for the
// session); the monitor's first averaging window is the warm-up fps sample
// that corrects the probe within ~a second when it guessed wrong. A device
// that keeps flip-flopping locks to low via onFallback and remembers it.

import { memo, useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import {
  QUALITY_FACTOR,
  pickInitialTier,
  qualityForFactor,
  rememberTier,
  type ClassroomQuality,
} from "./quality";

// Resolution scale the tier writes into the fiber store for <AdaptiveDpr>
// (multiplied by the mount-time initial dpr): full pixels on high, three
// quarters on medium, three fifths on low.
const TIER_PERFORMANCE: Record<ClassroomQuality, number> = {
  high: 1,
  medium: 0.75,
  low: 0.6,
};

// A decision every ~1.2 s of wall time (6 averaged 200 ms windows): fast
// enough to catch a struggling phone before the learner notices, slow enough
// that one GC pause can't cause a step-down.
const SAMPLE_MS = 200;
const SAMPLE_ITERATIONS = 6;
// After this many up/down flips the device is declared unstable and locked
// to low for the session (onFallback also stops the sampling entirely).
const FALLBACK_FLIPFLOPS = 6;

function QualityGovernor({ onTier }: { onTier: (tier: ClassroomQuality) => void }) {
  const set = useThree((state) => state.set);
  // Mount-only: the probed (or remembered) starting point. Later room
  // renders must not move it — live sampling owns the tier from here on.
  const [startTier] = useState<ClassroomQuality>(pickInitialTier);
  const lastTier = useRef<ClassroomQuality>(startTier);
  const onTierRef = useRef(onTier);
  onTierRef.current = onTier;

  // A tier change has two effects: the fiber store's performance (which
  // <AdaptiveDpr> turns into resolution and <AdaptiveEvents> into R3F event
  // handling) and the room's snow/lights/spill — the latter via one React
  // render, only when the tier actually changes.
  const applyTier = (tier: ClassroomQuality): void => {
    set((state) => ({
      performance: { ...state.performance, current: TIER_PERFORMANCE[tier] },
    }));
    if (tier === lastTier.current) return;
    lastTier.current = tier;
    rememberTier(tier);
    onTierRef.current(tier);
  };

  // Seed the store before the first sample so a remembered low tier doesn't
  // render a second of full-resolution frames while the monitor warms up.
  useEffect(() => {
    lastTier.current = startTier;
    set((state) => ({
      performance: { ...state.performance, current: TIER_PERFORMANCE[startTier] },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PerformanceMonitor
      factor={QUALITY_FACTOR[startTier]}
      ms={SAMPLE_MS}
      iterations={SAMPLE_ITERATIONS}
      flipflops={FALLBACK_FLIPFLOPS}
      onChange={(api) => applyTier(qualityForFactor(api.factor))}
      onFallback={() => applyTier("low")}
    />
  );
}

// Rendered once: `onTier` is a stable setState and everything live flows
// through refs, so parent re-renders (focus, pinch ticks) never touch this.
export default memo(QualityGovernor);
