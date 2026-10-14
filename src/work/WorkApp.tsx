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
import WorkDeck from "./WorkDeck";
import WorkFooterNav, { workNavCells } from "./WorkFooterNav";
import { useWorkTheme, getWorkLastPage, pushWorkHistory, setWorkLastPage, setWorkTheme } from "./storage/workPrefs";
import { isWorkPageId, workHashFor, workPageFromHash, workPageRecord, type WorkPageId } from "./workPages";
import WorkPageSurface from "./pages/WorkPageSurface";
import "./work-theme.css";
import "./work-shell.css";

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
        myDay={id === "myday" ? {
          controller: myDay,
          view: myDayView,
          selectedItemId: myDayItemId,
          editing: myDayEditing,
          showEditorFooter: page === "myday" && slotKey === "secondary:myday",
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
      orientation, page, theme, toggleTheme,
    ],
  );

  const footerCells = workNavCells();

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
          role="application"
          aria-label="Work mode workspace"
        >
          <WorkDeck page={page} axis={orientation} renderPage={renderPage} />

          {page === "myday" && myDayView === "editor" ? null : (
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

          <span className="sr-only" aria-live="polite" role="status">{pageRecord.heading}</span>
        </div>
      </CourseKeyboardProvider>
    </MotionConfig>
  );
}
