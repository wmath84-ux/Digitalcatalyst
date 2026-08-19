// Pins the Eduvora website header above Razorpay Standard Checkout and
// insets the Razorpay frame between the header and the bottom of the
// viewport. The payment checkout therefore behaves like an in-app iframe:
// the site header stays visible and the checkout page (Razorpay's own
// cross-origin frame) gets the full remaining viewport height and scrolls
// internally, so every field, method option and button stays reachable by
// scrolling — nothing is clipped behind the chrome.
//
// Because Razorpay's OWN "Continue payment / Cancel payment" confirmation
// renders inside its cross-origin iframe (and gets clipped once we inset
// that iframe), this module also renders our own always-visible exit
// affordance: a slim "Cancel payment" bar between the header and the
// payment frame, plus a same-origin confirmation sheet with
// "Continue payment" / "Cancel payment". Both live in OUR DOM, above
// Razorpay's z-index, so they can never be clipped or hidden.

const OPEN_CLASS = "eduvora-razorpay-open";
const HEADER_VAR = "--eduvora-header-h";

// Layering (Razorpay ships its own sky-high z-indexes):
//   backdrop < payment frame < exit bar / confirm sheet < site header
const HEADER_Z = "2147483000";
const CONFIRM_Z = "2147482600";
const BAR_Z = "2147482500";
const CONTAINER_Z = "2147482001";
const BACKDROP_Z = "2147482000";

const BAR_ID = "eduvora-razorpay-exit-bar";
const CONFIRM_ID = "eduvora-razorpay-exit-confirm";

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

const applyStyles = (element: HTMLElement, styles: Record<string, string>) => {
  Object.entries(styles).forEach(([property, value]) => setImportant(element, property, value));
};

export type CheckoutChromeOptions = {
  /**
   * Called when the user confirms "Cancel payment". The caller is expected
   * to close the Razorpay instance and navigate back to the order summary.
   */
  onCancel?: () => void;
  /** Label shown on the left of the exit bar (e.g. the amount being paid). */
  label?: string;
};

export type CheckoutChromeController = {
  /** Restores the original chrome and removes our exit UI. */
  release: () => void;
  /** Opens the "Continue payment / Cancel payment" confirmation sheet. */
  requestExit: () => void;
  /** True while the confirmation sheet is on screen. */
  isExitPromptOpen: () => boolean;
  /** Closes the confirmation sheet without cancelling the payment. */
  dismissExitPrompt: () => void;
};

const NOOP_CONTROLLER: CheckoutChromeController = {
  release: () => undefined,
  requestExit: () => undefined,
  isExitPromptOpen: () => false,
  dismissExitPrompt: () => undefined,
};

// Options for the NEXT reveal. Kept module-scoped so callers can always write
// `unpinChromeRef.current = revealCheckoutChromeOverRazorpay()` and never have
// to hold the controller while the options are assembled. The options are
// consumed (and reset) by the reveal call itself.
let pendingOptions: CheckoutChromeOptions = {};

/**
 * Register the label / onCancel behaviour for the next
 * `revealCheckoutChromeOverRazorpay()` call. The options are read once by
 * that call and then cleared, so a later reveal without a fresh
 * `prepareCheckoutChrome` falls back to the neutral defaults.
 */
export const prepareCheckoutChrome = (options: CheckoutChromeOptions) => {
  pendingOptions = options;
};

/**
 * Keep the site header visible while Razorpay Checkout is open, with the
 * payment frame inset below it and the dimming backdrop underneath both.
 * Also mounts an always-visible "Cancel payment" bar + confirmation sheet.
 * Returns a controller that can open that sheet and restore the chrome.
 *
 * The label and onCancel behaviour come from the most recent
 * `prepareCheckoutChrome()` call (or from the optional `options` argument
 * for direct callers).
 */
export const revealCheckoutChromeOverRazorpay = (options: CheckoutChromeOptions = pendingOptions): CheckoutChromeController => {
  if (typeof document === "undefined") return NOOP_CONTROLLER;

  const { onCancel, label } = options;
  pendingOptions = {};

  document.body.classList.add(OPEN_CLASS);
  document.body.setAttribute("data-eduvora-razorpay-open", "true");

  let headerSnap: StyleSnapshot | null = null;
  let rafId = 0;
  let disposed = false;

  /* ------------------------------------------------------------------ *
   * Our own exit chrome (same-origin, so it can never be clipped by the
   * cross-origin Razorpay iframe).
   * ------------------------------------------------------------------ */

  const bar = document.createElement("div");
  bar.id = BAR_ID;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Payment controls");
  applyStyles(bar, {
    position: "fixed",
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: "8px",
    padding: "6px 10px",
    "box-sizing": "border-box",
    background: "#ffffff",
    "border-bottom": "1px solid #e2e8f0",
    "font-family": "inherit",
    "z-index": BAR_Z,
  });

  const barLabel = document.createElement("span");
  applyStyles(barLabel, {
    display: "inline-flex",
    "align-items": "center",
    gap: "6px",
    "min-width": "0",
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "white-space": "nowrap",
    color: "#475569",
    "font-size": "12px",
    "font-weight": "600",
  });
  barLabel.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10.5" width="16" height="10" rx="2"></rect><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path></svg>';
  const barText = document.createElement("span");
  barText.textContent = label ? `Secure payment · ${label}` : "Secure payment in progress";
  applyStyles(barText, { overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" });
  barLabel.appendChild(barText);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel payment";
  applyStyles(cancelButton, {
    flex: "0 0 auto",
    appearance: "none",
    border: "1px solid #fecdd3",
    background: "#fff1f2",
    color: "#be123c",
    "border-radius": "999px",
    padding: "6px 12px",
    "font-size": "12px",
    "font-weight": "800",
    "font-family": "inherit",
    cursor: "pointer",
    "line-height": "1",
  });

  bar.append(barLabel, cancelButton);

  // Confirmation sheet — mirrors Razorpay's own wording, but rendered by us
  // so both buttons are always fully visible.
  const confirm = document.createElement("div");
  confirm.id = CONFIRM_ID;
  confirm.setAttribute("role", "dialog");
  confirm.setAttribute("aria-modal", "true");
  confirm.setAttribute("aria-label", "Cancel payment?");
  applyStyles(confirm, {
    position: "fixed",
    display: "none",
    "align-items": "center",
    "justify-content": "center",
    padding: "16px",
    "box-sizing": "border-box",
    background: "rgba(15, 23, 42, 0.55)",
    "z-index": CONFIRM_Z,
  });

  const confirmCard = document.createElement("div");
  applyStyles(confirmCard, {
    width: "100%",
    "max-width": "340px",
    background: "#ffffff",
    "border-radius": "18px",
    padding: "20px",
    "box-sizing": "border-box",
    "box-shadow": "0 20px 45px rgba(15, 23, 42, 0.25)",
    "font-family": "inherit",
    "text-align": "center",
  });

  const confirmTitle = document.createElement("p");
  confirmTitle.textContent = "Cancel this payment?";
  applyStyles(confirmTitle, {
    margin: "0",
    "font-size": "16px",
    "font-weight": "800",
    color: "#0f172a",
  });

  const confirmBody = document.createElement("p");
  confirmBody.textContent = "Your order is not paid yet. You can continue the payment, or go back to the order summary.";
  applyStyles(confirmBody, {
    margin: "8px 0 18px",
    "font-size": "12.5px",
    "line-height": "1.5",
    color: "#64748b",
  });

  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.textContent = "Continue payment";
  applyStyles(continueButton, {
    display: "block",
    width: "100%",
    appearance: "none",
    border: "none",
    background: "#4f46e5",
    color: "#ffffff",
    "border-radius": "14px",
    padding: "13px 16px",
    "font-size": "14px",
    "font-weight": "800",
    "font-family": "inherit",
    cursor: "pointer",
  });

  const confirmCancelButton = document.createElement("button");
  confirmCancelButton.type = "button";
  confirmCancelButton.textContent = "Cancel payment";
  applyStyles(confirmCancelButton, {
    display: "block",
    width: "100%",
    "margin-top": "10px",
    appearance: "none",
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#be123c",
    "border-radius": "14px",
    padding: "12px 16px",
    "font-size": "13.5px",
    "font-weight": "800",
    "font-family": "inherit",
    cursor: "pointer",
  });

  confirmCard.append(confirmTitle, confirmBody, continueButton, confirmCancelButton);
  confirm.appendChild(confirmCard);

  const isConfirmOpen = () => confirm.style.display === "flex";
  const openConfirm = () => {
    setImportant(confirm, "display", "flex");
    continueButton.focus?.();
  };
  const closeConfirm = () => setImportant(confirm, "display", "none");

  cancelButton.addEventListener("click", openConfirm);
  continueButton.addEventListener("click", closeConfirm);
  confirm.addEventListener("click", (event) => {
    if (event.target === confirm) closeConfirm();
  });
  confirmCancelButton.addEventListener("click", () => {
    closeConfirm();
    onCancel?.();
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (isConfirmOpen()) closeConfirm();
    else openConfirm();
  };
  window.addEventListener("keydown", onKeyDown);

  document.body.append(bar, confirm);

  /* ------------------------------------------------------------------ */

  const apply = () => {
    if (disposed) return;
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

    // The exit bar sits directly under the header, inside the same column.
    const barTop = headerTop + headerHeight;
    setImportant(bar, "top", `${barTop}px`);
    setImportant(bar, "left", `${left}px`);
    setImportant(bar, "width", `${width}px`);
    const barHeight = Math.round(bar.getBoundingClientRect().height || 36);

    // The confirmation sheet covers the whole payment column (header stays
    // visible above it, matching the rest of the in-app chrome).
    setImportant(confirm, "top", `${barTop}px`);
    setImportant(confirm, "left", `${left}px`);
    setImportant(confirm, "width", `${width}px`);
    setImportant(confirm, "bottom", "0");

    // The payment frame fills everything below the pinned header + exit bar
    // down to the bottom of the viewport. `top` + `bottom` anchoring (instead
    // of a pre-computed height) means it always tracks the real, live
    // viewport — including mobile URL-bar changes — and its inner page
    // scrolls on its own when the content is taller than the frame.
    const frameTop = barTop + barHeight;
    document.documentElement.style.setProperty("--eduvora-razorpay-top", `${frameTop}px`);
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

  const release = () => {
    disposed = true;
    cancelAnimationFrame(rafId);
    observer.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    window.removeEventListener("keydown", onKeyDown);
    window.visualViewport?.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("scroll", schedule);
    bar.remove();
    confirm.remove();
    restoreStyle(headerSnap);
    document.body.classList.remove(OPEN_CLASS);
    document.body.removeAttribute("data-eduvora-razorpay-open");
    document.documentElement.style.removeProperty(HEADER_VAR);
    document.documentElement.style.removeProperty("--eduvora-razorpay-top");
  };

  return {
    release,
    requestExit: openConfirm,
    isExitPromptOpen: isConfirmOpen,
    dismissExitPrompt: closeConfirm,
  };
};
