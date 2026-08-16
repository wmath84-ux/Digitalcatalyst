// Pins the Eduvora website header above Razorpay Standard Checkout and
// insets the Razorpay frame between the header and the bottom of the
// viewport. The payment checkout therefore behaves like an in-app iframe:
// the site header stays visible and the checkout page (Razorpay's own
// cross-origin frame) gets the full remaining viewport height and scrolls
// internally, so every field, method option and button stays reachable by
// scrolling — nothing is clipped behind the chrome.

const OPEN_CLASS = "eduvora-razorpay-open";
const HEADER_VAR = "--eduvora-header-h";

// Layering (Razorpay ships its own sky-high z-indexes):
//   backdrop < payment frame < site header
const HEADER_Z = "2147483000";
const CONTAINER_Z = "2147482001";
const BACKDROP_Z = "2147482000";

type StyleSnapshot = { element: HTMLElement; cssText: string };

const snapshotStyle = (element: HTMLElement): StyleSnapshot => ({
  element,
  cssText: element.style.cssText,
});

const restoreStyle = (snapshot: StyleSnapshot | null) => {
  if (!snapshot) return;
  snapshot.element.style.cssText = snapshot.cssText;
};

const setImportant = (element: HTMLElement, property: string, value: string) => {
  element.style.setProperty(property, value, "important");
};

/**
 * Keep the site header visible while Razorpay Checkout is open, with the
 * payment frame inset below it and the dimming backdrop underneath both.
 * Returns a disposer that restores the original chrome and CSS variables.
 */
export const revealCheckoutChromeOverRazorpay = (): (() => void) => {
  if (typeof document === "undefined") return () => undefined;

  document.body.classList.add(OPEN_CLASS);
  document.body.setAttribute("data-eduvora-razorpay-open", "true");

  let headerSnap: StyleSnapshot | null = null;
  let rafId = 0;

  const apply = () => {
    const shell = document.querySelector<HTMLElement>("[data-checkout-shell]");
    const header = document.querySelector<HTMLElement>("[data-site-header]");
    const shellBox = shell?.getBoundingClientRect();
    const headerBox = header?.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;

    // Match the phone column the checkout shell occupies (full width on
    // mobile, the centered max-w-md column on desktop).
    const left = Math.max(0, Math.round(shellBox?.left ?? 0));
    const width = Math.max(0, Math.round(shellBox?.width || window.innerWidth));
    const headerHeight = Math.round(headerBox?.height || header?.offsetHeight || 64);
    // The header is sticky, so it is always on screen; pin it exactly where
    // the user already sees it (top of the viewport in practice).
    const headerTop = Math.min(
      Math.max(0, Math.round(headerBox?.top ?? 0)),
      Math.max(0, viewportHeight - headerHeight),
    );

    document.documentElement.style.setProperty(HEADER_VAR, `${headerHeight}px`);

    if (header && !headerSnap) headerSnap = snapshotStyle(header);
    if (header) {
      setImportant(header, "position", "fixed");
      setImportant(header, "top", `${headerTop}px`);
      setImportant(header, "left", `${left}px`);
      setImportant(header, "width", `${width}px`);
      setImportant(header, "height", `${headerHeight}px`);
      setImportant(header, "right", "auto");
      setImportant(header, "bottom", "auto");
      setImportant(header, "transform", "none");
      setImportant(header, "z-index", HEADER_Z);
      setImportant(header, "max-width", "none");
    }

    // The payment frame fills everything below the pinned header down to
    // the bottom of the viewport. `top` + `bottom` anchoring (instead of a
    // pre-computed height) means it always tracks the real, live viewport —
    // including mobile URL-bar changes — and its inner page scrolls on its
    // own when the content is taller than the frame.
    const frameTop = headerTop + headerHeight;
    document.querySelectorAll<HTMLElement>(".razorpay-container, .razorpay-checkout-frame").forEach((node) => {
      setImportant(node, "position", "fixed");
      setImportant(node, "top", `${frameTop}px`);
      setImportant(node, "left", `${left}px`);
      setImportant(node, "width", `${width}px`);
      setImportant(node, "right", "auto");
      setImportant(node, "bottom", "0");
      setImportant(node, "height", "auto");
      setImportant(node, "max-width", "none");
      setImportant(node, "max-height", "none");
      // Razorpay animates the container in from the bottom of the screen;
      // kill the transform so the frame sits exactly in its inset box.
      setImportant(node, "transform", "none");
      setImportant(node, "margin", "0");
      setImportant(node, "border-radius", "0");
      setImportant(node, "overflow", "hidden");
      setImportant(node, "z-index", CONTAINER_Z);
    });

    // The dimming backdrop stays underneath the payment frame and the header.
    document.querySelectorAll<HTMLElement>(".razorpay-backdrop").forEach((node) => {
      setImportant(node, "z-index", BACKDROP_Z);
    });

    document.querySelectorAll<HTMLElement>("iframe.razorpay-checkout-frame, .razorpay-container iframe").forEach((frame) => {
      setImportant(frame, "width", "100%");
      setImportant(frame, "height", "100%");
      setImportant(frame, "max-height", "100%");
      setImportant(frame, "color-scheme", "light");
    });
  };

  // Re-apply on the next frame — Razorpay mounts/animates its nodes over
  // several mutations, and rAF batching keeps the loop cheap.
  const schedule = () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(apply);
  };

  apply();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  // Mobile browsers change the visual viewport as the URL bar hides/shows —
  // track it so the payment frame never ends up taller than the screen.
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);

  return () => {
    cancelAnimationFrame(rafId);
    observer.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    window.visualViewport?.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("scroll", schedule);
    restoreStyle(headerSnap);
    document.body.classList.remove(OPEN_CLASS);
    document.body.removeAttribute("data-eduvora-razorpay-open");
    document.documentElement.style.removeProperty(HEADER_VAR);
  };
};
