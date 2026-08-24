import { useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "system";

function resolve(mode: ThemeMode): "dark" | "light" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem("flowpath.theme") as ThemeMode) || "system";
    } catch {
      return "system";
    }
  });

  const [resolved, setResolved] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return resolve(mode);
  });

  useEffect(() => {
    const resolvedNow = resolve(mode);
    setResolved(resolvedNow);
    document.documentElement.setAttribute("data-theme", resolvedNow);
    try {
      localStorage.setItem("flowpath.theme", mode);
    } catch {
      // ignore
    }
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
