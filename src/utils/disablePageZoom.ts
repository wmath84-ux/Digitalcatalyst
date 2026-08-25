// Locks page-level pinch / ctrl-wheel / double-tap zoom so the PWA
// behaves like a native app. Image viewers that opt into their own
// pinch handling are left alone.
//
// The default app zoom (110%) is applied separately by `applyDocumentZoom`
// (see src/utils/appZoom.ts). This module also keeps the viewport meta
// refusing user scaling so a learner can never drift above or below the
// admin-configured default.

import { lockViewportScaling } from "./appZoom";

const isInteractiveZoomSurface = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("[data-pinch-zoom=\"enabled\"]"));
};

const VIEWPORT_SELECTOR = 'meta[name="viewport"]';

export const disablePageZoom = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  const onGesture = (event: Event) => {
    if (isInteractiveZoomSurface(event.target)) return;
    event.preventDefault();
  };

  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length < 2) return;
    if (isInteractiveZoomSurface(event.target)) return;
    event.preventDefault();
  };

  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    if (isInteractiveZoomSurface(event.target)) return;
    event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key !== "+" && event.key !== "-" && event.key !== "=" && event.key !== "0") return;
    event.preventDefault();
  };

  // The Course Player's desktop/mobile switch rewrites the viewport meta.
  // Watch it and immediately re-add the scaling-lock tokens so the app's
  // own zoom policy always wins.
  const meta = document.querySelector<HTMLMetaElement>(VIEWPORT_SELECTOR);
  const metaObserver = typeof MutationObserver !== "undefined"
    ? new MutationObserver(() => lockViewportScaling())
    : null;
  if (metaObserver && meta) {
    metaObserver.observe(meta, { attributes: true, attributeFilter: ["content"] });
  }
  lockViewportScaling();

  document.addEventListener("gesturestart", onGesture, { passive: false });
  document.addEventListener("gesturechange", onGesture, { passive: false });
  document.addEventListener("gestureend", onGesture, { passive: false });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("keydown", onKeyDown);

  return () => {
    metaObserver?.disconnect();
    document.removeEventListener("gesturestart", onGesture);
    document.removeEventListener("gesturechange", onGesture);
    document.removeEventListener("gestureend", onGesture);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("wheel", onWheel);
    document.removeEventListener("keydown", onKeyDown);
  };
};
