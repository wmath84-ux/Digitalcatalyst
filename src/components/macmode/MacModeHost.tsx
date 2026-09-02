// src/components/macmode/MacModeHost.tsx
//
// "Mac mode" — the full macOS Web Simulator, mounted over the Digital
// Catalyst app.
//
// The simulator itself is vendored verbatim under `src/macos/**`
// (https://github.com/LikhithSP/MacOS-Web-Simulator, MIT — see
// src/macos/LICENSE). This file is the seam between it and the app, and it
// owns four things the simulator cannot own for itself:
//
//   1. WHERE it renders. The simulator lays itself out as `fixed inset-0`, so
//      it goes into a portal on <body> rather than inside whichever page
//      happened to be on screen — otherwise a transformed or `overflow:hidden`
//      ancestor (the phone frame, the desktop scroll container) would clip it.
//
//   2. WHEN it loads. It is ~70 files plus wallpapers, so the whole thing is a
//      `React.lazy` chunk. Nobody who never presses the button downloads it.
//
//   3. Body scroll. The page underneath must not scroll while a full-screen OS
//      is on top, and the scroll position must be restored on exit.
//
//   4. Failure containment. An error inside the simulator must drop the user
//      back into the app, not white-screen the whole site — hence the local
//      error boundary.

import { Component, Suspense, lazy, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Vendored simulator root. `.jsx` — the simulator is plain JS/JSX, and Vite
// compiles it exactly like the rest of the app.
const MacOSApp = lazy(() => import("@/macos/MacOSApp.jsx"));

interface MacModeHostProps {
  /** Close Mac mode and return to the app. */
  onExit: () => void;
}

/**
 * The webfonts the simulator's UI is drawn with.
 *
 * Upstream ships these as an `@import` at the top of its stylesheet. A CSS
 * `@import` is hoisted to the top of the whole bundle at build time, so
 * keeping it there would cost every store visitor a Google Fonts round-trip
 * for a surface they may never open. Injecting the <link> here instead ties
 * the request to Mac mode actually being launched — and the browser caches it,
 * so re-entering costs nothing.
 */
const MAC_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Jaini+Purva&family=Syne:wght@400..800&family=Titillium+Web:ital,wght@0,200;0,300;0,400;0,600;0,700;0,900;1,200;1,300;1,400;1,600;1,700&family=Inter:wght@300;400;500;600;700&display=swap";

function useMacFonts() {
  useEffect(() => {
    if (document.querySelector('link[data-mac-mode-fonts]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MAC_FONTS_HREF;
    link.dataset.macModeFonts = "true";
    document.head.appendChild(link);
    // Deliberately NOT removed on exit: the stylesheet is inert without the
    // simulator's markup, and keeping it avoids a re-fetch/flash if the user
    // opens Mac mode again.
  }, []);
}

/**
 * Keeps the page under the simulator from scrolling, and puts the scroll
 * position back when Mac mode closes.
 */
function useLockedBodyScroll() {
  useEffect(() => {
    const { body, documentElement } = document;
    const scrollY = window.scrollY;
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };

    body.style.overflow = "hidden";
    // `position: fixed` (rather than overflow alone) is what actually stops
    // iOS Safari from rubber-banding the page behind the overlay.
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    documentElement.dataset.macMode = "on";

    return () => {
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      delete documentElement.dataset.macMode;
      window.scrollTo(0, scrollY);
    };
  }, []);
}

/** Full-screen boot placeholder shown while the simulator chunk downloads. */
function MacModeLoading() {
  return (
    <div className="fixed inset-0 z-[2147483000] grid place-items-center bg-black">
      <div className="flex flex-col items-center gap-5">
        <svg viewBox="0 0 24 24" className="h-14 w-14 fill-white/90" aria-hidden="true">
          <path d="M16.365 1.43c0 1.14-.42 2.2-1.12 3.01-.84.98-2.2 1.74-3.32 1.65a3.6 3.6 0 0 1 1.12-2.9c.77-.84 2.1-1.5 3.32-1.76zm3.5 16.2c-.6 1.37-.9 1.98-1.66 3.2-1.07 1.7-2.58 3.82-4.45 3.83-1.66.02-2.09-1.08-4.35-1.07-2.26.01-2.73 1.09-4.39 1.08-1.87-.02-3.3-1.94-4.37-3.63C-2.3 16.3-2.6 10.6.13 7.62c1.16-1.3 2.86-2.12 4.63-2.12 1.8 0 2.94 1.09 4.43 1.09 1.45 0 2.33-1.09 4.42-1.09 1.57 0 3.24.86 4.42 2.34-3.89 2.13-3.26 7.68.84 9.79z" />
        </svg>
        <p className="text-[13px] font-medium tracking-wide text-white/70">Starting Mac mode…</p>
      </div>
    </div>
  );
}

/**
 * Catches anything thrown inside the simulator and exits Mac mode instead of
 * taking the app down with it.
 */
class MacModeErrorBoundary extends Component<
  { children: ReactNode; onExit: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Surfaced in the console rather than a toast: Mac mode is a novelty
    // surface, and the user's next signal is simply being back in the app.
    console.error("[Mac mode] simulator crashed, returning to the app", error);
  }

  componentDidUpdate() {
    if (this.state.failed) this.props.onExit();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function MacModeHost({ onExit }: MacModeHostProps) {
  useMacFonts();
  useLockedBodyScroll();

  // `onExit` is passed down to the simulator's Apple menu. Holding it in a ref
  // keeps the identity stable so the simulator's key handlers are not torn
  // down and rebound on every host re-render.
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const stableExit = useRef(() => exitRef.current()).current;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div data-mac-mode-root className="fixed inset-0 z-[2147483000]">
      <MacModeErrorBoundary onExit={stableExit}>
        <Suspense fallback={<MacModeLoading />}>
          <MacOSApp onExit={stableExit} />
        </Suspense>
      </MacModeErrorBoundary>
    </div>,
    document.body,
  );
}
