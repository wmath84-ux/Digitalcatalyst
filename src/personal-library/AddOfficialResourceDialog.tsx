import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FolderPlus, Library, LoaderCircle, Plus } from "lucide-react";
import Modal from "../components/ui/Modal";
import {
  GlassSelect,
  GlassSelectContent,
  GlassSelectItem,
  GlassSelectTrigger,
} from "../components/ui/glass-select";
import { toast } from "../components/ui/glass-toast";
import type { PersonalModulesController } from "../hooks/usePersonalModules";
import type { PersonalCourseOfficialReference } from "../lib/personalCourseClient";
import type { CourseFileType } from "../types/course";
import { trackFeatureEvent } from "../utils/featureAnalytics";
import {
  PERSONAL_MODULE_DESC_MAX,
  PERSONAL_MODULE_TITLE_MAX,
  usageAtModuleLimit,
  usageAtPerModuleLimit,
  usageAtResourceLimit,
} from "../../utils/personalCourse";

interface AddOfficialResourceDialogProps {
  open: boolean;
  onClose: () => void;
  personal: PersonalModulesController;
  official: PersonalCourseOfficialReference | null;
  resourceName: string;
  resourceType?: CourseFileType;
}

/**
 * Course Player → personal module bridge. Source ids are only references; the
 * API re-resolves the official siteProducts snapshot and access server-side.
 * One in-flight guard prevents repeated taps, while authoritative transactions
 * and destination fingerprints reject stale targets and same-module duplicates.
 */
export default function AddOfficialResourceDialog({
  open,
  onClose,
  personal,
  official,
  resourceName,
  resourceType,
}: AddOfficialResourceDialogProps) {
  const [destination, setDestination] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submittedRef = useRef(false);
  const modeChosenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    submittedRef.current = false;
    modeChosenRef.current = false;
    setBusy(false);
    setError(null);
    setCreating(personal.allModules.length === 0);
    setDestination(personal.allModules[0]?.id || "");
    setTitle("");
    setDescription("");
    void personal.ensureLoaded();
    trackFeatureEvent("official_add_opened");
  }, [open]); // Opening is the reset boundary; live module changes are handled below.

  useEffect(() => {
    if (!open || modeChosenRef.current) return;
    if (personal.allModules.length > 0) {
      setCreating(false);
      setDestination((current) => personal.allModules.some((module) => module.id === current)
        ? current
        : personal.allModules[0].id);
    } else if (personal.loaded) {
      setCreating(true);
      setDestination("");
    }
  }, [open, personal.allModules, personal.loaded]);

  // A module can disappear in another tab while this dialog is open. Select a
  // live fallback instead of leaving a visually selected but stale id.
  useEffect(() => {
    if (!open || creating || personal.allModules.length === 0) return;
    if (!personal.allModules.some((module) => module.id === destination)) {
      setDestination(personal.allModules[0].id);
    }
  }, [creating, destination, open, personal.allModules]);

  const selectedModule = useMemo(
    () => personal.allModules.find((module) => module.id === destination) || null,
    [destination, personal.allModules],
  );
  const limits = personal.access?.limits || null;
  const moduleLimitReached = usageAtModuleLimit(personal.usage, limits);
  const resourceLimitReached = usageAtResourceLimit(personal.usage, limits);
  const typeNotAllowed = Boolean(resourceType && personal.access && !personal.access.allowedTypes.includes(resourceType));
  const selectedModuleLimitReached = Boolean(selectedModule && usageAtPerModuleLimit(selectedModule.resources.length, limits));
  const canAddResource = Boolean(personal.access?.entitled) && !resourceLimitReached && !typeNotAllowed;
  const canCreateModule = Boolean(personal.access?.entitled) && !moduleLimitReached;
  const canSubmit = Boolean(
    official
    && !busy
    && canAddResource
    && (creating ? canCreateModule && title.trim() : selectedModule && !selectedModuleLimitReached),
  );

  const submit = async () => {
    if (!official || !canSubmit || submittedRef.current) return;
    submittedRef.current = true;
    setBusy(true);
    setError(null);
    trackFeatureEvent("official_add_submitted", { destination: creating ? "new_module" : "existing_module" });
    const result = await personal.addOfficial(official, creating
      ? { destination: "module", newModuleTitle: title, newModuleDescription: description }
      : { destination: "module", moduleId: selectedModule!.id });
    setBusy(false);
    submittedRef.current = false;
    if (!result.ok) {
      setError(result.message || "The resource wasn't added. Please try again.");
      trackFeatureEvent("official_add_failed", { code: result.code || "unknown" });
      return;
    }
    if (result.alreadyExists) {
      const existingModule = personal.allModules.find((module) => module.id === result.data?.existingModuleId);
      toast({
        title: "Already added",
        description: existingModule ? `This resource is already in ${existingModule.title}.` : "This resource is already in that destination.",
        variant: "info",
      });
      trackFeatureEvent("official_already_added", { destination: "module" });
    } else {
      toast({
        title: "Added to My Module",
        description: creating ? `Created “${title.trim()}” and added ${resourceName}.` : `Added to “${selectedModule?.title || "My Module"}”.`,
        variant: "success",
      });
      trackFeatureEvent("official_add_succeeded", { destination: creating ? "new_module" : "existing_module" });
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title="Add to My Module" maxWidth="max-w-lg">
      <div className="space-y-5" data-add-official-resource-dialog>
        <div className="rounded-2xl border border-violet-400/25 bg-violet-500/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">Official resource</p>
          <p className="mt-1 break-words text-sm font-black text-white">{resourceName || "Course resource"}</p>
          <p className="mt-1 text-xs font-medium leading-5 text-white/55">A personal snapshot is added. The official course, order, authorship and completion stay unchanged.</p>
        </div>

        {personal.state === "loading" && !personal.loaded ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm font-bold text-white/60" role="status">
            <LoaderCircle className="h-5 w-5 animate-spin" /> Loading your modules…
          </div>
        ) : (
          <>
            {!personal.access?.entitled || resourceLimitReached || typeNotAllowed ? (
              <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-xs font-semibold leading-5 text-amber-100" role="status">
                <p>{resourceLimitReached
                  ? "Your current plan’s total resource limit has been reached. Existing library content remains available."
                  : typeNotAllowed
                    ? `This ${resourceType || "resource"} type is not included in your current plan. Existing library content remains available.`
                    : "Your existing library remains available, but your current plan does not allow another personal copy."}</p>
                <button
                  type="button"
                  onClick={() => { trackFeatureEvent("upgrade_clicked", { surface: "official_add_dialog", reason: resourceLimitReached ? "resource_limit" : typeNotAllowed ? "resource_type" : "ineligible" }); window.location.hash = "#/subscription"; }}
                  className="mt-2 min-h-11 rounded-full bg-amber-400/15 px-4 font-black ring-1 ring-amber-400/30"
                >
                  View plans
                </button>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Destination type">
              <button
                type="button"
                className={`min-h-11 rounded-2xl border px-3 py-2.5 text-sm font-black transition ${!creating ? "border-violet-400/50 bg-violet-500/20 text-violet-100" : "border-white/10 bg-white/[0.04] text-white/65"}`}
                onClick={() => { modeChosenRef.current = true; setCreating(false); }}
                disabled={busy || personal.allModules.length === 0}
                aria-pressed={!creating}
              >
                <Library className="mr-1.5 inline h-4 w-4" /> Existing
              </button>
              <button
                type="button"
                className={`min-h-11 rounded-2xl border px-3 py-2.5 text-sm font-black transition ${creating ? "border-violet-400/50 bg-violet-500/20 text-violet-100" : "border-white/10 bg-white/[0.04] text-white/65"}`}
                onClick={() => { modeChosenRef.current = true; setCreating(true); }}
                disabled={busy || !canCreateModule}
                aria-pressed={creating}
              >
                <FolderPlus className="mr-1.5 inline h-4 w-4" /> Create new
              </button>
            </div>

            {creating ? (
              <div className="space-y-4">
                {personal.access?.entitled && moduleLimitReached && !resourceLimitReached && !typeNotAllowed ? (
                  <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-xs font-semibold leading-5 text-amber-100">
                    <p>This plan’s module limit has been reached. Choose an existing module or view plans.</p>
                    <button type="button" onClick={() => { trackFeatureEvent("upgrade_clicked", { surface: "official_add_dialog", reason: "module_limit" }); window.location.hash = "#/subscription"; }} className="mt-2 min-h-11 rounded-full bg-amber-400/15 px-4 font-black ring-1 ring-amber-400/30">View plans</button>
                  </div>
                ) : null}
                <div>
                  <label htmlFor="official-new-module-title" className="mb-1.5 block text-xs font-black text-white/70">Module name</label>
                  <input
                    id="official-new-module-title"
                    autoFocus
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={PERSONAL_MODULE_TITLE_MAX}
                    disabled={busy || !canCreateModule}
                    placeholder="e.g. Exam revision"
                    className="min-h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-violet-400/60"
                  />
                </div>
                <div>
                  <label htmlFor="official-new-module-description" className="mb-1.5 block text-xs font-black text-white/70">Description <span className="font-medium text-white/40">(optional)</span></label>
                  <textarea
                    id="official-new-module-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={PERSONAL_MODULE_DESC_MAX}
                    disabled={busy || !canCreateModule}
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-violet-400/60"
                  />
                </div>
              </div>
            ) : personal.allModules.length > 0 ? (
              <div>
                <label htmlFor="official-module-destination" className="mb-1.5 block text-xs font-black text-white/70">Choose a module</label>
                <GlassSelect value={destination} onValueChange={setDestination}>
                  <GlassSelectTrigger
                    id="official-module-destination"
                    autoFocus
                    disabled={busy}
                    aria-label="Choose a module"
                    className="dc-glass-select min-h-12 h-auto w-full rounded-2xl px-4 text-sm font-semibold"
                  />
                  <GlassSelectContent className="dc-glass-select-pop" aria-label="Module destinations">
                    {personal.allModules.map((module) => (
                      <GlassSelectItem key={module.id} value={module.id}>{`${module.title} · ${module.resources.length} resources`}</GlassSelectItem>
                    ))}
                  </GlassSelectContent>
                </GlassSelect>
                {personal.access?.entitled && selectedModuleLimitReached && !resourceLimitReached && !typeNotAllowed ? (
                  <div className="mt-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold leading-5 text-amber-100" role="status">
                    <p>This module has reached your plan’s per-module resource limit. Choose another module or view plans.</p>
                    <button type="button" onClick={() => { trackFeatureEvent("upgrade_clicked", { surface: "official_add_dialog", reason: "per_module_limit" }); window.location.hash = "#/subscription"; }} className="mt-2 min-h-11 rounded-full bg-amber-400/15 px-4 font-black ring-1 ring-amber-400/30">View plans</button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5 text-center text-sm font-semibold text-white/60">
                You don't have a module yet. Create one above to add this resource.
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
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : creating ? <Plus className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {busy ? "Adding…" : creating ? "Create and add" : "Add resource"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
