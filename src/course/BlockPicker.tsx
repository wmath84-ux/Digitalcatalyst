// src/course/BlockPicker.tsx
//
// THE SELECTION PAGE — every block of the tablet/desktop plus deck starts
// here, and the header's Pages button brings the active block back to it.
//
// The owner's 2026-10-16+ revision:
//
//   "selection page ka jo button hai usko vibrant aur thoda sa badhiya design
//    do, ui ux selection page ka ekadam badhiya sa design karo."
//
// So: a clean white page with a vibrant hero strip, and one colourful card
// per course player page — each card carries its page's own accent colour on
// a rounded icon tile, a bold label and a quiet hint, lifting gently on
// hover. Press one and that page opens in this block. A page already open in
// another block MOVES here (the "Move here" badge says so before the press).

import type { CSSProperties } from "react";
import type { BlockPageRecord } from "./blockPages";
import { BlockPickerIcon, BlockPickerSparkIcon } from "./blockPages";

export interface BlockPickerProps {
  /** Which block is asking (c11 … c22) — for the tests' data attributes. */
  pane: string;
  /** The catalog to offer (hidden tabs already filtered out). */
  pages: readonly BlockPageRecord[];
  /** Which pages already sit in other blocks (they MOVE here when picked). */
  taken: Readonly<Record<string, string | null>> | undefined;
  onPick: (page: BlockPageRecord["key"]) => void;
  /** The block had a page before — offer the quiet way back to it. */
  onReset?: (() => void) | undefined;
}

export default function BlockPicker({ pane, pages, taken, onPick }: BlockPickerProps) {
  return (
    <div className="dc-block-picker" data-course-block-picker={pane}>
      <div className="dc-block-picker__head">
        <span className="dc-block-picker__mark" aria-hidden>
          <BlockPickerIcon size={17} />
        </span>
        <div className="dc-block-picker__head-text">
          <h3 className="dc-block-picker__title">
            Choose a page
            <BlockPickerSparkIcon size={13} className="dc-block-picker__spark" aria-hidden />
          </h3>
          <p className="dc-block-picker__hint">
            Is block ke liye koi bhi page kholo — har block apne aap.
          </p>
        </div>
      </div>
      <div className="dc-block-picker__grid" role="group" aria-label={`Pages for block ${pane}`}>
        {pages.map((record) => {
          const Icon = record.icon;
          const elsewhere = taken && Object.entries(taken).find(([, page]) => page === record.key)?.[0];
          return (
            <button
              key={record.key}
              type="button"
              className="dc-block-picker__button"
              data-course-block-picker-page={record.key}
              data-taken={elsewhere ? "true" : "false"}
              style={{ "--dc-page-accent": record.accent, "--dc-page-accent-to": record.accentTo } as CSSProperties}
              title={elsewhere ? `${record.label} — abhi ${elsewhere} block mein hai, yahan khulega` : record.hint}
              onClick={() => onPick(record.key)}
            >
              <span className="dc-block-picker__tile" aria-hidden>
                <Icon size={16} aria-hidden />
              </span>
              <span className="dc-block-picker__text">
                <span className="dc-block-picker__button-label">{record.label}</span>
                <span className="dc-block-picker__button-hint">{record.hint}</span>
              </span>
              {elsewhere ? <span className="dc-block-picker__move">Move here</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
