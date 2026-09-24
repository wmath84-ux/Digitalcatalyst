// src/personal-library/MyCourseEditorPage.tsx
//
// The builder behind the Study Library's "+" button.
//
// This is where a learner authors a WHOLE course:
//
//   · cover image (upload from the device, or paste a URL)
//   · title + description
//   · modules — and modules INSIDE modules, so a folder can hold a topic
//   · resources per module: name, file type, a link or an uploaded file
//   · Brain practice sets (MCQs) — pasted in bulk or written by hand,
//     exactly like the admin's Practice Set panel
//
// The saved tree is what the Course Player opens (src/lib/myCourseAdapter.ts),
// so everything built here shows up as real modules, real lessons and real
// practice in the player — the learner's own course, their own design.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowDown, ArrowUp, BookOpen, Brain, Check, FileText, FolderPlus, Globe2,
  GraduationCap, Image as ImageIcon, Layers3, Link2, LoaderCircle, Music2, Network,
  Play, Plus, Presentation, Sheet, Trash2, Upload, Video, X,
} from "lucide-react";
import type { ComponentType } from "react";
import Header from "../components/Header";
import { toast } from "../components/ui/glass-toast";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { useMyCourses } from "../hooks/useMyCourses";
import {
  createMyCourse,
  createMyModule,
  createMyQuestion,
  createMyResource,
  countModules,
  countResources,
  uploadMyCourseCover,
  uploadMyCourseResourceFile,
} from "../lib/myCourseClient";
import {
  MY_COURSE_DESC_MAX, MY_COURSE_MAX_DEPTH, MY_COURSE_MAX_MODULES, MY_COURSE_MAX_RESOURCES,
  MY_COURSE_TITLE_MAX, MY_MODULE_DESC_MAX, MY_MODULE_TITLE_MAX, MY_RESOURCE_DESC_MAX,
  MY_RESOURCE_NAME_MAX,
  type MyCourse, type MyCourseModule, type MyCourseResource, type MyCourseResourceType,
} from "../types/myCourse";
import MyCourseBrainEditor, { IconButton, inputClass, labelClass, myQuestionIssues } from "./MyCourseBrainEditor";

type TypeOption = {
  id: MyCourseResourceType;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  /** The learner may upload a file instead of pasting a link. */
  upload?: boolean;
  /** A link is required (a Brain set is the one type whose content is inline). */
  needsUrl?: boolean;
  hint?: string;
};

const TYPE_OPTIONS: TypeOption[] = [
  { id: "youtube", label: "YouTube video", icon: Play, needsUrl: true, hint: "Paste any YouTube link" },
  { id: "video", label: "Video file", icon: Video, upload: true, hint: "Upload, or paste a direct video URL" },
  { id: "audio", label: "Audio", icon: Music2, upload: true, hint: "Upload, or paste a direct audio URL" },
  { id: "pdf", label: "PDF", icon: FileText, upload: true, hint: "Upload a PDF or paste its link" },
  { id: "doc", label: "Document (Google Doc)", icon: BookOpen, needsUrl: true, hint: "Google Docs link" },
  { id: "sheet", label: "Sheet", icon: Sheet, needsUrl: true, hint: "Google Sheets link" },
  { id: "slides", label: "Slides", icon: Presentation, needsUrl: true, hint: "Google Slides link" },
  { id: "image", label: "Image", icon: ImageIcon, upload: true, hint: "Upload an image or paste its URL" },
  { id: "google_form", label: "Google Form", icon: FileText, needsUrl: true, hint: "Forms link" },
  { id: "embed", label: "Website / embed", icon: Globe2, needsUrl: true, hint: "Any https page" },
  { id: "ebook", label: "E-book", icon: GraduationCap, upload: true, hint: "PDF / EPUB file or link" },
  { id: "mindmap", label: "Mind map (Whimsical)", icon: Network, needsUrl: true, hint: "Whimsical board link" },
  { id: "brain", label: "Brain · MCQ practice", icon: Brain, hint: "Write your own questions" },
];

const typeOption = (type: MyCourseResourceType): TypeOption =>
  TYPE_OPTIONS.find((option) => option.id === type) || TYPE_OPTIONS[0];

/* ── immutable tree helpers ──────────────────────────────────────────────── */

const updateNode = (
  modules: MyCourseModule[],
  id: string,
  patch: (module: MyCourseModule) => MyCourseModule,
): MyCourseModule[] =>
  modules.map((module) =>
    module.id === id
      ? patch(module)
      : { ...module, modules: updateNode(module.modules, id, patch) },
  );

const removeNode = (modules: MyCourseModule[], id: string): MyCourseModule[] =>
  modules
    .filter((module) => module.id !== id)
    .map((module) => ({ ...module, modules: removeNode(module.modules, id) }));

const moveNode = (modules: MyCourseModule[], id: string, delta: number): MyCourseModule[] => {
  const index = modules.findIndex((module) => module.id === id);
  if (index >= 0) {
    const destination = index + delta;
    if (destination < 0 || destination >= modules.length) return modules;
    const next = [...modules];
    const [moved] = next.splice(index, 1);
    next.splice(destination, 0, moved);
    return next;
  }
  return modules.map((module) => ({ ...module, modules: moveNode(module.modules, id, delta) }));
};

const addChildNode = (modules: MyCourseModule[], parentId: string | null, child: MyCourseModule): MyCourseModule[] => {
  if (parentId === null) return [...modules, child];
  return modules.map((module) =>
    module.id === parentId
      ? { ...module, modules: [...module.modules, child] }
      : { ...module, modules: addChildNode(module.modules, parentId, child) },
  );
};

const depthOf = (modules: MyCourseModule[], id: string, depth = 1): number => {
  for (const module of modules) {
    if (module.id === id) return depth;
    const nested = depthOf(module.modules, id, depth + 1);
    if (nested) return nested;
  }
  return 0;
};

/* ── page ────────────────────────────────────────────────────────────────── */

interface MyCourseEditorPageProps {
  /** `null` (or "new") opens a blank course; anything else edits that course. */
  courseId: string | null;
  onBack: () => void;
  onPlay: (courseId: string) => void;
}

export default function MyCourseEditorPage({ courseId, onBack, onPlay }: MyCourseEditorPageProps) {
  const { user } = useAuth();
  const myCourses = useMyCourses();
  const isNew = !courseId || courseId === "new";
  const existing = courseId && !isNew ? myCourses.getCourse(courseId) : null;
  const [draft, setDraft] = useState<MyCourse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const dirtyRef = useRef(false);

  // Seed the draft once the library (or the "new course" case) is ready.
  useEffect(() => {
    if (draft) return;
    if (isNew) {
      if (user?.id) setDraft({ ...createMyCourse(user.id), modules: [createMyModule("Module 1")] });
      return;
    }
    // A plain JSON clone (not structuredClone) so the editor also works on the
    // oldest WebKit this app targets — the draft is pure JSON by design.
    if (existing) setDraft(JSON.parse(JSON.stringify(existing)) as MyCourse);
  }, [draft, existing, isNew, user?.id]);

  const stats = useMemo(() => {
    const modules = draft?.modules || [];
    return { modules: countModules(modules), resources: countResources(modules) };
  }, [draft]);

  const patch = useCallback((next: Partial<MyCourse>) => {
    dirtyRef.current = true;
    setDraft((current) => (current ? { ...current, ...next, updatedAt: Date.now() } : current));
  }, []);

  const patchModules = useCallback((modules: MyCourseModule[]) => {
    dirtyRef.current = true;
    setDraft((current) => (current ? { ...current, modules, updatedAt: Date.now() } : current));
  }, []);

  const addModule = useCallback(
    (parentId: string | null) => {
      if (!draft) return;
      if (stats.modules >= MY_COURSE_MAX_MODULES) {
        toast({ title: "Module limit reached", description: `A course holds up to ${MY_COURSE_MAX_MODULES} modules.`, variant: "info" });
        return;
      }
      if (parentId && depthOf(draft.modules, parentId) >= MY_COURSE_MAX_DEPTH) {
        toast({ title: "Nesting limit reached", description: `Folders can nest ${MY_COURSE_MAX_DEPTH} levels deep.`, variant: "info" });
        return;
      }
      const count = countModules(draft.modules) + 1;
      patchModules(addChildNode(draft.modules, parentId, createMyModule(`Module ${count}`)));
    },
    [draft, patchModules, stats.modules],
  );

  const addResource = useCallback(
    (moduleId: string, type: MyCourseResourceType = "youtube") => {
      if (!draft) return;
      if (stats.resources >= MY_COURSE_MAX_RESOURCES) {
        toast({ title: "Resource limit reached", description: `A course holds up to ${MY_COURSE_MAX_RESOURCES} resources.`, variant: "info" });
        return;
      }
      patchModules(updateNode(draft.modules, moduleId, (module) => ({
        ...module,
        resources: [...module.resources, createMyResource(type)],
        updatedAt: Date.now(),
      })));
    },
    [draft, patchModules, stats.resources],
  );

  const updateModule = useCallback(
    (moduleId: string, next: (module: MyCourseModule) => MyCourseModule) => {
      if (!draft) return;
      patchModules(updateNode(draft.modules, moduleId, (module) => ({ ...next(module), updatedAt: Date.now() })));
    },
    [draft, patchModules],
  );

  const removeModule = useCallback(
    (moduleId: string) => {
      if (!draft) return;
      patchModules(removeNode(draft.modules, moduleId));
    },
    [draft, patchModules],
  );

  const moveModule = useCallback(
    (moduleId: string, delta: number) => {
      if (!draft) return;
      patchModules(moveNode(draft.modules, moduleId, delta));
    },
    [draft, patchModules],
  );

  const handleCoverFile = async (file: File) => {
    if (!draft || !user?.id) return;
    setCoverUploading(true);
    try {
      const url = await uploadMyCourseCover(user.id, draft.id, file);
      patch({ coverImage: url });
      toast({ title: "Cover added", variant: "success" });
    } catch (uploadError) {
      toast({
        title: "That image could not be uploaded",
        description: uploadError instanceof Error ? uploadError.message : undefined,
        variant: "error",
      });
    } finally {
      setCoverUploading(false);
    }
  };

  const save = async (options: { thenPlay?: boolean } = {}): Promise<boolean> => {
    if (!draft) return false;
    if (!draft.title.trim()) {
      setError("Give your course a title before saving.");
      return false;
    }
    setBusy(true);
    setError(null);
    const result = await myCourses.save(draft);
    setBusy(false);
    if (!result.ok) {
      setError(result.message || "The course was not saved.");
      return false;
    }
    dirtyRef.current = false;
    toast({ title: "Course saved", variant: "success" });
    if (options.thenPlay) onPlay(draft.id);
    else onBack();
    return true;
  };

  const confirmDelete = async () => {
    if (!draft || isNew) return;
    setDeleteOpen(false);
    setBusy(true);
    const result = await myCourses.remove(draft.id);
    setBusy(false);
    if (!result.ok) {
      toast({ title: "The course was not deleted", description: result.message, variant: "error" });
      return;
    }
    toast({ title: "Course deleted", variant: "success" });
    onBack();
  };

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center text-white" data-my-course-editor>
        <div>
          <Layers3 className="mx-auto h-12 w-12 text-violet-300" />
          <h1 className="mt-4 text-2xl font-black">Sign in to build your course</h1>
        </div>
      </main>
    );
  }

  if (!isNew && myCourses.state === "ready" && !existing) {
    return (
      <div className="min-h-screen text-white" data-my-course-editor data-my-course-missing>
        <Header cartCount={0} notifCount={0} title="Course not found" subtitle="My Study Library" onNavigateToCart={() => {}} onNavigateToNotifications={() => {}} onNavigateToSubscription={() => {}} />
        <main className="mx-auto w-full max-w-md px-4 py-10 text-center">
          <p className="text-sm font-semibold text-white/60">This course no longer exists in your library.</p>
          <button type="button" onClick={onBack} className="mt-5 min-h-11 rounded-full bg-violet-600 px-5 text-sm font-black">Back to My Study Library</button>
        </main>
      </div>
    );
  }

  if (!draft) {
    return (
      <main className="grid min-h-screen place-items-center text-white" data-my-course-editor-loading>
        <LoaderCircle className="h-8 w-8 animate-spin text-violet-300" />
      </main>
    );
  }

  return (
    <div className="min-h-screen text-white" data-my-course-editor data-course-id={draft.id}>
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-screen sm:overflow-hidden sm:rounded-none sm:border-0 lg:max-w-full">
        <Header
          cartCount={0}
          notifCount={0}
          title={isNew ? "New course" : "Edit course"}
          subtitle="My Study Library"
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
        />

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-28 pt-3 sm:px-5 lg:px-7 xl:px-9" data-my-course-editor-content>
          <div className="mx-auto w-full max-w-[1100px] space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-black text-white/65 ring-1 ring-white/10 transition hover:bg-white/10"
                data-my-course-editor-back
              >
                <ArrowLeft size={14} /> My Study Library
              </button>
              <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white/50">
                {stats.modules} module{stats.modules === 1 ? "" : "s"} · {stats.resources} resource{stats.resources === 1 ? "" : "s"}
              </span>
            </div>

            {/* ── 1. Course identity ─────────────────────────────────── */}
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4" data-my-course-meta>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Course</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">{isNew ? "Build your own course" : "Edit your course"}</h1>
              <p className="mt-1 text-xs font-medium leading-5 text-white/50">
                Cover, modules, lessons aur apne MCQ — sab kuch aap design karein. Save ke baad Play se Course Player khulega.
              </p>

              <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  <span className={labelClass}>Cover image</span>
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    {draft.coverImage ? (
                      <img src={draft.coverImage} alt="Course cover" className="h-full w-full object-cover" data-my-course-cover-preview />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-white/30">
                        <ImageIcon size={30} />
                      </span>
                    )}
                    {coverUploading ? (
                      <span className="absolute inset-0 grid place-items-center bg-black/55">
                        <LoaderCircle className="h-6 w-6 animate-spin text-white" />
                      </span>
                    ) : null}
                    {draft.coverImage ? (
                      <button
                        type="button"
                        onClick={() => patch({ coverImage: "" })}
                        aria-label="Remove cover image"
                        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/20"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                  <label className="mt-2 flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-3 text-[11px] font-black text-white/70 transition hover:border-violet-400/50 hover:bg-white/[0.06]">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={coverUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void handleCoverFile(file);
                      }}
                      data-my-course-cover-input
                    />
                    {coverUploading ? "Uploading…" : <><Upload size={13} /> Upload cover</>}
                  </label>
                  <input
                    value={draft.coverImage?.startsWith("data:") ? "" : draft.coverImage || ""}
                    onChange={(event) => patch({ coverImage: event.target.value })}
                    placeholder="…or paste an image URL"
                    className={`${inputClass} mt-2`}
                    aria-label="Cover image URL"
                  />
                </div>

                <div className="space-y-3">
                  <label className="block">
                    <span className={labelClass}>Course title</span>
                    <input
                      value={draft.title}
                      onChange={(event) => patch({ title: event.target.value })}
                      maxLength={MY_COURSE_TITLE_MAX}
                      placeholder="e.g. NEET Biology — my revision plan"
                      className={inputClass}
                      data-my-course-title-input
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Description (optional)</span>
                    <textarea
                      value={draft.description || ""}
                      onChange={(event) => patch({ description: event.target.value })}
                      maxLength={MY_COURSE_DESC_MAX}
                      rows={4}
                      placeholder="What is this course for?"
                      className={`${inputClass} resize-y py-2`}
                      data-my-course-description-input
                    />
                  </label>
                </div>
              </div>
            </section>

            {/* ── 2. Modules ────────────────────────────────────────── */}
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4" data-my-course-modules>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Structure</p>
                  <h2 className="mt-0.5 text-lg font-black">Modules & resources</h2>
                </div>
                <button
                  type="button"
                  onClick={() => addModule(null)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-violet-600 px-4 text-[11px] font-black transition hover:bg-violet-500"
                  data-my-course-add-module
                >
                  <FolderPlus size={14} /> Add module
                </button>
              </div>
              <p className="mt-1 text-[11px] font-medium leading-5 text-white/45">
                Har module ke andar resources (video, PDF, link, Brain MCQ) aur nested sub-modules — jaise admin course banata hai.
              </p>

              <div className="mt-3 space-y-3">
                {draft.modules.map((module, index) => (
                  <ModuleNodeEditor
                    key={module.id}
                    module={module}
                    depth={1}
                    index={index}
                    siblingCount={draft.modules.length}
                    uid={user.id}
                    courseId={draft.id}
                    onUpdate={(next) => updateModule(module.id, next)}
                    onRemove={() => removeModule(module.id)}
                    onMove={(delta) => moveModule(module.id, delta)}
                    onAddChild={() => addModule(module.id)}
                    onAddResource={(type) => addResource(module.id, type)}
                  />
                ))}
                {draft.modules.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => addModule(null)}
                    className="w-full rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center text-[12px] font-black text-white/55 transition hover:bg-white/[0.05]"
                  >
                    <Plus className="mx-auto mb-2 h-6 w-6 text-white/35" />
                    Add your first module
                  </button>
                ) : null}
              </div>
            </section>

            {error ? (
              <p role="alert" className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100">
                {error}
              </p>
            ) : null}
          </div>
        </main>

        {/* ── Sticky action bar ─────────────────────────────────────── */}
        <div className="sticky bottom-0 z-30 border-t border-white/10 bg-slate-950/85 px-3 py-3 backdrop-blur sm:px-5" data-my-course-editor-actions>
          <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-2">
            {!isNew ? (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[11px] font-black text-rose-300 ring-1 ring-rose-400/25 transition hover:bg-rose-500/10 disabled:opacity-40"
                data-my-course-delete
              >
                <Trash2 size={13} /> Delete
              </button>
            ) : null}
            <span className="ml-auto hidden text-[11px] font-semibold text-white/40 sm:block">
              {myCourses.saving ? "Saving…" : dirtyRef.current ? "Unsaved changes" : "Saved"}
            </span>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-black text-white ring-1 ring-white/15 transition hover:bg-white/10 disabled:opacity-40"
              data-my-course-save
            >
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check size={15} />} Save
            </button>
            <button
              type="button"
              onClick={() => void save({ thenPlay: true })}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-600 px-5 text-sm font-black transition hover:bg-violet-500 disabled:opacity-40"
              data-my-course-save-play
            >
              <Play size={15} /> Save & play
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this course?"
        message={`“${draft.title || "Untitled course"}” and everything inside it will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

/* ── module node ─────────────────────────────────────────────────────────── */

interface ModuleNodeEditorProps {
  module: MyCourseModule;
  depth: number;
  index: number;
  siblingCount: number;
  uid: string;
  courseId: string;
  onUpdate: (next: (module: MyCourseModule) => MyCourseModule) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  onAddChild: () => void;
  onAddResource: (type: MyCourseResourceType) => void;
}

function ModuleNodeEditor({
  module, depth, index, siblingCount, uid, courseId, onUpdate, onRemove, onMove, onAddChild, onAddResource,
}: ModuleNodeEditorProps) {
  const [open, setOpen] = useState(depth === 1);
  const canNest = depth < MY_COURSE_MAX_DEPTH;

  return (
    <article
      className={`rounded-2xl border p-3 ${depth === 1 ? "border-white/12 bg-white/[0.035]" : "border-white/10 bg-black/20"}`}
      data-my-module={module.id}
      data-my-module-depth={depth}
      style={depth > 1 ? { marginLeft: Math.min((depth - 1) * 14, 42) } : undefined}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-[11px] font-black text-violet-200 ring-1 ring-violet-400/25"
          data-my-module-toggle
        >
          {index + 1}
        </button>
        <input
          value={module.title}
          onChange={(event) => onUpdate((current) => ({ ...current, title: event.target.value }))}
          maxLength={MY_MODULE_TITLE_MAX}
          placeholder={`Module ${index + 1} title`}
          className={`${inputClass} flex-1`}
          aria-label={`Module ${index + 1} title`}
          data-my-module-title
        />
        <IconButton label="Move module up" onClick={() => onMove(-1)} disabled={index === 0}>
          <ArrowUp size={14} />
        </IconButton>
        <IconButton label="Move module down" onClick={() => onMove(1)} disabled={index === siblingCount - 1}>
          <ArrowDown size={14} />
        </IconButton>
        <IconButton label="Delete module" onClick={onRemove} tone="danger">
          <Trash2 size={14} />
        </IconButton>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className={labelClass}>Description (optional)</span>
            <textarea
              value={module.description || ""}
              onChange={(event) => onUpdate((current) => ({ ...current, description: event.target.value }))}
              maxLength={MY_MODULE_DESC_MAX}
              rows={2}
              placeholder="What is this module about?"
              className={`${inputClass} resize-y py-2`}
            />
          </label>

          <div className="space-y-2">
            {module.resources.map((resource) => (
              <ResourceEditor
                key={resource.id}
                resource={resource}
                uid={uid}
                courseId={courseId}
                onUpdate={(next) =>
                  onUpdate((current) => ({
                    ...current,
                    resources: current.resources.map((item) => (item.id === resource.id ? next(item) : item)),
                    updatedAt: Date.now(),
                  }))
                }
                onRemove={() =>
                  onUpdate((current) => ({
                    ...current,
                    resources: current.resources.filter((item) => item.id !== resource.id),
                    updatedAt: Date.now(),
                  }))
                }
                onMove={(delta) =>
                  onUpdate((current) => {
                    const at = current.resources.findIndex((item) => item.id === resource.id);
                    const destination = at + delta;
                    if (at < 0 || destination < 0 || destination >= current.resources.length) return current;
                    const next = [...current.resources];
                    const [moved] = next.splice(at, 1);
                    next.splice(destination, 0, moved);
                    return { ...current, resources: next, updatedAt: Date.now() };
                  })
                }
                index={module.resources.findIndex((item) => item.id === resource.id)}
                siblingCount={module.resources.length}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wide text-white/45">Add resource</span>
            <select
              value=""
              onChange={(event) => {
                const value = event.target.value as MyCourseResourceType;
                if (value) onAddResource(value);
              }}
              className={`${inputClass} w-auto min-w-[168px] appearance-none py-1.5 text-[11px]`}
              aria-label="Resource type to add"
              data-my-resource-type-picker
            >
              <option value="" className="bg-slate-900">Choose a type…</option>
              {TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id} className="bg-slate-900">
                  {option.label}
                </option>
              ))}
            </select>
            {canNest ? (
              <button
                type="button"
                onClick={onAddChild}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-black text-cyan-200 ring-1 ring-cyan-400/25 transition hover:bg-cyan-500/10"
                data-my-module-add-child
              >
                <FolderPlus size={12} /> Sub-module
              </button>
            ) : null}
          </div>

          {module.modules.map((child, childIndex) => (
            <ModuleNodeEditor
              key={child.id}
              module={child}
              depth={depth + 1}
              index={childIndex}
              siblingCount={module.modules.length}
              uid={uid}
              courseId={courseId}
              onUpdate={(next) =>
                onUpdate((current) => ({
                  ...current,
                  modules: updateNode(current.modules, child.id, next),
                  updatedAt: Date.now(),
                }))
              }
              onRemove={() =>
                onUpdate((current) => ({ ...current, modules: removeNode(current.modules, child.id), updatedAt: Date.now() }))
              }
              onMove={(delta) =>
                onUpdate((current) => ({ ...current, modules: moveNode(current.modules, child.id, delta), updatedAt: Date.now() }))
              }
              onAddChild={() =>
                onUpdate((current) => ({
                  ...current,
                  modules: addChildNode(current.modules, child.id, createMyModule("New sub-module")),
                  updatedAt: Date.now(),
                }))
              }
              onAddResource={(type) =>
                onUpdate((current) => ({
                  ...current,
                  modules: updateNode(current.modules, child.id, (node) => ({
                    ...node,
                    resources: [...node.resources, createMyResource(type)],
                    updatedAt: Date.now(),
                  })),
                  updatedAt: Date.now(),
                }))
              }
            />
          ))}
        </div>
      ) : (
        <p className="mt-2 truncate text-[11px] font-semibold text-white/40">
          {module.resources.length} resource{module.resources.length === 1 ? "" : "s"}
          {module.modules.length ? ` · ${module.modules.length} sub-module${module.modules.length === 1 ? "" : "s"}` : ""}
        </p>
      )}
    </article>
  );
}

/* ── resource ────────────────────────────────────────────────────────────── */

interface ResourceEditorProps {
  resource: MyCourseResource;
  uid: string;
  courseId: string;
  index: number;
  siblingCount: number;
  onUpdate: (next: (resource: MyCourseResource) => MyCourseResource) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}

function ResourceEditor({ resource, uid, courseId, index, siblingCount, onUpdate, onRemove, onMove }: ResourceEditorProps) {
  const option = typeOption(resource.type);
  const Icon = option.icon;
  const [uploading, setUploading] = useState(false);
  const isBrain = resource.type === "brain";
  const questions = resource.practiceQuestions || [];
  const missing = questions.filter((question) => myQuestionIssues(question).length > 0).length;
  const ready = !isBrain || (questions.length > 0 && missing === 0);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await uploadMyCourseResourceFile(uid, courseId, file);
      onUpdate((current) => ({
        ...current,
        url: uploaded.url,
        fileName: uploaded.fileName,
        size: uploaded.size,
        source: "upload",
        name: current.name || file.name.replace(/\.[^.]+$/, ""),
        updatedAt: Date.now(),
      }));
      toast({ title: "File uploaded", variant: "success" });
    } catch (uploadError) {
      toast({
        title: "That file could not be uploaded",
        description: uploadError instanceof Error ? uploadError.message : undefined,
        variant: "error",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border p-3 ${ready ? "border-white/10 bg-black/25" : "border-amber-400/30 bg-amber-500/[0.06]"}`}
      data-my-resource={resource.id}
      data-my-resource-type={resource.type}
      data-my-resource-ready={ready ? "true" : "false"}
    >
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-500/12 text-cyan-200 ring-1 ring-cyan-400/20">
          <Icon size={16} />
        </span>
        <input
          value={resource.name}
          onChange={(event) => onUpdate((current) => ({ ...current, name: event.target.value }))}
          maxLength={MY_RESOURCE_NAME_MAX}
          placeholder={isBrain ? "Practice set name" : "Resource name"}
          className={`${inputClass} flex-1`}
          aria-label="Resource name"
          data-my-resource-name
        />
        <select
          value={resource.type}
          onChange={(event) => {
            const type = event.target.value as MyCourseResourceType;
            onUpdate((current) => ({
              ...current,
              type,
              ...(type === "brain"
                ? { practiceQuestions: current.practiceQuestions?.length ? current.practiceQuestions : [createMyQuestion()], practiceTitle: current.practiceTitle || current.name }
                : { practiceQuestions: undefined, practiceTitle: undefined }),
              updatedAt: Date.now(),
            }));
          }}
          className={`${inputClass} w-auto min-w-[150px] appearance-none py-1.5 text-[11px]`}
          aria-label="Resource type"
          data-my-resource-type-select
        >
          {TYPE_OPTIONS.map((type) => (
            <option key={type.id} value={type.id} className="bg-slate-900">
              {type.label}
            </option>
          ))}
        </select>
        <IconButton label="Move resource up" onClick={() => onMove(-1)} disabled={index === 0}>
          <ArrowUp size={14} />
        </IconButton>
        <IconButton label="Move resource down" onClick={() => onMove(1)} disabled={index === siblingCount - 1}>
          <ArrowDown size={14} />
        </IconButton>
        <IconButton label="Delete resource" onClick={onRemove} tone="danger">
          <Trash2 size={14} />
        </IconButton>
      </div>

      <div className="mt-3 space-y-3">
        {!isBrain ? (
          <div className="space-y-2">
            <label className="block">
              <span className={labelClass}>
                {option.upload ? "Link or upload" : "Link"} {option.hint ? `— ${option.hint}` : ""}
              </span>
              <div className="flex items-center gap-2">
                <Link2 size={14} className="shrink-0 text-white/35" />
                <input
                  value={resource.url || ""}
                  onChange={(event) => onUpdate((current) => ({ ...current, url: event.target.value, source: "link", updatedAt: Date.now() }))}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="https://…"
                  className={inputClass}
                  aria-label="Resource link"
                  data-my-resource-url
                />
              </div>
            </label>
            {option.upload ? (
              <label className="flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-3 text-[11px] font-black text-white/70 transition hover:border-violet-400/50 hover:bg-white/[0.06]">
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void handleFile(file);
                  }}
                  data-my-resource-file
                />
                {uploading ? "Uploading…" : <><Upload size={13} /> Upload file{resource.fileName ? ` — ${resource.fileName}` : ""}</>}
              </label>
            ) : null}
          </div>
        ) : null}

        <label className="block">
          <span className={labelClass}>Details (optional)</span>
          <textarea
            value={resource.description || ""}
            onChange={(event) => onUpdate((current) => ({ ...current, description: event.target.value, updatedAt: Date.now() }))}
            maxLength={MY_RESOURCE_DESC_MAX}
            rows={2}
            placeholder="A note about this resource"
            className={`${inputClass} resize-y py-2`}
          />
        </label>

        {isBrain ? (
          <MyCourseBrainEditor
            questions={questions}
            title={resource.practiceTitle || ""}
            onChange={({ questions: next, title }) =>
              onUpdate((current) => ({
                ...current,
                practiceQuestions: next,
                practiceTitle: title,
                name: current.name || title || "Practice set",
                updatedAt: Date.now(),
              }))
            }
          />
        ) : null}

        {!isBrain && !String(resource.url || "").trim() ? (
          <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-100">
            Add a link (or upload a file) — the player opens a resource only when it has something to show.
          </p>
        ) : null}
        {isBrain && !ready ? (
          <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-100">
            {questions.length === 0
              ? "Add at least one question — the Brain tab needs a set to open."
              : `${missing} question${missing === 1 ? "" : "s"} still need text, two options or a marked answer.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
