// The existing PerformanceMonitor → AdaptiveDpr/AdaptiveEvents bridge.
// Decisions still require 5 of 6 averaged windows; no per-frame React state.
// Resolution moves in small steps, while the more visible snow/light tier
// changes have separate enter/leave thresholds (quality.ts).
//
// drei 10's `flipped` counter increments on EVERY qualifying window, even an
// incline at factor=1, not only direction changes. A finite flipflops limit
// therefore permanently locked even a healthy 60 Hz device to low. Keep the
// SAME monitor running so a transient load can recover; hysteresis + slow
// recovery prevent oscillation without a session-long low-quality lock.
import { memo, useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { PerformanceMonitor, type PerformanceMonitorApi } from "@react-three/drei";
import {
  CLASSROOM_SAMPLE_MS,
  ClassroomFrameBudget,
  QUALITY_FACTOR,
  MIN_CLASSROOM_PERFORMANCE,
  classroomFrameBounds,
  performanceForFactor,
  pickInitialTier,
  qualityForFactor,
  rememberTier,
  type ClassroomQuality,
} from "./quality";

const SAMPLE_MS = CLASSROOM_SAMPLE_MS;
const SAMPLE_ITERATIONS = 6;
const FALLBACK_FLIPFLOPS = Infinity;

function QualityGovernor({ onTier }: { onTier: (tier: ClassroomQuality) => void }) {
  const set = useThree((state) => state.set);
  const scene = useThree((state) => state.scene);
  const [budget] = useState(() => new ClassroomFrameBudget());
  const [startTier] = useState<ClassroomQuality>(pickInitialTier);
  const lastTier = useRef<ClassroomQuality>(startTier);
  const monitor = useRef<PerformanceMonitorApi | null>(null);
  const onTierRef = useRef(onTier);
  onTierRef.current = onTier;

  const applyFactor = (factor: number): void => {
    const current = performanceForFactor(factor);
    set((state) => current === state.performance.current && state.performance.min === MIN_CLASSROOM_PERFORMANCE ? state : {
      performance: { ...state.performance, current, min: MIN_CLASSROOM_PERFORMANCE },
    });
    const tier = qualityForFactor(factor, lastTier.current);
    if (tier === lastTier.current) return;
    lastTier.current = tier;
    rememberTier(tier);
    onTierRef.current(tier);
  };

  const observeWindow = (api: PerformanceMonitorApi): void => {
    monitor.current = api;
    if (!document.hidden && budget.observe(api.factor, api.averages)) {
      scene.userData.classroomFrameBudgetMs = 1000 / budget.target;
    }
  };

  useEffect(() => {
    scene.userData.classroomFrameBudgetMs = 1000 / budget.target;
    applyFactor(QUALITY_FACTOR[startTier]);
    // A hidden tab is not a struggling GPU. Discard only the incomplete
    // sampling history on hide/return; keep the chosen quality and keep
    // sampling. No forced low tier or DPR reset when the learner comes back.
    const resetSamples = () => {
      budget.resetSamples();
      const api = monitor.current;
      if (!api) return;
      api.frames.length = 0;
      api.averages.length = 0;
      api.index = 0;
    };
    document.addEventListener("visibilitychange", resetSamples);
    return () => document.removeEventListener("visibilitychange", resetSamples);
    // Mount-only: live sampling owns quality from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PerformanceMonitor
      factor={QUALITY_FACTOR[startTier]}
      ms={SAMPLE_MS}
      iterations={SAMPLE_ITERATIONS}
      step={0.05}
      bounds={() => classroomFrameBounds(budget.target)}
      onIncline={observeWindow}
      onDecline={observeWindow}
      flipflops={FALLBACK_FLIPFLOPS}
      onChange={(api) => {
        monitor.current = api;
        if (!document.hidden) applyFactor(api.factor);
      }}
    />
  );
}

export default memo(QualityGovernor);
