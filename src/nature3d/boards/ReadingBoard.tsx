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
import { ArrowLeft, BookOpen, FileText, Film, Folder, Headphones, Image as ImageIcon, Layers, Lock, Play, Sparkles, Brain } from "lucide-react";
import ResourceViewer from "../../course/ResourceViewer";
import CourseBrainPanel from "../../course/CourseBrainPanel";
import { collectBrainPracticeSets } from "../../../utils/practiceSet.js";
import type { CourseFile, CourseFileType, CourseModule } from "../../types/course";
import type { Product } from "../../data/products";

interface ReadingBoardProps {
  /** Only the courses this learner actually owns. */
  courses: Product[];
  /**
   * Modules the learner built in the sanctuary (and My Study Library).
   * Shown first on the library so the tray's Module button lands on them.
   */
  myCourses?: Product[];
  /** Open a self-authored module in its dedicated Course Player. */
  onPlayMyCourse?: (productId: string) => void;
  /** When true, the "Created by you" shelf is the opening view. */
  focusMine?: boolean;
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
  brain: Brain,
  embed: Play,
  google_form: FileText,
};

/** Flatten a module tree into the files it directly owns, plus its children. */
function moduleFiles(module: CourseModule): CourseFile[] {
  return module.files ?? [];
}

export default function ReadingBoard({
  courses, myCourses = [], onPlayMyCourse, focusMine = false,
  loading, signedIn, courseId, onSelectCourse, moduleId, onSelectModule,
}: ReadingBoardProps) {
  const [file, setFile] = useState<CourseFile | null>(null);
  const setCourseId = onSelectCourse;

  const course = useMemo(
    () => courses.find((c) => c.id === courseId) ?? myCourses.find((c) => c.id === courseId) ?? null,
    [courses, myCourses, courseId],
  );
  const isMine = Boolean(course && myCourses.some((c) => c.id === course.id));

  // ── Level 3: a resource is open ──────────────────────────────────────
  // Brain resources are NOT played via ResourceViewer — they are practice sets
  // that need the Course Player's Brain panel (same as My Study Library's player).
  // Inside Sanctuary they must play ON THE BOARD, not via the external Course Player.
  const brainSets = useMemo(() => {
    if (!course) return [];
    const mods = course.courseContent ?? [];
    // Collect all module ids as unlocked (learner owns their own course)
    const allIds = new Set<string>();
    const collectIds = (nodes: any[]) => {
      for (const m of nodes || []) {
        allIds.add(String(m.id));
        if (Array.isArray(m.modules)) collectIds(m.modules);
      }
    };
    collectIds(mods as any);
    return collectBrainPracticeSets(mods as any, allIds);
  }, [course]);

  const activeBrainSet = useMemo(() => {
    if (!file || file.type !== "brain") return null;
    return brainSets.find((s: any) => s.id === file.id) || null;
  }, [file, brainSets]);

  if (course && file) {
    if (file.type === "brain" && activeBrainSet) {
      return (
        <BoardFrame
          title={file.name}
          subtitle={`${course.title} · Brain practice on board`}
          onBack={() => setFile(null)}
          backLabel="Modules"
        >
          <div className="h-full w-full overflow-auto p-2">
            <CourseBrainPanel
              productId={course.id}
              sets={brainSets as any}
              activeModuleId={moduleId}
              openSetId={file.id}
              onOpenedSet={() => {}}
              onComplete={() => {}}
            />
          </div>
        </BoardFrame>
      );
    }
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
        subtitle={isMine
          ? `${modules.length} module${modules.length === 1 ? "" : "s"} · created by you`
          : `${modules.length} module${modules.length === 1 ? "" : "s"}`}
        onBack={() => {
          onSelectModule(null);
          setCourseId(null);
        }}
        backLabel="My courses"
      >
        {isMine && onPlayMyCourse ? (
          <div className="flex justify-end px-8 pt-5">
            <button
              type="button"
              onClick={() => onPlayMyCourse(course.id)}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-500/25 px-4 py-2 text-[14px] font-black text-violet-100 ring-1 ring-violet-300/40 transition hover:bg-violet-500/40"
            >
              <Play className="h-4 w-4" /> Play on Board
            </button>
          </div>
        ) : null}
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

  // ── Level 1: created modules + purchased-course library ──────────────
  const mineFirst = focusMine || myCourses.length > 0;
  return (
    <BoardFrame
      title="My courses"
      subtitle={mineFirst ? "Your modules, then purchased courses" : "Pick a course, then a module"}
    >
      {!signedIn ? (
        <Empty icon={Lock} line="Sign in to see the courses you have purchased." />
      ) : loading && courses.length === 0 && myCourses.length === 0 ? (
        <Empty icon={Layers} line="Loading your library…" />
      ) : courses.length === 0 && myCourses.length === 0 ? (
        <Empty icon={BookOpen} line="Create a module from the tray, or purchase a course." />
      ) : (
        <div className="space-y-8 p-8">
          {myCourses.length > 0 ? (
            <section data-reading-mine-library>
              <p className="mb-3 flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.16em] text-violet-300">
                <Sparkles className="h-4 w-4" /> Created by you
              </p>
              <div className="grid gap-6 lg:grid-cols-3 2xl:grid-cols-4">
                {myCourses.map((c) => (
                  <article
                    key={c.id}
                    className="group overflow-hidden rounded-2xl border border-violet-300/25 bg-violet-500/[0.07] text-left transition hover:border-violet-300/60 hover:bg-violet-500/15"
                  >
                    <button type="button" onClick={() => setCourseId(c.id)} className="block w-full text-left">
                      <div className="aspect-video w-full overflow-hidden bg-slate-800">
                        {c.image ? (
                          <img
                            src={c.image}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="grid h-full place-items-center bg-gradient-to-br from-violet-700/40 to-indigo-900/40">
                            <Sparkles className="h-8 w-8 text-violet-200/70" />
                          </div>
                        )}
                      </div>
                      <div className="p-5">
                        <p className="text-[19px] font-black leading-tight text-white">{c.title}</p>
                        <p className="mt-1.5 text-[15px] text-white/55">Your module</p>
                        <p className="mt-3 text-[14px] font-bold text-violet-300">
                          {(c.courseContent?.length ?? 0)} modules
                        </p>
                      </div>
                    </button>
                    {onPlayMyCourse ? (
                      <div className="border-t border-white/10 px-5 py-3">
                        <button
                          type="button"
                          onClick={() => onPlayMyCourse(c.id)}
                          className="inline-flex items-center gap-2 text-[13px] font-black text-violet-100"
                        >
                          <Play className="h-3.5 w-3.5" /> Play on Board
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {courses.length > 0 ? (
            <section>
              {myCourses.length > 0 ? (
                <p className="mb-3 text-[13px] font-black uppercase tracking-[0.16em] text-emerald-300">
                  Purchased
                </p>
              ) : null}
              <div className="grid gap-6 lg:grid-cols-3 2xl:grid-cols-4">
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
            </section>
          ) : null}
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
    // `course-player-shell` is NOT decoration. Every course-player surface —
    // the rich-text toolbar, the note cards, the mind-map chrome — is styled
    // through CSS custom properties (--course-border, --course-text,
    // --course-surface, --dc-chrome-glass ...) that are declared ON THAT CLASS
    // and inherited by descendants. Rendered outside it those variables
    // resolve to nothing, so the toolbar lost its borders, plates and ink and
    // stopped looking (or behaving) like the real editor. StudyLibraryPage
    // wraps the viewer in the same class for exactly this reason.
    <div className="course-player-shell flex h-full w-full flex-col bg-[#070b12] text-white">
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
