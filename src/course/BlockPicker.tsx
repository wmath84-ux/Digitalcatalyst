// src/course/BlockPicker.tsx
//
// THE BLANK PAGE — every block of the tablet/desktop plus deck starts here,
// the owner's starter page (2026-10-16+):
//
//   "block Keval aur Keval ek blank page se start hoga … white background,
//    button s blue white … rectangular button design … course player ke
//    sabhi pages ke button honge … sabkuchh solid color, glass type nahin."
//
// So: a WHITE page, solid colors only, rectangular blue/white buttons, and
// every course player page listed — press one and that page opens in this
// block. No gradients, no glass, no shadows.

import type { BlockPageRecord } from "./blockPages";
import { BlockPickerIcon } from "./blockPages";

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
          <BlockPickerIcon size={16} />
        </span>
        <div>
          <h3 className="dc-block-picker__title">Blank page</h3>
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
              title={elsewhere ? `${record.label} — abhi ${elsewhere} block mein hai, yahan khulega` : record.hint}
              onClick={() => onPick(record.key)}
            >
              <Icon size={14} aria-hidden />
              <span className="dc-block-picker__button-label">{record.label}</span>
              {elsewhere ? <span className="dc-block-picker__move">Move here</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
