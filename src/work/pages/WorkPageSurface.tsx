// Work's page-local chrome plus device-only Work feature surfaces, including
// the Phase 4 Revision dashboard and local review library.

import { Suspense, lazy, useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, Moon, Sun } from "lucide-react";
import type { UseCourseNotesResult } from "../../course/useCourseNotes";
import { WORK_DEVICE_UID } from "../workIdentity";
import type { WorkTheme } from "../storage/workPrefs";
import type { WorkMyDayPageProps } from "../myday/WorkMyDayPage";
import { workPageRecord, type WorkPageId } from "../workPages";

const NotesPanel = lazy(() => import("../../course/NotesPanel"));
const WorkMindMapSurface = lazy(() => import("./WorkMindMapSurface"));
const WorkSketchSurface = lazy(() => import("./WorkSketchSurface"));
const WorkAiSurface = lazy(() => import("./WorkAiSurface"));
const WorkMyDayPage = lazy(() => import("../myday/WorkMyDayPage"));
const WorkRevisionApp = lazy(() => import("../WorkRevisionApp"));

interface WorkPageSurfaceProps {
  page: WorkPageId;
  slotKey: string;
  theme: WorkTheme;
  orientation: "row" | "column";
  notes: UseCourseNotesResult;
  onExit: () => void;
  onToggleTheme: () => void;
  /**
   * Work-shell immersive signal for THIS split slot: true while this slot is
   * showing a headless surface (Note editor, Mind Map canvas, Sketch editor,
   * or the Revision page, which is headless as a whole page). WorkApp
   * aggregates every slot and hides only the shared Work footer; the state
   * is Work-local and never published to the Course Player session.
   */
  onImmersiveChange?: (slotKey: string, immersive: boolean) => void;
  myDay?: Omit<WorkMyDayPageProps, "slotKey" | "theme" | "orientation" | "onExit" | "onToggleTheme">;
  /**
   * The plus deck (768px up) draws ONE Work header line for the whole shell, so
   * every block's page renders without its own 12-height header — the same way
   * the Course Player's four blocks carry no per-block header. Below 768px this
   * stays false and today's page header is untouched.
   */
  headless?: boolean;
}

/**
 * The page's own icon-plate wash — one row per Work page. Exported because the
 * shell's single header line (768px up) shows the current page with the same
 * plate every page header uses.
 */
export const WORK_ACCENT_WASH: Record<WorkPageId, string> = {
  myday: "rgba(6,214,160,.14)",
  notes: "rgba(58,134,255,.14)",
  mindmap: "rgba(179,136,255,.18)",
  sketch: "rgba(249,115,22,.14)",
  ai: "rgba(34,211,238,.15)",
  revision: "rgba(52,211,153,.14)",
};

function WorkPageLoading({ page }: { page: WorkPageId }) {
  const record = workPageRecord(page);
  return (
    <div className="flex h-full min-h-0 items-center justify-center gap-2 text-xs font-semibold text-[var(--text-secondary)]" role="status" aria-live="polite" data-work-page-loading={page}>
      <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Opening {record.heading} on this device…
    </div>
  );
}

export default function WorkPageSurface({ page, slotKey, theme, orientation, notes, onExit, onToggleTheme, onImmersiveChange, myDay, headless = false }: WorkPageSurfaceProps) {
  // ── Headless editor/viewer state (Work-local) ──────────────────────────
  // Each reused Course surface reports its own editor boundary; Work only
  // mirrors it into shell chrome. Library/page states keep the Work header,
  // editor/viewer states drop it so the surface gets the full slot, exactly
  // like the Course Player's updated headless pages.
  const [notesEditorOpen, setNotesEditorOpen] = useState(false);
  const [mindMapEditorOpen, setMindMapEditorOpen] = useState(false);
  // The Revision page is headless as a page (like the Sketch page): every
  // Revision view carries its own chrome, so the outer Work header never
  // sits over it and the shared Work footer stays hidden while the page is
  // up. Leaving the page for another Work page restores both.
  const immersive =
    page === "sketch" ||
    page === "revision" ||
    (page === "notes" && notesEditorOpen) ||
    (page === "mindmap" && mindMapEditorOpen);
  // The AI page carries no Work header at all (owner brief): the chat
  // surface gets the full slot. It is NOT immersive — the shared Work
  // footer stays up so pages can still be switched, and the theme keeps
  // flowing to the surface (and to every other page's theme toggle)
  // exactly as before.
  const showHeader = !headless && !immersive && page !== "ai";
  useEffect(() => {
    onImmersiveChange?.(slotKey, immersive);
  }, [immersive, onImmersiveChange, slotKey]);
  useEffect(() => () => {
    onImmersiveChange?.(slotKey, false);
  }, [onImmersiveChange, slotKey]);

  if (page === "myday") {
    return myDay ? (
      <Suspense fallback={<WorkPageLoading page="myday" />}>
        <WorkMyDayPage
          {...myDay}
          slotKey={slotKey}
          theme={theme}
          orientation={orientation}
          onExit={onExit}
          onToggleTheme={onToggleTheme}
        />
      </Suspense>
    ) : null;
  }
  const record = workPageRecord(page);
  const PageIcon = record.icon;
  const dark = theme === "dark";

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--workspace-bg)] text-[var(--text-primary)]"
      data-work-page-surface={page}
      data-work-slot={slotKey}
      data-work-surface-theme={theme}
      data-work-immersive={immersive ? "true" : "false"}
      data-work-headless={immersive ? "true" : undefined}
    >
      {showHeader ? (
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-color)] bg-[var(--surface-bg)] px-2 sm:px-3" data-work-header-area={page}>
        <button
          type="button"
          onClick={onExit}
          aria-label="Leave Work mode and open Home"
          title="Home"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--text-secondary)] transition hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
          data-work-exit=""
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ color: record.color, background: WORK_ACCENT_WASH[page] }} aria-hidden="true">
          <PageIcon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13px] font-bold leading-tight text-[var(--text-primary)]">{record.heading}</h1>
          <p className="truncate text-[10px] leading-tight text-[var(--text-tertiary)]">Private · this device</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1 rounded-full border border-[var(--border-color)] px-2 py-1 text-[9px] font-semibold text-[var(--text-tertiary)] md:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" /> Local only
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${dark ? "light" : "dark"} Work theme`}
          aria-pressed={dark}
          title={`${dark ? "Light" : "Dark"} theme`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--text-secondary)] transition hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
          data-work-theme-toggle=""
        >
          {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
        </button>
      </header>
      ) : null}

      {page === "notes" ? (
        <div className="min-h-0 min-w-0 flex-1" data-work-page-body="notes">
          <Suspense fallback={<WorkPageLoading page={page} />}>
            <NotesPanel
              notes={notes.notes}
              masterNotes={[]}
              onAdd={notes.add}
              onEdit={notes.edit}
              onDelete={notes.remove}
              courseTitle="Work"
              modules={[]}
              personalModules={[]}
              onRetrySync={notes.reload}
              syncState={{ status: notes.status, synced: notes.synced, errorMessage: notes.errorMessage }}
              uid={WORK_DEVICE_UID}
              storageOnly
              themeOverride={theme}
              onEditorOpenChange={setNotesEditorOpen}
            />
          </Suspense>
        </div>
      ) : page === "mindmap" ? (
        <div className="min-h-0 min-w-0 flex-1" data-work-page-body="mindmap">
          <Suspense fallback={<WorkPageLoading page={page} />}>
            <WorkMindMapSurface theme={theme} orientation={orientation} onEditorOpenChange={setMindMapEditorOpen} />
          </Suspense>
        </div>
      ) : page === "sketch" ? (
        <div className="min-h-0 min-w-0 flex-1" data-work-page-body="sketch">
          <Suspense fallback={<WorkPageLoading page={page} />}>
            <WorkSketchSurface theme={theme} />
          </Suspense>
        </div>
      ) : page === "ai" ? (
        <div className="min-h-0 min-w-0 flex-1" data-work-page-body="ai">
          <Suspense fallback={<WorkPageLoading page={page} />}>
            <WorkAiSurface theme={theme} notes={notes.notes} />
          </Suspense>
        </div>
      ) : (
        <div className="min-h-0 min-w-0 flex-1" data-work-page-body="revision">
          <Suspense fallback={<WorkPageLoading page={page} />}>
            <WorkRevisionApp notes={notes.notes} onExit={onExit} />
          </Suspense>
        </div>
      )}
    </section>
  );
}
