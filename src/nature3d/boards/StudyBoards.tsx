// src/nature3d/boards/StudyBoards.tsx
//
// THE THREE BOARD SURFACES, AND THE BRIDGE THAT PUTS THEM IN THE 3D WORLD.
//
// `BoardPortals` renders each board's React tree into the DOM element the
// engine created for it (`engine/boardScreens.ts`), via `createPortal`. React
// keeps owning the tree — state, effects, context, everything — while the
// browser's 3D compositor decides where the pixels land. Neither side knows
// about the other, which is what keeps the engine framework-free.
//
// The three surfaces are the course player's own panels, unchanged:
//
//   • reading   → the purchased-course library and `ResourceViewer`
//   • notes     → `NotesPanel`, opening on the note library exactly as it does
//                 in the player
//   • mind map  → `MindMapPanel`, opening on the map library likewise
//
// Nothing about their design is altered — the brief is explicit that these
// must be the same pages, not lookalikes. They are given the data they need
// from the same stores the player uses (`notesStore`, `useCourseMindMap`), so
// a note written on the board is the same note the player shows.

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Layers } from "lucide-react";
import NotesPanel from "../../course/NotesPanel";
import useCourseMindMap from "../../course/useCourseMindMap";
import { combineHtml, loadLocalNotes, persistLocalNotes } from "../../course/notesStore";
import { richTextToPlain } from "../../utils/richText";
import type { CoursePlayerNote } from "../../types/course";
import type { Product } from "../../data/products";
import ReadingBoard, { BoardFrame } from "./ReadingBoard";

const MindMapPanel = lazy(() => import("../../course/MindMapPanel"));

export type BoardSlot = "mindmap" | "reading" | "notes";

/**
 * Frozen so the "no course picked" case passes the SAME array identity every
 * render. A fresh `[]` would change props every frame and make NotesPanel
 * rebuild its grid continuously — on a board that is composited in 3D, that
 * is a visible cost.
 */
const EMPTY_NOTES: CoursePlayerNote[] = [];

export interface BoardHosts {
  mindmap: HTMLElement | null;
  reading: HTMLElement | null;
  notes: HTMLElement | null;
}

interface BoardPortalsProps {
  hosts: BoardHosts;
  courses: Product[];
  loading: boolean;
  uid: string | null;
}

/**
 * Notes for one course, in the same localStorage records the player uses.
 *
 * This mirrors the player's own note plumbing (`CoursePlayerApp` lines around
 * the `notes` state) rather than inventing a second store, so a note taken at
 * the board is already there when the learner opens the course normally.
 */
function useBoardNotes(uid: string | null, productId: string | null) {
  const [notes, setNotes] = useState<CoursePlayerNote[]>([]);

  useEffect(() => {
    setNotes(uid && productId ? loadLocalNotes(uid, productId) : []);
  }, [uid, productId]);

  const commit = useCallback(
    (next: CoursePlayerNote[]) => {
      setNotes(next);
      if (uid && productId) persistLocalNotes(uid, productId, next);
    },
    [uid, productId],
  );

  const onAdd = useCallback(
    (html: string) => {
      const now = Date.now();
      commit([
        {
          id: `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
          text: richTextToPlain(html),
          html,
          createdAt: now,
          links: [],
        },
        ...notes,
      ]);
    },
    [commit, notes],
  );

  const onEdit = useCallback(
    (id: string, html: string) => {
      commit(
        notes.map((note) =>
          note.id === id ? { ...note, html, text: richTextToPlain(html), updatedAt: Date.now() } : note,
        ),
      );
    },
    [commit, notes],
  );

  const onDelete = useCallback(
    (id: string) => {
      // Dropping a note must also drop every wire pointing at it, or the
      // link layer draws a line to a card that is not there any more.
      commit(
        notes
          .filter((note) => note.id !== id)
          .map((note) => ({ ...note, links: (note.links ?? []).filter((l) => l !== id) })),
      );
    },
    [commit, notes],
  );

  return { notes, onAdd, onEdit, onDelete };
}

export default function BoardPortals({ hosts, courses, loading, uid }: BoardPortalsProps) {
  // ── NOTHING IS AUTO-SELECTED ─────────────────────────────────────────
  //
  // This used to be `activeCourse={ownedCourses[0]}` — the first course the
  // catalogue happened to return. That is why the note and mind-map boards
  // opened showing somebody's existing notes: the boards were silently
  // scoped to a course the learner never picked. The learner chooses the
  // course (and then the module) on the reading board, and until they do,
  // `selectedCourseId` is null and the side boards are genuinely empty —
  // just the "+" to create the first one.
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  const activeCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  // A course that disappears from the entitlement list (subscription lapsed,
  // refund) must not leave its notes on the board.
  useEffect(() => {
    if (selectedCourseId && !activeCourse) {
      setSelectedCourseId(null);
      setSelectedModuleId(null);
    }
  }, [selectedCourseId, activeCourse]);

  const productId = activeCourse?.id ?? null;
  const notes = useBoardNotes(uid, productId);

  // The mind map hook is the player's own, pointed at the same document, so
  // maps made here appear in the player and vice versa. `moduleId` is the
  // module the learner drilled into — the same scoping the player uses, so
  // the two show the same maps.
  const mindMap = useCourseMindMap({
    uid: uid ?? undefined,
    productId: productId ?? "",
    moduleId: selectedModuleId ?? undefined,
    rootTopic: activeCourse?.title || "Study map",
  });

  const signedIn = Boolean(uid);

  const readingTree = useMemo(
    () => (
      <ReadingBoard
        courses={courses}
        loading={loading}
        signedIn={signedIn}
        courseId={selectedCourseId}
        onSelectCourse={setSelectedCourseId}
        moduleId={selectedModuleId}
        onSelectModule={setSelectedModuleId}
      />
    ),
    [courses, loading, signedIn, selectedCourseId, selectedModuleId],
  );

  return (
    <>
      {hosts.reading ? createPortal(readingTree, hosts.reading) : null}

      {hosts.notes
        ? createPortal(
            <BoardFrame title="Note taking" subtitle={activeCourse?.title}>
              {/* The player's panel, untouched — same toolbar, same editor,
                  same library grid. With no course picked it is handed an
                  EMPTY list, so the board shows only the circular "+". */}
              <div className="h-full w-full">
                <NotesPanel
                  notes={activeCourse ? notes.notes : EMPTY_NOTES}
                  onAdd={notes.onAdd}
                  onEdit={notes.onEdit}
                  onDelete={notes.onDelete}
                />
              </div>
            </BoardFrame>,
            hosts.notes,
          )
        : null}

      {hosts.mindmap
        ? createPortal(
            <BoardFrame title="Mind map" subtitle={activeCourse?.title}>
              <Suspense
                fallback={
                  <div className="grid h-full place-items-center text-white/50">
                    <Layers className="h-10 w-10 animate-pulse" />
                  </div>
                }
              >
                {/* Again the player's own panel, opening on its map library. */}
                <div className="h-full w-full">
                  <MindMapPanel
                    mind={mindMap.mind}
                    onMindChange={mindMap.setMind}
                    status={mindMap.status}
                    errorMessage={mindMap.errorMessage}
                    onFlush={mindMap.flush}
                    maps={mindMap.maps}
                    activeMapKey={mindMap.activeMapKey}
                    onSelectMap={mindMap.selectMap}
                    onCreateMap={mindMap.createMap}
                    onRenameMap={mindMap.renameMap}
                    onDeleteMap={mindMap.deleteMap}
                    mapsLoading={mindMap.mapsLoading}
                    atMapLimit={mindMap.atMapLimit}
                    landscape
                    open
                  />
                </div>
              </Suspense>
            </BoardFrame>,
            hosts.mindmap,
          )
        : null}
    </>
  );
}

export { combineHtml };
