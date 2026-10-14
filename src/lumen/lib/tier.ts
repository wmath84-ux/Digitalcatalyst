import { useEffect, useRef, useState, type RefObject } from "react";
import type { Tier } from "./types";


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

/** All width decisions made by the chat, including bridge viewport modes. */
export const CHAT_FRAME_BREAKPOINTS = [520, 900] as const;
export const CHAT_COLUMN_BREAKPOINTS = [272, 400, 580, 700, 820, 1020, 1120] as const;

/** A representative width for this layout bucket (not every measured pixel). */
export function breakpointWidth(width: number, breakpoints: readonly number[]): number {
  return breakpoints.reduce((bucket, point) => width >= point ? point : bucket, 1);
}

export function useElementBreakpoint<T extends HTMLElement>(breakpoints: readonly number[]): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastBucket = 0;
    const publish = (measured: number) => {
      // Hidden tabs report zero: keep the last layout instead of collapsing
      // the entire history into the narrowest tier while it is offscreen.
      if (!Number.isFinite(measured) || measured <= 0) return;
      const next = breakpointWidth(measured, breakpoints);
      if (next === lastBucket) return; // no React update on same-tier pixels
      lastBucket = next;
      setWidth(next);
    };
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (typeof measured === "number") publish(measured);
    });
    ro?.observe(el);
    publish(el.getBoundingClientRect().width);
    return () => ro?.disconnect();
  }, [breakpoints]);

  return [ref, width];
}
