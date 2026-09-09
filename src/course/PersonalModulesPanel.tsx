// src/course/PersonalModulesPanel.tsx
//
// The Course Player's "My Modules" manager — the learner-owned study space
// for one course (products/{course}'s content is never touched; everything
// lives in `users/{uid}/personalCourseModules` via the server API).
//
// Owned by the Course Player (CoursePlayerApp.tsx) and hosted by the
// Modules tab of the study pane exactly like the Mind Map / Player panels:
//
//   · LIST — modules (expand → resources), usage vs plan limits, module and
//     resource management, reordering, the locked/upsell state for learners
//     without an eligible plan, and honest limit messaging that names the
//     plan + remaining/used counts + an upgrade action.
//   · COMPOSE — create/edit module, create/edit resource with a type picker
//     limited to the plan's allowed types and URL validation through the
//     SAME pure layer the server enforces (utils/personalCourse.js). The
//     server remains authoritative — every save goes through
//     `/api/personal-course` and server error messages are shown verbatim.
//   · Opening a personal resource builds an official-shape `CourseFile`
//     (personalResourceToCourseFile) and hands it to the EXISTING
//     ResourceViewer stack — no second viewer anywhere.
//
// The panel is intentionally a plain (tap-only) list: its rows carry real
// per-row controls (rename / delete / reorder / add), so the official
// modules list' scroll-snap release-fire behaviour is NOT copied here — the
// two surfaces must never fight the learner's finger.
//
// Keyboard care: compose fields live at the TOP of the pane's own scroll
// column, so the browser's visual-viewport pan (already handled by the
// player's split) never hides an active field.

import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Library,
  LockKeyhole,
  PencilLine,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { CourseFile, CourseFileType } from "../types/course";
import type { PersonalModulesController } from "../hooks/usePersonalModules";
import { personalResourceToCourseFile, type PersonalCourseModule, type PersonalCourseResource } from "../lib/personalCourseClient";
import {
  personalCourseTypeLabel,
  personalLimitMessage,
  PERSONAL_MODULE_DESC_MAX,
  PERSONAL_MODULE_TITLE_MAX,
  PERSONAL_RESOURCE_DESC_MAX,
  PERSONAL_RESOURCE_NAME_MAX,
  sanitizePersonalModuleInput,
  sanitizePersonalResourceInput,
  usageAtModuleLimit,
  usageAtPerModuleLimit,
  usageAtResourceLimit,
  type PersonalModulesCycleLimits,
} from "../../utils/personalCourse";
import { trackFeatureEvent } from "../utils/featureAnalytics";
import CourseConfirmDialog from "./ConfirmDeleteDialog";

type View = "home" | "module-create" | "module-edit" | "resource-create" | "resource-edit";

interface ConfirmTarget {
  kind: "module" | "resource";
  module: PersonalCourseModule;
  resource?: PersonalCourseResource;
}

interface PersonalModulesPanelProps {
  /** The controller returned by usePersonalModules (owned by the player). */
  personal: PersonalModulesController;
  productTitle: string;
  landscape: boolean;
  /** Open a personal resource in the existing ResourceViewer stack. */
  onOpenPersonalFile: (file: CourseFile, context: { moduleTitle: string }) => void;
  /** Open the account-wide central workspace. */
  onOpenLibrary?: () => void;
  /** Open the AI Study Engine for a whole module (“Ask this Module”). */
  onOpenModuleAi?: (module: PersonalCourseModule, view?: string, question?: string) => void;
  /** Open the AI Study Engine scoped to one resource (“Ask AI about this”). */
  onOpenResourceAi?: (resource: PersonalCourseResource, view?: string, question?: string) => void;
  /** Close the manager and restore the official modules list. */
  onExit: () => void;
}

/** The little 44px tinted plate every dock-style row in the player uses. */
const RowPlate = ({ icon, color, busy }: { icon: ReactNode; color: string; busy?: boolean }) => (
  <span
    className="flex h-11 w-11 shrink-0 items-center justify-center"
    style={{ background: `${color}18`, border: `1px solid ${color}22`, borderRadius: 12, color }}
  >
    {busy ? <RefreshCw size={18} className="animate-spin" /> : icon}
  </span>
);

const SectionLabel = ({ children, attr = "data-personal-section-label" }: { children: ReactNode; attr?: string }) => (
  <p className="px-4 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--course-muted)]" {...{ [attr]: "" }}>
    {children}
  </p>
);

const plainRowClass = "flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04]";

const smallIconButtonClass = "grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[var(--course-muted)] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30";

const typeIconHint = (type: string) => {
  switch (type) {
    case "youtube":
      return "Paste a YouTube link (watch / youtu.be / Shorts / embed) or an 11-character video id.";
    case "video":
      return "Direct video file link (.mp4, .webm…) — or a Google Drive file link.";
    case "audio":
      return "Direct audio file link (.mp3, .m4a…) — or a Google Drive file link.";
    case "pdf":
      return "Link to the PDF itself (.pdf) or a Google Drive file link.";
    case "doc":
      return "Paste a Google Docs link (docs.google.com/document/d/…).";
    case "sheet":
      return "Paste a Google Sheets link (docs.google.com/spreadsheets/d/…).";
    case "slides":
      return "Paste a Google Slides link (docs.google.com/presentation/d/…).";
    case "ebook":
      return "Public e-book / file link — PDFs render in-app, others open in the reader.";
    case "image":
      return "Direct image link (.png, .jpg, .gif, .webp…) — or a Google Drive file link.";
    case "google_form":
      return "Paste a Google Forms link (docs.google.com/forms/… or forms.gle/…).";
    case "embed":
      return "Paste the public https:// website URL you want to embed.";
    case "mindmap":
      return "Paste a Whimsical mind-map link (whimsical.com/…).";
    default:
      return "Paste the https:// link for this resource.";
  }
};

const goToSubscription = () => {
  window.location.hash = "#/subscription";
};

/** The panel's primary violet submit button (GlassButton doesn't carry colour/busy props). */
function PrimaryButton({ busy = false, children, ...props }: { busy?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-xs font-black text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: "linear-gradient(180deg,#B388FF,#9D6BFF)", boxShadow: "0 8px 24px #B388FF2E" }}
      {...props}
    >
      {busy ? <RefreshCw size={15} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

/** One resource row inside an expanded module: open + reorder + edit + delete + Ask AI. */
function ResourceCard({ module, resource, busy, onOpen, onEdit, onDelete, onMove, onAi }: {
  module: PersonalCourseModule;
  resource: PersonalCourseResource;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (nextIndex: number) => void;
  onAi?: () => void;
}) {
  const index = module.resources.findIndex((item) => item.id === resource.id);
  const last = module.resources.length - 1;
  return (
    <div className="flex items-center gap-1" data-personal-resource data-resource-id={resource.id}>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
        onClick={onOpen}
        disabled={busy}
        data-personal-open-resource
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-black text-white/90">{resource.name}</span>
          <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-wide text-[var(--course-muted)]">
            {personalCourseTypeLabel(resource.type)}
          </span>
        </span>
      </button>
      {onAi ? (
        <button type="button" aria-label={`Ask AI about ${resource.name}`} title="Ask AI about this" className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/25 transition hover:bg-violet-500/25 disabled:opacity-30" disabled={busy} onClick={onAi} data-personal-resource-ai=""><Sparkles size={12} /></button>
      ) : null}
      <button type="button" aria-label="Move resource up" className={smallIconButtonClass} disabled={busy || index === 0} onClick={() => onMove(index - 1)} data-personal-resource-move-up><ChevronUp size={14} /></button>
      <button type="button" aria-label="Move resource down" className={smallIconButtonClass} disabled={busy || index === last} onClick={() => onMove(index + 1)} data-personal-resource-move-down><ChevronDown size={14} /></button>
      <button type="button" aria-label="Edit resource" className={smallIconButtonClass} disabled={busy} onClick={onEdit} data-personal-edit-resource><PencilLine size={14} /></button>
      <button type="button" aria-label="Delete resource" className={`${smallIconButtonClass} hover:!text-rose-300`} disabled={busy} onClick={onDelete} data-personal-delete-resource><Trash2 size={14} /></button>
    </div>
  );
}

export default function PersonalModulesPanel({ personal, productTitle, onOpenPersonalFile, onOpenLibrary, onOpenModuleAi, onOpenResourceAi, onExit }: PersonalModulesPanelProps) {
  const { access, usage, modules } = personal;
  const limits = access?.limits ?? null;
  const entitled = Boolean(access?.entitled);

  const [view, setView] = useState<View>("home");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<{
    title: string;
    description: string;
    name: string;
    type: string;
    url: string;
  }>({ title: "", description: "", name: "", type: "", url: "" });

  // Which module/resource is being edited or created into.
  const [targetModuleId, setTargetModuleId] = useState<string | null>(null);
  const [targetResourceId, setTargetResourceId] = useState<string | null>(null);

  const allowedTypes = access?.allowedTypes ?? [];
  const defaultType = allowedTypes.includes("youtube") ? "youtube" : (allowedTypes[0] || "");
  const atModuleLimit = usageAtModuleLimit(usage, limits);
  const atResourceLimit = usageAtResourceLimit(usage, limits);

  const targetModule = useMemo(
    () => modules.find((module) => module.id === targetModuleId) || null,
    [modules, targetModuleId],
  );
  const targetResource = useMemo(() => {
    if (!targetModule || !targetResourceId) return null;
    return targetModule.resources.find((resource) => resource.id === targetResourceId) || null;
  }, [targetModule, targetResourceId]);

  // A compose screen whose target disappeared (deleted on another device, or
  // the list reloaded after a failed create) must NOT setState during render
  // — flip the view in an effect after painting a safe fallback instead.
  const composeTargetMissing = (view === "resource-create" || view === "resource-edit")
    && targetModuleId != null
    && personal.state === "ready"
    && !targetModule;
  useEffect(() => {
    if (composeTargetMissing) exitToHome();
  }, [composeTargetMissing]);

  const run = async (label: string, action: () => Promise<{ ok: boolean; message?: string; code?: string }>) => {
    if (busyAction) return;
    setBusyAction(label);
    setServerError(null);
    const result = await action();
    setBusyAction(null);
    if (!result.ok) {
      setServerError(result.message || "Something went wrong — please try again.");
      return false;
    }
    return true;
  };

  const toggleModule = (moduleId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  const exitToHome = () => {
    setView("home");
    setServerError(null);
    setDrafts({ title: "", description: "", name: "", type: defaultType, url: "" });
    setTargetModuleId(null);
    setTargetResourceId(null);
  };

  const openModuleCreate = () => {
    setDrafts({ title: "", description: "", name: "", type: defaultType, url: "" });
    setServerError(null);
    setView("module-create");
  };

  const openModuleEdit = (module: PersonalCourseModule) => {
    setTargetModuleId(module.id);
    setTargetResourceId(null);
    setDrafts({ title: module.title, description: module.description || "", name: "", type: defaultType, url: "" });
    setServerError(null);
    setView("module-edit");
  };

  const openResourceCreate = (module: PersonalCourseModule) => {
    setTargetModuleId(module.id);
    setTargetResourceId(null);
    setDrafts({ title: "", description: "", name: "", type: defaultType, url: "" });
    setServerError(null);
    setView("resource-create");
  };

  const openResourceEdit = (module: PersonalCourseModule, resource: PersonalCourseResource) => {
    setTargetModuleId(module.id);
    setTargetResourceId(resource.id);
    setDrafts({
      title: "",
      description: resource.description || "",
      name: resource.name,
      type: resource.type,
      url: resource.sourceUrl || resource.url || "",
    });
    setServerError(null);
    setView("resource-edit");
  };

  const submitModule = async (creating: boolean) => {
    const moduleId = targetModuleId || "";
    const cleaned = sanitizePersonalModuleInput({ title: drafts.title, description: drafts.description });
    if (!cleaned.ok) {
      setServerError(cleaned.errors[0]?.message || "Check the module details.");
      return;
    }
    const ok = await run("module", async () => {
      const result = creating
        ? await personal.createModule(cleaned.value.title, cleaned.value.description)
        : await personal.updateModule(moduleId, cleaned.value.title, cleaned.value.description);
      if (result.ok) trackFeatureEvent(creating ? "module_created" : "module_updated");
      return result;
    });
    if (ok) exitToHome();
  };

  const submitResource = async (creating: boolean) => {
    const moduleId = targetModuleId || "";
    const resourceId = targetResourceId || "";
    const type = String(drafts.type || defaultType);
    const preflight = sanitizePersonalResourceInput({
      type,
      name: drafts.name,
      description: drafts.description,
      url: drafts.url,
    });
    if (!preflight.ok) {
      setServerError(preflight.errors[0]?.message || "Check the resource details.");
      return;
    }
    const ok = await run("resource", async () => {
      const result = creating
        ? await personal.createResource(moduleId, {
            type: preflight.value.type,
            name: preflight.value.name,
            description: preflight.value.description,
            url: String(drafts.url || "").trim(),
          })
        : await personal.updateResource(moduleId, resourceId, {
            type: preflight.value.type,
            name: preflight.value.name,
            description: preflight.value.description,
            url: String(drafts.url || "").trim(),
          });
      if (result.ok) trackFeatureEvent(creating ? "resource_added" : "resource_updated");
      return result;
    });
    if (ok) exitToHome();
  };

  const handleDeleteModule = (module: PersonalCourseModule) => {
    setConfirm({ kind: "module", module });
  };
  const handleDeleteResource = (module: PersonalCourseModule, resource: PersonalCourseResource) => {
    setConfirm({ kind: "resource", module, resource });
  };
  const confirmDelete = async () => {
    if (!confirm) return;
    const target = confirm;
    setConfirm(null);
    const ok = await run("delete", async () => {
      const result = target.kind === "module"
        ? await personal.deleteModule(target.module.id)
        : await personal.deleteResource(target.module.id, String(target.resource?.id || ""));
      if (result.ok) trackFeatureEvent(target.kind === "module" ? "module_deleted" : "resource_deleted");
      return result;
    });
    if (ok && target.kind === "module") {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(target.module.id);
        return next;
      });
    }
  };

  // ── List-state body -----------------------------------------------------
  const renderHome = () => {
    if (personal.state === "loading" && !access) {
      return (
        <div className="grid h-full place-items-center px-6 py-10 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-violet-400" />
            <p className="text-[11px] font-bold text-[var(--course-muted)]">Loading your modules…</p>
          </div>
        </div>
      );
    }
    if (personal.state === "error" && !access) {
      return (
        <div className="px-6 py-8 text-center">
          <p className="text-xs font-semibold text-[var(--course-muted)]">{personal.error || "Could not load My Modules."}</p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              className="rounded-2xl px-5 py-3 text-xs font-black text-white transition-transform active:scale-95"
              style={{ background: "linear-gradient(180deg,#B388FF,#9D6BFF)" }}
              onClick={() => personal.reload()}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    // ── Locked / disabled / upsell states ────────────────────────────────
    if (!entitled && modules.length === 0) {
      const disabled = Boolean(access?.disabled);
      const planName = access?.planName || null;
      return (
        <div className="px-5 py-8" data-personal-locked-state>
          <div className="flex flex-col items-center gap-3 text-center">
            <span
              className="flex h-16 w-16 items-center justify-center"
              style={{ background: "#B388FF18", border: "1px solid #B388FF33", borderRadius: 20, color: "#B388FF" }}
            >
              <LockKeyhole size={28} />
            </span>
            <p className="text-sm font-black text-white/90">My Modules</p>
            <p className="max-w-[260px] text-[11px] font-semibold leading-relaxed text-[var(--course-muted)]">
              {disabled
                ? `Personal Course Modules are disabled on ${planName ? `your ${planName} plan` : "your current plan"}.`
                : planName
                  ? `Create your own study modules inside ${productTitle} — included with ${planName}.`
                  : `Create your own study modules inside ${productTitle} — included with eligible subscription plans.`}
            </p>
            {!disabled ? (
              <div className="mt-2 flex flex-col gap-2">
                <button
                  type="button"
                  className="rounded-2xl px-5 py-3 text-xs font-black text-white transition-transform active:scale-95"
                  style={{ background: "linear-gradient(180deg,#B388FF,#9D6BFF)" }}
                  onClick={() => { trackFeatureEvent("upgrade_clicked"); goToSubscription(); }}
                >
                  View subscription plans
                </button>
                <p className="max-w-[260px] text-[10px] font-semibold leading-relaxed text-[var(--course-muted)]">
                  {access?.limits
                    ? `Create up to ${formatLimit(access.limits.moduleLimit)} modules with ${formatLimit(access.limits.resourceLimit)} resources on paid plans.`
                    : "Add YouTube, PDFs, Google Docs, Sheets, Slides, audio, images and more — and they open right here in the player."}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    // Existing content remains readable and organisable after a downgrade;
    // only new module/resource creation is blocked.
    const planName = access?.planName || "your plan";
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {!entitled ? (
          <div className="mx-4 mt-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5" data-personal-downgrade-readable>
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-200">Read-only creation mode</p>
            <p className="mt-0.5 text-[10px] font-semibold leading-relaxed text-white/65">Your saved content remains available. Renew or upgrade to create additional modules or resources.</p>
            <button type="button" onClick={goToSubscription} className="mt-1.5 min-h-8 rounded-xl px-3 text-[10px] font-black text-amber-100 ring-1 ring-amber-400/25">View plans</button>
          </div>
        ) : null}
        <div className="px-4 pb-1 pt-2" data-personal-usage-summary>
          <div className="flex items-center gap-3 rounded-2xl px-2 py-2">
            <RowPlate icon={<Sparkles size={20} />} color="#B388FF" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black text-white/90" data-personal-plan-name>{planName}</p>
              <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-[var(--course-muted)]" data-personal-usage-text>
                {usageText(usage?.moduleCount ?? modules.length, usage?.resourceCount ?? 0, limits)}
              </p>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-2 py-2" data-personal-module-list>
          <button
            type="button"
            className={plainRowClass}
            disabled={!entitled || atModuleLimit || Boolean(busyAction)}
            onClick={openModuleCreate}
            data-personal-add-module
          >
            <RowPlate icon={<Plus size={20} />} color="#B388FF" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-black text-white/90">New module</span>
              <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wide text-[var(--course-muted)]">
                {!entitled ? "Upgrade or renew to create more" : atModuleLimit ? personalLimitMessage("module", limits, planName) : "Name it and start adding resources"}
              </span>
            </span>
          </button>

          {modules.length === 0 ? (
            <div className="grid place-items-center px-6 py-10 text-center">
              <div className="flex flex-col items-center gap-2">
                <Library size={26} className="text-[var(--course-muted)]" />
                <p className="text-xs font-black text-white/80">No modules yet</p>
                <p className="max-w-[240px] text-[10px] font-semibold text-[var(--course-muted)]">
                  Add a YouTube lesson, a PDF, a Google Form quiz — anything you want beside the course.
                </p>
              </div>
            </div>
          ) : (
            modules.map((module) => {
              const open = expanded.has(module.id);
              const perModuleCount = module.resources.length;
              const moduleAtResourceLimit = usageAtPerModuleLimit(perModuleCount, limits);
              const index = modules.findIndex((item) => item.id === module.id);
              return (
                <div key={module.id} className="rounded-2xl" data-personal-module data-module-id={module.id} data-expanded={open ? "true" : "false"}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
                      onClick={() => toggleModule(module.id)}
                      data-personal-toggle-module
                    >
                      <RowPlate icon={<span className="text-[11px] font-black">{index + 1}</span>} color="#B388FF" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black text-white/90">{module.title}</span>
                        <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wide text-[var(--course-muted)]">
                          {perModuleCount} {perModuleCount === 1 ? "resource" : "resources"}
                        </span>
                      </span>
                      {open ? (
                        <ChevronDown size={15} className="shrink-0 text-[var(--course-muted)]" />
                      ) : (
                        <ChevronRight size={15} className="shrink-0 text-[var(--course-muted)]" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Move module up"
                      className={smallIconButtonClass}
                      disabled={index === 0 || Boolean(busyAction)}
                      onClick={() => { void run("move", () => personal.moveModule(module.id, index - 1)); }}
                      data-personal-module-move-up
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label="Move module down"
                      className={smallIconButtonClass}
                      disabled={index === modules.length - 1 || Boolean(busyAction)}
                      onClick={() => { void run("move", () => personal.moveModule(module.id, index + 1)); }}
                      data-personal-module-move-down
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>

                  {open ? (
                    <div className="ml-2 space-y-1 border-l border-white/10 pl-3 pb-1" data-personal-module-body>
                      {onOpenModuleAi ? (
                        <div className="flex flex-wrap gap-1.5 pb-1" data-personal-module-ai="">
                          <button
                            type="button"
                            onClick={() => onOpenModuleAi(module, "ask")}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-[11px] font-black text-white shadow-[0_6px_18px_rgba(139,92,246,0.28)] transition hover:bg-violet-500"
                            data-personal-ask-module=""
                          >
                            <Sparkles size={13} /> Ask this Module
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenModuleAi(module, "summary")}
                            className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-white/[0.06] px-3 text-[10px] font-black text-white/70 ring-1 ring-white/10 transition hover:bg-white/[0.09]"
                            data-personal-summary-module=""
                          >
                            Summary
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenModuleAi(module, "practice")}
                            className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-white/[0.06] px-3 text-[10px] font-black text-white/70 ring-1 ring-white/10 transition hover:bg-white/[0.09]"
                            data-personal-questions-module=""
                          >
                            Questions
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenModuleAi(module, "flashcards")}
                            className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-white/[0.06] px-3 text-[10px] font-black text-white/70 ring-1 ring-white/10 transition hover:bg-white/[0.09]"
                            data-personal-flashcards-module=""
                          >
                            Flashcards
                          </button>
                        </div>
                      ) : null}
                      {module.resources.map((resource) => (
                        <ResourceCard
                          key={resource.id}
                          module={module}
                          resource={resource}
                          busy={Boolean(busyAction)}
                          onOpen={() => {
                            trackFeatureEvent("resource_opened", { type: resource.type, surface: "course_player" });
                            void personal.markOpened(resource);
                            onOpenPersonalFile(
                              personalResourceToCourseFile(resource, module.id),
                              { moduleTitle: module.title },
                            );
                          }}
                          onEdit={() => openResourceEdit(module, resource)}
                          onDelete={() => handleDeleteResource(module, resource)}
                          onMove={(nextIndex) => { void run("move", () => personal.moveResource(module.id, resource.id, nextIndex)); }}
                          onAi={onOpenResourceAi ? () => onOpenResourceAi(resource, "ask") : undefined}
                        />
                      ))}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black text-violet-200 transition-colors hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ background: "#B388FF14", border: "1px solid #B388FF2B" }}
                          disabled={!entitled || atResourceLimit || moduleAtResourceLimit || Boolean(busyAction)}
                          onClick={() => openResourceCreate(module)}
                          data-personal-add-resource
                        >
                          <Plus size={13} /> Add resource
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black text-white/70 transition-colors hover:bg-white/[0.05]"
                          style={{ background: "#FFFFFF0D", border: "1px solid #FFFFFF1F" }}
                          disabled={Boolean(busyAction)}
                          onClick={() => openModuleEdit(module)}
                          data-personal-edit-module
                        >
                          <PencilLine size={13} /> Rename
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black text-rose-300 transition-colors hover:bg-rose-500/10"
                          style={{ background: "#FB718510", border: "1px solid #FB71851F" }}
                          disabled={Boolean(busyAction)}
                          onClick={() => handleDeleteModule(module)}
                          data-personal-delete-module
                        >
                          <Trash2 size={13} /> Delete module
                        </button>
                      </div>
                      {atResourceLimit || moduleAtResourceLimit ? (
                        <p className="px-2 pt-1 text-[10px] font-bold text-amber-300/90" data-personal-limit-note>
                          {personalLimitMessage(atResourceLimit ? "resource" : "per-module", limits, planName)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // ── Compose bodies ------------------------------------------------------
  const renderFormShell = (children: ReactNode, heading: string, onBack: () => void) => (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-4 pt-2">
      <SectionLabel>{heading}</SectionLabel>
      <button
        type="button"
        className={`${plainRowClass} mb-1`}
        onClick={onBack}
        disabled={Boolean(busyAction)}
        data-personal-back
      >
        <RowPlate icon={<ChevronRight size={18} className="rotate-180" />} color="#B388FF" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-black text-white/90">Back</span>
          <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wide text-[var(--course-muted)]">My Modules</span>
        </span>
      </button>
      {serverError ? (
        <p
          className="mx-1 mb-1 rounded-xl px-3 py-2 text-[11px] font-bold leading-relaxed text-rose-200"
          style={{ background: "#FB718510", border: "1px solid #FB718522" }}
          data-personal-form-error
        >
          {serverError}
        </p>
      ) : null}
      {children}
    </div>
  );

  const fieldClass = "w-full rounded-2xl bg-black/20 px-4 py-3 text-sm font-semibold text-white placeholder:text-white/25 outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-violet-400/60";
  const labelClass = "mb-1.5 block px-1 text-[10px] font-black uppercase tracking-wider text-[var(--course-muted)]";

  const renderModuleForm = (creating: boolean) => {
    const submit = () => { void submitModule(creating); };
    return renderFormShell(
      <div className="space-y-3" data-personal-module-form data-mode={creating ? "create" : "edit"}>
        <div>
          <label className={labelClass} htmlFor="pm-title">Module title</label>
          <input
            id="pm-title"
            className={fieldClass}
            maxLength={PERSONAL_MODULE_TITLE_MAX}
            placeholder="e.g. Week 1 — my extra practice"
            value={drafts.title}
            disabled={Boolean(busyAction)}
            onChange={(event) => setDrafts((current) => ({ ...current, title: event.target.value }))}
            data-personal-input="title"
          />
          <p className="mt-1 px-1 text-right text-[9px] font-bold text-white/30">{drafts.title.length}/{PERSONAL_MODULE_TITLE_MAX}</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="pm-desc">Description (optional)</label>
          <textarea
            id="pm-desc"
            className={`${fieldClass} min-h-[84px] resize-none`}
            maxLength={PERSONAL_MODULE_DESC_MAX}
            placeholder="What is this module for?"
            value={drafts.description}
            disabled={Boolean(busyAction)}
            onChange={(event) => setDrafts((current) => ({ ...current, description: event.target.value }))}
            data-personal-input="description"
          />
        </div>
        <PrimaryButton
          busy={busyAction === "module"}
          disabled={busyAction === "module"}
          onClick={submit}
          data-personal-save
        >
          {creating ? "Create module" : "Save changes"}
        </PrimaryButton>
      </div>,
      creating ? "New module" : "Edit module",
      exitToHome,
    );
  };

  const renderResourceForm = (creating: boolean) => {
    const module = targetModule;
    if (!module) {
      // Paints once; the composeTargetMissing effect then returns to home.
      return renderFormShell(
        <p
          className="mx-1 rounded-xl px-3 py-2 text-[11px] font-bold leading-relaxed text-[var(--course-muted)]"
          style={{ background: "#FFFFFF0A", border: "1px solid #FFFFFF1A" }}
          data-personal-form-error
        >
          This module no longer exists — it may have been deleted on another device.
        </p>,
        creating ? "Add resource" : "Edit resource",
        exitToHome,
      );
    }
    const resource = targetResource;
    const type = allowedTypes.includes(drafts.type as CourseFileType) ? drafts.type : "";
    const finalType = (type || (resource && allowedTypes.includes(resource.type) ? resource.type : "") || defaultType) as CourseFileType;
    const legacyType = resource && !allowedTypes.includes(resource.type) ? resource.type : null;
    const chooseType = (next: string) => setDrafts((current) => ({ ...current, type: next }));
    const submit = () => { void submitResource(creating); };
    return renderFormShell(
      <div className="space-y-3" data-personal-resource-form data-mode={creating ? "create" : "edit"}>
        <div className="rounded-2xl px-1 py-1" data-personal-type-picker>
          <p className={labelClass}>Resource type</p>
          {allowedTypes.length === 0 ? (
            <p className="px-1 pb-1 text-[11px] font-bold text-amber-300/90">
              Your plan doesn't include any resource types for My Modules yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allowedTypes.map((allowedType) => {
                const active = finalType === allowedType;
                return (
                  <button
                    key={allowedType}
                    type="button"
                    className="rounded-xl px-3 py-2 text-[10px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      background: active ? "#B388FF30" : "#FFFFFF0D",
                      border: active ? "1px solid #B388FF66" : "1px solid #FFFFFF1F",
                      color: active ? "#E5D5FF" : "rgba(255,255,255,0.75)",
                    }}
                    disabled={Boolean(busyAction)}
                    onClick={() => chooseType(allowedType)}
                    data-personal-type-chip={allowedType}
                    data-active={active ? "true" : "false"}
                  >
                    {personalCourseTypeLabel(allowedType)}
                  </button>
                );
              })}
              {legacyType ? (
                <button
                  key={legacyType}
                  type="button"
                  className="rounded-xl px-3 py-2 text-[10px] font-black opacity-60"
                  style={{ background: "#FFFFFF0D", border: "1px dashed #FFFFFF33", color: "rgba(255,255,255,0.75)" }}
                  disabled
                  title={`Your plan no longer includes ${personalCourseTypeLabel(legacyType)} — this resource stays readable, you just can't add new ones.`}
                  data-personal-type-chip={legacyType}
                  data-active="false"
                >
                  {personalCourseTypeLabel(legacyType)}
                </button>
              ) : null}
            </div>
          )}
          {legacyType ? (
            <p className="px-1 pt-1 text-[9px] font-semibold text-[var(--course-muted)]" data-personal-legacy-type-note>
              “{personalCourseTypeLabel(legacyType)}” isn't on your plan any more — this resource stays readable; you can still edit its details.
            </p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="pr-url">Link</label>
          <input
            id="pr-url"
            className={fieldClass}
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://…"
            value={drafts.url}
            disabled={Boolean(busyAction)}
            onChange={(event) => setDrafts((current) => ({ ...current, url: event.target.value }))}
            data-personal-input="url"
          />
          <p className="mt-1 px-1 text-[10px] font-semibold leading-relaxed text-[var(--course-muted)]" data-personal-url-hint>
            {typeIconHint(type)}
          </p>
        </div>
        <div>
          <label className={labelClass} htmlFor="pr-name">Name (optional)</label>
          <input
            id="pr-name"
            className={fieldClass}
            maxLength={PERSONAL_RESOURCE_NAME_MAX}
            placeholder={type ? `e.g. My ${personalCourseTypeLabel(type).toLowerCase()}` : "Resource name"}
            value={drafts.name}
            disabled={Boolean(busyAction)}
            onChange={(event) => setDrafts((current) => ({ ...current, name: event.target.value }))}
            data-personal-input="name"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="pr-desc">Description (optional)</label>
          <textarea
            id="pr-desc"
            className={`${fieldClass} min-h-[72px] resize-none`}
            maxLength={PERSONAL_RESOURCE_DESC_MAX}
            placeholder="What to look for in this resource?"
            value={drafts.description}
            disabled={Boolean(busyAction)}
            onChange={(event) => setDrafts((current) => ({ ...current, description: event.target.value }))}
            data-personal-input="description"
          />
        </div>
        <PrimaryButton
          busy={busyAction === "resource"}
          disabled={busyAction === "resource"}
          onClick={submit}
          data-personal-save
        >
          {creating ? "Add resource" : "Save changes"}
        </PrimaryButton>
      </div>,
      creating ? `Add to “${module.title}”` : "Edit resource",
      exitToHome,
    );
  };

  // ── The pane body (owned by the Course Player's Modules tab) ───────────
  return (
    <div className="flex h-full min-h-0 flex-col" data-course-personal-modules>
      <div className="flex items-center gap-2 px-4 pb-0 pt-3">
        <button
          type="button"
          aria-label="Back to course modules"
          className="grid h-8 w-8 place-items-center rounded-xl text-[var(--course-muted)] transition-colors hover:bg-white/[0.06] hover:text-white"
          onClick={onExit}
          data-personal-exit
        >
          <ChevronRight size={18} className="rotate-180" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-black text-white/90" data-personal-heading>My Modules</p>
          <p className="truncate text-[10px] font-bold uppercase tracking-wide text-[var(--course-muted)]">{productTitle}</p>
        </div>
        {onOpenLibrary ? (
          <button
            type="button"
            onClick={onOpenLibrary}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[10px] font-black text-violet-200 ring-1 ring-violet-400/25 transition hover:bg-violet-500/10"
            data-open-study-library
          >
            <Library size={14} /> Library
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        {view === "module-create" ? renderModuleForm(true)
          : view === "module-edit" ? renderModuleForm(false)
            : view === "resource-create" ? renderResourceForm(true)
              : view === "resource-edit" ? renderResourceForm(false)
                : renderHome()}
      </div>

      <CourseConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === "module" ? "Delete this module?" : "Delete this resource?"}
        message={
          confirm?.kind === "module"
            ? `“${confirm?.module.title}” and all ${confirm?.module.resources.length || "its"} resources will be removed from your personal modules. This can't be undone.`
            : `“${confirm?.resource?.name}” will be removed from your personal modules. This can't be undone.`
        }
        confirmLabel="Delete"
        onConfirm={() => { void confirmDelete(); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

const formatLimit = (limit: number | undefined | null) => (limit === -1 ? "unlimited" : String(limit ?? 0));

const usageText = (moduleCount: number, resourceCount: number, limits: PersonalModulesCycleLimits | null) => {
  const modulePart = limits && Number(limits.moduleLimit) >= 0 ? `${moduleCount} of ${limits.moduleLimit} modules` : `${moduleCount} modules`;
  const resourcePart = limits && Number(limits.resourceLimit) >= 0 ? `${resourceCount} of ${limits.resourceLimit} resources` : `${resourceCount} resources`;
  return `${modulePart} • ${resourcePart}`;
};
