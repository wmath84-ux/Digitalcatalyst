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

  // NOTE: there is deliberately NO document-level `touchmove` listener here.
  // A non-passive document touchmove makes every scroll wait on the main
  // thread and, with `touches.length >= 2`, swallows the whole gesture — that
  // competes with the compositor-driven touch scrolling of the tablet shell's
  // `[data-desktop-content]` (and the tablet-portrait `<main>` scrollers).
  // Pinch-zoom is already blocked app-wide by `#root { touch-action:
  // pan-x pan-y }`, and the iOS gesturestart/gesturechange/gestureend + wheel
  // + keydown handlers below still block zoom everywhere else.
  document.addEventListener("gesturestart", onGesture, { passive: false });
  document.addEventListener("gesturechange", onGesture, { passive: false });
  document.addEventListener("gestureend", onGesture, { passive: false });
  document.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("keydown", onKeyDown);

  return () => {
    document.removeEventListener("gesturestart", onGesture);
    document.removeEventListener("gesturechange", onGesture);
    document.removeEventListener("gestureend", onGesture);
    document.removeEventListener("wheel", onWheel);
    document.removeEventListener("keydown", onKeyDown);
  };
};
