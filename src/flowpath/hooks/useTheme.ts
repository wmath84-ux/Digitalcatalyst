import { useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "system";

function resolve(mode: ThemeMode): "dark" | "light" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

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
    return resolve(mode);
  });

  // Set data-theme on mount, REMOVE it on unmount so the rest of the app is unaffected
  useEffect(() => {
    const resolvedNow = resolve(mode);
    setResolved(resolvedNow);
    document.documentElement.setAttribute("data-theme", resolvedNow);
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
        document.documentElement.setAttribute("data-theme", r);
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
