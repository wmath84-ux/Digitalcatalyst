// src/work/WorkApp.tsx
//
// WORK MODE — a device-first, immersive workbench. This is the host for every
// Work surface: My Day, Notes, Mind map, Sketch, AI and Revision share one
// remembered-page split deck and one footer navigation.
//
// Owner brief (2026-10-14):
//
//   "Work per click karne per ek naya environment open hoga jahan per apna
//    course player ka mind map hai aur notes hai aur sketch hai aur ai hai,
//    my day hai aur revision hai … sab kuchh ek jagah hoga."
//   "Feature pura storage based hoga, sab storage mein save hoga, kuchh bhi
//    cloud per nahin."
//   "Light aur dark theme rakhna donon."
//   "Mind map editor, note editor, sketch editor aur deck ya brain card page per
//    home page header nahin dikhna chahie."
//
// The split/navigation contracts stay in WorkDeck. Work now mounts the real
// device-only Notes, Mind Map, Sketch, AI, My Day and Revision surfaces; Work
// Revision uses its own local Dexie KV namespace and never cloud-syncs.

import { useCallback, useEffect, useRef, useState } from "react";
import { MotionConfig } from "framer-motion";
import { CourseKeyboardProvider } from "../course/useCourseKeyboard";
import useWorkMyDay from "./storage/useWorkMyDay";
import type { WorkMyDayKind } from "./storage/workMyDay";
import useCourseNotes from "../course/useCourseNotes";
import { WORK_DEVICE_UID, WORK_PRODUCT_ID } from "./workIdentity";
import { X } from "lucide-react";
import WorkDeck from "./WorkDeck";
import WorkFooterNav, { workNavCells } from "./WorkFooterNav";
import WorkQuadDeck, { WORK_CONTENT_PAGES, type WorkQuadSlot } from "./WorkQuadDeck";
import WorkQuadHeader from "./WorkQuadHeader";
import { HeaderNavView, type CourseNavItem } from "../course/CourseHeaderNav";
import CourseViewPanel from "../course/CourseViewPanel";
import { loadQuadLayout, saveQuadLayout, useQuadDeckEnabled, type QuadLayoutState, type QuadPaneId } from "../course/quadLayout";
import { useCourseViewSettings } from "../course/courseViewSettings";
import { useFooterNavigationPlacement } from "../utils/footerNavigationPlacement";
import { useWorkTheme, getWorkHistory, getWorkLastPage, pushWorkHistory, setWorkLastPage, setWorkTheme } from "./storage/workPrefs";
import { WORK_PAGES, isWorkPageId, workHashFor, workPageFromHash, workPageRecord, type WorkPageId } from "./workPages";
import WorkPageSurface from "./pages/WorkPageSurface";
import "./work-theme.css";
import "./work-shell.css";
import "./work-quad.css";

const HOME_HASH = "#/home";

function readOrientation(): "row" | "column" {
  return typeof window !== "undefined" && window.innerWidth > window.innerHeight ? "row" : "column";
}

export default function WorkApp() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const theme = useWorkTheme();
  const notes = useCourseNotes({ uid: WORK_DEVICE_UID, productId: WORK_PRODUCT_ID, storageOnly: true });
  const myDay = useWorkMyDay();
  const [myDayView, setMyDayView] = useState<"library" | "editor">("library");
  const [myDayItemId, setMyDayItemId] = useState<string | null>(null);
  const [myDayEditing, setMyDayEditing] = useState(false);
  // Per-slot editor/viewer state reported by WorkPageSurface (Notes editor,
  // Mind Map canvas, Sketch editor, Revision card viewers). Any visible
  // immersive slot hides the shared Work footer; returning every slot to a
  // library/page state restores it. This is Work-local state only — Work
  // never publishes into the Course Player's panel session.
  const [immersiveSlots, setImmersiveSlots] = useState<Record<string, boolean>>({});
  const reportImmersive = useCallback((slotKey: string, immersive: boolean) => {
    setImmersiveSlots((previous) => (previous[slotKey] === immersive ? previous : { ...previous, [slotKey]: immersive }));
  }, []);
  const anyImmersive = Object.values(immersiveSlots).some(Boolean);

  // ── The plus deck (tablet/desktop, 768px up) ─────────────────────────────
  // The owner (2026-10-16): "Work mode mein bhi same split-screen behaviour,
  // same footer-navigation behaviour aur naye notes / mind map / sketch ke
  // design." So Work mounts the Course Player's OWN deck and the SAME
  // placeable navigation; only the pages inside the blocks are Work's.
  // Below 768px every one of these lines is inert and today's deck runs.
  const quadWide = useQuadDeckEnabled();
  const courseView = useCourseViewSettings();
  const navPlacement = useFooterNavigationPlacement();
  const [quadState, setQuadState] = useState<QuadLayoutState>(() => loadQuadLayout("work"));
  const [quadReveal, setQuadReveal] = useState<{ pane: QuadPaneId; count: number } | null>(null);
  // The two CONTENT blocks: c11 (main) and c21 (the one under it). Notes and
  // the Mind map own the right-hand blocks, exactly as in the Course Player.
  const [quadPrimary, setQuadPrimary] = useState<WorkPageId | null>(null);
  const [quadSecondary, setQuadSecondary] = useState<WorkPageId | null>(null);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const commitQuadState = useCallback((next: QuadLayoutState) => {
    setQuadState(next);
    saveQuadLayout("work", next);
  }, []);
  const revealQuadPane = useCallback((pane: QuadPaneId) => {
    setQuadReveal((current) => ({ pane, count: (current?.count ?? 0) + 1 }));
  }, []);
  const [hash, setHash] = useState(() => typeof window === "undefined" ? "#/work" : window.location.hash);
  const [orientation, setOrientation] = useState(readOrientation);
  const routePage = workPageFromHash(hash);
  const [page, setPage] = useState<WorkPageId>(() => routePage ?? getWorkLastPage());
  const pageRecord = workPageRecord(page);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (routePage) {
      setPage(routePage);
      setWorkLastPage(routePage);
      // A deep link (`#/work/sketch`) puts that page in the main block too, so
      // the deck and the address bar never disagree.
      if (WORK_CONTENT_PAGES.includes(routePage)) setQuadPrimary(routePage);
      if (routePage === "myday") {
        const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
        const itemId = new URLSearchParams(query).get("item");
        if (itemId) {
          setMyDayItemId(itemId);
          setMyDayView("editor");
          setMyDayEditing(false);
        }
      }
    } else if (hash === "#/work" || hash === "#/work/") {
      setPage(getWorkLastPage());
    }
  }, [hash, routePage]);

  useEffect(() => {
    const update = () => setOrientation(readOrientation());
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // The first Work route opens the remembered page and seeds the same device
  // history the divider consults when the learner first pulls it down.
  useEffect(() => {
    if (page) {
      setWorkLastPage(page);
      pushWorkHistory(page);
    }
    // The hash is intentionally excluded: navigation writes history in
    // `openPage` below, and a deep-link should only be recorded once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The blocks start useful, never empty: the page on screen takes c11 and the
  // page the learner was on before it takes c21 — the same "previous page
  // fills the other block" rule the phone deck has always followed.
  useEffect(() => {
    const content = (value: WorkPageId | string | null | undefined): WorkPageId | null =>
      value && isWorkPageId(value) && WORK_CONTENT_PAGES.includes(value) ? value : null;
    const history = getWorkHistory();
    const isContent = (value: WorkPageId) => WORK_CONTENT_PAGES.includes(value);
    const first = content(page) ?? content(history.find(isContent));
    const other = content(history.find((id) => id !== first && isContent(id)));
    setQuadPrimary((current) => current ?? first);
    setQuadSecondary((current) => current ?? other);
    // Seeded once per visit — afterwards the learner's own picks win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leaveWork = useCallback(() => { window.location.hash = HOME_HASH; }, []);
  const toggleTheme = useCallback(() => setWorkTheme(theme === "dark" ? "light" : "dark"), [theme]);

  const openPage = useCallback((next: WorkPageId) => {
    if (!isWorkPageId(next)) return;
    setPage(next);
    setWorkLastPage(next);
    pushWorkHistory(next);
    const target = workHashFor(next);
    if (window.location.hash !== target) window.location.hash = target;
  }, []);

  /**
   * The navigation in the deck. Notes and the Mind map keep their own blocks
   * (the Course Player's own rule: tapping those tabs brings the block back
   * and lets it glow), every other page borrows the main block.
   */
  const selectWorkPage = useCallback(
    (next: WorkPageId) => {
      if (next === "notes") {
        revealQuadPane("c12");
        return;
      }
      if (next === "mindmap") {
        revealQuadPane("c22");
        return;
      }
      setQuadPrimary(next);
      openPage(next);
    },
    [openPage, revealQuadPane],
  );

  const pickQuadPage = useCallback((slot: WorkQuadSlot, next: WorkPageId) => {
    if (slot === "c11") setQuadPrimary(next);
    else setQuadSecondary(next);
    pushWorkHistory(next);
  }, []);

  const openMyDayItem = useCallback((id: string) => {
    setMyDayItemId(id);
    setMyDayView("editor");
    setMyDayEditing(false);
  }, []);
  const createMyDayItem = useCallback(async (kind: WorkMyDayKind, notebookId?: string) => {
    const created = await myDay.createItem({ kind, ...(notebookId ? { notebookId } : {}) });
    setMyDayItemId(created.id);
    setMyDayView("editor");
    setMyDayEditing(false);
  }, [myDay.createItem]);
  const backFromMyDayEditor = useCallback(() => {
    setMyDayView("library");
    setMyDayItemId(null);
    setMyDayEditing(false);
  }, []);
  const deleteCurrentMyDayItem = useCallback(() => {
    if (myDayItemId) void myDay.removeItem(myDayItemId);
    backFromMyDayEditor();
  }, [backFromMyDayEditor, myDay.removeItem, myDayItemId]);

  const renderPage = useCallback(
    (id: WorkPageId, slotKey: string) => (
      <WorkPageSurface
        key={slotKey}
        page={id}
        slotKey={slotKey}
        theme={theme}
        orientation={orientation}
        notes={notes}
        onExit={leaveWork}
        onToggleTheme={toggleTheme}
        onImmersiveChange={reportImmersive}
        headless={quadWide}
        myDay={id === "myday" ? {
          controller: myDay,
          view: myDayView,
          selectedItemId: myDayItemId,
          editing: myDayEditing,
          // On a phone the editor keeps its own Back / Delete pill in the
          // bottom slot. In the deck the shell's own navigation stays up
          // instead, so the pill is not drawn twice.
          showEditorFooter: !quadWide && page === "myday" && slotKey === "secondary:myday",
          onOpenItem: openMyDayItem,
          onCreateItem: createMyDayItem,
          onBack: backFromMyDayEditor,
          onDelete: deleteCurrentMyDayItem,
          onEditingChange: setMyDayEditing,
        } : undefined}
      />
    ),
    [
      backFromMyDayEditor, createMyDayItem, deleteCurrentMyDayItem, leaveWork,
      myDay, myDayEditing, myDayItemId, myDayView, notes, openMyDayItem,
      orientation, page, quadWide, reportImmersive, theme, toggleTheme,
    ],
  );

  const footerCells = workNavCells();

  // ── The placeable navigation (the Course Player's own component) ─────────
  // Same cells, same icons + labels, same six-pixel-smaller boxes, same four
  // placements and the same free-space dropdown — only the destinations are
  // Work's own six pages. `navPlacement` is the ONE stored choice, so a
  // learner who put the navigation on the right in the course player finds it
  // on the right here too.
  const navItems: CourseNavItem[] = WORK_PAGES.map((record) => ({
    key: record.id,
    label: record.label,
    heading: record.heading,
    color: record.color,
    icon: record.icon,
  }));
  // The deck draws the navigation itself in the single-divider shape (the
  // owner's "right side = page, uske niche footer navigation"), so the shell
  // steps out of the way then.
  const quadNavInDeck = quadWide && quadState.format === "pair";
  const navInHeader = quadWide && navPlacement === "header" && !quadNavInDeck;
  const navRailLeft = quadWide && navPlacement === "left" && !quadNavInDeck;
  const navRailRight = quadWide && navPlacement === "right" && !quadNavInDeck;
  const navBottom = quadWide && navPlacement === "bottom" && !quadNavInDeck;
  const quadNavVisible = quadWide && !anyImmersive;
  const workNavNode = (
    <HeaderNavView
      items={navItems}
      activeKey={page}
      onSelect={(key) => {
        if (isWorkPageId(key)) selectWorkPage(key);
      }}
      placement={navPlacement}
      ariaLabel="Work mode pages"
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <CourseKeyboardProvider scopeRef={shellRef}>
        <div
          ref={shellRef}
          className="work-shell relative flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden"
          data-work-shell=""
          data-work-theme={theme}
          data-work-page={page}
          data-work-orientation={orientation}
          data-work-immersive={anyImmersive ? "true" : "false"}
          data-work-quad={quadWide ? "true" : "false"}
          {...(quadWide ? { "data-quad-nav-shrunk": "" } : {})}
          role="application"
          aria-label="Work mode workspace"
        >
          {quadWide ? (
            <>
              {/* One Work header line for the whole shell — exit, the page,
                  the navigation when it lives up here, the view settings and
                  the theme. The blocks themselves are headless, exactly like
                  the Course Player's four blocks. */}
              <WorkQuadHeader
                page={page}
                theme={theme}
                onExit={leaveWork}
                onToggleTheme={toggleTheme}
                {...(navInHeader && quadNavVisible ? { navSlot: workNavNode } : {})}
                viewSettingsOpen={viewSettingsOpen}
                onToggleViewSettings={() => setViewSettingsOpen((open) => !open)}
              />

              <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                {navRailLeft && quadNavVisible ? (
                  <div className="relative z-[70] flex w-[88px] shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--surface-bg)]" data-work-quad-nav-rail="left">
                    {workNavNode}
                  </div>
                ) : null}

                <WorkQuadDeck
                  primary={quadPrimary}
                  secondary={quadSecondary}
                  onPick={pickQuadPage}
                  renderPage={renderPage}
                  state={quadState}
                  onState={commitQuadState}
                  view={courseView}
                  placement={navPlacement}
                  nav={workNavNode}
                  reveal={quadReveal}
                  activePage={page}
                />

                {navRailRight && quadNavVisible ? (
                  <div className="relative z-[70] flex w-[88px] shrink-0 flex-col border-l border-[var(--border-color)] bg-[var(--surface-bg)]" data-work-quad-nav-rail="right">
                    {workNavNode}
                  </div>
                ) : null}
              </div>

              {navBottom && quadNavVisible ? (
                <div className="relative z-[70] shrink-0 border-t border-[var(--border-color)] bg-[var(--surface-bg)]" data-work-quad-nav-bottom>
                  {workNavNode}
                </div>
              ) : null}

              {viewSettingsOpen ? (
                <div className="absolute inset-0 z-[90] flex items-start justify-center bg-black/35 p-4" data-work-view-settings role="dialog" aria-modal="true" aria-label="Work view settings">
                  <div className="mt-10 w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--surface-bg)] shadow-2xl">
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] px-3 py-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">Work view</span>
                      <button
                        type="button"
                        data-work-view-close
                        aria-label="Close the Work view settings"
                        onClick={() => setViewSettingsOpen(false)}
                        className="grid h-7 w-7 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--text-secondary)]"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto pb-2">
                      <CourseViewPanel quadWide />
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <WorkDeck page={page} axis={orientation} renderPage={renderPage} />

              {(page === "myday" && myDayView === "editor") || anyImmersive ? null : (
                <WorkFooterNav
                  label="Work mode pages"
                  cells={footerCells}
                  activeId={page}
                  onSelect={(id) => {
                    if (isWorkPageId(id)) openPage(id);
                  }}
                  position="flow"
                  dataAttrs={{ "data-work-primary-navigation": "" }}
                />
              )}
            </>
          )}

          <span className="sr-only" aria-live="polite" role="status">{pageRecord.heading}</span>
        </div>
      </CourseKeyboardProvider>
    </MotionConfig>
  );
}
