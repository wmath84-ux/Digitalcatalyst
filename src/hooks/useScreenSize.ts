"use client";

import { useEffect, useState } from "react";

type ScreenSize = "mobile" | "tablet" | "desktop";

const MOBILE_BASE = 640;
const DESKTOP_ON_TABLET_THRESHOLD = 960; // 1.5x mobile
const TABLET_LANDSCAPE_MIN = 640;

const getScreenCategory = (): ScreenSize => {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isLandscape = width > height;

  // Detect tablet device (min screen side >=600)
  let isTabletDevice = false;
  try {
    const w = window.screen?.width ?? 0;
    const h = window.screen?.height ?? 0;
    const minSide = Math.min(w, h);
    if (minSide > 0) {
      isTabletDevice = minSide >= 600;
    } else {
      isTabletDevice = width >= MOBILE_BASE;
    }
  } catch {
    isTabletDevice = width >= MOBILE_BASE;
  }

  // NEW: Tablet landscape => desktop
  // Also width >=960 (1.5x mobile) => desktop with side panel
  if (width >= 1024) return "desktop";
  if (width >= DESKTOP_ON_TABLET_THRESHOLD) return "desktop";
  if (isLandscape && isTabletDevice && width >= TABLET_LANDSCAPE_MIN) return "desktop";

  if (width <= MOBILE_BASE) return "mobile";
  if (width <= 1023) return "tablet";
  return "desktop";
};

const useScreenSize = (): ScreenSize => {
  const [size, setSize] = useState<ScreenSize>(() => getScreenCategory());

  useEffect(() => {
    const updateSize = () => {
      setSize(getScreenCategory());
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    window.addEventListener("orientationchange", updateSize);
    window.visualViewport?.addEventListener?.("resize", updateSize);
    try {
      window.screen?.orientation?.addEventListener?.("change", updateSize);
    } catch {}

    return () => {
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("orientationchange", updateSize);
      window.visualViewport?.removeEventListener?.("resize", updateSize);
      try {
        window.screen?.orientation?.removeEventListener?.("change", updateSize);
      } catch {}
    };
  }, []);

  return size;
};

export default useScreenSize;
export type { ScreenSize };
