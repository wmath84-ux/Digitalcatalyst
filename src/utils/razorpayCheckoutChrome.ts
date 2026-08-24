// Forces Razorpay Standard Checkout to cover the entire viewport.
//
// The previous inset layout (site header + a custom exit bar sitting
// above a clipped iframe) hid Razorpay's own close control and made
// the payment sheet hard to dismiss on phones. Full screen fixes that
// in one step: every field, method and Razorpay's native × stay on
// screen, and there are no extra close buttons of our own.
//
// This module only stretches the Razorpay nodes to the live visual
// viewport and restores them on release. Open / close policy lives in
// PaymentGateway (native ×, backdrop tap, Esc, system Back).

const OPEN_CLASS = "eduvora-razorpay-open";

const FRAME_Z = "2147483646";
const BACKDROP_Z = "2147483645";

export type CheckoutChromeController = {
  /** Restores the original page and stops pinning the payment frame. */
  release: () => void;
};

const NOOP_CONTROLLER: CheckoutChromeController = {
  release: () => undefined,
};

const setImportant = (element: HTMLElement, property: string, value: string) => {
  element.style.setProperty(property, value, "important");
};

const applyStyles = (element: HTMLElement, styles: Record<string, string>) => {
  Object.entries(styles).forEach(([property, value]) => setImportant(element, property, value));
};

/**
 * Stretch Razorpay Checkout across the full visual viewport and keep it
 * there while Razorpay mounts / animates its nodes. Call `release()`
 * from every exit path (dismiss, success, failure, unmount).
 */
export const revealCheckoutChromeOverRazorpay = (): CheckoutChromeController => {
  if (typeof document === "undefined") return NOOP_CONTROLLER;

  document.body.classList.add(OPEN_CLASS);
  document.body.setAttribute("data-eduvora-razorpay-open", "true");

  let rafId = 0;
  let disposed = false;

  const apply = () => {
    if (disposed) return;

    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || window.innerWidth));
    const height = Math.max(1, Math.round(viewport?.height || window.innerHeight));
    const top = Math.round(viewport?.offsetTop || 0);
    const left = Math.round(viewport?.offsetLeft || 0);

    document.documentElement.style.setProperty("--eduvora-razorpay-top", "0px");

    document.querySelectorAll<HTMLElement>(".razorpay-container, .razorpay-checkout-frame").forEach((node) => {
      applyStyles(node, {
        position: "fixed",
        inset: "0",
        top: `${top}px`,
        left: `${left}px`,
        right: "auto",
        bottom: "auto",
        width: `${width}px`,
        height: `${height}px`,
        "max-width": "none",
        "max-height": "none",
        transform: "none",
        margin: "0",
        "border-radius": "0",
        overflow: "hidden",
        "z-index": FRAME_Z,
      });
    });

    document.querySelectorAll<HTMLElement>(".razorpay-backdrop").forEach((node) => {
      applyStyles(node, {
        position: "fixed",
        inset: "0",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        "z-index": BACKDROP_Z,
      });
    });

    document.querySelectorAll<HTMLElement>("iframe.razorpay-checkout-frame, .razorpay-container iframe").forEach((frame) => {
      applyStyles(frame, {
        width: "100%",
        height: "100%",
        "max-height": "100%",
        "min-height": "100%",
        "border-radius": "0",
        "color-scheme": "light",
      });
    });
  };

  const schedule = () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(apply);
  };

  apply();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);

  const release = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(rafId);
    observer.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    window.visualViewport?.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("scroll", schedule);
    document.body.classList.remove(OPEN_CLASS);
    document.body.removeAttribute("data-eduvora-razorpay-open");
    document.documentElement.style.removeProperty("--eduvora-razorpay-top");
  };

  return { release };
};
