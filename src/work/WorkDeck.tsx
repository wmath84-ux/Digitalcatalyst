// src/work/WorkDeck.tsx
//
// Work mode's page-placement policy on top of the Course Player's real
// `SplitDeck`.
//
// Owner brief (2026-10-14):
//
//   "default last opened page dikhega badhiya sa full screen mein footer
//    navigation ke sath … divider by default hamesha top per hoga … user upar
//    se divider line ko khinchkar kahin bhi adjust kar sakta hai … agar already
//    do pages split mode mein open hain to agar koi teesra page open kiya jata
//    hai to vah niche wale area mein split mode mein open hoga matlab secondary
//    area jo already opened hai usko replace kar dega."
//
// Reading this literally gives one useful invariant:
//
//   · SplitDeck's study pane is the SECOND / bottom flex child and its ratio is
//     its own percent (`splitMotion.ts`); `restRatio=100` → lesson/top = 0%,
//     study/bottom = 100%, so the first page is full-screen and the divider is
//     already at the top;
//   · dragging DOWN makes the top/primary slot larger; when the first real drag
//     starts, it takes the page that was open just before the current one (if
//     any) from the on-device Work history;
//   · the footer always replaces the SECONDARY / bottom slot. At rest that is
//     the entire screen; while split it is only the bottom region. Thus a third
//     navigation tap replaces the old secondary page and never disturbs the
//     primary one.
//
// Geometry, pointer capture, keyboard access, the swap button, split ratios,
// spring/snap physics and the desktop-only 3rd/4th pane controls all belong to
// `src/course/studyPanels.tsx`. Work only supplies the policy props; the shared
// deck's defaults leave the Course Player untouched.

import { useCallback, useState, type ReactNode } from "react";
import { ArrowDown, PanelsTopLeft } from "lucide-react";
import SplitDeck from "../course/studyPanels";
import { getWorkHistory } from "./storage/workPrefs";
import {
  WORK_PAGES,
  isWorkPageId,
  workPageRecord,
  type WorkPageId,
} from "./workPages";

export interface WorkDeckProps {
  /** The page on the screen / in the bottom (secondary) slot. */
  page: WorkPageId;
  /** Viewport axis from WorkApp; it updates live on rotation / resize. */
  axis: "row" | "column";
  /** Renders one of the six existing page surfaces (no chrome around it). */
  renderPage: (page: WorkPageId, slotKey: string) => ReactNode;
}

function WorkSplitPrompt({ onOpen }: { onOpen: (page: WorkPageId) => void }) {
  return (
    <div
      className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto px-5 py-7 text-center"
      data-work-split-prompt=""
    >
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border-color)] bg-[var(--active-bg)] text-[var(--accent-color)]">
        <PanelsTopLeft size={21} aria-hidden="true" />
      </span>
      <h2 className="text-base font-bold tracking-tight text-[var(--text-primary)]">Your other page</h2>
      <p className="mt-1 max-w-[250px] text-xs leading-relaxed text-[var(--text-secondary)]">
        Choose a page for the space above the divider. The page below stays open.
      </p>
      <div className="mt-4 flex max-w-[360px] flex-wrap justify-center gap-2">
        {WORK_PAGES.map((record) => {
          const Icon = record.icon;
          return (
            <button
              key={record.id}
              type="button"
              onClick={() => onOpen(record.id)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
              aria-label={`Open ${record.label} in the lower page area`}
            >
              <Icon size={14} aria-hidden="true" />
              {record.label}
            </button>
          );
        })}
      </div>
      <span className="mt-4 inline-flex items-center gap-1 text-[10px] font-medium text-[var(--text-tertiary)]">
        <ArrowDown size={12} aria-hidden="true" /> Drag the line to resize both pages
      </span>
    </div>
  );
}

export default function WorkDeck({ page, axis, renderPage }: WorkDeckProps) {
  const [primary, setPrimary] = useState<WorkPageId | null>(null);
  const activeRecord = workPageRecord(page);
  const ActiveIcon = activeRecord.icon;

  // The top / primary pane takes the page the learner was on just before this
  // one. No history means a quiet page picker, not an empty black rectangle.
  const showPreviousPage = useCallback(() => {
    setPrimary((current) => {
      if (current) return current;
      const history = getWorkHistory();
      const previous = history.find((entry) => entry !== page);
      return previous ?? null;
    });
  }, [page]);

  const renderExtraPane = useCallback(
    (_region: "lesson" | "study", tab: string, _setTab: (tab: string) => void) => {
      const extraPage = isWorkPageId(tab) ? tab : "notes";
      return (
        <div className="h-full min-h-0 min-w-0 overflow-hidden" data-work-extra-page={extraPage}>
          {renderPage(extraPage, `extra:${extraPage}`)}
        </div>
      );
    },
    [renderPage],
  );

  const extraPaneTab = useCallback(
    (used: string[]) => {
      const onScreen = new Set<string>([...used, page, ...(primary ? [primary] : [])]);
      return WORK_PAGES.find((record) => !onScreen.has(record.id))?.id ?? "notes";
    },
    [page, primary],
  );

  const lesson = primary ? (
    <div className="h-full min-h-0 min-w-0 overflow-hidden" data-work-primary-page={primary}>
      {renderPage(primary, `primary:${primary}`)}
    </div>
  ) : (
    <WorkSplitPrompt onOpen={setPrimary} />
  );
  const study = (
    <div className="h-full min-h-0 min-w-0 overflow-hidden" data-work-secondary-page={page}>
      {renderPage(page, `secondary:${page}`)}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-work-deck-host="">
      <SplitDeck
        axis={axis}
        orientation={axis === "row" ? "landscape" : "portrait"}
        courseId="work"
        accent={activeRecord.color}
        studyIcon={ActiveIcon}
        lesson={lesson}
        study={study}
        solid
        restRatio={100}
        fullRange
        railAtEdge={false}
        grabInset={26}
        keyboardExpandEnabled={activeRecord.writing === true}
        onSplitStart={showPreviousPage}
        renderExtraPane={renderExtraPane}
        extraPaneTab={extraPaneTab}
      />
    </div>
  );
}
