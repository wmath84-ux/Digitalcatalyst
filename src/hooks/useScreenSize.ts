"use client";

import { useEffect, useState } from "react";

type ScreenSize = "mobile" | "tablet" | "desktop";

const useScreenSize = (): ScreenSize => {
  const [size, setSize] = useState<ScreenSize>("desktop");

  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      // Mobile: width <= 640px
      // Tablet: width > 640px && width <= 1023px
      // Desktop: width > 1023px
      let category: ScreenSize;
      if (width <= 640) {
        category = "mobile";
      } else if (width <= 1023) {
        category = "tablet";
      } else {
        category = "desktop";
      }
      setSize(category);
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  return size;
};

export default useScreenSize;
export type { ScreenSize };