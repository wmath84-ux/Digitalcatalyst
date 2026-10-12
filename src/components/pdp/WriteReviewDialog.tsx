// src/components/pdp/WriteReviewDialog.tsx
//
// "Write a review" opens catraco's MIT-licensed Uiverse "dry-bulldog-95"
// feedback card (https://uiverse.io/catraco/dry-bulldog-95), adapted to submit
// the PDP's real 1–5 rating and review text. Keep its six-column paper card,
// one-column face buttons, textarea, and centered paper-plane action together.
//
// The card is a real modal rather than a decorative preview: it traps keyboard
// focus, restores focus to the opener, closes on Escape/backdrop, and locks the
// document scroll while open.

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { lockBodyScroll, unlockBodyScroll } from "../ui/overlayBounds";

const RATING_OPTIONS = [
  { value: 1, label: "Very unhappy", mouth: "M8 17c1-2 2.3-3 4-3s3 1 4 3" },
  { value: 2, label: "Unhappy", mouth: "M8 16c1-1.4 2.3-2.1 4-2.1s3 .7 4 2.1" },
  { value: 3, label: "Neutral", mouth: "M8.5 15h7" },
  { value: 4, label: "Happy", mouth: "M8 14.5c1 1.5 2.3 2.2 4 2.2s3-.7 4-2.2" },
  { value: 5, label: "Very happy", mouth: "M8 13.5c1 2 2.3 3 4 3s3-1 4-3" },
] as const;

export interface WriteReviewDialogProps {
  /** Visible product title the review is about. */
  productTitle: string;
  rating: number;
  comment: string;
  submitting: boolean;
  notice: string;
  onRating: (rating: number) => void;
  onComment: (comment: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export default function WriteReviewDialog({
  productTitle,
  rating,
  comment,
  submitting,
  notice,
  onRating,
  onComment,
  onSubmit,
  onClose,
}: WriteReviewDialogProps) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestOnClose = useRef(onClose);

  useEffect(() => {
    latestOnClose.current = onClose;
  }, [onClose]);

  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        latestOnClose.current();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    textareaRef.current?.focus({ preventScroll: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) {
        window.requestAnimationFrame(() => previousFocus.focus({ preventScroll: true }));
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
      data-pdp-review-dialog-backdrop
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        id="pdp-review-composer"
        data-pdp-review-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close review form"
          className="absolute right-3 top-3 z-10 flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border-2 border-slate-300 bg-white text-base font-light text-black transition duration-300 hover:border-[#ee0d0d] hover:bg-[#ee0d0d] hover:text-white"
        >
          <X size={14} aria-hidden="true" />
        </button>

        <div className="grid grid-cols-6 gap-2 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]">
          <h1
            id={headingId}
            className="col-span-6 text-center text-xl font-bold text-slate-800"
          >
            Send feedback
          </h1>
          <p className="col-span-6 px-1 text-center text-xs font-medium text-slate-500">
            {productTitle}
          </p>

          <textarea
            ref={textareaRef}
            value={comment}
            onChange={(event) => onComment(event.target.value.slice(0, 2000))}
            rows={4}
            maxLength={2000}
            aria-label="Your product review"
            placeholder="Your experience…"
            className="col-span-6 h-28 resize-none rounded-lg border border-slate-200 bg-slate-100 p-2 text-slate-600 outline-none duration-300 placeholder:text-slate-600 placeholder:opacity-50 focus:border-slate-600"
          />

          {RATING_OPTIONS.map(({ value, label, mouth }) => (
            <button
              key={value}
              type="button"
              onClick={() => onRating(value)}
              aria-label={`${value} star${value === 1 ? "" : "s"} — ${label}`}
              aria-pressed={value === rating}
              title={label}
              data-pdp-review-rating={value}
              className={`col-span-1 flex items-center justify-center rounded-lg border p-2 duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${
                value === rating
                  ? "border-blue-400 bg-blue-100 text-blue-600"
                  : "border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-600 hover:bg-white"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="9" cy="9.5" r="0.9" fill="currentColor" />
                <circle cx="15" cy="9.5" r="0.9" fill="currentColor" />
                <path d={mouth} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          ))}
          <span className="col-span-1" aria-hidden="true" />

          <span className="col-span-2" aria-hidden="true" />
          <button
            type="button"
            disabled={submitting}
            onClick={onSubmit}
            aria-label={submitting ? "Submitting review" : "Submit review"}
            title={submitting ? "Submitting review" : "Submit review"}
            className="col-span-2 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-100 p-2 stroke-slate-600 duration-300 hover:border-slate-600 hover:bg-slate-600 hover:text-white focus-visible:border-blue-400 focus-visible:bg-blue-400 focus-visible:text-white disabled:cursor-not-allowed disabled:opacity-60"
            data-pdp-review-submit-btn
          >
            <svg
              fill="none"
              viewBox="0 0 24 24"
              height="22"
              width="22"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeWidth="1.5"
                d="M7.39999 6.32003L15.89 3.49003C19.7 2.22003 21.77 4.30003 20.51 8.11003L17.68 16.6C15.78 22.31 12.66 22.31 10.76 16.6L9.91999 14.08L7.39999 13.24C1.68999 11.34 1.68999 8.23003 7.39999 6.32003Z"
              />
              <path
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeWidth="1.5"
                d="M10.11 13.6501L13.69 10.0601"
              />
            </svg>
          </button>
          <span className="col-span-2" aria-hidden="true" />

          {notice ? (
            <p className="col-span-6 text-center text-xs font-medium text-rose-600" role="status" aria-live="polite">
              {notice}
            </p>
          ) : null}
          <p className="col-span-6 text-center text-[11px] leading-4 text-slate-500">
            Reviews are published after moderation and show the same star rating other learners see.
          </p>
        </div>
      </div>
    </div>
  );
}
