// src/classroom3d/Classroom3DPreview.tsx
//
// Stand-alone sandbox for the 3D Classroom, at `#/dev/classroom-3d`.
// No auth, no Firestore, no course ownership: it feeds the room the demo
// course content and local-only notes / mind map state, so the whole seated
// experience can be reviewed on any device.
//
// In production the SAME <Classroom3D> is mounted by CoursePlayerApp with the
// real course, the real viewer stack and the Firestore-backed panels — see
// the `classroom3d` branch there. This file only supplies stand-ins.

import { useCallback, useMemo, useState } from "react";
import { demoCourseContent } from "../data/demoCourseContent";
import type { CourseFile, CoursePlayerNote } from "../types/course";
import ResourceViewer from "../course/ResourceViewer";
import NotesPanel from "../course/NotesPanel";
import MindMapPanel from "../course/MindMapPanel";
import type { MindMapSummary } from "../course/useCourseMindMap";
import { addChildNode, countNodes, createMindMap, rootId, type MindMap } from "../../utils/mindMapTree";
import Classroom3D from "./Classroom3D";
import { flattenModules } from "./state";

const demoMind = (): MindMap => {
  let mind = createMindMap("This module", "Room map");
  for (const branch of ["Key idea", "Formula", "Doubt to revise"]) {
    mind = addChildNode(mind, rootId(), branch).mind;
  }
  return mind;
};

export default function Classroom3DPreview() {
  const flat = useMemo(
    () => flattenModules(demoCourseContent).filter((module) => module.files.length > 0),
    [],
  );
  const [file, setFile] = useState<CourseFile | null>(() => flat[0]?.files[0] ?? null);
  const [notes, setNotes] = useState<CoursePlayerNote[]>([]);
  const [mind, setMind] = useState<MindMap>(demoMind);
  const [composerSignal, setComposerSignal] = useState(0);
  const [done, setDone] = useState<Set<string>>(() => new Set());

  const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const addNote = useCallback((html: string) => {
    setNotes((current) => [
      { id: `n${Date.now()}`, text: plain(html), html, createdAt: Date.now(), links: [] },
      ...current,
    ]);
  }, []);
  const editNote = useCallback((id: string, html: string) => {
    setNotes((current) =>
      current.map((note) =>
        note.id === id ? { ...note, html, text: plain(html), updatedAt: Date.now() } : note,
      ),
    );
  }, []);
  const deleteNote = useCallback((id: string) => {
    setNotes((current) => current.filter((note) => note.id !== id));
  }, []);

  const maps = useMemo<MindMapSummary[]>(
    () => [
      {
        mapKey: "main",
        title: mind.title || "Room map",
        rootTopic: mind.rootTopic,
        nodeCount: countNodes(mind),
        updatedAt: Date.now(),
        createdAt: Date.now(),
      },
    ],
    [mind],
  );

  const total = useMemo(() => flat.reduce((sum, module) => sum + module.files.length, 0), [flat]);

  return (
    <Classroom3D
      modules={demoCourseContent}
      courseTitle="Demo course · 3D Classroom"
      selectedFileId={file?.id ?? null}
      onSelectFile={setFile}
      board={<ResourceViewer file={file} active desktopView />}
      notes={
        <NotesPanel
          notes={notes}
          onAdd={addNote}
          onEdit={editNote}
          onDelete={deleteNote}
          composerOpenSignal={composerSignal}
        />
      }
      mind={
        <MindMapPanel
          mind={mind}
          onMindChange={(updater) =>
            setMind((current) => (typeof updater === "function" ? updater(current) : updater))
          }
          status="saved"
          playerTheme="dark"
          open
          maps={maps}
          activeMapKey="main"
        />
      }
      progress={total ? Math.round((done.size / total) * 100) : 0}
      isDone={Boolean(file && done.has(file.id))}
      canMarkComplete={Boolean(file)}
      onToggleComplete={() =>
        setDone((current) => {
          if (!file) return current;
          const next = new Set(current);
          if (next.has(file.id)) next.delete(file.id);
          else next.add(file.id);
          return next;
        })
      }
      noteCount={notes.length}
      mapCount={maps.length}
      onComposeNote={() => setComposerSignal((value) => value + 1)}
      onExit={() => {
        window.location.hash = "#/home";
      }}
      exitLabel="Leave room"
    />
  );
}
