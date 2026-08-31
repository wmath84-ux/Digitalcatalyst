import { useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "system";

function resolve(mode: ThemeMode): "dark" | "light" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Write the theme onto <html> so the palette is correct BEFORE the browser
 *  paints the first frame. Called from the state initializer (synchronous,
 *  pre-paint) and again from effects on every change. Without this the
 *  attribute only landed in `useEffect`, i.e. AFTER the first paint — which
 *  made the very first frame of FlowPath flash the wrong theme (white for
 *  light-mode users) while the whole UI was still invisible. */
const applyThemeAttribute = (resolved: "dark" | "light") => {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
};

export function useTheme() {
  // FlowPath is a dark-first 3D dashboard — default to dark, not system
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem("flowpath.theme") as ThemeMode) || "dark";
    } catch {
      return "dark";
    }
  });

  const [resolved, setResolved] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const resolvedNow = resolve(mode);
    // Synchronous, before React commits: the first painted frame already
    // carries the stored theme — no white/dark flash on navigation.
    applyThemeAttribute(resolvedNow);
    return resolvedNow;
  });

  // Keep data-theme in sync on every change, REMOVE it on unmount so the
  // rest of the app is unaffected.
  useEffect(() => {
    const resolvedNow = resolve(mode);
    setResolved(resolvedNow);
    applyThemeAttribute(resolvedNow);
    try {
      localStorage.setItem("flowpath.theme", mode);
    } catch {
      // ignore
    }
    // CLEANUP: remove data-theme when FlowPath unmounts
    return () => {
      document.documentElement.removeAttribute("data-theme");
    };
  }, [mode]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      if (mode === "system") {
        const r = resolve(mode);
        setResolved(r);
        applyThemeAttribute(r);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const toggle = () => {
    setMode((m) => {
      if (m === "dark") return "light";
      if (m === "light") return "dark";
      return resolve("system") === "dark" ? "light" : "dark";
    });
  };

  return { mode, resolved, setMode, toggle };
}
