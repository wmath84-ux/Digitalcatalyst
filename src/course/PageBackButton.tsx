// src/course/PageBackButton.tsx
//
// THE TOP-LEFT BACK BUTTON — on EVERY course player page, the owner's way
// (2026-10-16+):
//
//   "course player ke sabhi pages per back to home page ka button add karo
//    lekin yah button directly home page per redirect na karen — step bye
//    step previous pages per click karne per back kare. Top left mein yah
//    button hoga."
//
// Solid colors only: a white rectangular chip with a blue edge and blue
// text — the same language as the block picker. It NEVER jumps home: it calls
// `onBack`, which walks one step of the surface's own history.

import { ArrowLeft } from "lucide-react";

export interface PageBackButtonProps {
  /** Step one page back (the deck / player passes its history walker). */
  onBack: () => void;
  /** False while there is no previous page — the button sits disabled. */
  enabled: boolean;
  /** aria-label / title suffix, e.g. "Lesson" or "Notes". */
  surface: string;
}

export default function PageBackButton({ onBack, enabled, surface }: PageBackButtonProps) {
  return (
    <button
      type="button"
      className="dc-page-back"
      data-course-page-back=""
      data-surface={surface}
      data-enabled={enabled ? "true" : "false"}
      disabled={!enabled}
      aria-label={`Back to the previous page — ${surface}`}
      title="Back to the previous page"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (enabled) onBack();
      }}
    >
      <ArrowLeft size={13} strokeWidth={2.5} aria-hidden />
      <span>Back</span>
    </button>
  );
}
