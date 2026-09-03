// src/components/ui/glass-modal.tsx
//
// AI Canvas — "Glass Modal" (https://aicanvas.me/components/glass-modal)
//
// Ported as-is from the component's published source spec: a centered dialog
// with deep glass blur on the backdrop, a scale-spring entrance for the panel,
// and a staggered content reveal so the header, body and actions land in
// sequence rather than as one block.
//
// Every number from the upstream spec is preserved verbatim:
//   · panel        initial {scale:0.9, y:16} → spring stiffness 350 damping 28
//   · blur layer   backdrop-filter blur(40px) saturate(1.8) on a separate,
//                  non-animating layer (animating a backdrop-filter kills the
//                  compositor, which is why upstream splits it out)
//   · top highlight  left-8 right-8 h-[1px] white/25 gradient
//   · close button whileHover {scale:1.15, rotate:90}, whileTap {scale:0.9}
//   · icon badge   initial {scale:0, rotate:-20} → spring 300/18, delay 0.15
//   · heading      delay 0.2 · description delay 0.25 · features 0.3
//   · feature rows initial {opacity:0, x:-12}, delay 0.35 + i*0.08
//   · primary CTA  amber→red gradient, whileHover scale 1.04
//   · ghost CTA    white/6 fill, whileHover scale 1.04
//
// Two deliberate adaptations, both required by this repo (the visual result is
// identical):
//   1. Icons come from `lucide-react` (X, Check, ShieldCheck) because the app
//      does not ship @phosphor-icons/react and the two sets are visually
//      interchangeable at these sizes.
//   2. The upstream demo is a fixed 340px card pinned inside a preview frame
//      with a hardcoded "Upgrade to Pro" body. Here the same card is wrapped in
//      a real dialog (backdrop, Escape, scroll lock, focus return) and its
//      content is driven by props, so the caller can feed it live state. The
//      card markup, styles and motion are untouched.
//
// The accent colour is a prop (`accent`) defaulting to the upstream amber
// (#FFA032) so a caller can retint the badge/CTA without forking the file.

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ShieldCheck, X } from "lucide-react";

export interface GlassModalProps {
  open: boolean;
  onClose: () => void;
  /** Card heading — upstream: "Upgrade to Pro". */
  title: ReactNode;
  /** Supporting sentence under the heading. */
  description?: ReactNode;
  /** Bulleted rows with the staggered x-slide reveal. */
  features?: ReactNode[];
  /** Primary button label. Omit to hide the button. */
  primaryLabel?: ReactNode;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  /** Ghost button label — upstream: "Maybe Later". */
  secondaryLabel?: ReactNode;
  onSecondary?: () => void;
  /** Badge glyph. Defaults to the upstream ShieldCheck. */
  icon?: ReactNode;
  /** Accent hex used by the badge tint and the check bullets. */
  accent?: string;
  /** Extra content rendered between the description and the feature rows. */
  children?: ReactNode;
  /** Card width. Upstream is a fixed 340px. */
  widthClassName?: string;
  "data-testid"?: string;
}

const EASE = [0.25, 0.1, 0.25, 1] as const;

export default function GlassModal({
  open,
  onClose,
  title,
  description,
  features = [],
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  secondaryLabel,
  onSecondary,
  icon,
  accent = "#FFA032",
  children,
  widthClassName = "w-[340px] max-w-[calc(100vw-2rem)]",
  ...rest
}: GlassModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // Escape to dismiss + body scroll lock while the dialog owns the screen.
  useEffect(() => {
    if (!open) return undefined;
    restoreFocusTo.current = (document.activeElement as HTMLElement) || null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      restoreFocusTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto p-4"
          role="dialog"
          aria-modal="true"
          {...rest}
        >
          {/* Backdrop — deep blur, matching the upstream scene treatment. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            onClick={onClose}
            className="absolute inset-0 bg-[#1A1A19]/70"
            style={{
              backdropFilter: "blur(18px) saturate(1.4)",
              WebkitBackdropFilter: "blur(18px) saturate(1.4)",
            }}
            aria-hidden="true"
          />

          {/* Modal card — upstream motion.div, verbatim. */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            initial={{ scale: 0.9, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className={`relative isolate ${widthClassName} overflow-hidden rounded-3xl outline-none`}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow:
                "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            {/* Separate, non-animating blur layer. */}
            <div
              className="pointer-events-none absolute inset-0 z-[-1] rounded-3xl"
              style={{
                backdropFilter: "blur(40px) saturate(1.8)",
                WebkitBackdropFilter: "blur(40px) saturate(1.8)",
              }}
            />
            {/* Top highlight. */}
            <div
              className="pointer-events-none absolute left-8 right-8 top-0 h-[1px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
              }}
            />

            {/* Close button. */}
            <motion.button
              type="button"
              onClick={onClose}
              aria-label="Close"
              whileHover={{ scale: 1.15, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="absolute right-4 top-4 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <X size={14} className="text-white/60" />
            </motion.button>

            <div className="flex max-h-[82vh] flex-col items-center overflow-y-auto px-8 pb-8 pt-10">
              {/* 1) Icon badge. */}
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.15 }}
                className="mb-5 flex h-16 w-16 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${accent}18`, border: `1px solid ${accent}22` }}
              >
                {icon ?? <ShieldCheck size={28} style={{ color: accent }} />}
              </motion.div>

              {/* 2) Heading. */}
              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mb-2 text-center text-lg font-semibold text-white/90"
              >
                {title}
              </motion.h2>

              {/* 3) Description. */}
              {description ? (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="mb-6 text-center text-sm leading-relaxed text-white/40"
                >
                  {description}
                </motion.p>
              ) : null}

              {/* Caller-supplied body (live data tables, price rows, …). */}
              {children ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28 }}
                  className="mb-6 w-full"
                >
                  {children}
                </motion.div>
              ) : null}

              {/* 4) Feature rows with the staggered slide-in. */}
              {features.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mb-6 flex w-full flex-col gap-3"
                >
                  {features.map((feature, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.35 + index * 0.08 }}
                      className="flex items-center gap-3"
                    >
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{ background: `${accent}2e` }}
                      >
                        <Check size={10} style={{ color: accent }} />
                      </span>
                      <span className="text-sm text-white/60">{feature}</span>
                    </motion.div>
                  ))}
                </motion.div>
              ) : null}

              {/* 5) Buttons. */}
              {primaryLabel || secondaryLabel ? (
                <div className="flex w-full flex-col gap-2">
                  {primaryLabel ? (
                    <motion.button
                      type="button"
                      onClick={onPrimary}
                      disabled={primaryDisabled}
                      whileHover={
                        primaryDisabled
                          ? undefined
                          : {
                              scale: 1.04,
                              background:
                                "linear-gradient(135deg, rgba(255,180,80,0.9), rgba(235,75,45,0.8))",
                              boxShadow: "0 4px 24px rgba(220,80,30,0.6)",
                            }
                      }
                      whileTap={primaryDisabled ? undefined : { scale: 0.96 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      className="w-full cursor-pointer rounded-full py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(255,160,50,0.75), rgba(220,60,40,0.6))",
                        border: "1px solid rgba(255,180,80,0.25)",
                        boxShadow: "0 2px 16px rgba(220,80,30,0.4)",
                      }}
                    >
                      {primaryLabel}
                    </motion.button>
                  ) : null}
                  {secondaryLabel ? (
                    <motion.button
                      type="button"
                      onClick={onSecondary ?? onClose}
                      whileHover={{ scale: 1.04, background: "rgba(255,255,255,0.1)" }}
                      whileTap={{ scale: 0.96 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      className="w-full cursor-pointer rounded-full py-3 text-sm font-medium text-white/50"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      {secondaryLabel}
                    </motion.button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
