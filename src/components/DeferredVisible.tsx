// src/components/DeferredVisible.tsx
//
// Mount children only once their slot is actually near the viewport.
//
// Some sections are genuinely expensive to have alive — the Home feedback
// wall runs a matter.js physics world and a requestAnimationFrame render loop
// from the moment it mounts, even though it sits at the very BOTTOM of the
// page and most sessions never scroll to it. On a low-end Android that is a
// continuous main-thread cost (and a background battery drain) paid for a
// section nobody is looking at.
//
// This wrapper reserves the same box (so there is zero layout shift), watches
// it with a single IntersectionObserver, and swaps the real children in a
// little BEFORE the section scrolls into view, so the content is ready by the
// time it is on screen. Once mounted it stays mounted — this is a lazy start,
// not a virtualiser, so no state is ever thrown away.
//
// Devices without IntersectionObserver (very old WebViews) mount immediately:
// degraded to today's behaviour rather than a missing section.

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function DeferredVisible({
  children,
  className,
  rootMargin = "400px",
  placeholder = null,
}: {
  children: ReactNode;
  className?: string;
  /** How early to mount, relative to the viewport. */
  rootMargin?: string;
  /** Optional skeleton shown in the reserved box until then. */
  placeholder?: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return undefined;
    const host = hostRef.current;
    if (!host) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [rootMargin, visible]);

  return (
    <div ref={hostRef} className={className}>
      {visible ? children : placeholder}
    </div>
  );
}
