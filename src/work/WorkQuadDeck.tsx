// src/work/WorkQuadDeck.tsx
//
// WORK MODE'S PLUS DECK — the same split-screen behaviour the owner shipped in
// the Course Player (2026-10-16), now in Work too:
//
//   "Work mode mein bhi same split-screen behaviour, same footer-navigation
//    behaviour aur naye notes page, mind map page aur sketch ke design — sab
//    kuchh exactly same chahiye."
//
// The deck itself is the Course Player's own `QuadDeck` — four blocks in a
// plus, one horizontal and one vertical divider, every divider always
// draggable, a dot at each divider-segment's centre that opens the one control
// cluster (the two swaps, the four quadrant buttons, every grid shape), the
// Course-view zoom and the four divider switches. Not one line of that is
// duplicated here; this file only says WHICH page sits in WHICH block:
//
//   · c11 — the main content: the Work page you are on (My Day, Sketch, AI,
//           Revision) — the Course Player's video block, Work's own way;
//   · c21 — the second content block under it: another Work page (the picker
//           offers one when the block is empty);
//   · c12 — Notes, exactly the panel the Notes page uses;
//   · c22 — Mind map, exactly the panel the Mind map page uses.
//
// Notes and the Mind map keep their blocks, exactly as in the Course Player, so
// the navigation can never shuffle them; every other Work page borrows the
// content block. Below 768px nothing here mounts — `useQuadDeckEnabled()` gates
// it and WorkApp keeps today's `WorkDeck` untouched on a phone.

import { useCallback, type ReactNode } from "react";
import { CirclePlus, PanelsTopLeft } from "lucide-react";
import QuadDeck from "../course/QuadDeck";
import type { CourseViewSettings } from "../course/courseViewSettings";
import type { QuadLayoutState, QuadPaneId } from "../course/quadLayout";
import type { FooterNavigationPlacement } from "../utils/footerNavigationPlacement";
import { WORK_PAGES, workPageRecord, type WorkPageId } from "./workPages";

/**
 * The pages that can live in a content block. Notes and the Mind map are NOT
 * in this list: they own the right-hand blocks (c12 / c22) in every format,
 * exactly like the Course Player's own panes.
 */
export const WORK_CONTENT_PAGES: WorkPageId[] = WORK_PAGES.map((page) => page.id).filter(
  (id) => id !== "notes" && id !== "mindmap",
);

/** The two content blocks the deck owns. */
export type WorkQuadSlot = "c11" | "c21";

/** A page the navigation put in a content block (a hint while it is empty). */
export interface WorkQuadPromptProps {
  slot: WorkQuadSlot;
  onPick: (slot: WorkQuadSlot, page: WorkPageId) => void;
}

/** The empty-block picker — the same quiet panel `WorkDeck` shows on a phone. */
export function WorkQuadPrompt({ slot, onPick }: WorkQuadPromptProps) {
  return (
    <div
      className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto px-4 py-6 text-center"
      data-work-quad-prompt={slot}
    >
      <span className="mb-2 grid h-10 w-10 place-items-center rounded-2xl border border-[var(--border-color)] bg-[var(--active-bg)] text-[var(--accent-color)]">
        <PanelsTopLeft size={20} aria-hidden="true" />
      </span>
      <h2 className="text-[13px] font-bold tracking-tight text-[var(--text-primary)]">
        {slot === "c11" ? "Your main page" : "Your other page"}
      </h2>
      <p className="mt-1 max-w-[240px] text-[11px] leading-relaxed text-[var(--text-secondary)]">
        Is block ke liye ek page chuno. Notes aur Mind map apne block mein hi rehte hain.
      </p>
      <div className="mt-3 flex max-w-[340px] flex-wrap justify-center gap-2">
        {WORK_CONTENT_PAGES.map((id) => {
          const record = workPageRecord(id);
          const Icon = record.icon;
          return (
            <button
              key={id}
              type="button"
              data-work-quad-prompt-page={id}
              onClick={() => onPick(slot, id)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] px-3 text-[11px] font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
            >
              <Icon size={13} />
              {record.label}
              <CirclePlus size={12} aria-hidden="true" className="opacity-60" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface WorkQuadDeckProps {
  /** The page in the main content block (c11), or null for the picker. */
  primary: WorkPageId | null;
  /** The page in the lower content block (c21), or null for the picker. */
  secondary: WorkPageId | null;
  onPick: (slot: WorkQuadSlot, page: WorkPageId) => void;
  /** Renders one Work page surface, headless (the deck brings the chrome). */
  renderPage: (page: WorkPageId, slotKey: string) => ReactNode;
  /** The shape + both ratios (WorkApp persists them under the "work" key). */
  state: QuadLayoutState;
  onState: (next: QuadLayoutState) => void;
  /** Course view page: zoom and the four divider switches (one shared store). */
  view: CourseViewSettings;
  /** Where the navigation sits — the blocks step their chrome out of its way. */
  placement: FooterNavigationPlacement;
  /** The navigation, for the single-divider shape's strip under the content. */
  nav: ReactNode;
  /** A navigation press asks for a block: bring it back and let it glow. */
  reveal: { pane: QuadPaneId; count: number } | null;
  /** True while the page below is the one the navigation selected (highlight). */
  activePage?: WorkPageId;
}

export default function WorkQuadDeck({
  primary,
  secondary,
  onPick,
  renderPage,
  state,
  onState,
  view,
  placement,
  nav,
  reveal,
}: WorkQuadDeckProps) {
  const block = useCallback(
    (page: WorkPageId | null, slot: WorkQuadSlot) => (
      <div className="h-full min-h-0 min-w-0 overflow-hidden" data-work-quad-block={slot} data-work-quad-page={page ?? "empty"}>
        {page ? renderPage(page, `deck:${slot}:${page}`) : <WorkQuadPrompt slot={slot} onPick={onPick} />}
      </div>
    ),
    [onPick, renderPage],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-work-quad-pane-host>
      <QuadDeck
        state={state}
        onState={onState}
        view={view}
        navSide={placement}
        player={block(primary, "c11")}
        notes={renderPage("notes", "deck:c12:notes")}
        resources={block(secondary, "c21")}
        mindmap={renderPage("mindmap", "deck:c22:mindmap")}
        resourcesFooter={nav}
        reveal={reveal}
      />
    </div>
  );
}
