// R3F 9 reapplies the Canvas `dpr` prop on EVERY render (focus, resize,
// portal updates), not just on mount. A constant initial DPR silently undid
// AdaptiveDpr and the drag dip. Mirror the live store value back to the prop.
//
// Adapter only: the existing QualityGovernor + AdaptiveDpr still choose and
// apply resolution. This wrapper never samples frames or decides quality.
// Only DPR edges re-render it; children keep their identities.
import { useCallback, useLayoutEffect, useState } from "react";
import { Canvas, useStore, type CanvasProps, type RootState } from "@react-three/fiber";

function DprBinding({ onChange }: { onChange: (dpr: number) => void }) {
  const store = useStore();
  useLayoutEffect(() => {
    let previous = store.getState().viewport.dpr;
    onChange(previous);
    return store.subscribe((state) => {
      if (state.viewport.dpr === previous) return;
      previous = state.viewport.dpr;
      onChange(previous);
    });
  }, [store, onChange]);
  return null;
}

export default function ClassroomCanvas({ dpr, maxDpr, onCreated, children, ...props }: CanvasProps & { maxDpr: number }) {
  const [liveDpr, setLiveDpr] = useState(dpr);
  const created = useCallback((state: RootState) => {
    // AdaptiveDpr uses `initialDpr` as its ceiling. A remembered low START
    // must not permanently cap a recovered device. Set the area-capped high
    // ceiling before children mount; the governor seeds the starting scale.
    state.set(current => ({ viewport: { ...current.viewport, initialDpr: maxDpr } }));
    onCreated?.(state);
  }, [maxDpr, onCreated]);
  return (
    <Canvas {...props} dpr={liveDpr} onCreated={created}>
      <DprBinding onChange={setLiveDpr} />
      {children}
    </Canvas>
  );
}
