// Locks page-level pinch / ctrl-wheel / double-tap zoom so the PWA
// behaves like a native app. Image viewers that opt into their own
// pinch handling are left alone.

const isInteractiveZoomSurface = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("[data-pinch-zoom=\"enabled\"]"));
};

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

  document.addEventListener("gesturestart", onGesture, { passive: false });
  document.addEventListener("gesturechange", onGesture, { passive: false });
  document.addEventListener("gestureend", onGesture, { passive: false });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("keydown", onKeyDown);

  return () => {
    document.removeEventListener("gesturestart", onGesture);
    document.removeEventListener("gesturechange", onGesture);
    document.removeEventListener("gestureend", onGesture);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("wheel", onWheel);
    document.removeEventListener("keydown", onKeyDown);
  };
};
