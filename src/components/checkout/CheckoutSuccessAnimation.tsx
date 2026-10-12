// src/components/checkout/CheckoutSuccessAnimation.tsx
//
// The moment that shows FIRST after a completed transaction — adapted from
// Yaya12085's MIT-licensed Uiverse "nasty-firefox-13" card
// (https://uiverse.io/Yaya12085/nasty-firefox-13):
//
//   · a 3rem circle on a pale green plate, holding a 2rem success glyph that
//     pulses (scale 1 → 1.09, 0.6s linear alternate-reverse infinite);
//   · centred content: a 1rem/#066e29 title over a .875rem/#595b5f message;
//   · a full-width solid green primary action and, under it, the outlined
//     secondary action.
//
// The reference's geometry, palette and pulse are kept verbatim. What changes
// is the copy and the actions: this is a payment/access confirmation, so the
// primary action opens the receipt and the secondary returns to the source.
// The receipt card itself is revealed by CheckoutSuccessStep right after this
// card lands, so a buyer sees the animation and then the record — in order,
// never at once.

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ReceiptText, X } from "lucide-react";
import type { ReactNode } from "react";

export interface CheckoutSuccessAnimationProps {
  title: string;
  message: string;
  /** Reassurance line under the buttons (amount, order or access note). */
  footnote?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  /** The reference's corner × — here it skips straight to the receipt. */
  onDismiss: () => void;
  /** "free" swaps the glyph for the no-payment variant of the same card. */
  variant?: "paid" | "free";
}

export default function CheckoutSuccessAnimation({
  title,
  message,
  footnote,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  onDismiss,
  variant = "paid",
}: CheckoutSuccessAnimationProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      data-checkout-success-animation
      data-variant={variant}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="cu-success"
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className="cu-success-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss and view receipt"
        data-checkout-success-dismiss=""
      >
        <X size={16} aria-hidden="true" />
      </button>
      <span className="cu-success-plate" aria-hidden="true">
        {/* The reference's own success glyph, drawn at its authored 2rem. */}
        <svg viewBox="0 0 24 24" fill="none" focusable="false">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" opacity="0.35" />
          <path
            d="M7.75 12.5l2.6 2.6 5.9-6.2"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div className="cu-success-content">
        <h2 className="cu-success-title">{title}</h2>
        <p className="cu-success-message">{message}</p>
      </div>
      {footnote ? <p className="cu-success-footnote">{footnote}</p> : null}
      <div className="cu-success-actions">
        <button type="button" className="cu-success-primary" onClick={onPrimary} data-checkout-success-receipt-btn="">
          <ReceiptText size={16} aria-hidden="true" />
          {primaryLabel}
        </button>
        <button
          type="button"
          className="cu-success-secondary"
          onClick={onSecondary}
          data-checkout-success-back-btn=""
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {secondaryLabel}
        </button>
      </div>
    </motion.div>
  );
}
