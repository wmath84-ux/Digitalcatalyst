import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  ArrowDown, ArrowLeft, ArrowUp, Bookmark, BookOpen, ChevronRight,
  ExternalLink, FileText, FolderOpen, Globe2, GraduationCap,
  Image as ImageIcon, Layers3, Library, Link2, LoaderCircle, MoreHorizontal,
  Music2, PencilLine, Play, Plus, Presentation, RefreshCw, Search, Share2, Sheet,
  Sparkles, Trash2, Video,
} from "lucide-react";
import Header from "../components/Header";
import BottomNav, { type TabKey } from "../components/BottomNav";
import { GlassCard } from "../components/ui/GlassCard";
import { GlassButton } from "../components/ui/glass-button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Modal from "../components/ui/Modal";
import {
  GlassSelect,
  GlassSelectContent,
  GlassSelectItem,
  GlassSelectTrigger,
} from "../components/ui/glass-select";
import { toast } from "../components/ui/glass-toast";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";
import { usePersonalModules, type PersonalModulesController } from "../hooks/usePersonalModules";
import {
  personalResourceToCourseFile,
  type PersonalCourseModule,
  type PersonalCourseResource,
  type PersonalResourceFields,
} from "../lib/personalCourseClient";
import type { CourseFileType } from "../types/course";
import { trackFeatureEvent } from "../utils/featureAnalytics";
import ResourceViewer, { type CourseFileActions } from "../course/ResourceViewer";
import {
  loadPlaybackStore,
  mergePlaybackEntry,
  persistPlaybackStore,
  type CoursePlaybackPatch,
  type CoursePlaybackStore,
} from "../course/playbackState";
import {
  ALL_PERSONAL_COURSE_TYPES,
  PERSONAL_MODULE_DESC_MAX,
  PERSONAL_MODULE_TITLE_MAX,
  PERSONAL_RESOURCE_DESC_MAX,
  PERSONAL_RESOURCE_NAME_MAX,
  personalCourseTypeLabel,
  personalLimitMessage,
  sanitizePersonalModuleInput,
  sanitizePersonalResourceInput,
  usageAtModuleLimit,
  usageAtPerModuleLimit,
  usageAtResourceLimit,
} from "../../utils/personalCourse";
import ModuleAiWorkspace, { type ModuleAiView } from "../ai/ModuleAiWorkspace";
import CreateStudyPackDialog from "./CreateStudyPackDialog";
import CreateStudyStackDialog from "./CreateStudyStackDialog";
import {
  filterPersonalLibraryResources,
  normalizeLibrarySearchText,
  sortPersonalLibraryResources,
} from "../../utils/personalLibrary";

type ResourceFilter = "all" | "saved" | "organized" | "recent-added" | "recent-opened";
type SortMode = "recent" | "opened" | "name" | "module";
type DialogState =
  | { kind: "module-create" }
  | { kind: "module-edit"; module: PersonalCourseModule }
  | { kind: "resource-create"; moduleId: string | null }
  | { kind: "resource-edit"; resource: PersonalCourseResource }
  | { kind: "move"; resource: PersonalCourseResource }
  | null;
type DeleteTarget = { kind: "module"; module: PersonalCourseModule } | { kind: "resource"; resource: PersonalCourseResource } | null;

/** What the AI study workspace is scoped to (module-wide or one resource). */
type AiTarget = {
  moduleId: string | null;
  storageModuleId: string;
  moduleTitle: string;
  productId: string | null;
  resourceId?: string | null;
  resourceTitle?: string;
  view: ModuleAiView;
  question?: string;
} | null;

const TYPE_ICONS: Record<string, ComponentType<{ className?: string; size?: number }>> = {
  youtube: Play,
  video: Video,
  audio: Music2,
  pdf: FileText,
  doc: BookOpen,
  sheet: Sheet,
  slides: Presentation,
  ebook: GraduationCap,
  image: ImageIcon,
  google_form: FileText,
  embed: Globe2,
  mindmap: Layers3,
};

const typeIcon = (type: string) => TYPE_ICONS[type] || Link2;
const formatDate = (value: number | null | undefined) => {
  if (!value) return "Not opened yet";
  const delta = Date.now() - value;
  if (delta < 60_000) return "Just now";
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  if (delta < 7 * 86_400_000) return `${Math.floor(delta / 86_400_000)}d ago`;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: value < Date.now() - 31536000000 ? "numeric" : undefined }).format(value);
};
const percent = (used: number, limit: number | undefined) => limit == null || limit < 0 ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

const navigateFromBottom = (tab: TabKey) => {
  if (tab === "home") window.location.hash = "#/home";
  else if (tab === "myday") window.location.hash = "#/my-day";
  else if (tab === "store") window.location.hash = "#/store";
  else if (tab === "purchases") window.location.hash = "#/store/purchases";
  else if (tab === "profile") window.location.hash = "#/profile";
  else if (tab === "revision") window.location.hash = "#/revision";
};

export default function StudyLibraryPage() {
  const { user } = useAuth();
  const { cartIds } = useCommerce();
  const { purchasedIds } = useCatalog();
  const personal = usePersonalModules(user?.id, "__library__", { autoLoad: true, scope: "all" });
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [typeFilter, setTypeFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState<ResourceFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [viewerResource, setViewerResource] = useState<PersonalCourseResource | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  // Part 2 — the AI Study Engine surface for whichever module / resource the
  // learner opened. One workspace instance; opening a new scope replaces it.
  const [aiTarget, setAiTarget] = useState<AiTarget | null>(null);
  const [packModule, setPackModule] = useState<PersonalCourseModule | null>(null);
  const [stackModule, setStackModule] = useState<PersonalCourseModule | null>(null);
  const [stackSteps, setStackSteps] = useState<PersonalCourseResource[] | null>(null);
  const [stackIndex, setStackIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const deleteRef = useRef(false);

  useEffect(() => {
    trackFeatureEvent("library_opened", { surface: "route" });
  }, []);

  // Titles are looked up when a resource-scoped AI workspace opens; a ref keeps
  // that lookup out of the callback dependencies (the cards re-render often).
  const moduleTitleByIdRef = useRef<Record<string, string>>({});

  const openModuleAi = useCallback((module: PersonalCourseModule, view: ModuleAiView = "ask", question?: string) => {
    setAiTarget({
      moduleId: module.id,
      storageModuleId: module.id,
      moduleTitle: module.title,
      productId: module.productId || "__library__",
      view,
      question,
    });
  }, []);

  const openResourceAi = useCallback((resource: PersonalCourseResource, view: ModuleAiView = "ask", question?: string) => {
    setAiTarget({
      moduleId: resource.personalModuleId || null,
      storageModuleId: resource.storageModuleId || resource.personalModuleId || "",
      moduleTitle: resource.personalModuleId ? (moduleTitleByIdRef.current[resource.personalModuleId] || "My module") : "Saved for Later",
      productId: resource.productId || "__library__",
      resourceId: resource.id,
      resourceTitle: resource.name,
      view,
      question,
    });
  }, []);

  const moduleTitleById = useMemo(
    () => Object.fromEntries(personal.allModules.map((module) => [module.id, module.title])),
    [personal.allModules],
  );
  moduleTitleByIdRef.current = moduleTitleById;
  const allResources = useMemo(
    () => [...personal.allModules.flatMap((module) => module.resources), ...personal.savedResources],
    [personal.allModules, personal.savedResources],
  );
  const visibleResources = useMemo(() => sortPersonalLibraryResources(
    filterPersonalLibraryResources(allResources, {
      query: deferredQuery,
      type: typeFilter,
      moduleId: moduleFilter,
      state: resourceFilter,
      moduleTitleById,
    }),
    sortMode,
  ), [allResources, deferredQuery, moduleFilter, moduleTitleById, resourceFilter, sortMode, typeFilter]);
  const recentAdded = useMemo(() => sortPersonalLibraryResources(allResources, "recent").slice(0, 5), [allResources]);
  const recentOpened = useMemo(() => sortPersonalLibraryResources(allResources.filter((item) => item.lastOpenedAt), "opened").slice(0, 5), [allResources]);
  const visibleModules = useMemo(() => {
    const normalized = normalizeLibrarySearchText(deferredQuery);
    return personal.allModules.filter((module) => {
      if (moduleFilter !== "all" && module.id !== moduleFilter) return false;
      if (!normalized) return true;
      return normalizeLibrarySearchText(`${module.title} ${module.description}`).includes(normalized)
        || module.resources.some((resource) => visibleResources.some((item) => item.id === resource.id));
    });
  }, [deferredQuery, moduleFilter, personal.allModules, visibleResources]);
  const dynamicTypes = useMemo(() => Array.from(new Set<string>([
    ...ALL_PERSONAL_COURSE_TYPES,
    ...allResources.map((resource) => resource.type),
  ])), [allResources]);

  const limits = personal.access?.limits || null;
  const atModuleLimit = usageAtModuleLimit(personal.usage, limits);
  const atResourceLimit = usageAtResourceLimit(personal.usage, limits);
  const canCreate = Boolean(personal.access?.entitled);
  const canCreateResource = canCreate && (personal.access?.allowedTypes?.length || 0) > 0;
  const noFilters = !deferredQuery && typeFilter === "all" && moduleFilter === "all" && resourceFilter === "all";

  const openResource = useCallback((resource: PersonalCourseResource) => {
    setViewerResource(resource);
    void personal.markOpened(resource);
    trackFeatureEvent("resource_opened", { type: resource.type, state: resource.state, surface: "study_library" });
  }, [personal]);

  const reorderModule = async (module: PersonalCourseModule, delta: number) => {
    if (actionBusy) return;
    const index = personal.allModules.findIndex((item) => item.id === module.id);
    const destination = index + delta;
    if (index < 0 || destination < 0 || destination >= personal.allModules.length) return;
    setActionBusy(`module:${module.id}`);
    const result = await personal.moveModule(module.id, destination);
    setActionBusy(null);
    if (!result.ok) toast({ title: "Module wasn't moved", description: result.message, variant: "error" });
    else trackFeatureEvent("module_reordered", { direction: delta < 0 ? "up" : "down" });
  };

  const reorderResource = async (resource: PersonalCourseResource, delta: number) => {
    if (actionBusy) return;
    const siblings = resource.state === "saved"
      ? personal.savedResources
      : personal.allModules.find((module) => module.id === resource.personalModuleId)?.resources || [];
    const index = siblings.findIndex((item) => item.id === resource.id);
    const destination = index + delta;
    if (index < 0 || destination < 0 || destination >= siblings.length) return;
    setActionBusy(`resource:${resource.id}`);
    const result = await personal.moveResource(resource.storageModuleId, resource.id, destination);
    setActionBusy(null);
    if (!result.ok) toast({ title: "Resource wasn't moved", description: result.message, variant: "error" });
    else trackFeatureEvent("resource_reordered", { direction: delta < 0 ? "up" : "down" });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteRef.current) return;
    deleteRef.current = true;
    const target = deleteTarget;
    setDeleteTarget(null);
    setActionBusy(`delete:${target.kind}`);
    const result = target.kind === "module"
      ? await personal.deleteModule(target.module.id)
      : await personal.deleteResource(target.resource.storageModuleId, target.resource.id);
    deleteRef.current = false;
    setActionBusy(null);
    if (!result.ok) {
      toast({ title: `${target.kind === "module" ? "Module" : "Resource"} wasn't deleted`, description: result.message, variant: "error" });
      return;
    }
    toast({ title: target.kind === "module" ? "Module deleted" : "Resource deleted", variant: "success" });
    trackFeatureEvent(target.kind === "module" ? "module_deleted" : "resource_deleted", { surface: "study_library" });
  };

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center text-white" data-study-library-page>
        <div><Library className="mx-auto h-12 w-12 text-violet-300" /><h1 className="mt-4 text-2xl font-black">Sign in to open your library</h1></div>
      </main>
    );
  }

  return (
    <div data-study-library-page className="min-h-screen text-white">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-screen sm:overflow-hidden sm:rounded-none sm:border-0 lg:max-w-full">
        <Header
          cartCount={cartIds.size}
          notifCount={0}
          title="Study Library"
          subtitle="Your modules and saved resources"
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />

        <main data-study-library-content className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-7 pt-3 sm:px-5 lg:px-7 xl:px-9">
          <div className="mx-auto w-full max-w-[1500px] space-y-5">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <GlassButton variant="capsule" onClick={() => { window.location.hash = "#/profile"; }} className="mb-3 [&>span>div]:h-9 [&>span>div]:px-3 [&>span>div]:text-[11px] [&>span>div]:font-black">
                  <span className="inline-flex items-center gap-1.5"><ArrowLeft size={14} /> Profile</span>
                </GlassButton>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Your learning workspace</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">My Study Library</h1>
                <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-white/55">Organise official course resources and your own links without changing the official curriculum or progress.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => setDialog({ kind: "module-create" })}
                  disabled={!canCreate || atModuleLimit}
                  title={!canCreate ? "An eligible plan is required" : atModuleLimit ? "Your plan’s module limit has been reached" : undefined}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                ><FolderOpen size={17} /> New module</button>
                <button
                  type="button"
                  onClick={() => setDialog({ kind: "resource-create", moduleId: moduleFilter === "all" ? null : moduleFilter })}
                  disabled={!canCreateResource || atResourceLimit}
                  title={!canCreate ? "An eligible plan is required" : !canCreateResource ? "No resource types are enabled on this plan" : atResourceLimit ? "Your plan’s resource limit has been reached" : undefined}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-black transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                ><Plus size={17} /> Add resource</button>
              </div>
            </header>

            {!canCreate && personal.loaded ? (
              <div className="flex flex-col gap-3 rounded-3xl border border-amber-400/25 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between" data-library-downgrade-state>
                <div>
                  <p className="text-sm font-black text-amber-100">Your existing library stays readable</p>
                  <p className="mt-0.5 text-xs font-medium leading-5 text-white/60">Creation is paused because your current plan is not eligible. Opening, renaming, moving, reordering and deleting retained content remain available.</p>
                </div>
                <button type="button" onClick={() => { trackFeatureEvent("upgrade_clicked", { surface: "study_library", reason: "ineligible" }); window.location.hash = "#/subscription"; }} className="min-h-11 shrink-0 rounded-full bg-amber-400/15 px-5 text-xs font-black text-amber-100 ring-1 ring-amber-400/30">View plans</button>
              </div>
            ) : canCreate && (atModuleLimit || atResourceLimit || !canCreateResource) ? (
              <div className="flex flex-col gap-3 rounded-3xl border border-amber-400/25 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between" data-library-limit-state>
                <div>
                  <p className="text-sm font-black text-amber-100">Your current plan cannot add more here</p>
                  <p className="mt-0.5 text-xs font-medium leading-5 text-white/60">{!canCreateResource
                    ? "No personal resource types are enabled on this plan. Existing content remains available."
                    : `${personalLimitMessage(atResourceLimit ? "resource" : "module", limits, personal.access?.planName || undefined)} Existing content remains available.`}</p>
                </div>
                <button type="button" onClick={() => { trackFeatureEvent("upgrade_clicked", { surface: "study_library", reason: !canCreateResource ? "resource_types" : atResourceLimit ? "resource_limit" : "module_limit" }); window.location.hash = "#/subscription"; }} className="min-h-11 shrink-0 rounded-full bg-amber-400/15 px-5 text-xs font-black text-amber-100 ring-1 ring-amber-400/30">View plans</button>
              </div>
            ) : null}

            {personal.state === "loading" && !personal.loaded ? <LibrarySkeleton /> : personal.state === "error" && !personal.loaded ? (
              <div className="grid min-h-72 place-items-center rounded-3xl border border-rose-400/20 bg-rose-500/10 p-8 text-center">
                <div><RefreshCw className="mx-auto h-8 w-8 text-rose-200" /><p className="mt-3 font-black">Your library couldn't load</p><p className="mt-1 text-sm text-white/60">{personal.error}</p><button type="button" onClick={personal.reload} className="mt-5 min-h-11 rounded-full bg-white/10 px-5 text-sm font-black">Try again</button></div>
              </div>
            ) : (
              <>
                <section className="grid gap-3 md:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]" aria-label="Search and plan usage">
                  <GlassCard className="!p-4 sm:!p-5">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                      <input
                        ref={searchRef}
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search resources, modules, descriptions…"
                        aria-label="Search study library"
                        className="min-h-13 w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-12 pr-4 text-base font-semibold text-white outline-none placeholder:text-white/35 focus:border-violet-400/60"
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <FilterSelect label="State" value={resourceFilter} onChange={(value) => setResourceFilter(value as ResourceFilter)} options={[
                        ["all", "All resources"], ["saved", "Saved for Later"], ["organized", "In modules"], ["recent-added", "Recently added"], ["recent-opened", "Recently opened"],
                      ]} />
                      <FilterSelect label="Type" value={typeFilter} onChange={setTypeFilter} options={[["all", "All types"], ...dynamicTypes.map((type) => [type, personalCourseTypeLabel(type)] as [string, string])]} />
                      <FilterSelect label="Module" value={moduleFilter} onChange={setModuleFilter} options={[["all", "All modules"], ...personal.allModules.map((module) => [module.id, module.title] as [string, string])]} />
                      <FilterSelect label="Sort" value={sortMode} onChange={(value) => setSortMode(value as SortMode)} options={[["recent", "Newest"], ["opened", "Last opened"], ["name", "Name A–Z"], ["module", "Module order"]]} />
                    </div>
                  </GlassCard>
                  <UsageCard personal={personal} />
                </section>

                {noFilters && (recentOpened.length > 0 || recentAdded.length > 0) ? (
                  <section className="grid gap-3 xl:grid-cols-2" aria-label="Recent resources">
                    <RecentStrip title="Recently opened" icon={Play} resources={recentOpened} onOpen={openResource} onShowAll={() => setResourceFilter("recent-opened")} />
                    <RecentStrip title="Recently added" icon={Sparkles} resources={recentAdded} onOpen={openResource} onShowAll={() => setResourceFilter("recent-added")} />
                  </section>
                ) : null}

                <section aria-labelledby="library-modules-heading">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Organise</p><h2 id="library-modules-heading" className="mt-0.5 text-xl font-black">My Modules</h2></div>
                    <p className="text-xs font-bold text-white/45">Use ↑ ↓ controls to reorder on any device</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <SavedModuleCard count={personal.savedResources.length} active={moduleFilter === "all" && resourceFilter === "saved"} onOpen={() => { setModuleFilter("all"); setResourceFilter("saved"); }} onAdd={() => setDialog({ kind: "resource-create", moduleId: null })} canAdd={canCreateResource && !atResourceLimit} />
                    {visibleModules.map((module) => {
                      const index = personal.allModules.findIndex((item) => item.id === module.id);
                      return <ModuleCard
                        key={module.id}
                        module={module}
                        index={index}
                        count={personal.allModules.length}
                        busy={Boolean(actionBusy)}
                        active={moduleFilter === module.id}
                        onOpen={() => { setModuleFilter(module.id); setResourceFilter("all"); trackFeatureEvent("module_opened", { surface: "study_library" }); }}
                        onAdd={() => setDialog({ kind: "resource-create", moduleId: module.id })}
                        onEdit={() => setDialog({ kind: "module-edit", module })}
                        onDelete={() => setDeleteTarget({ kind: "module", module })}
                        onMove={(delta) => void reorderModule(module, delta)}
                        canAdd={canCreateResource && !atResourceLimit && !usageAtPerModuleLimit(module.resources.length, limits)}
                        onAi={(view) => openModuleAi(module, view || "ask")}
                        onCreatePack={() => setPackModule(module)}
                        onCreateStack={() => setStackModule(module)}
                      />;
                    })}
                    {personal.allModules.length === 0 ? (
                      <button type="button" onClick={() => setDialog({ kind: "module-create" })} disabled={!canCreate} className="min-h-44 rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-5 text-center transition hover:bg-white/[0.05] disabled:opacity-50">
                        <FolderOpen className="mx-auto h-8 w-8 text-white/35" /><p className="mt-3 text-sm font-black">No modules yet</p><p className="mt-1 text-xs font-medium leading-5 text-white/45">Create a module, or save an official resource from the Course Player.</p>
                      </button>
                    ) : null}
                  </div>
                </section>

                <section aria-labelledby="library-resources-heading">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Browse</p><h2 id="library-resources-heading" className="mt-0.5 text-xl font-black">Resources</h2></div>
                    <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-black text-white/60">{visibleResources.length} shown</span>
                  </div>
                  {visibleResources.length ? (
                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3" data-library-resource-grid>
                      {visibleResources.map((resource) => {
                        const siblings = resource.state === "saved" ? personal.savedResources : personal.allModules.find((module) => module.id === resource.personalModuleId)?.resources || [];
                        const index = siblings.findIndex((item) => item.id === resource.id);
                        return <ResourceCard
                          key={`${resource.storageModuleId}:${resource.id}`}
                          resource={resource}
                          moduleTitle={resource.personalModuleId ? moduleTitleById[resource.personalModuleId] : "Saved for Later"}
                          index={index}
                          count={siblings.length}
                          busy={Boolean(actionBusy)}
                          onOpen={() => openResource(resource)}
                          onEdit={() => setDialog({ kind: "resource-edit", resource })}
                          onMoveDestination={() => setDialog({ kind: "move", resource })}
                          onDelete={() => setDeleteTarget({ kind: "resource", resource })}
                          onReorder={(delta) => void reorderResource(resource, delta)}
                          onAi={(view) => openResourceAi(resource, view || "ask")}
                        />;
                      })}
                    </div>
                  ) : <ResourceEmpty filtered={!noFilters} onReset={() => { setQuery(""); setTypeFilter("all"); setModuleFilter("all"); setResourceFilter("all"); }} onAdd={() => setDialog({ kind: "resource-create", moduleId: null })} canAdd={canCreateResource && !atResourceLimit} />}
                </section>
              </>
            )}
          </div>
        </main>
        <BottomNav active="profile" onChange={navigateFromBottom} purchasesBadge={purchasedIds.size} />
      </div>

      <CreateStudyPackDialog open={Boolean(packModule)} module={packModule} onClose={() => setPackModule(null)} />
      <CreateStudyStackDialog
        open={Boolean(stackModule) && !stackSteps}
        module={stackModule}
        onClose={() => setStackModule(null)}
        onStart={(_id, steps) => { setStackSteps(steps); setStackIndex(0); trackFeatureEvent("study_stack_started", { steps: steps.length }); if (steps[0]) openResource(steps[0]); }}
      />
      {stackSteps ? (
        <div className="fixed bottom-20 left-1/2 z-40 flex w-[min(92vw,420px)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-slate-950/90 px-3 py-2 text-xs font-black backdrop-blur">
          <span className="flex-1 truncate">Stack {stackIndex + 1}/{stackSteps.length}</span>
          <button type="button" className="min-h-11 px-3" onClick={() => { const next = Math.max(0, stackIndex - 1); setStackIndex(next); openResource(stackSteps[next]); }}>Prev</button>
          <button type="button" className="min-h-11 px-3" onClick={() => { const next = Math.min(stackSteps.length - 1, stackIndex + 1); setStackIndex(next); openResource(stackSteps[next]); }}>Next</button>
          <button type="button" className="min-h-11 px-3 text-rose-200" onClick={() => { setStackSteps(null); setStackModule(null); }}>Exit</button>
        </div>
      ) : null}
      <LibraryEditorDialog state={dialog} personal={personal} onClose={() => setDialog(null)} />
      <ModuleAiWorkspace
        open={Boolean(aiTarget)}
        onClose={() => setAiTarget(null)}
        uid={user?.id || null}
        moduleId={aiTarget?.moduleId}
        storageModuleId={aiTarget?.storageModuleId}
        moduleTitle={aiTarget?.moduleTitle}
        productId={aiTarget?.productId}
        resourceId={aiTarget?.resourceId}
        resourceTitle={aiTarget?.resourceTitle}
        initialView={aiTarget?.view || "ask"}
        initialQuestion={aiTarget?.question}
        onExpandToModule={aiTarget?.resourceId && aiTarget.storageModuleId
          ? () => setAiTarget((current) => (current ? { ...current, resourceId: null, resourceTitle: undefined, moduleTitle: current.moduleTitle } : current))
          : undefined}
        onOpenResource={(openedResourceId) => {
          const found = allResources.find((row) => row.id === openedResourceId) || null;
          if (found) setViewerResource(found);
        }}
      />
      <LibraryViewerDialog
        resource={viewerResource}
        uid={user.id}
        moduleTitle={viewerResource?.personalModuleId ? moduleTitleById[viewerResource.personalModuleId] : "Saved for Later"}
        onClose={() => setViewerResource(null)}
        onAskAi={(resource) => openResourceAi(resource, "ask")}
        onSummarizeAi={(resource) => openResourceAi(resource, "summary")}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.kind === "module" ? "Delete this module?" : "Delete this resource?"}
        message={deleteTarget?.kind === "module"
          ? `“${deleteTarget.module.title}” and its ${deleteTarget.module.resources.length} resources will be permanently deleted. This can't be undone.`
          : `“${deleteTarget?.resource.name || "This resource"}” will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <div className="min-w-0">
      <GlassSelect value={value} onValueChange={onChange}>
        <GlassSelectTrigger aria-label={label} className="dc-glass-select min-h-11 h-auto w-full text-xs font-black text-white/75" />
        <GlassSelectContent className="dc-glass-select-pop" aria-label={`${label} options`}>
          {options.map(([id, name]) => <GlassSelectItem key={id} value={id}>{name}</GlassSelectItem>)}
        </GlassSelectContent>
      </GlassSelect>
    </div>
  );
}

function UsageCard({ personal }: { personal: PersonalModulesController }) {
  const limits = personal.access?.limits;
  const moduleLimit = limits?.moduleLimit;
  const resourceLimit = limits?.resourceLimit;
  return (
    <GlassCard className="!p-4 sm:!p-5" data-library-plan-usage>
      <div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">Plan usage</p><p className="mt-0.5 truncate text-sm font-black">{personal.access?.planName || "Current account"}{personal.access?.cycle ? ` · ${personal.access.cycle}` : ""}</p></div><Sparkles className="h-5 w-5 text-emerald-300" /></div>
      <UsageLine label="Modules" used={personal.moduleCount} limit={moduleLimit} />
      <UsageLine label="Resources" used={personal.resourceCount} limit={resourceLimit} />
      <p className="mt-3 text-[10px] font-bold leading-4 text-white/45">
        {limits?.perModuleResourceLimit === -1 || limits?.perModuleResourceLimit == null
          ? "Unlimited resources per module"
          : `${limits.perModuleResourceLimit} resources per module`}
        {personal.access ? ` · ${personal.access.allowedTypes.length} resource types` : ""}
      </p>
    </GlassCard>
  );
}
function UsageLine({ label, used, limit }: { label: string; used: number; limit?: number }) {
  return <div className="mt-3"><div className="flex justify-between text-[11px] font-bold text-white/55"><span>{label}</span><span>{used} / {limit === -1 || limit == null ? "∞" : limit}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" style={{ width: `${limit === -1 || limit == null ? 0 : percent(used, limit)}%` }} /></div></div>;
}

function RecentStrip({ title, icon: Icon, resources, onOpen, onShowAll }: { title: string; icon: ComponentType<{ size?: number }>; resources: PersonalCourseResource[]; onOpen: (resource: PersonalCourseResource) => void; onShowAll: () => void }) {
  return <GlassCard className="!p-4"><div className="flex items-center justify-between"><h3 className="inline-flex items-center gap-2 text-sm font-black"><Icon size={16} /> {title}</h3><button type="button" onClick={onShowAll} className="min-h-11 px-2 text-[11px] font-black text-violet-300">Show all</button></div><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{resources.map((resource) => { const IconType = typeIcon(resource.type); return <button key={`${resource.storageModuleId}:${resource.id}`} type="button" onClick={() => onOpen(resource)} className="flex min-h-14 min-w-[180px] max-w-[230px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-left"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200"><IconType size={17} /></span><span className="min-w-0"><span className="block truncate text-xs font-black">{resource.name}</span><span className="block truncate text-[10px] font-bold text-white/40">{resource.lastOpenedAt ? formatDate(resource.lastOpenedAt) : formatDate(resource.createdAt)}</span></span></button>; })}</div></GlassCard>;
}

function SavedModuleCard({ count, active, onOpen, onAdd, canAdd }: { count: number; active: boolean; onOpen: () => void; onAdd: () => void; canAdd: boolean }) {
  return <article className={`flex min-h-44 flex-col rounded-3xl border p-4 ${active ? "border-amber-300/45 bg-amber-500/15" : "border-white/10 bg-white/[0.04]"}`} data-library-saved-bucket><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-500/15 text-amber-200"><Bookmark size={20} /></span><span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-black">{count}</span></div><button type="button" onClick={onOpen} className="mt-3 min-h-11 flex-1 text-left"><h3 className="text-sm font-black">Saved for Later</h3><p className="mt-1 text-xs font-medium leading-5 text-white/45">Unsorted resources waiting for a module.</p></button><button type="button" onClick={onAdd} disabled={!canAdd} className="mt-2 min-h-11 rounded-xl text-[11px] font-black text-amber-100 ring-1 ring-amber-400/20 disabled:opacity-35"><Plus size={13} className="mr-1 inline" />Add link</button></article>;
}

function ModuleCard({ module, index, count, busy, active, onOpen, onAdd, onEdit, onDelete, onMove, canAdd, onAi, onCreatePack, onCreateStack }: { module: PersonalCourseModule; index: number; count: number; busy: boolean; active: boolean; onOpen: () => void; onAdd: () => void; onEdit: () => void; onDelete: () => void; onMove: (delta: number) => void; canAdd: boolean; onAi: (view?: ModuleAiView) => void; onCreatePack: () => void; onCreateStack: () => void }) {
  return <article className={`flex min-h-44 flex-col rounded-3xl border p-4 ${active ? "border-violet-300/45 bg-violet-500/15" : "border-white/10 bg-white/[0.04]"}`} data-library-module={module.id}><div className="flex items-start justify-between gap-2"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-500/15 text-sm font-black text-violet-200">{index + 1}</span><div className="flex"><IconButton label="Move module up" icon={ArrowUp} disabled={busy || index <= 0} onClick={() => onMove(-1)} /><IconButton label="Move module down" icon={ArrowDown} disabled={busy || index >= count - 1} onClick={() => onMove(1)} /></div></div><button type="button" onClick={onOpen} className="mt-2 min-h-12 flex-1 text-left"><h3 className="line-clamp-2 text-sm font-black">{module.title}</h3><p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-white/45">{module.description || `${module.resources.length} ${module.resources.length === 1 ? "resource" : "resources"}`}</p></button><div className="mt-2 flex items-center gap-1"><button type="button" onClick={onAdd} disabled={!canAdd || busy} aria-label={`Add resource to ${module.title}`} title={!canAdd ? "This module has reached a plan limit" : undefined} className="grid h-11 w-11 place-items-center rounded-xl text-violet-200 ring-1 ring-white/10 disabled:opacity-35"><Plus size={15} /></button><button type="button" onClick={() => onAi("ask")} disabled={busy} aria-label={`AI study tools for ${module.title}`} title="AI study tools for this module" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/25 transition hover:bg-violet-500/25 disabled:opacity-25" data-module-ai-open=""><Sparkles size={15} /></button><button type="button" onClick={onCreatePack} disabled={busy} aria-label={`Create Study Pack from ${module.title}`} title="Create Study Pack" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-cyan-200 ring-1 ring-white/10" data-create-study-pack=""><Share2 size={15} /></button><button type="button" onClick={onCreateStack} disabled={busy} aria-label={`Start Study Stack for ${module.title}`} title="Start Study Stack" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-emerald-200 ring-1 ring-white/10" data-start-study-stack=""><Play size={15} /></button><IconButton label={`Rename ${module.title}`} icon={PencilLine} disabled={busy} onClick={onEdit} /><IconButton label={`Delete ${module.title}`} icon={Trash2} disabled={busy} onClick={onDelete} tone="danger" /><button type="button" onClick={onOpen} className="ml-auto inline-flex min-h-11 items-center gap-1 px-2 text-[11px] font-black text-white/60">Open <ChevronRight size={14} /></button></div></article>;
}

function IconButton({ label, icon: Icon, disabled, onClick, tone = "normal" }: { label: string; icon: ComponentType<{ size?: number }>; disabled?: boolean; onClick: () => void; tone?: "normal" | "danger" }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition hover:bg-white/[0.06] disabled:opacity-25 ${tone === "danger" ? "text-rose-300" : "text-white/55"}`}><Icon size={15} /></button>;
}

function ResourceCard({ resource, moduleTitle, index, count, busy, onOpen, onEdit, onMoveDestination, onDelete, onReorder, onAi }: { resource: PersonalCourseResource; moduleTitle: string; index: number; count: number; busy: boolean; onOpen: () => void; onEdit: () => void; onMoveDestination: () => void; onDelete: () => void; onReorder: (delta: number) => void; onAi: (view?: ModuleAiView) => void }) {
  const Icon = typeIcon(resource.type);
  return <article className="group rounded-3xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-white/20" data-library-resource={resource.id}><div className="flex items-start gap-3"><button type="button" onClick={onOpen} aria-label={`Open ${resource.name}`} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-500/12 text-cyan-200 ring-1 ring-cyan-400/20"><Icon size={21} /></button><button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left"><h3 className="line-clamp-2 text-sm font-black leading-5">{resource.name}</h3><p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-white/40">{personalCourseTypeLabel(resource.type)} · {moduleTitle}</p></button><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${resource.originKind === "official" ? "bg-blue-500/15 text-blue-200" : "bg-white/[0.06] text-white/50"}`}>{resource.originKind === "official" ? "Official copy" : "My link"}</span></div>{resource.description ? <p className="mt-3 line-clamp-2 text-xs font-medium leading-5 text-white/50">{resource.description}</p> : null}<div className="mt-3 flex flex-wrap items-center gap-0.5 border-t border-white/[0.07] pt-2"><button type="button" onClick={onOpen} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[11px] font-black text-cyan-200"><Play size={13} /> Open</button><button type="button" onClick={() => onAi("ask")} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[11px] font-black text-violet-200" aria-label={`Ask AI about ${resource.name}`} title="Ask AI about this resource" data-resource-ai-open=""><Sparkles size={13} /> Ask AI</button><IconButton label="Move resource up" icon={ArrowUp} disabled={busy || index <= 0} onClick={() => onReorder(-1)} /><IconButton label="Move resource down" icon={ArrowDown} disabled={busy || index >= count - 1} onClick={() => onReorder(1)} /><IconButton label="Edit resource" icon={PencilLine} disabled={busy} onClick={onEdit} /><button type="button" onClick={onMoveDestination} disabled={busy} className="grid h-11 w-11 place-items-center rounded-xl text-violet-200 disabled:opacity-25" aria-label="Move to another module" title="Move to another module"><MoreHorizontal size={17} /></button><IconButton label="Delete resource" icon={Trash2} disabled={busy} onClick={onDelete} tone="danger" /><span className="ml-auto hidden text-[10px] font-bold text-white/30 sm:block">{formatDate(resource.lastOpenedAt || resource.createdAt)}</span></div></article>;
}

function ResourceEmpty({ filtered, onReset, onAdd, canAdd }: { filtered: boolean; onReset: () => void; onAdd: () => void; canAdd: boolean }) {
  return <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center"><div><Search className="mx-auto h-9 w-9 text-white/30" /><h3 className="mt-3 text-lg font-black">{filtered ? "No matching resources" : "Your library is ready"}</h3><p className="mx-auto mt-1 max-w-sm text-sm font-medium leading-6 text-white/45">{filtered ? "Try another keyword or clear a filter." : "Add your own link here, or open an official course resource and choose Save for Later."}</p><button type="button" onClick={filtered ? onReset : onAdd} disabled={!filtered && !canAdd} className="mt-5 min-h-11 rounded-full bg-violet-600 px-5 text-sm font-black disabled:opacity-40">{filtered ? "Clear filters" : "Add first resource"}</button></div></div>;
}

function LibrarySkeleton() {
  return <div className="space-y-4" role="status" aria-label="Loading My Study Library"><div className="h-40 animate-pulse rounded-3xl bg-white/[0.05]" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-44 animate-pulse rounded-3xl bg-white/[0.05]" />)}</div><div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-3xl bg-white/[0.05]" />)}</div></div>;
}

function LibraryEditorDialog({ state, personal, onClose }: { state: DialogState; personal: PersonalModulesController; onClose: () => void }) {
  if (!state) return null;
  if (state.kind === "module-create" || state.kind === "module-edit") return <ModuleEditorDialog open state={state} personal={personal} onClose={onClose} />;
  if (state.kind === "move") return <MoveResourceDialog open resource={state.resource} personal={personal} onClose={onClose} />;
  return <ResourceEditorDialog open state={state} personal={personal} onClose={onClose} />;
}

function ModuleEditorDialog({ open, state, personal, onClose }: { open: boolean; state: Extract<NonNullable<DialogState>, { kind: "module-create" | "module-edit" }>; personal: PersonalModulesController; onClose: () => void }) {
  const editing = state.kind === "module-edit";
  const [title, setTitle] = useState(editing ? state.module.title : "");
  const [description, setDescription] = useState(editing ? state.module.description : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const submit = async () => {
    if (busyRef.current) return;
    const clean = sanitizePersonalModuleInput({ title, description });
    if (!clean.ok) { setError(clean.errors[0]?.message || "Check the module details."); return; }
    busyRef.current = true; setBusy(true); setError("");
    const result = editing ? await personal.updateModule(state.module.id, clean.value.title, clean.value.description) : await personal.createModule(clean.value.title, clean.value.description);
    busyRef.current = false; setBusy(false);
    if (!result.ok) { setError(result.message || "The module wasn't saved."); return; }
    toast({ title: editing ? "Module renamed" : "Module created", variant: "success" });
    trackFeatureEvent(editing ? "module_renamed" : "module_created", { surface: "study_library" });
    onClose();
  };
  return <Modal open={open} onClose={() => { if (!busy) onClose(); }} title={editing ? "Rename module" : "Create a module"} maxWidth="max-w-lg"><div className="space-y-4"><Field label="Module name" id="library-module-title"><input id="library-module-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={PERSONAL_MODULE_TITLE_MAX} disabled={busy} className={fieldClass} placeholder="e.g. Final exam revision" /></Field><Field label="Description (optional)" id="library-module-description"><textarea id="library-module-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={PERSONAL_MODULE_DESC_MAX} disabled={busy} rows={4} className={`${fieldClass} resize-none py-3`} placeholder="What belongs in this module?" /></Field>{error ? <ErrorBox message={error} /> : null}<DialogButtons busy={busy} submitLabel={editing ? "Save changes" : "Create module"} onCancel={onClose} onSubmit={() => void submit()} /></div></Modal>;
}

function ResourceEditorDialog({ open, state, personal, onClose }: { open: boolean; state: Extract<NonNullable<DialogState>, { kind: "resource-create" | "resource-edit" }>; personal: PersonalModulesController; onClose: () => void }) {
  const editing = state.kind === "resource-edit";
  const existing = editing ? state.resource : null;
  const allowed = personal.access?.allowedTypes || [];
  const choices = existing && !allowed.includes(existing.type) ? [existing.type, ...allowed] : allowed;
  const [moduleId, setModuleId] = useState<string>(editing ? existing!.personalModuleId || "saved" : state.moduleId || "saved");
  const [type, setType] = useState<CourseFileType>(existing?.type || allowed[0] || "youtube");
  const [name, setName] = useState(existing?.name || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [url, setUrl] = useState(existing?.sourceUrl || existing?.url || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const submit = async () => {
    if (busyRef.current) return;
    const clean = sanitizePersonalResourceInput({ type, name, description, url });
    if (!clean.ok) { setError(clean.errors[0]?.message || "Check the resource details."); return; }
    busyRef.current = true; setBusy(true); setError("");
    const fields: PersonalResourceFields = { type: clean.value.type, name: clean.value.name, description: clean.value.description, url };
    const result = editing
      ? await personal.updateResource(existing!.storageModuleId, existing!.id, fields)
      : await personal.createResource(moduleId === "saved" ? null : moduleId, fields);
    busyRef.current = false; setBusy(false);
    if (!result.ok) { setError(result.message || "The resource wasn't saved."); return; }
    toast({ title: result.alreadyExists ? "Already in this destination" : editing ? "Resource updated" : "Resource added", variant: result.alreadyExists ? "info" : "success" });
    trackFeatureEvent(result.alreadyExists ? "resource_duplicate_blocked" : editing ? "resource_updated" : "resource_added", { type: clean.value.type, surface: "study_library" });
    onClose();
  };
  return <Modal open={open} onClose={() => { if (!busy) onClose(); }} title={editing ? "Edit resource" : "Add a resource"} maxWidth="max-w-xl"><div className="space-y-4">{choices.length === 0 ? <p className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">No personal resource types are enabled on your current plan. Existing resources remain available.</p> : null}{!editing ? <Field label="Destination" id="library-resource-destination"><LibrarySelect id="library-resource-destination" value={moduleId} onValueChange={setModuleId} disabled={busy} options={[["saved", "Saved for Later"], ...personal.allModules.map((module) => [module.id, module.title] as [string, string])]} /></Field> : null}<Field label="Resource type" id="library-resource-type"><LibrarySelect id="library-resource-type" value={type} onValueChange={(value) => setType(value as CourseFileType)} disabled={busy || choices.length <= 1} options={choices.map((choice) => [choice, `${personalCourseTypeLabel(choice)}${!allowed.includes(choice) ? " (retained)" : ""}`])} /></Field><Field label="Link" id="library-resource-url"><input id="library-resource-url" autoFocus type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={url} onChange={(event) => setUrl(event.target.value)} disabled={busy} className={fieldClass} placeholder="https://…" /></Field><Field label="Name (optional)" id="library-resource-name"><input id="library-resource-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={PERSONAL_RESOURCE_NAME_MAX} disabled={busy} className={fieldClass} placeholder="A useful title" /></Field><Field label="Details (optional)" id="library-resource-description"><textarea id="library-resource-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={PERSONAL_RESOURCE_DESC_MAX} disabled={busy} rows={3} className={`${fieldClass} resize-none py-3`} placeholder="A note about this resource" /></Field>{error ? <ErrorBox message={error} /> : null}<DialogButtons busy={busy} disabled={choices.length === 0} submitLabel={editing ? "Save changes" : "Add resource"} onCancel={onClose} onSubmit={() => void submit()} /></div></Modal>;
}

function MoveResourceDialog({ open, resource, personal, onClose }: { open: boolean; resource: PersonalCourseResource; personal: PersonalModulesController; onClose: () => void }) {
  const [destination, setDestination] = useState(resource.state === "saved" ? personal.allModules[0]?.id || "" : "saved");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const submit = async () => {
    if (!destination || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    const result = await personal.moveResourceTo(resource, destination === "saved" ? null : destination);
    busyRef.current = false; setBusy(false);
    if (!result.ok) { setError(result.message || "The resource wasn't moved."); return; }
    toast({ title: result.data?.moved === false ? "Already there" : "Resource moved", variant: result.data?.moved === false ? "info" : "success" });
    trackFeatureEvent("resource_moved", { from: resource.state, to: destination === "saved" ? "saved" : "module" });
    onClose();
  };
  const destinations = personal.allModules.filter((module) => module.id !== resource.personalModuleId);
  return <Modal open={open} onClose={() => { if (!busy) onClose(); }} title="Move resource" maxWidth="max-w-lg"><div className="space-y-4"><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-sm font-black">{resource.name}</p><p className="mt-1 text-xs text-white/45">Choose a different module or Saved for Later. The move only completes after the server confirms it.</p></div><Field label="Destination" id="library-move-destination"><LibrarySelect id="library-move-destination" autoFocus value={destination} onValueChange={setDestination} disabled={busy} options={[...(resource.state !== "saved" ? [["saved", "Saved for Later"] as [string, string]] : []), ...destinations.map((module) => [module.id, `${module.title} · ${module.resources.length} resources`] as [string, string])]} /></Field>{!destination ? <p className="text-sm text-white/50">Create a module first to organise this saved resource.</p> : null}{error ? <ErrorBox message={error} /> : null}<DialogButtons busy={busy} disabled={!destination} submitLabel="Move resource" onCancel={onClose} onSubmit={() => void submit()} /></div></Modal>;
}

function LibraryViewerDialog({ resource, uid, moduleTitle, onClose, onAskAi, onSummarizeAi }: { resource: PersonalCourseResource | null; uid: string; moduleTitle: string; onClose: () => void; onAskAi: (resource: PersonalCourseResource) => void; onSummarizeAi: (resource: PersonalCourseResource) => void }) {
  const [actions, setActions] = useState<CourseFileActions | null>(null);
  const [desktopView, setDesktopView] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
  const [playback, setPlayback] = useState<CoursePlaybackStore>(() => loadPlaybackStore(uid, "__study_library__"));
  const file = resource ? personalResourceToCourseFile(resource) : null;
  useEffect(() => { setActions(null); }, [resource?.id, resource?.storageModuleId]);
  const handleActions = useCallback((_fileId: string, next: CourseFileActions | null) => setActions(next), []);
  const handlePlayback = useCallback((fileId: string, patch: CoursePlaybackPatch) => {
    setPlayback((current) => {
      const next = { ...current };
      mergePlaybackEntry(next, fileId, patch);
      persistPlaybackStore(uid, "__study_library__", next);
      return next;
    });
  }, [uid]);
  return <Modal open={Boolean(resource)} onClose={onClose} title={resource?.name || "Resource viewer"} maxWidth="max-w-[min(96vw,1200px)]"><div className="course-player-shell -m-1 flex min-h-0 flex-col" data-library-resource-viewer><div className="mb-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-violet-200">My Study Library → {moduleTitle}</span>{resource?.originKind === "official" ? <span className="rounded-full bg-blue-500/15 px-3 py-1 text-[10px] font-black uppercase text-blue-200">Personal copy of official resource</span> : null}<button type="button" onClick={() => setDesktopView((value) => !value)} className="ml-auto min-h-11 rounded-full px-3 text-[11px] font-black text-white/65 ring-1 ring-white/10">{desktopView ? "Mobile view" : "Desktop view"}</button>{resource ? <button type="button" onClick={() => onAskAi(resource)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-violet-500/15 px-3 text-[11px] font-black text-violet-100 ring-1 ring-violet-400/25" data-resource-ai-viewer-ask=""><Sparkles size={13} /> Ask AI about this</button> : null}{resource ? <button type="button" onClick={() => onSummarizeAi(resource)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[11px] font-black text-white/65 ring-1 ring-white/10" data-resource-ai-viewer-summary=""><BookOpen size={13} /> Summarize</button> : null}{actions?.externalUrl ? <a href={actions.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[11px] font-black text-cyan-200 ring-1 ring-cyan-400/20">Open original <ExternalLink size={13} /></a> : null}</div><div className="h-[min(68dvh,760px)] min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-black/30"><ResourceViewer file={file} active={Boolean(resource)} playback={playback} onPlaybackChange={handlePlayback} onFileActions={handleActions} desktopView={desktopView} /></div></div></Modal>;
}

const fieldClass = "min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-violet-400/60 disabled:opacity-50";
function LibrarySelect({ id, value, onValueChange, options, disabled, autoFocus }: { id: string; value: string; onValueChange: (value: string) => void; options: [string, string][]; disabled?: boolean; autoFocus?: boolean }) {
  return (
    <GlassSelect value={value} onValueChange={onValueChange}>
      <GlassSelectTrigger id={id} aria-label={id.replace(/-/g, " ")} disabled={disabled} autoFocus={autoFocus} className="dc-glass-select min-h-12 h-auto w-full rounded-2xl px-4 text-sm font-semibold" />
      <GlassSelectContent className="dc-glass-select-pop" aria-label={`${id.replace(/-/g, " ")} options`}>
        {options.map(([optionValue, optionLabel]) => <GlassSelectItem key={optionValue} value={optionValue}>{optionLabel}</GlassSelectItem>)}
      </GlassSelectContent>
    </GlassSelect>
  );
}
function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) { return <div><label htmlFor={id} className="mb-1.5 block text-xs font-black text-white/70">{label}</label>{children}</div>; }
function ErrorBox({ message }: { message: string }) { return <p role="alert" className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100">{message}</p>; }
function DialogButtons({ busy, disabled, submitLabel, onCancel, onSubmit }: { busy: boolean; disabled?: boolean; submitLabel: string; onCancel: () => void; onSubmit: () => void }) { return <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-full border border-white/10 px-5 text-sm font-black text-white/70 disabled:opacity-40">Cancel</button><button type="button" onClick={onSubmit} disabled={busy || disabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-600 px-5 text-sm font-black text-white disabled:opacity-40">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{busy ? "Saving…" : submitLabel}</button></div>; }
