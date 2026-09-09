import { useEffect, useRef, useState, type RefObject } from "react";
import type { Tier } from "./types";
import { PERF } from "./perf";

/**
 * Container-aware responsiveness.
 * The chat can live inside a narrow course-player panel, so every layout
 * decision is derived from the width of the chat *container*, measured with
 * a ResizeObserver — not from the device viewport.
 */
export function tierOf(width: number): Tier {
  if (width < 272) return "xxs"; // extreme split-panel (~half a phone)
  if (width < 400) return "xs";  // phones / narrow panels
  if (width < 580) return "sm";  // large phones, small tablets
  if (width < 820) return "md";  // portrait tablets
  if (width < 1120) return "lg"; // landscape tablets, small laptops
  return "xl";                   // desktop
}

const ORDER: Tier[] = ["xxs", "xs", "sm", "md", "lg", "xl"];

/** tier <= other */
export function tierLte(a: Tier, b: Tier): boolean {
  return ORDER.indexOf(a) <= ORDER.indexOf(b);
}

export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const quantize = (w: number) => Math.round(w / PERF.RESIZE_EPSILON) * PERF.RESIZE_EPSILON;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w !== "number") return;
      // Quantized updates: sub-threshold resizes (text zoom, fractional
      // dpr drift) no longer churn React state on every pixel.
      setWidth((prev) => {
        const q = quantize(w);
        return q === prev ? prev : q;
      });
    });
    ro.observe(el);
    setWidth(quantize(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
