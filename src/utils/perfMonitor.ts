// src/utils/perfMonitor.ts
//
// Opt-in performance instrumentation. OFF by default — when it is off this
// module registers nothing, observes nothing and logs nothing, so it cannot
// cost a learner a single millisecond or a single console line in production.
//
// Turn it on for a session with either:
//
//   • `?perf=1` in the URL (survives the hash router), or
//   • `localStorage.setItem("eduvora:perf", "1")` and reload.
//
// Turn it off again with `?perf=0` or by removing the key. While it is on:
//
//   • LCP, CLS and INP are collected from the browser's own PerformanceObserver
//     entries (no third-party web-vitals dependency — the raw entries are all
//     the Core Web Vitals need for a dev read-out);
//   • long tasks (>50 ms) are counted, since those are what make a low-end
//     Android feel stuck;
//   • route transitions and any code that calls `markPerf()` show up as User
//     Timing marks, so a Chrome DevTools performance profile is annotated;
//   • `window.__eduvoraPerf.report()` prints one table on demand.
//
// Everything is bounded: the observers keep counters and the last value, never
// growing arrays of entries.

type PerfState = {
  lcp: number;
  cls: number;
  inp: number;
  longTasks: number;
  longTaskMs: number;
  routes: Array<{ hash: string; ms: number }>;
};

const MAX_ROUTE_SAMPLES = 30;

let enabled = false;
let state: PerfState | null = null;
const observers: PerformanceObserver[] = [];

function readFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const search = new URLSearchParams(window.location.search);
    const param = search.get("perf");
    if (param === "1") {
      window.localStorage.setItem("eduvora:perf", "1");
      return true;
    }
    if (param === "0") {
      window.localStorage.removeItem("eduvora:perf");
      return false;
    }
    return window.localStorage.getItem("eduvora:perf") === "1";
  } catch {
    return false;
  }
}

function observe(type: string, callback: (entries: PerformanceEntryList) => void) {
  try {
    const observer = new PerformanceObserver((list) => callback(list.getEntries()));
    // `buffered` replays entries that happened before this ran (LCP especially).
    observer.observe({ type, buffered: true } as PerformanceObserverInit);
    observers.push(observer);
  } catch {
    /* unsupported entry type on this engine — skip that metric, never throw */
  }
}

/** A User Timing mark, but only while instrumentation is on. */
export function markPerf(name: string): void {
  if (!enabled) return;
  try {
    performance.mark(`eduvora:${name}`);
  } catch {
    /* ignore */
  }
}

/** Measure an async/sync span and record it as a User Timing measure. */
export function measurePerf<T>(name: string, run: () => T): T {
  if (!enabled) return run();
  const start = performance.now();
  try {
    return run();
  } finally {
    const ms = performance.now() - start;
    try {
      performance.measure(`eduvora:${name}`, { start, duration: ms } as PerformanceMeasureOptions);
    } catch {
      /* ignore */
    }
  }
}

/** Record a completed route transition (hash → first paint of that route). */
export function recordRouteTiming(hash: string, ms: number): void {
  if (!enabled || !state) return;
  state.routes.push({ hash, ms: Math.round(ms) });
  if (state.routes.length > MAX_ROUTE_SAMPLES) state.routes.shift();
}

export function isPerfEnabled(): boolean {
  return enabled;
}

/**
 * Install the observers. Safe to call once at boot: it returns immediately
 * unless the opt-in flag is set.
 */
export function initPerfMonitor(): void {
  if (typeof window === "undefined" || enabled) return;
  enabled = readFlag();
  if (!enabled) return;

  state = { lcp: 0, cls: 0, inp: 0, longTasks: 0, longTaskMs: 0, routes: [] };

  observe("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
    if (last && state) state.lcp = Math.round(last.startTime);
  });

  observe("layout-shift", (entries) => {
    for (const entry of entries as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
      if (entry.hadRecentInput) continue;
      if (state) state.cls += entry.value || 0;
    }
  });

  observe("event", (entries) => {
    for (const entry of entries as Array<PerformanceEntry & { duration: number }>) {
      if (state && entry.duration > state.inp) state.inp = Math.round(entry.duration);
    }
  });

  observe("longtask", (entries) => {
    for (const entry of entries) {
      if (!state) break;
      state.longTasks += 1;
      state.longTaskMs += Math.round(entry.duration);
    }
  });

  const report = () => {
    if (!state) return null;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const summary = {
      "TTFB (ms)": navigation ? Math.round(navigation.responseStart) : null,
      "DOM interactive (ms)": navigation ? Math.round(navigation.domInteractive) : null,
      "Load (ms)": navigation ? Math.round(navigation.loadEventEnd) : null,
      "LCP (ms)": state.lcp,
      CLS: Number(state.cls.toFixed(4)),
      "INP-ish worst event (ms)": state.inp,
      "Long tasks": state.longTasks,
      "Long task total (ms)": state.longTaskMs,
      "JS heap (MB)": (() => {
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        return memory ? Math.round(memory.usedJSHeapSize / 1_048_576) : null;
      })(),
    };
    // eslint-disable-next-line no-console
    console.table(summary);
    if (state.routes.length > 0) {
      // eslint-disable-next-line no-console
      console.table(state.routes);
    }
    return summary;
  };

  (window as unknown as { __eduvoraPerf?: unknown }).__eduvoraPerf = {
    report,
    get state() {
      return state;
    },
    stop: () => {
      observers.forEach((observer) => observer.disconnect());
      observers.length = 0;
      enabled = false;
    },
  };

  // eslint-disable-next-line no-console
  console.info("[perf] instrumentation on — call __eduvoraPerf.report() for a summary (?perf=0 to disable)");
}
