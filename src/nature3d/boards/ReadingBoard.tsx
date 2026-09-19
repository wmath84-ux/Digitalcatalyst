// src/nature3d/boards/ReadingBoard.tsx
//
// THE READING BOARD — the centre board of the lectern.
//
// This is the whole course-player reading flow, rendered onto a 30 m board:
//
//   1. the learner's PURCHASED courses (the library),
//   2. the modules inside the course they pick,
//   3. the resource they pick, played by the real `ResourceViewer`.
//
// The viewer is imported, not reimplemented. That is the point of the brief:
// "jaise course player ke andar page par jaisa sab kuchh functionality hai
// vaise hi yahan boards par honi chahiye". `ResourceViewer` already knows how
// to play a YouTube embed, scroll a PDF, open a Google Doc, show an image and
// stream audio, and it already persists playback positions — so every file
// type works here on day one, and keeps working when that component changes.
//
// It can be mounted at all because the board is a CSS3D DOM surface rather
// than a texture: an `<iframe>` needs to be in the document to load, and here
// it is. See `engine/boardScreens.ts` for why that decision was forced.

import { useMemo, useState } from "react";
import { ArrowLeft, BookOpen, FileText, Film, Folder, Headphones, Image as ImageIcon, Layers, Lock, Play } from "lucide-react";
import ResourceViewer from "../../course/ResourceViewer";
import type { CourseFile, CourseFileType, CourseModule } from "../../types/course";
import type { Product } from "../../data/products";

interface ReadingBoardProps {
  /** Only the courses this learner actually owns. */
  courses: Product[];
  loading: boolean;
  /** Signed out — the board says so instead of pretending the library is empty. */
  signedIn: boolean;
  /**
   * The course the learner has picked, LIFTED so the notes and mind-map
   * boards scope to it too. Nothing is auto-selected: until the learner
   * chooses, this is null and the side boards stay empty.
   */
  courseId: string | null;
  onSelectCourse: (id: string | null) => void;
  /** The module they drilled into, for the same reason. */
  moduleId: string | null;
  onSelectModule: (id: string | null) => void;
}

const TYPE_ICON: Partial<Record<CourseFileType, typeof FileText>> = {
  youtube: Film,
  video: Film,
  audio: Headphones,
  pdf: FileText,
  doc: FileText,
  sheet: Layers,
  slides: Layers,
  ebook: BookOpen,
  image: ImageIcon,
  mindmap: Layers,
  brain: Layers,
  embed: Play,
  google_form: FileText,
};

/** Flatten a module tree into the files it directly owns, plus its children. */
function moduleFiles(module: CourseModule): CourseFile[] {
  return module.files ?? [];
}

export default function ReadingBoard({
  courses, loading, signedIn, courseId, onSelectCourse, moduleId, onSelectModule,
}: ReadingBoardProps) {
  const [file, setFile] = useState<CourseFile | null>(null);
  const setCourseId = onSelectCourse;

  const course = useMemo(
    () => courses.find((c) => c.id === courseId) ?? null,
    [courses, courseId],
  );

  // ── Level 3: a resource is open ──────────────────────────────────────
  if (course && file) {
    return (
      <BoardFrame
        title={file.name}
        subtitle={moduleId ? `${course.title} · notes scoped to this module` : course.title}
        onBack={() => setFile(null)}
        backLabel="Modules"
      >
        {/* The real viewer. `desktopView` keeps it in its wide layout, which
            is what a 30 m board is. */}
        <ResourceViewer file={file} active desktopView />
      </BoardFrame>
    );
  }

  // ── Level 2: modules + resources of one course ───────────────────────
  if (course) {
    const modules = course.courseContent ?? [];
    return (
      <BoardFrame
        title={course.title}
        subtitle={`${modules.length} module${modules.length === 1 ? "" : "s"}`}
        onBack={() => {
          onSelectModule(null);
          setCourseId(null);
        }}
        backLabel="My courses"
      >
        {modules.length === 0 ? (
          <Empty icon={Folder} line="This course has no modules yet." />
        ) : (
          <div className="grid gap-5 p-8 lg:grid-cols-2 2xl:grid-cols-3">
            {modules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                onOpen={(f, ownerId) => {
                  // Scope the notes and mind-map boards to the module this
                  // resource came from, exactly as the player does.
                  onSelectModule(ownerId);
                  setFile(f);
                }}
              />
            ))}
          </div>
        )}
      </BoardFrame>
    );
  }

  // ── Level 1: the purchased-course library ────────────────────────────
  return (
    <BoardFrame title="My courses" subtitle="Pick a course, then a module">
      {!signedIn ? (
        <Empty icon={Lock} line="Sign in to see the courses you have purchased." />
      ) : loading ? (
        <Empty icon={Layers} line="Loading your library…" />
      ) : courses.length === 0 ? (
        <Empty icon={BookOpen} line="You have not purchased any courses yet." />
      ) : (
        <div className="grid gap-6 p-8 lg:grid-cols-3 2xl:grid-cols-4">
          {courses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCourseId(c.id)}
              className="group overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04] text-left transition hover:border-emerald-300/60 hover:bg-white/[0.09]"
            >
              <div className="aspect-video w-full overflow-hidden bg-slate-800">
                {c.image ? (
                  <img
                    src={c.image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : null}
              </div>
              <div className="p-5">
                <p className="text-[19px] font-black leading-tight text-white">{c.title}</p>
                <p className="mt-1.5 text-[15px] text-white/55">{c.instructor}</p>
                <p className="mt-3 text-[14px] font-bold text-emerald-300">
                  {(c.courseContent?.length ?? 0)} modules
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </BoardFrame>
  );
}

function ModuleCard({ module, onOpen }: { module: CourseModule; onOpen: (f: CourseFile, moduleId: string) => void }) {
  const files = moduleFiles(module);
  const children = module.modules ?? [];
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-5">
      <p className="flex items-center gap-2.5 text-[18px] font-black text-white">
        <Folder className="h-5 w-5 shrink-0 text-amber-300" />
        {module.title}
      </p>
      <div className="mt-4 space-y-2">
        {files.map((f) => {
          const Icon = TYPE_ICON[f.type] ?? FileText;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onOpen(f, module.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-left text-[15px] font-semibold text-white/85 transition hover:border-emerald-300/50 hover:bg-emerald-400/10 hover:text-white"
            >
              <Icon className="h-4.5 w-4.5 shrink-0 text-sky-300" />
              <span className="truncate">{f.name}</span>
            </button>
          );
        })}
        {children.map((child) => (
          <div key={child.id} className="ml-3 border-l border-white/10 pl-3">
            {/* `onOpen` is passed straight through, so a nested module reports
                its OWN id — notes scope to the module the file really lives
                in, not to its top-level ancestor. */}
            <ModuleCard module={child} onOpen={onOpen} />
          </div>
        ))}
        {files.length === 0 && children.length === 0 ? (
          <p className="px-1 py-2 text-[14px] text-white/40">Empty module</p>
        ) : null}
      </div>
    </div>
  );
}

/** Shared chrome: a title strip and a scrolling body. */
export function BoardFrame({
  title,
  subtitle,
  onBack,
  backLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col bg-[#070b12] text-white">
      <header className="flex shrink-0 items-center gap-4 border-b border-white/10 bg-white/[0.03] px-8 py-5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-[15px] font-bold text-white/90 transition hover:bg-white/20"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
            {backLabel ?? "Back"}
          </button>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-[24px] font-black leading-tight">{title}</h2>
          {subtitle ? <p className="truncate text-[15px] text-white/50">{subtitle}</p> : null}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function Empty({ icon: Icon, line }: { icon: typeof BookOpen; line: string }) {
  return (
    <div className="grid h-full place-items-center p-10 text-center">
      <div>
        <Icon className="mx-auto h-12 w-12 text-white/25" />
        <p className="mt-4 text-[17px] font-bold text-white/55">{line}</p>
      </div>
    </div>
  );
}
