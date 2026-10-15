// src/work/WorkRevisionTestPanel.tsx
//
// Work Revision's test switcher: a left side panel that opens over whatever
// Revision state is on screen — dashboard, library, a deck (FSRS) card or
// the Brain answer deck — and lists every already-created test (revision
// set) on this device. Tapping a test opens that test straight away (its
// study-style page), so a learner can jump between tests mid-study without
// backing out through the library. The panel is a pure overlay: opening and
// closing it never unmounts or resets the screen underneath, and every
// write keeps going through the same device-only Work Revision store.
//
// The Revision page itself stays a page (it opens from the library, as
// before) — this panel is the extra quick entry the owner asked for, not a
// replacement page squeezed into a drawer.

import { ChevronRight, Layers3, LayoutDashboard, LogOut, X } from "lucide-react";

export interface WorkRevisionTestRow {
  id: string;
  name: string;
  cards: number;
  due: number;
  active: boolean;
}

export interface WorkRevisionTestPanelProps {
  open: boolean;
  tests: WorkRevisionTestRow[];
  onClose: () => void;
  onGoDashboard: () => void;
  onGoLibrary: () => void;
  onOpenTest: (id: string) => void;
  /** Leaves Work entirely (the headless Revision page's way home). */
  onExit?: () => void;
}

const navButtonClass =
  "flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)]";

export default function WorkRevisionTestPanel({
  open,
  tests,
  onClose,
  onGoDashboard,
  onGoLibrary,
  onOpenTest,
  onExit,
}: WorkRevisionTestPanelProps) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40" data-work-revision-panel="">
      <button
        type="button"
        aria-label="Close test panel"
        data-work-revision-panel-backdrop=""
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/45"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Revision tests"
        data-work-revision-panel-aside=""
        className="work-revision-panel-aside absolute inset-y-0 left-0 flex w-[min(19rem,86%)] min-w-0 flex-col border-r border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--text-primary)] shadow-[var(--work-shadow-pop)]"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-color)] px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-extrabold">Revision tests</h2>
            <p className="truncate text-[11px] text-[var(--text-tertiary)]">On this device · tap a test to open it</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close test panel"
            data-work-revision-panel-close=""
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--text-secondary)] transition hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <nav className="shrink-0 space-y-1 border-b border-[var(--border-color)] px-2 py-2" aria-label="Revision pages">
          <button type="button" className={navButtonClass} data-work-revision-panel-nav="dashboard" onClick={onGoDashboard}>
            <LayoutDashboard size={16} aria-hidden="true" className="shrink-0 text-[var(--text-tertiary)]" />
            <span className="min-w-0 flex-1 truncate">Revision home</span>
          </button>
          <button type="button" className={navButtonClass} data-work-revision-panel-nav="library" onClick={onGoLibrary}>
            <Layers3 size={16} aria-hidden="true" className="shrink-0 text-[var(--text-tertiary)]" />
            <span className="min-w-0 flex-1 truncate">All tests · Library</span>
          </button>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <p className="px-2.5 pb-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Your tests</p>
          {tests.length ? (
            <ul className="space-y-1">
              {tests.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTest(row.id)}
                    aria-current={row.active ? "true" : undefined}
                    data-work-revision-panel-test={row.id}
                    data-work-revision-panel-test-active={row.active ? "true" : undefined}
                    className={`flex w-full min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)] ${
                      row.active
                        ? "border-[var(--accent-color)] bg-[var(--active-bg)]"
                        : "border-transparent hover:bg-[var(--hover-bg)]"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{row.name}</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--text-tertiary)]">
                        {row.cards} {row.cards === 1 ? "card" : "cards"} · {row.due} due
                      </span>
                    </span>
                    {row.active ? (
                      <span className="shrink-0 rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent-color)]">Current</span>
                    ) : (
                      <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-[var(--text-tertiary)]" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2.5 py-2 text-xs leading-relaxed text-[var(--text-tertiary)]">
              No tests yet. Open the library to create your first revision set — it will appear here for one-tap switching.
            </p>
          )}
        </div>

        {onExit ? (
          <div className="shrink-0 border-t border-[var(--border-color)] px-2 py-2">
            <button type="button" className={navButtonClass} data-work-revision-panel-exit="" onClick={onExit}>
              <LogOut size={16} aria-hidden="true" className="shrink-0 text-[var(--text-tertiary)]" />
              <span className="min-w-0 flex-1 truncate">Leave Work</span>
            </button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
