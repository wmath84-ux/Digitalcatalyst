// src/components/pdp/WriteReviewDialog.tsx
//
// "Write a review" on the product page opens this card — adapted from
// catraco's MIT-licensed Uiverse "dry-bulldog-95" Tailwind card
// (https://uiverse.io/catraco/dry-bulldog-95):
//
//   <div class="bg-white border border-slate-200 grid grid-cols-6 gap-2 rounded-xl p-2 text-sm">
//     <h1 class="text-center text-xl font-bold col-span-6">…</h1>
//     <textarea class="bg-slate-100 … h-28 … col-span-6 resize-none outline-none rounded-lg p-2
//                      duration-300 focus:border-slate-600"></textarea>
//     <button class="fill-slate-600 col-span-1 … rounded-lg p-2 duration-300 bg-slate-100
//                    hover:border-slate-600 focus:fill-blue-200 focus:bg-blue-400 border border-slate-200">
//     … one icon button per choice …
//     <span class="col-span-2"></span>
//     <button class="bg-slate-100 stroke-slate-600 border border-slate-200 col-span-2 flex justify-center
//                    rounded-lg p-2 duration-300 hover:border-slate-600 hover:text-white
//                    focus:stroke-blue-200 focus:bg-blue-400"> … send …</button>
//
// The reference's feedback faces become the five star choices (same button
// material, same 1-column rhythm) and its paper-plane send button becomes the
// submit action. The two departures are deliberate: the title is slate-800
// instead of the reference's slate-200 (which paints white-on-white), and the
// dialog carries a real close control, Escape handling and a scroll lock —
// this is a modal, so it has to behave like one.
//
// It renders INSIDE the reviews section (no portal) so the review list, its
// status line and this composer stay one region for screen readers — and so
// the "Write a review" → "Submit review" journey stays inside `[data-pdp-reviews]`.

import { useEffect, useId, useRef } from "react";
import { Star, X } from "lucide-react";
import { lockBodyScroll, unlockBodyScroll } from "../ui/overlayBounds";

export interface WriteReviewDialogProps {
  /** Visible product title the review is about. */
  productTitle: string;
  rating: number;
  comment: string;
  submitting: boolean;
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
  onRating,
  onComment,
  onSubmit,
  onClose,
}: WriteReviewDialogProps) {
  const headingId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  useEffect(() => {
    // Land the caret in the field the buyer came here to fill.
    textareaRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center"
      data-pdp-review-dialog-backdrop
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        id="pdp-review-composer"
        data-pdp-review-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative w-full max-w-sm"
      >
        {/* The reference's own dismiss control (Uiverse "nasty-firefox-13"
            .dismiss): white plate, 2px slate border, red on hover. */}
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
            Write a Review
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

          <p className="col-span-6 text-[11px] font-semibold text-slate-500">Your rating</p>

          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRating(value)}
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              aria-pressed={value === rating}
              className="col-span-1 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-100 p-2 fill-slate-600 duration-300 hover:border-slate-600 focus:border-blue-400 focus:bg-blue-400"
            >
              <Star
                aria-hidden="true"
                size={20}
                className={
                  value <= rating
                    ? "fill-amber-400 text-amber-400"
                    : "fill-slate-300 text-slate-300"
                }
              />
            </button>
          ))}
          <span className="col-span-1" aria-hidden="true" />

          <button
            type="button"
            disabled={submitting}
            onClick={onSubmit}
            className="col-span-6 flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 p-2 stroke-slate-600 duration-300 hover:border-slate-600 hover:text-white focus:stroke-blue-200 focus:bg-blue-400 focus:text-white disabled:cursor-not-allowed disabled:opacity-60"
            data-pdp-review-submit-btn
          >
            {/* The reference's paper-plane glyph. */}
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
            <span className="text-sm font-semibold text-slate-700">
              {submitting ? "Submitting…" : "Submit review"}
            </span>
          </button>

          <p className="col-span-6 text-center text-[11px] leading-4 text-slate-500">
            Reviews are published after moderation and show the same star rating other learners see.
          </p>
        </div>
      </div>
    </div>
  );
}
