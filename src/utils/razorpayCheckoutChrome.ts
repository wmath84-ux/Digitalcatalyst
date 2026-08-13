// Pins the Eduvora header and footer above Razorpay Standard Checkout
// so the payment iframe sits in the phone column between them instead
// of covering the whole viewport.

const OPEN_CLASS = "eduvora-razorpay-open";
const HEADER_VAR = "--eduvora-header-h";
const FOOTER_VAR = "--eduvora-footer-h";

type StyleSnapshot = { element: HTMLElement; cssText: string };

const snapshotStyle = (element: HTMLElement): StyleSnapshot => ({
  element,
  cssText: element.style.cssText,
});

const restoreStyle = (snapshot: StyleSnapshot | null) => {
  if (!snapshot) return;
  snapshot.element.style.cssText = snapshot.cssText;
};

const pinElement = (
  element: HTMLElement,
  box: { top: number; left: number; width: number; height: number },
) => {
  element.style.setProperty("position", "fixed", "important");
  element.style.setProperty("top", `${Math.max(0, box.top)}px`, "important");
  element.style.setProperty("left", `${Math.max(0, box.left)}px`, "important");
  element.style.setProperty("width", `${Math.max(0, box.width)}px`, "important");
  element.style.setProperty("height", `${Math.max(0, box.height)}px`, "important");
  element.style.setProperty("right", "auto", "important");
  element.style.setProperty("bottom", "auto", "important");
  element.style.setProperty("transform", "none", "important");
  element.style.setProperty("z-index", "2147483000", "important");
  element.style.setProperty("max-width", "none", "important");
};

const insetRazorpayFrame = (box: { top: number; left: number; width: number; height: number }) => {
  const containers = document.querySelectorAll<HTMLElement>(".razorpay-container, .razorpay-checkout-frame");
  containers.forEach((node) => {
    node.style.setProperty("position", "fixed", "important");
    node.style.setProperty("top", `${Math.max(0, box.top)}px`, "important");
    node.style.setProperty("left", `${Math.max(0, box.left)}px`, "important");
    node.style.setProperty("width", `${Math.max(0, box.width)}px`, "important");
    node.style.setProperty("height", `${Math.max(0, box.height)}px`, "important");
    node.style.setProperty("right", "auto", "important");
    node.style.setProperty("bottom", "auto", "important");
    node.style.setProperty("max-width", "none", "important");
    node.style.setProperty("max-height", "none", "important");
    node.style.setProperty("transform", "none", "important");
    node.style.setProperty("margin", "0", "important");
    node.style.setProperty("border-radius", "0", "important");
  });

  document.querySelectorAll<HTMLElement>("iframe.razorpay-checkout-frame, .razorpay-container iframe").forEach((frame) => {
    frame.style.setProperty("width", "100%", "important");
    frame.style.setProperty("height", "100%", "important");
    frame.style.setProperty("max-height", "100%", "important");
    frame.style.setProperty("color-scheme", "light");
  });
};

const measureChrome = () => {
  const shell = document.querySelector<HTMLElement>("[data-checkout-shell]");
  const header = document.querySelector<HTMLElement>("[data-site-header]");
  const footer = document.querySelector<HTMLElement>("[data-site-footer]");
  const shellBox = shell?.getBoundingClientRect();
  const headerBox = header?.getBoundingClientRect();
  const footerBox = footer?.getBoundingClientRect();

  const left = shellBox?.left ?? 0;
  const width = shellBox?.width || window.innerWidth;
  const headerHeight = Math.round(headerBox?.height || header?.offsetHeight || 64);
  const footerHeight = Math.round(footerBox?.height || footer?.offsetHeight || 80);
  const top = shellBox?.top ?? 0;
  const bottom = shellBox?.bottom ?? window.innerHeight;

  document.documentElement.style.setProperty(HEADER_VAR, `${headerHeight}px`);
  document.documentElement.style.setProperty(FOOTER_VAR, `${footerHeight}px`);

  return {
    header,
    footer,
    headerBox: { top, left, width, height: headerHeight },
    footerBox: { top: bottom - footerHeight, left, width, height: footerHeight },
    frameBox: {
      top: top + headerHeight,
      left,
      width,
      height: Math.max(160, bottom - top - headerHeight - footerHeight),
    },
  };
};

/**
 * Keep the store header and footer visible while Razorpay Checkout is open.
 * Returns a disposer that restores the original chrome and CSS variables.
 */
export const revealCheckoutChromeOverRazorpay = (): (() => void) => {
  if (typeof document === "undefined") return () => undefined;

  document.body.classList.add(OPEN_CLASS);
  document.body.setAttribute("data-eduvora-razorpay-open", "true");

  let headerSnap: StyleSnapshot | null = null;
  let footerSnap: StyleSnapshot | null = null;

  const apply = () => {
    const measured = measureChrome();
    if (measured.header && !headerSnap) headerSnap = snapshotStyle(measured.header);
    if (measured.footer && !footerSnap) footerSnap = snapshotStyle(measured.footer);
    if (measured.header) pinElement(measured.header, measured.headerBox);
    if (measured.footer) pinElement(measured.footer, measured.footerBox);
    insetRazorpayFrame(measured.frameBox);
  };

  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);

  return () => {
    observer.disconnect();
    window.removeEventListener("resize", apply);
    window.removeEventListener("orientationchange", apply);
    restoreStyle(headerSnap);
    restoreStyle(footerSnap);
    document.body.classList.remove(OPEN_CLASS);
    document.body.removeAttribute("data-eduvora-razorpay-open");
    document.documentElement.style.removeProperty(HEADER_VAR);
    document.documentElement.style.removeProperty(FOOTER_VAR);
  };
};
