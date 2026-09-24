import { useEffect, useMemo, useRef, useState } from "react";
import { BookPlus, CheckCircle2, FolderPlus, Library, LoaderCircle, Plus } from "lucide-react";
import Modal from "../components/ui/Modal";
import {
  GlassSelect,
  GlassSelectContent,
  GlassSelectItem,
  GlassSelectTrigger,
} from "../components/ui/glass-select";
import { toast } from "../components/ui/glass-toast";
import type { MyCourse, MyCourseModule } from "../types/myCourse";
import { MY_COURSE_TITLE_MAX, MY_MODULE_TITLE_MAX } from "../types/myCourse";
import type { CourseFileType } from "../types/course";
import { trackFeatureEvent } from "../utils/featureAnalytics";

/**
 * The official resource the Course Player hands to this dialog, already
 * flattened from the active `CourseFile` by the player.
 */
export interface OfficialResourceDraft {
  name: string;
  type: CourseFileType;
  url: string;
  description: string;
  /** Brain practice payload (type "brain" only) — copied verbatim. */
  practiceTitle?: string;
  practiceQuestions?: MyCourseModule["resources"][number]["practiceQuestions"];
}

export interface AddOfficialSaveInput {
  /** `null` → create a brand-new course titled `newCourseTitle`. */
  existingCourseId: string | null;
  newCourseTitle: string;
  /** `null` → append a new module titled `newModuleTitle`. */
  moduleId: string | null;
  newModuleTitle: string;
}

export type AddOfficialSaveResult = {
  ok: boolean;
  alreadyExists?: boolean;
  destinationTitle?: string;
  message?: string;
};

interface AddOfficialResourceDialogProps {
  open: boolean;
  onClose: () => void;
  /** The learner's live My Study Library (useMyCourses().courses). */
  courses: MyCourse[];
  coursesState: "loading" | "ready" | "error";
  resource: OfficialResourceDraft | null;
  onSave: (input: AddOfficialSaveInput) => Promise<AddOfficialSaveResult>;
}

interface ModuleOption {
  id: string;
  title: string;
  depth: number;
  resourceCount: number;
}

/** Depth-first flatten of a course's module tree for the destination select. */
const flattenModules = (modules: MyCourseModule[], depth = 0): ModuleOption[] =>
  modules.flatMap((module) => [
    {
      id: module.id,
      title: module.title || "Untitled module",
      depth,
      resourceCount: module.resources.length,
    },
    ...flattenModules(module.modules || [], depth + 1),
  ]);

/**
 * Course Player → My Study Library bridge ("Add to My Module").
 *
 * Owner brief (2026-09-24): the two settings rows ("Add to My Module" and
 * "Save for later") must write into the NEW My Study Library — the
 * learner-owned course shelf at `users/{uid}/myCourses/{courseId}
 * (src/lib/myCourseClient.ts) — instead of the old server-backed
 * personal-modules tree, so everything saved here shows up on the Study
 * Library page and plays in the same Course Player.
 *
 * This dialog picks the destination course + module (or creates either) and
 * hands the actual write back to the player through `onSave` — the player
 * owns the resource mapping, the duplicate check and the live controller, so
 * this dialog stays presentational exactly like the old one.
 */
export default function AddOfficialResourceDialog({
  open,
  onClose,
  courses,
  coursesState,
  resource,
  onSave,
}: AddOfficialResourceDialogProps) {
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [creatingModule, setCreatingModule] = useState(false);
  const [moduleId, setModuleId] = useState("");
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submittedRef = useRef(false);
  const modeChosenRef = useRef(false);

  const course = useMemo(
    () => courses.find((entry) => entry.id === courseId) || null,
    [courses, courseId],
  );
  const moduleOptions = useMemo(() => flattenModules(course?.modules || []), [course]);

  // Opening is the reset boundary: preselect the learner's most recently
  // updated course and its first module.
  useEffect(() => {
    if (!open) return;
    submittedRef.current = false;
    modeChosenRef.current = false;
    setBusy(false);
    setError(null);
    setCreatingCourse(courses.length === 0);
    setCourseId(courses[0]?.id || "");
    setNewCourseTitle("");
    setCreatingModule(courses.length === 0);
    setNewModuleTitle("");
    const firstCourse = courses[0] || null;
    const options = flattenModules(firstCourse?.modules || []);
    setModuleId(options[0]?.id || "");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- courses changes are reconciled below

  // Live reconciliation: the selected course/module can disappear (another
  // tab, a delete) while the dialog is open — never leave a stale id selected.
  useEffect(() => {
    if (!open) return;
    if (!creatingCourse) {
      if (!courses.some((entry) => entry.id === courseId)) {
        setCourseId(courses[0]?.id || "");
        if (!courses.length) setCreatingCourse(true);
      }
    }
  }, [open, creatingCourse, courses, courseId]);

  useEffect(() => {
    if (!open || creatingModule || !course) return;
    if (!moduleOptions.some((option) => option.id === moduleId)) {
      setModuleId(moduleOptions[0]?.id || "");
    }
  }, [open, creatingModule, course, moduleOptions, moduleId]);

  const selectedCourseValid = creatingCourse ? newCourseTitle.trim().length > 0 : Boolean(course);
  const selectedModuleValid = creatingModule ? newModuleTitle.trim().length > 0 : Boolean(moduleId);
  const canSubmit = Boolean(resource) && !busy && selectedCourseValid && selectedModuleValid;

  const submit = async () => {
    if (!resource || !canSubmit || submittedRef.current) return;
    submittedRef.current = true;
    setBusy(true);
    setError(null);
    trackFeatureEvent("official_add_submitted", {
      destination: creatingCourse ? "new_course" : "existing_course",
    });
    const result = await onSave({
      existingCourseId: creatingCourse ? null : courseId,
      newCourseTitle: newCourseTitle.trim(),
      moduleId: creatingModule ? null : moduleId,
      newModuleTitle: newModuleTitle.trim(),
    });
    setBusy(false);
    submittedRef.current = false;
    if (!result.ok) {
      setError(result.message || "The resource wasn't added. Please try again.");
      trackFeatureEvent("official_add_failed", { code: result.message ? "save-failed" : "unknown" });
      return;
    }
    if (result.alreadyExists) {
      toast({
        title: "Already added",
        description: `“${resource.name}” is already in ${result.destinationTitle || "that module"}.`,
        variant: "info",
      });
      trackFeatureEvent("official_already_added", { destination: "module" });
    } else {
      toast({
        title: "Added to My Module",
        description: `“${resource.name}” is now in ${result.destinationTitle || "your library"} — open My Study Library to see it.`,
        variant: "success",
      });
      trackFeatureEvent("official_add_succeeded", {
        destination: creatingCourse ? "new_course" : "existing_course",
      });
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title="Add to My Module" maxWidth="max-w-lg">
      <div className="space-y-5" data-add-official-resource-dialog>
        <div className="rounded-2xl border border-violet-400/25 bg-violet-500/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">Official resource</p>
          <p className="mt-1 break-words text-sm font-black text-white">{resource?.name || "Course resource"}</p>
          <p className="mt-1 text-xs font-medium leading-5 text-white/55">
            A personal copy is added to your My Study Library. The official course, order and completion stay unchanged.
          </p>
        </div>

        {coursesState === "loading" && courses.length === 0 ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm font-bold text-white/60" role="status">
            <LoaderCircle className="h-5 w-5 animate-spin" /> Loading your library…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Destination type">
              <button
                type="button"
                className={`min-h-11 rounded-2xl border px-3 py-2.5 text-sm font-black transition ${!creatingCourse ? "border-violet-400/50 bg-violet-500/20 text-violet-100" : "border-white/10 bg-white/[0.04] text-white/65"}`}
                onClick={() => { modeChosenRef.current = true; setCreatingCourse(false); }}
                disabled={busy || courses.length === 0}
                aria-pressed={!creatingCourse}
              >
                <Library className="mr-1.5 inline h-4 w-4" /> Existing course
              </button>
              <button
                type="button"
                className={`min-h-11 rounded-2xl border px-3 py-2.5 text-sm font-black transition ${creatingCourse ? "border-violet-400/50 bg-violet-500/20 text-violet-100" : "border-white/10 bg-white/[0.04] text-white/65"}`}
                onClick={() => { modeChosenRef.current = true; setCreatingCourse(true); }}
                disabled={busy}
                aria-pressed={creatingCourse}
              >
                <BookPlus className="mr-1.5 inline h-4 w-4" /> New course
              </button>
            </div>

            {creatingCourse ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="official-new-course-title" className="mb-1.5 block text-xs font-black text-white/70">Course name</label>
                  <input
                    id="official-new-course-title"
                    autoFocus
                    value={newCourseTitle}
                    onChange={(event) => setNewCourseTitle(event.target.value)}
                    maxLength={MY_COURSE_TITLE_MAX}
                    disabled={busy}
                    placeholder="e.g. Exam revision"
                    className="min-h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-violet-400/60"
                  />
                </div>
                <div>
                  <label htmlFor="official-new-course-module" className="mb-1.5 block text-xs font-black text-white/70">Module name</label>
                  <input
                    id="official-new-course-module"
                    value={newModuleTitle}
                    onChange={(event) => setNewModuleTitle(event.target.value)}
                    maxLength={MY_MODULE_TITLE_MAX}
                    disabled={busy}
                    placeholder="e.g. Chapter 1"
                    className="min-h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-violet-400/60"
                  />
                </div>
              </div>
            ) : courses.length > 0 ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="official-course-destination" className="mb-1.5 block text-xs font-black text-white/70">Choose a course</label>
                  <GlassSelect value={courseId} onValueChange={setCourseId}>
                    <GlassSelectTrigger
                      id="official-course-destination"
                      disabled={busy}
                      aria-label="Choose a course"
                      className="dc-glass-select min-h-12 h-auto w-full rounded-2xl px-4 text-sm font-semibold"
                    />
                    <GlassSelectContent className="dc-glass-select-pop" aria-label="Course destinations">
                      {courses.map((entry) => (
                        <GlassSelectItem key={entry.id} value={entry.id}>{entry.title || "Untitled course"}</GlassSelectItem>
                      ))}
                    </GlassSelectContent>
                  </GlassSelect>
                </div>

                {creatingModule ? (
                  <div>
                    <label htmlFor="official-new-module-title" className="mb-1.5 block text-xs font-black text-white/70">New module name</label>
                    <input
                      id="official-new-module-title"
                      autoFocus
                      value={newModuleTitle}
                      onChange={(event) => setNewModuleTitle(event.target.value)}
                      maxLength={MY_MODULE_TITLE_MAX}
                      disabled={busy}
                      placeholder="e.g. Chapter 1"
                      className="min-h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-violet-400/60"
                    />
                  </div>
                ) : moduleOptions.length > 0 ? (
                  <div>
                    <label htmlFor="official-module-destination" className="mb-1.5 block text-xs font-black text-white/70">Choose a module</label>
                    <GlassSelect value={moduleId} onValueChange={setModuleId}>
                      <GlassSelectTrigger
                        id="official-module-destination"
                        disabled={busy}
                        aria-label="Choose a module"
                        className="dc-glass-select min-h-12 h-auto w-full rounded-2xl px-4 text-sm font-semibold"
                      />
                      <GlassSelectContent className="dc-glass-select-pop" aria-label="Module destinations">
                        {moduleOptions.map((option) => (
                          <GlassSelectItem key={option.id} value={option.id}>
                            {`${"\u00A0\u00A0".repeat(option.depth)}${option.title} · ${option.resourceCount} resources`}
                          </GlassSelectItem>
                        ))}
                      </GlassSelectContent>
                    </GlassSelect>
                  </div>
                ) : (
                  <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-semibold leading-5 text-white/60">
                    This course has no modules yet — create one below.
                  </p>
                )}

                <button
                  type="button"
                  className={`min-h-10 w-full rounded-2xl border px-3 text-xs font-black transition ${creatingModule ? "border-violet-400/50 bg-violet-500/20 text-violet-100" : "border-white/10 bg-white/[0.04] text-white/65"}`}
                  onClick={() => { setCreatingModule((current) => !current); setNewModuleTitle(""); }}
                  disabled={busy}
                  aria-pressed={creatingModule}
                >
                  {creatingModule ? "Choose an existing module instead" : <><FolderPlus className="mr-1.5 inline h-4 w-4" /> Create a new module</>}
                </button>
              </div>
            ) : (
              <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5 text-center text-sm font-semibold text-white/60">
                You don't have a course yet — create one above to add this resource.
              </p>
            )}
          </>
        )}

        {error ? <p role="alert" className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100">{error}</p> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-full border border-white/10 px-5 text-sm font-black text-white/70 disabled:opacity-40">Cancel</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-600 px-5 text-sm font-black text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : creatingCourse ? <Plus className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {busy ? "Adding…" : creatingCourse ? "Create and add" : "Add resource"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
