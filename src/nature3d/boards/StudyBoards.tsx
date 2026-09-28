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
// from the same stores the player uses (`useCourseNotes`, `useCourseMindMap`),
// so a note written on the board is the same note the player shows — and both
// are FIRESTORE-backed:
//
//   notes     → users/{uid}/notes/{noteId}      (one document per note)
//   mind maps → users/{uid}/mindMaps/{mapId}    (one document per map)
//
// Before this, notes were written to localStorage only, so a note taken inside
// the Sanctuary never reached Firebase and never rendered anywhere else; and
// the mind-map board was UNSCOPED until the learner opened a resource (the
// module id was still null), which made `useCourseMindMap` refuse every write —
// the map looked editable and saved nothing. Both are fixed here.

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Layers } from "lucide-react";
import NotesPanel from "../../course/NotesPanel";
import useCourseMindMap from "../../course/useCourseMindMap";
import useCourseNotes from "../../course/useCourseNotes";
import { combineHtml } from "../../course/notesStore";
import type { CoursePlayerNote } from "../../types/course";
import type { Product } from "../../data/products";
import ReadingBoard, { BoardFrame } from "./ReadingBoard";

const MindMapPanel = lazy(() => import("../../course/MindMapPanel"));

export type BoardSlot = "mindmap" | "reading" | "notes";

/**
 * Mind-map scope for a course the learner has picked but not drilled into.
 *
 * `useCourseMindMap` needs BOTH a course and a module before it will read or
 * write a single document. On the reading board the module id only becomes
 * known when a RESOURCE is opened, so "pick a course → mind map board → draw"
 * used to be unscoped: the canvas accepted every branch and nothing was ever
 * saved to Firebase. This bucket gives the course-level map a real, stable
 * scope (`users/{uid}/mindMaps/{uid}__{productId}__course`); opening a resource
 * switches the board to that module's own maps, exactly like the player.
 */
export const SANCTUARY_COURSE_MAP_SCOPE = "course";

/** Save-state vocabulary shared by the notes and mind-map hooks. */
type BoardSaveStatus = "idle" | "loading" | "ready" | "saving" | "saved" | "error";

const clock = (ms: number | null) =>
  ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

/**
 * The board's subtitle says out loud whether the work reached Firebase — a
 * silent save is indistinguishable from a lost one, which is exactly how "save
 * nahi ho raha" went undiagnosed.
 */
export function boardSubtitle(
  title: string | undefined,
  status: BoardSaveStatus,
  errorMessage: string | null,
  lastSavedAt: number | null,
): string {
  const head = title ? `${title} · ` : "";
  if (status === "saving") return `${head}Firebase par save ho raha hai…`;
  if (status === "error") return `${head}${errorMessage || "Cloud save fail — device par safe hai, dobara try hoga"}`;
  if (status === "saved") {
    const at = clock(lastSavedAt);
    return `${head}Firebase par save ho gaya${at ? ` · ${at}` : ""}`;
  }
  if (status === "loading") return `${head}Loading…`;
  return title || "";
}

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
  /** Self-authored modules (sanctuary + Study Library), already adapted to Product. */
  myCourses?: Product[];
  /** Open a self-authored module in the dedicated Course Player. */
  onPlayMyCourse?: (productId: string) => void;
  /** Select this course id on the reading board (mine-… or purchased). */
  openCourseId?: string | null;
  onOpenCourseConsumed?: () => void;
  /** Highlight the created-by-you shelf. */
  focusMine?: boolean;
  loading: boolean;
  uid: string | null;
}

/**
 * Notes for one course — the SAME store the Course Player uses.
 *
 * `useCourseNotes` keeps one Firestore document per note under
 * `users/{uid}/notes/{noteId}`, read through a live listener, and mirrors every
 * change into localStorage. So a note written on this 3D board is saved to
 * Firebase, shows up on any other device without a refresh, survives an
 * offline session, and — because the merge uploads anything that exists only
 * on the device — every note written by the OLD localStorage-only build is
 * pushed to the cloud the first time the board (or the player) opens.
 */
function useBoardNotes(uid: string | null, productId: string | null) {
  const { notes, add, edit, remove, status, errorMessage, lastSavedAt } = useCourseNotes({
    uid,
    productId,
  });

  const onAdd = useCallback((html: string) => { add(html); }, [add]);
  const onEdit = useCallback((id: string, html: string) => { edit(id, html); }, [edit]);
  // Dropping a note also drops every wire pointing at it — the hook's
  // `removeNoteFromSet` pass does that, so the link layer never draws a line to
  // a card that is not there any more. The delete is committed immediately and
  // leaves a device tombstone, so a later snapshot cannot resurrect it.
  const onDelete = useCallback((id: string) => { remove(id); }, [remove]);

  return { notes, onAdd, onEdit, onDelete, status, errorMessage, lastSavedAt };
}

export default function BoardPortals({
  hosts, courses, myCourses = [], onPlayMyCourse, openCourseId, onOpenCourseConsumed, focusMine = false, loading, uid,
}: BoardPortalsProps) {
  // Every board tree always renders into the engine's 3D screen — the
  // learner looks at the board itself, and the engine's input bridge
  // (scene.ts) guarantees its taps land at any framing.
  const readingHost = hosts.reading;
  const notesHost = hosts.notes;
  const mindmapHost = hosts.mindmap;
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
    () => courses.find((c) => c.id === selectedCourseId) ?? myCourses.find((c) => c.id === selectedCourseId) ?? null,
    [courses, myCourses, selectedCourseId],
  );

  useEffect(() => {
    if (!openCourseId) return;
    setSelectedCourseId(openCourseId);
    setSelectedModuleId(null);
    onOpenCourseConsumed?.();
  }, [openCourseId, onOpenCourseConsumed]);

  // A course that disappears from the entitlement list (subscription lapsed,
  // refund) must not leave its notes on the board. A just-created sanctuary
  // module can land here a tick before `myCourses` catches up — don't
  // drop the selection in that window.
  useEffect(() => {
    if (selectedCourseId && !activeCourse) {
      // A just-created sanctuary module can land here a tick before the
      // library snapshot catches up — don't flash back to the empty shelf.
      if (selectedCourseId === openCourseId) return;
      if (selectedCourseId.startsWith("mine-")) return;
      setSelectedCourseId(null);
      setSelectedModuleId(null);
    }
  }, [selectedCourseId, activeCourse, openCourseId]);

  const productId = activeCourse?.id ?? null;
  const notes = useBoardNotes(uid, productId);

  // The mind map hook is the player's own, pointed at the same documents, so
  // maps made here appear in the player and vice versa. The module is the one
  // the learner drilled into — and until they do, the course's own bucket, so
  // the board is ALWAYS scoped and every branch really is written to Firestore.
  const boardModuleId = selectedModuleId ?? (productId ? SANCTUARY_COURSE_MAP_SCOPE : null);

  const mindMap = useCourseMindMap({
    uid: uid ?? undefined,
    // `undefined`, never `""`: an empty course id is not a scope, and passing
    // one used to build a shared `uid____module` document id.
    productId: productId ?? undefined,
    moduleId: boardModuleId ?? undefined,
    rootTopic: activeCourse?.title || "Study map",
  });

  const signedIn = Boolean(uid);

  const readingTree = useMemo(
    () => (
      <ReadingBoard
        courses={courses}
        myCourses={myCourses}
        onPlayMyCourse={onPlayMyCourse}
        focusMine={focusMine}
        loading={loading}
        signedIn={signedIn}
        courseId={selectedCourseId}
        onSelectCourse={setSelectedCourseId}
        moduleId={selectedModuleId}
        onSelectModule={setSelectedModuleId}
      />
    ),
    [courses, myCourses, onPlayMyCourse, focusMine, loading, signedIn, selectedCourseId, selectedModuleId],
  );

  return (
    <>
      {readingHost ? createPortal(readingTree, readingHost) : null}

      {notesHost
        ? createPortal(
            <BoardFrame
              title="Note taking"
              subtitle={boardSubtitle(activeCourse?.title, notes.status, notes.errorMessage, notes.lastSavedAt)}
            >
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
            notesHost,
          )
        : null}

      {mindmapHost
        ? createPortal(
            <BoardFrame
              title="Mind map"
              subtitle={boardSubtitle(
                activeCourse?.title,
                mindMap.status,
                mindMap.errorMessage,
                mindMap.lastSavedAt,
              )}
            >
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
            mindmapHost,
          )
        : null}
    </>
  );
}

export { combineHtml };
