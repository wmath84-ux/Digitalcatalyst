"use client";

// Admin · Product editor — Modules & Resources editor.
//
// The previous ModulesEditor was a long vertical list of module cards,
// each with a nested list of resources. On a phone that meant the
// admin had to scroll through every module — even modules they
// weren't editing — to find the resource they wanted to change.
//
// The new layout uses the same drill-down pattern as the Curriculum
// Builder:
//   • A pill rail at the top of the page lists every module.
//   • Picking a module shows ONLY that module's card.
//   • The card exposes a second pill rail with that module's
//     resources. Picking a resource shows ONLY that resource's
//     card.
//   • Each rail ends with a + pill that adds a new module /
//     resource (auto-focus on the freshly created item).
//   • When the admin opens a module the Resources rail reveals
//     itself automatically — so the "Module → Resources" drill is
//     always one tap away.
//
// All the existing business logic (add / update / delete for both
// modules and resources, sort order, move-to-module, parent
// hierarchy, paid-update linkage, image / URL / Cloudinary upload
// for image-type resources, advanced settings sheet) is preserved
// byte-for-byte. This is a UI/UX-only refactor.

import { useEffect, useMemo, useState } from "react";
import {
  Field,
  Pill,
  SecondaryButton,
  inputClass,
  selectClass,
  textareaClass,
} from "@/components/admin/ui";
import { CloudinaryImageUploadField, imageProviderFromUrl } from "@/components/admin/products/CloudinaryImageUploadField";
import PracticeSetImportPanel from "@/components/admin/products/PracticeSetImportPanel";
import AdminExperimentEditor from "@/components/admin/products/ExperimentEditor";
import BlockNoteResourceEditor from "@/components/admin/products/BlockNoteResourceEditor";
import MindMapResourceEditor from "@/components/admin/products/MindMapResourceEditor";
import { normalizeResourceUrl } from "../../../../utils/productMapping";
import { experimentBlockingIssues } from "@/utils/experimentSpec";
import {
  countIncompletePracticeQuestions,
  normalizePracticeQuestions,
  practiceQuestionsExplained,
  practiceQuestionsReady,
} from "../../../../utils/practiceSet.js";
import { ADMIN_PRODUCT_RESOURCE_TYPES, registerNoteResourceType } from "../../../../utils/productResourceTypes.js";
import { MAX_NOTE_HTML_LENGTH } from "../../../../utils/courseNotes.js";
import { getFirebaseStorage } from "../../../../firebase";
import {
  buildReadStoragePath,
  normalizeReadResourceUrl,
  normalizeReadSourceKind,
  READ_PDF_MAX_BYTES,
} from "../../../../utils/readResources.js";
import type { PaidUpdate, ProductModule, ProductResource } from "@/lib/admin/types";

type ReadUploadResult = { url: string; storagePath: string; fileName: string; fileSize: number };

// Validate / register the first-class note type against the shared data-layer
// registry. This is idempotent even if a legacy registry already contains a
// `block_note` / `Block Note` alias.
const RESOURCE_TYPE_REGISTRY = registerNoteResourceType(ADMIN_PRODUCT_RESOURCE_TYPES);
const RESOURCE_TYPES = RESOURCE_TYPE_REGISTRY.map((entry) => entry.value);
const RESOURCE_TYPE_LABELS = Object.fromEntries(
  RESOURCE_TYPE_REGISTRY.map((entry) => [entry.value, entry.label]),
) as Record<string, string>;

function providerForType(type: ProductResource["type"]) {
  // The Brain practice set is the ONE resource type with no external provider:
  // its content is the question list the admin imports below. An experiment is
  // the same idea — its content is the HTML designed in the panel below.
  if (type === "brain") return "Brain";
  if (type === "interactive") return "Experiment";
  if (type === "read") return "Read library";
  if (type === "note") return "BlockNote";
  if (type === "mind_map") return "Mind Map";
  if (type === "youtube") return "YouTube";
  if (["gdrive", "gdoc", "gsheet", "gslides", "gform"].includes(type)) return "Google";
  if (type === "whimsical") return "Whimsical";
  return "Public URL";
}

function genLocalId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ------------------------------------------------------------------ */
/* Pill rail — mobile-first dropdown                                    */
/* ------------------------------------------------------------------ */

interface PillRailProps<T> {
  label: string;
  items: T[];
  keyOf: (item: T) => string;
  labelOf: (item: T) => string;
  iconOf?: (item: T) => string | undefined;
  activeKey: string | null;
  onSelect: (key: string | null) => void;
  onAdd: () => void;
  totalLabel?: string;
  emptyHint?: string;
}

function PillRail<T>({
  label,
  items,
  keyOf,
  labelOf,
  iconOf,
  activeKey,
  onSelect,
  onAdd,
  totalLabel,
  emptyHint,
}: PillRailProps<T>) {
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white px-2 py-2"
      data-pill-rail
      data-pill-rail-label={label}
    >
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            {label}
          </span>
          {totalLabel ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
              {totalLabel}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onAdd}
          data-pill-action="add"
          className="grid h-7 w-7 place-items-center rounded-full bg-indigo-600 text-base font-bold text-white active:bg-indigo-700"
          aria-label={`Add ${label.replace(/s$/, "").toLowerCase()}`}
          title={`Add ${label.replace(/s$/, "").toLowerCase()}`}
        >
          +
        </button>
      </div>
      <div
        className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1.5 pb-1 pt-0.5"
        data-pill-rail-scroll
      >
        {items.length === 0 ? (
          <span className="rounded-full bg-slate-50 px-3 py-1.5 text-[11px] text-slate-400">
            {emptyHint ?? `No ${label.toLowerCase()} yet — tap + to add.`}
          </span>
        ) : (
          items.map((item) => {
            const k = keyOf(item);
            const active = k === activeKey;
            const icon = iconOf?.(item) ?? "";
            return (
              <button
                key={k}
                type="button"
                onClick={() => onSelect(active ? null : k)}
                aria-pressed={active}
                data-pill-rail-pill
                data-pill-key={k}
                data-pill-active={active ? "true" : "false"}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 active:bg-slate-100"
                }`}
              >
                {icon ? <span aria-hidden>{icon}</span> : null}
                <span className="max-w-[160px] truncate">{labelOf(item)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

interface ModulesResourcesEditorProps {
  productId: string;
  modules: ProductModule[];
  onChange: (modules: ProductModule[]) => void;
  paidUpdates: PaidUpdate[];
  onReadUploadAdded: (storagePath: string) => void;
}

export default function ModulesResourcesEditor({
  productId,
  modules,
  onChange,
  paidUpdates,
  onReadUploadAdded,
}: ModulesResourcesEditorProps) {
  // Focus state — at any moment at most one module is in focus,
  // and at most one resource in that module is in focus. The
  // resource rail only renders once a module is picked, so it
  // "auto-opens" right after the admin taps a module pill.
  const [activeModuleId, setActiveModuleId] = useState<string | null>(
    modules[0]?.id ?? null,
  );
  const [activeResourceId, setActiveResourceId] = useState<string | null>(null);

  // When the modules list changes (admin added/deleted one), keep
  // focus sane: if the focused module is gone, fall back to the
  // first one. If a new module was added and there's no focus
  // yet, focus the first one so the page never lands on a blank
  // state.
  useEffect(() => {
    if (modules.length === 0) {
      setActiveModuleId(null);
      setActiveResourceId(null);
      return;
    }
    if (!activeModuleId || !modules.some((module) => module.id === activeModuleId)) {
      setActiveModuleId(modules[0].id);
      setActiveResourceId(null);
    }
  }, [modules, activeModuleId]);

  // Switching modules clears the focused resource (the new module
  // probably has different resources). Switching to a module
  // without any resources clears focus on its own (it is null
  // already), and the resource rail just shows its empty hint.
  useEffect(() => {
    setActiveResourceId(null);
  }, [activeModuleId]);

  const activeModule = useMemo(
    () => modules.find((module) => module.id === activeModuleId) ?? null,
    [modules, activeModuleId],
  );
  const activeResource = useMemo(
    () =>
      activeModule?.resources.find((resource) => resource.id === activeResourceId) ?? null,
    [activeModule, activeResourceId],
  );

  const totalResources = useMemo(
    () => modules.reduce((count, module) => count + (module.resources || []).length, 0),
    [modules],
  );

  async function uploadReadPdf(
    resourceId: string,
    file: File,
    onProgress: (progress: number) => void,
  ): Promise<ReadUploadResult> {
    if (!productId) throw new Error("Save the product draft before uploading a Read PDF.");
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) {
      throw new Error("Choose a PDF file (application/pdf).");
    }
    if (file.size <= 0 || file.size >= READ_PDF_MAX_BYTES) {
      throw new Error(`PDFs must be smaller than ${Math.floor(READ_PDF_MAX_BYTES / 1024 / 1024)} MiB.`);
    }
    const storagePath = buildReadStoragePath(productId, resourceId);
    if (!storagePath) throw new Error("Could not create an owned Storage path for this resource.");
    const storage = await getFirebaseStorage();
    const { ref, uploadBytesResumable, getDownloadURL, deleteObject } = await import("firebase/storage");
    const target = ref(storage, storagePath);
    try {
      const downloadUrl = await new Promise<string>((resolve, reject) => {
        const task = uploadBytesResumable(target, file, { contentType: "application/pdf" });
        task.on(
          "state_changed",
          (snapshot) => onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
          reject,
          async () => {
            try {
              resolve(await getDownloadURL(task.snapshot.ref));
            } catch (error) {
              reject(error);
            }
          },
        );
      });
      const url = normalizeReadResourceUrl(downloadUrl, "upload", {
        productId,
        resourceId,
        storagePath,
        fileSize: file.size,
      });
      if (!url) throw new Error("The uploaded PDF URL did not match this resource's Storage object.");
      onReadUploadAdded(storagePath);
      return { url, storagePath, fileName: file.name.slice(0, 255), fileSize: file.size };
    } catch (error) {
      // A failed URL lookup or interrupted transfer must not leave an unowned
      // object behind. The catch intentionally does not mask the upload error.
      try {
        await deleteObject(target);
      } catch {
        // A partial/canceled upload may have no object to remove.
      }
      throw error;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Module mutations                                                 */
  /* ---------------------------------------------------------------- */

  function addModule(): string {
    const id = genLocalId("mod");
    const next: ProductModule = {
      id,
      title: `Module ${modules.length + 1}`,
      description: "",
      sortOrder: modules.length,
      visibility: "visible",
      active: true,
      accessLevel: "included",
      individuallyPurchasable: false,
      cashPrice: null,
      salePrice: null,
      coinPrice: null,
      includeInBundle: true,
      previewAvailable: false,
      requiredPreviousModuleIds: [],
      entitlementId: id,
      badge: null,
      parentModuleId: null,
      resources: [],
    };
    onChange([...modules, next]);
    setActiveModuleId(id);
    setActiveResourceId(null);
    return id;
  }

  function updateModule(id: string, patch: Partial<ProductModule>) {
    onChange(modules.map((module) => (module.id === id ? { ...module, ...patch } : module)));
  }

  function descendantsOf(id: string) {
    const ids = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const module of modules) {
        if (module.parentModuleId === id || (module.parentModuleId && ids.has(module.parentModuleId))) {
          if (!ids.has(module.id)) {
            ids.add(module.id);
            changed = true;
          }
        }
      }
    }
    return ids;
  }

  function removeModule(id: string) {
    const descendants = descendantsOf(id);
    descendants.add(id);
    onChange(modules.filter((module) => !descendants.has(module.id)));
    if (activeModuleId === id) {
      setActiveModuleId(null);
      setActiveResourceId(null);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Resource mutations                                                */
  /* ---------------------------------------------------------------- */

  function addResource(moduleId: string): string {
    const id = genLocalId("res");
    const module = modules.find((item) => item.id === moduleId);
    const resource: ProductResource = {
      id,
      name: `Resource ${(module?.resources.length || 0) + 1}`,
      type: "youtube",
      url: "",
      provider: "YouTube",
      sortOrder: module?.resources.length || 0,
      visibility: "visible",
      accessLevel: "included",
      individuallyPurchasable: false,
      paidUpdateId: null,
      cashPrice: null,
      salePrice: null,
      coinPrice: null,
      entitlementId: id,
      parentModuleId: moduleId,
    };
    onChange(
      modules.map((item) =>
        item.id === moduleId ? { ...item, resources: [...(item.resources || []), resource] } : item,
      ),
    );
    setActiveResourceId(id);
    return id;
  }

  function updateResource(moduleId: string, resourceId: string, patch: Partial<ProductResource>) {
    onChange(
      modules.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              resources: (module.resources || []).map((resource) =>
                resource.id === resourceId ? { ...resource, ...patch } : resource,
              ),
            }
          : module,
      ),
    );
  }

  function removeResource(moduleId: string, resourceId: string) {
    onChange(
      modules.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              resources: (module.resources || [])
                .filter((resource) => resource.id !== resourceId)
                .map((resource, index) => ({ ...resource, sortOrder: index })),
            }
          : module,
      ),
    );
    if (activeResourceId === resourceId) setActiveResourceId(null);
  }

  function moveResourceToModule(resourceId: string, fromModuleId: string, toModuleId: string) {
    if (fromModuleId === toModuleId) return;
    const resource = modules
      .find((module) => module.id === fromModuleId)
      ?.resources.find((item) => item.id === resourceId);
    if (!resource) return;
    onChange(
      modules.map((module) => {
        if (module.id === fromModuleId) {
          return {
            ...module,
            resources: module.resources
              .filter((item) => item.id !== resourceId)
              .map((item, index) => ({ ...item, sortOrder: index })),
          };
        }
        if (module.id === toModuleId) {
          return {
            ...module,
            resources: [
              ...module.resources,
              { ...resource, parentModuleId: toModuleId, sortOrder: module.resources.length },
            ],
          };
        }
        return module;
      }),
    );
    setActiveModuleId(toModuleId);
    setActiveResourceId(resourceId);
  }

  function moveResourceWithinModule(moduleId: string, index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    const module = modules.find((item) => item.id === moduleId);
    if (!module || nextIndex < 0 || nextIndex >= module.resources.length) return;
    const resources = [...module.resources];
    [resources[index], resources[nextIndex]] = [resources[nextIndex], resources[index]];
    onChange(
      modules.map((item) =>
        item.id === moduleId
          ? { ...item, resources: resources.map((resource, sortOrder) => ({ ...resource, sortOrder })) }
          : item,
      ),
    );
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-3" data-admin-modules-editor>
      {/* Stats strip */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
        <p className="text-sm font-semibold text-indigo-950">Modules and resources</p>
        <p className="mt-1 text-xs leading-5 text-indigo-700">
          Pick a module from the rail below, then pick a resource — only the focused card shows its settings. Adding
          a new one is always one tap on the + pill.
        </p>
        <p className="mt-2 text-[11px] font-semibold text-indigo-900">
          {modules.length} module(s) · {totalResources} resource(s)
        </p>
      </div>

      {/* Module rail */}
      <PillRail
        label="Modules"
        items={modules}
        keyOf={(module) => module.id}
        labelOf={(module) => module.title || "Untitled module"}
        iconOf={() => "📚"}
        activeKey={activeModuleId}
        onSelect={(key) => setActiveModuleId(key)}
        onAdd={addModule}
        totalLabel={modules.length ? String(modules.length) : undefined}
        emptyHint="No modules yet — tap + to add the first one."
      />

      {/* Focused module card (only the active one) */}
      {activeModule ? (
        <div
          data-admin-module-card
          data-module-id={activeModule.id}
          className="space-y-3 rounded-xl border border-indigo-300 bg-white p-3 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">1</span>
              <p className="text-sm font-semibold text-slate-900">Module details</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this module and all of its resources? This cannot be undone.")) {
                  removeModule(activeModule.id);
                }
              }}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 active:bg-red-100"
            >
              Delete module
            </button>
          </div>

          <Field label="Module title" required>
            <input
              className={inputClass}
              value={activeModule.title}
              onChange={(event) => updateModule(activeModule.id, { title: event.target.value })}
              placeholder="e.g. Chapter 1 — Real Numbers"
            />
          </Field>

          <Field label="Module description">
            <textarea
              className={textareaClass}
              value={activeModule.description}
              onChange={(event) => updateModule(activeModule.id, { description: event.target.value })}
              placeholder="What will the learner know after this module?"
            />
          </Field>

          {/* Resources rail — only renders when a module is focused, so
              the drill from "module" → "resource" is one tap. */}
          <div className="border-t border-slate-200 pt-3" data-admin-resource-rail>
            <PillRail
              label={`Resources in “${activeModule.title || "Untitled module"}”`}
              items={activeModule.resources || []}
              keyOf={(resource) => resource.id}
              labelOf={(resource) => resource.name || "Untitled resource"}
              iconOf={() => "🎬"}
              activeKey={activeResourceId}
              onSelect={(key) => setActiveResourceId(key)}
              onAdd={() => addResource(activeModule.id)}
              totalLabel={activeModule.resources?.length ? String(activeModule.resources.length) : undefined}
              emptyHint="No resources yet — tap + to add the first URL."
            />
          </div>

          {/* Focused resource card (only the active one) */}
          {activeResource ? (
            <ResourceCard
              module={activeModule}
              resource={activeResource}
              productId={productId}
              onUpdate={(patch) => updateResource(activeModule.id, activeResource.id, patch)}
              onUploadReadPdf={uploadReadPdf}
              onRemove={() => {
                if (window.confirm("Delete this resource?")) {
                  removeResource(activeModule.id, activeResource.id);
                }
              }}
              onMoveUp={() => {
                const index = activeModule.resources.findIndex((r) => r.id === activeResource.id);
                if (index > 0) moveResourceWithinModule(activeModule.id, index, -1);
              }}
              onMoveDown={() => {
                const index = activeModule.resources.findIndex((r) => r.id === activeResource.id);
                if (index < activeModule.resources.length - 1) {
                  moveResourceWithinModule(activeModule.id, index, 1);
                }
              }}
              onMoveToModule={(toModuleId) =>
                moveResourceToModule(activeResource.id, activeModule.id, toModuleId)
              }
              modules={modules}
              paidUpdates={paidUpdates}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 px-3 py-6 text-center text-xs text-slate-500">
              Pick a resource above to edit its URL, type and pricing — or tap + to add one.
            </p>
          )}

          <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
              Advanced module settings
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Access level">
                  <select
                    className={selectClass}
                    value={activeModule.accessLevel}
                    onChange={(event) => {
                      const accessLevel = event.target.value as ProductModule["accessLevel"];
                      updateModule(activeModule.id, {
                        accessLevel,
                        individuallyPurchasable:
                          accessLevel === "purchasable" ? true : activeModule.individuallyPurchasable,
                      });
                    }}
                  >
                    <option value="included">Included</option>
                    <option value="purchasable">Individually purchasable</option>
                    <option value="paid_update">Paid update</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </Field>
                <Field label="Parent module">
                  <select
                    className={selectClass}
                    value={activeModule.parentModuleId ?? ""}
                    onChange={(event) => updateModule(activeModule.id, { parentModuleId: event.target.value || null })}
                  >
                    <option value="">None (root)</option>
                    {modules
                      .filter((other) => other.id !== activeModule.id && !descendantsOf(activeModule.id).has(other.id))
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.title}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Sort order">
                  <input
                    className={inputClass}
                    type="number"
                    value={activeModule.sortOrder}
                    onChange={(event) => updateModule(activeModule.id, { sortOrder: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Badge">
                  <input
                    className={inputClass}
                    value={activeModule.badge ?? ""}
                    onChange={(event) => updateModule(activeModule.id, { badge: event.target.value || null })}
                    placeholder="e.g. NEW"
                  />
                </Field>
                <Field label="Cash price (₹)">
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    value={activeModule.cashPrice ?? ""}
                    onChange={(event) =>
                      updateModule(activeModule.id, { cashPrice: event.target.value === "" ? null : Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label="Sale price (₹)">
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    value={activeModule.salePrice ?? ""}
                    onChange={(event) =>
                      updateModule(activeModule.id, { salePrice: event.target.value === "" ? null : Number(event.target.value) })
                    }
                  />
                </Field>
              </div>
              <Field
                label="Required previous module IDs"
                hint="Comma separated module ids that the learner must complete first."
              >
                <input
                  className={inputClass}
                  value={activeModule.requiredPreviousModuleIds.join(", ")}
                  onChange={(event) => updateModule(activeModule.id, { requiredPreviousModuleIds: event.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
                />
              </Field>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={activeModule.individuallyPurchasable}
                    onChange={(event) => updateModule(activeModule.id, { individuallyPurchasable: event.target.checked })}
                  />
                  Individually purchasable
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={activeModule.includeInBundle}
                    onChange={(event) => updateModule(activeModule.id, { includeInBundle: event.target.checked })}
                  />
                  Include in full bundle
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={activeModule.previewAvailable}
                    onChange={(event) => updateModule(activeModule.id, { previewAvailable: event.target.checked })}
                  />
                  Preview available
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={activeModule.active}
                    onChange={(event) => updateModule(activeModule.id, { active: event.target.checked })}
                  />
                  Active
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={activeModule.visibility === "visible"}
                    onChange={(event) => updateModule(activeModule.id, { visibility: event.target.checked ? "visible" : "hidden" })}
                  />
                  Visible
                </label>
              </div>
            </div>
          </details>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No modules yet — tap the + on the Modules rail to add the first one.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resource card (extracted for readability)                            */
/* ------------------------------------------------------------------ */

function ResourceCard({
  module,
  resource,
  productId,
  onUpdate,
  onUploadReadPdf,
  onRemove,
  onMoveUp,
  onMoveDown,
  onMoveToModule,
  modules,
  paidUpdates,
}: {
  module: ProductModule;
  resource: ProductResource;
  productId: string;
  onUpdate: (patch: Partial<ProductResource>) => void;
  onUploadReadPdf: (resourceId: string, file: File, onProgress: (progress: number) => void) => Promise<ReadUploadResult>;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToModule: (moduleId: string) => void;
  modules: ProductModule[];
  paidUpdates: PaidUpdate[];
}) {
  const isRead = resource.type === "read";
  const readSourceKind = isRead
    ? normalizeReadSourceKind(resource.readSourceKind, resource.readStoragePath)
    : "pdf_url";
  const cleanUrl = isRead
    ? normalizeReadResourceUrl(resource.url, readSourceKind, {
        productId,
        resourceId: resource.id,
        storagePath: resource.readStoragePath,
        fileSize: resource.readFileSize,
      })
    : normalizeResourceUrl(resource.url, resource.type);
  const [readUploadProgress, setReadUploadProgress] = useState<number | null>(null);
  const [readUploadError, setReadUploadError] = useState("");
  const index = module.resources.findIndex((r) => r.id === resource.id);
  const isFirst = index === 0;
  const isLast = index === module.resources.length - 1;

  // A Brain resource is the ONE type that is ready WITHOUT a URL: its content
  // is the practice set below. An experiment is the same idea — its content is
  // the HTML designed in the panel below (or a hosted page). Everything else
  // keeps the URL-ready rule.
  const isBrain = resource.type === "brain";
  const brainQuestions = normalizePracticeQuestions(resource.practiceQuestions);
  // Two rules, on purpose: `brainReady` is what the Course Player can run,
  // `brainExplained` is the admin's publish rule on top of it — an explanation
  // on every question is NEVER optional (owner rule, 2026-10-07).
  const brainReady = isBrain && practiceQuestionsReady(resource.practiceQuestions);
  const brainExplained = brainReady && practiceQuestionsExplained(resource.practiceQuestions);
  const brainIncomplete = isBrain ? countIncompletePracticeQuestions(resource.practiceQuestions) : 0;
  const isExperiment = resource.type === "interactive";
  const isNote = resource.type === "note";
  const isMindMap = resource.type === "mind_map";
  const noteHtmlLength = String(resource.noteHtml || "").length;
  const noteReady = isNote && Boolean(resource.name.trim()) && noteHtmlLength <= MAX_NOTE_HTML_LENGTH;
  const mindMapReady = isMindMap && Boolean(resource.name.trim()) && Boolean(resource.mindMapData);
  const experimentHtml = isExperiment ? String(resource.interactiveHtml || "") : "";
  const experimentHosted = isExperiment && Boolean(cleanUrl);
  const experimentErrors = isExperiment && experimentHtml.trim() ? experimentBlockingIssues(experimentHtml) : [];
  const experimentReady = isExperiment && (Boolean(experimentHtml.trim()) || experimentHosted) && experimentErrors.length === 0;
  const readyForPlayer = isBrain ? brainExplained : isExperiment ? experimentReady : isNote ? noteReady : isMindMap ? mindMapReady : Boolean(cleanUrl);

  return (
    <article
      data-admin-resource-card
      data-resource-id={resource.id}
      data-resource-type={resource.type}
      className={`space-y-3 rounded-xl border p-3 ${readyForPlayer ? "border-slate-200 bg-slate-50/60" : isBrain || isExperiment || isNote ? "border-amber-300 bg-amber-50/40" : "border-red-300 bg-red-50/30"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Resource {index + 1} · {module.title || "Untitled module"}
        </p>
        {isBrain ? (
          <Pill tone={brainExplained ? "success" : "warn"}>
            {brainQuestions.length === 0
              ? "Questions required"
              : brainExplained
                ? `${brainQuestions.length} question${brainQuestions.length === 1 ? "" : "s"} ready`
                : `${brainQuestions.length} question${brainQuestions.length === 1 ? "" : "s"} · ${Math.max(brainIncomplete, 1)} to fix`}
          </Pill>
        ) : isExperiment ? (
          <Pill tone={experimentReady ? "success" : experimentErrors.length ? "danger" : "warn"}>
            {!experimentHtml.trim() && !experimentHosted
              ? "Source required"
              : experimentErrors.length
                ? `${experimentErrors.length} error${experimentErrors.length === 1 ? "" : "s"} to fix`
                : "Experiment ready"}
          </Pill>
        ) : isRead ? (
          <Pill tone={cleanUrl ? "success" : "warn"}>{cleanUrl ? "Read source ready" : "Source required"}</Pill>
        ) : isNote ? (
          <Pill tone={noteReady ? "success" : "warn"}>{noteReady ? "Master note ready" : noteHtmlLength > MAX_NOTE_HTML_LENGTH ? "Note too long" : "Add a title"}</Pill>
        ) : isMindMap ? (
          <Pill tone={mindMapReady ? "success" : "warn"}>{mindMapReady ? "Mind map ready" : "Add mind map data"}</Pill>
        ) : (
          <Pill tone={cleanUrl ? "success" : "danger"}>{cleanUrl ? "URL ready" : "URL required"}</Pill>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Resource name" required>
          <input
            className={inputClass}
            placeholder="e.g. Chapter 1 video"
            value={resource.name}
            onChange={(event) => onUpdate({ name: event.target.value })}
          />
        </Field>
        <Field label="Resource type" required>
          <select
            className={selectClass}
            value={resource.type}
            disabled={readUploadProgress !== null}
            onChange={(event) => {
              const type = event.target.value as ProductResource["type"];
              if (type === "read") {
                onUpdate({
                  type,
                  provider: providerForType(type),
                  url: "",
                  readSourceKind: "pdf_url",
                  readStoragePath: undefined,
                  readFileName: undefined,
                  readFileSize: undefined,
                  noteHtml: undefined,
                  noteSource: undefined,
                  ownerType: undefined,
                  ownerId: undefined,
                  courseId: undefined,
                  moduleId: undefined,
                });
              } else if (type === "note") {
                onUpdate({
                  type,
                  provider: providerForType(type),
                  url: "",
                  noteSource: "master",
                  ownerType: "course",
                  ownerId: productId || undefined,
                  courseId: productId || undefined,
                  moduleId: module.id,
                  noteHtml: resource.type === "note" ? resource.noteHtml : "",
                  parentModuleId: module.id,
                  readSourceKind: undefined,
                  readStoragePath: undefined,
                  readFileName: undefined,
                  readFileSize: undefined,
                });
              } else if (type === "mind_map") {
                onUpdate({
                  type,
                  provider: providerForType(type),
                  url: "",
                  mindMapData: resource.type === "mind_map" ? resource.mindMapData : undefined,
                  mindMapSourceMode: resource.type === "mind_map" ? resource.mindMapSourceMode : undefined,
                  mindMapRootTopic: resource.type === "mind_map" ? resource.mindMapRootTopic : undefined,
                  readSourceKind: undefined,
                  readStoragePath: undefined,
                  readFileName: undefined,
                  readFileSize: undefined,
                  noteHtml: undefined,
                  noteSource: undefined,
                  ownerType: undefined,
                  ownerId: undefined,
                  courseId: undefined,
                  moduleId: undefined,
                });
              } else {
                onUpdate({
                  type,
                  provider: providerForType(type),
                  readSourceKind: undefined,
                  readStoragePath: undefined,
                  readFileName: undefined,
                  readFileSize: undefined,
                  noteHtml: undefined,
                  noteSource: undefined,
                  ownerType: undefined,
                  ownerId: undefined,
                  courseId: undefined,
                  moduleId: undefined,
                });
              }
            }}
          >
            {RESOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {RESOURCE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {isBrain ? (
        <PracticeSetImportPanel
          questions={brainQuestions}
          title={resource.practiceTitle || ""}
          resourceName={resource.name}
          onChange={({ questions, title }) =>
            onUpdate({
              // Normalise for storage (caps, ids, difficulty) but keep drafts:
              // `normalizePracticeQuestions` only drops entries with no text at
              // all, which the panel never produces (a blank question is kept
              // until the admin removes it).
              practiceQuestions: questions.map((question, questionIndex) => ({
                ...question,
                id: String(question.id || `q${questionIndex + 1}`),
              })),
              practiceTitle: title || undefined,
            })
          }
        />
      ) : isExperiment ? (
        <div className="space-y-3">
          <Field
            label="Hosted experiment link (optional)"
            hint="Only for experiments too big to store — the player uses this only when the HTML box below is empty."
          >
            <textarea
              className={`${textareaClass} min-h-[52px] bg-white`}
              placeholder="https://…"
              value={resource.url}
              onChange={(event) => onUpdate({ url: event.target.value })}
              onBlur={() => {
                const normalized = normalizeResourceUrl(resource.url, resource.type);
                if (normalized && normalized !== resource.url) {
                  onUpdate({ url: normalized });
                }
              }}
            />
          </Field>
          {/* The Study Library's experiment builder, re-skinned for the admin
              panel: AI prompt → paste/upload/template → live preview → checks. */}
          <AdminExperimentEditor resource={resource} onChange={onUpdate} />
        </div>
      ) : isRead ? (
        <div className="space-y-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
          <Field label="Read source" required hint="PDF sources open in the locally bundled PDF.js viewer; generic websites open in a sandboxed embed.">
            <select
              className={selectClass}
              value={readSourceKind}
              disabled={readUploadProgress !== null}
              onChange={(event) => {
                const nextKind = event.target.value as NonNullable<ProductResource["readSourceKind"]>;
                onUpdate({
                  readSourceKind: nextKind,
                  url: "",
                  readStoragePath: undefined,
                  readFileName: undefined,
                  readFileSize: undefined,
                });
                setReadUploadError("");
              }}
            >
              <option value="upload">Upload a PDF</option>
              <option value="gdrive">Google Drive PDF</option>
              <option value="pdf_url">Direct PDF URL</option>
              <option value="embed_url">Generic embed URL</option>
            </select>
          </Field>

          {readSourceKind === "upload" ? (
            <div className="space-y-2 rounded-lg border border-violet-100 bg-white p-3">
              <p className="text-xs leading-5 text-slate-600">
                PDF files must be smaller than {Math.floor(READ_PDF_MAX_BYTES / 1024 / 1024)} MiB. Replacing a PDF keeps the previous file until this product save succeeds.
              </p>
              {!productId ? (
                <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">Save the product draft first, then upload the PDF.</p>
              ) : null}
              <label className={`inline-flex cursor-pointer items-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 ${!productId || readUploadProgress !== null ? "pointer-events-none opacity-50" : ""}`}>
                {readUploadProgress === null ? (resource.readFileName ? "Replace PDF" : "Choose PDF") : `Uploading ${readUploadProgress}%`}
                <input
                  className="sr-only"
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={!productId || readUploadProgress !== null}
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    input.value = "";
                    if (!file) return;
                    setReadUploadError("");
                    setReadUploadProgress(0);
                    try {
                      const uploaded = await onUploadReadPdf(resource.id, file, setReadUploadProgress);
                      onUpdate({
                        url: uploaded.url,
                        readSourceKind: "upload",
                        readStoragePath: uploaded.storagePath,
                        readFileName: uploaded.fileName,
                        readFileSize: uploaded.fileSize,
                      });
                    } catch (error) {
                      setReadUploadError(error instanceof Error ? error.message : "PDF upload failed.");
                    } finally {
                      setReadUploadProgress(null);
                    }
                  }}
                />
              </label>
              {readUploadProgress !== null ? (
                <progress className="block h-2 w-full accent-violet-600" max={100} value={readUploadProgress} aria-label="PDF upload progress" />
              ) : null}
              {resource.readFileName && cleanUrl ? (
                <p className="text-xs text-emerald-700">
                  {resource.readFileName} · {((resource.readFileSize || 0) / (1024 * 1024)).toFixed(2)} MiB
                </p>
              ) : null}
              {readUploadError ? <p role="alert" className="text-xs font-medium text-red-700">{readUploadError}</p> : null}
            </div>
          ) : (
            <div className="space-y-2">
              <Field
                label={readSourceKind === "gdrive" ? "Google Drive share URL" : readSourceKind === "pdf_url" ? "Direct PDF URL" : "Generic embed URL"}
                required
                hint={readSourceKind === "gdrive"
                  ? "Paste a drive.google.com share link and set its access to “Anyone with the link”. Drive blocks direct browser reads of its files, so learners view it in Google Drive's own viewer inside the Read tab."
                  : readSourceKind === "pdf_url"
                    ? "The host must allow browser CORS access for PDF.js to read the PDF."
                    : "Enter a URL only, not iframe HTML. It will open in a sandboxed frame."}
              >
                <textarea
                  className={`${textareaClass} min-h-[72px] bg-white ${cleanUrl ? "border-emerald-300" : "border-slate-200"}`}
                  placeholder={readSourceKind === "gdrive" ? "https://drive.google.com/file/d/…/view" : "https://…"}
                  value={resource.url || ""}
                  onChange={(event) => onUpdate({
                    url: event.target.value,
                    readSourceKind,
                    readStoragePath: undefined,
                    readFileName: undefined,
                    readFileSize: undefined,
                  })}
                  onBlur={() => {
                    const normalized = normalizeReadResourceUrl(resource.url, readSourceKind);
                    if (normalized && normalized !== resource.url) onUpdate({ url: normalized });
                  }}
                />
              </Field>
              {resource.url?.trim() && !cleanUrl ? (
                <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700">
                  Enter a safe public HTTPS URL. Private/local hosts, IP addresses, credentials, Firebase Storage URLs and iframe HTML are not accepted.
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : isNote ? (
        <BlockNoteResourceEditor resource={resource} onChange={onUpdate} />
      ) : isMindMap ? (
        <MindMapResourceEditor resource={resource} onChange={onUpdate} />
      ) : resource.type === "image_url" ? (
        <div className="space-y-3 rounded-xl border border-indigo-100 bg-white p-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Image source</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Paste your own public or embed URL, or upload directly to Cloudinary — same as product images.
            </p>
          </div>
          <Field
            label="Your image / embed URL"
            required
            hint="Public HTTPS image URL, Cloudinary URL, or iframe embed code."
          >
            <textarea
              className={`${textareaClass} min-h-[76px] bg-white ${cleanUrl ? "border-emerald-300" : "border-red-300"}`}
              placeholder={'https://… or <iframe src="https://…"></iframe>'}
              value={resource.url}
              onChange={(event) =>
                onUpdate({ url: event.target.value, provider: imageProviderFromUrl(event.target.value) })
              }
              onBlur={() => {
                const normalized = normalizeResourceUrl(resource.url, resource.type);
                if (normalized && normalized !== resource.url) {
                  onUpdate({ url: normalized, provider: imageProviderFromUrl(normalized) });
                }
              }}
            />
          </Field>
          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">or</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <CloudinaryImageUploadField
            folder="module-images"
            tags={["module", "resource"]}
            onUploaded={(hostedUrl) => onUpdate({ url: hostedUrl, provider: "Cloudinary" })}
          />
          {cleanUrl ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cleanUrl}
                alt=""
                className="h-32 w-full object-cover"
                onError={(event) => ((event.target as HTMLImageElement).style.opacity = "0.2")}
              />
              <p className="truncate px-2 py-1.5 text-[11px] text-slate-500">{cleanUrl}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <Field
          label="Resource URL / YouTube ID / iframe code"
          required
          hint="Paste the link here. Full iframe embed code is also accepted and cleaned automatically."
        >
          <textarea
            className={`${textareaClass} min-h-[76px] bg-white ${cleanUrl ? "border-emerald-300" : "border-red-300"}`}
            placeholder={'https://… or <iframe src="https://…"></iframe>'}
            value={resource.url}
            onChange={(event) => onUpdate({ url: event.target.value })}
            onBlur={() => {
              const normalized = normalizeResourceUrl(resource.url, resource.type);
              if (normalized && normalized !== resource.url) {
                onUpdate({ url: normalized });
              }
            }}
          />
        </Field>
      )}

      {!cleanUrl && !isBrain && !isExperiment && !isNote && !isMindMap ? (
        <p className="rounded-lg bg-red-100 p-2 text-xs font-medium text-red-700">
          Add a valid public URL before publishing. This resource cannot appear in the player yet.
        </p>
      ) : null}
      {isNote && !noteReady ? (
        <p className="rounded-lg bg-amber-100 p-2 text-xs font-medium text-amber-800" data-admin-note-validation>
          {noteHtmlLength > MAX_NOTE_HTML_LENGTH
            ? `This Block Note exceeds ${MAX_NOTE_HTML_LENGTH.toLocaleString()} serialized body characters. Shorten it before saving or publishing.`
            : "Add a title to this Block Note before saving or publishing."}
        </p>
      ) : null}
      {isBrain && !brainReady ? (
        <p className="rounded-lg bg-amber-100 p-2 text-xs font-medium text-amber-800">
          Every practice question needs text, two options and a marked answer. The set only reaches the learner&apos;s Brain tab once it is
          complete — drafts stay saved here meanwhile.
        </p>
      ) : null}
      {isMindMap && !mindMapReady ? (
        <p className="rounded-lg bg-amber-100 p-2 text-xs font-medium text-amber-800">
          Add mind map data using either the code import or scratch builder. The mind map will appear in the Course Player once complete.
        </p>
      ) : null}
      {isExperiment && !experimentReady ? (
        <p className="rounded-lg bg-amber-100 p-2 text-xs font-medium text-amber-800">
          {experimentErrors.length
            ? "This experiment has errors the player cannot run past — fix them in the panel above before publishing."
            : "Paste the HTML the AI gave you (or upload the .html file, or start from a template) — an experiment with no source cannot open in the player."}
        </p>
      ) : null}
      {resource.type === "whimsical" ? (
        <p className="text-[11px] text-slate-500">Whimsical → Share → Enable Public Access → Copy URL.</p>
      ) : null}

      <details className="rounded-lg border border-slate-200 bg-white p-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">Advanced resource settings</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Move to module">
            <select className={selectClass} value={module.id} onChange={(event) => onMoveToModule(event.target.value)}>
              {modules.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title || "Untitled module"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Access">
            <select
              className={selectClass}
              value={resource.accessLevel}
              onChange={(event) => onUpdate({ accessLevel: event.target.value as ProductResource["accessLevel"] })}
            >
              <option value="included">Included</option>
              <option value="purchasable">Purchasable</option>
              <option value="paid_update">Paid update</option>
              <option value="hidden">Hidden</option>
            </select>
          </Field>
          <Field label="Paid update package">
            <select
              className={selectClass}
              value={resource.paidUpdateId ?? ""}
              onChange={(event) => onUpdate({ paidUpdateId: event.target.value || null })}
            >
              <option value="">None</option>
              {paidUpdates.map((update) => (
                <option key={update.id} value={update.id}>
                  {update.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Visibility">
            <select
              className={selectClass}
              value={resource.visibility}
              onChange={(event) => onUpdate({ visibility: event.target.value as ProductResource["visibility"] })}
            >
              <option value="visible">Visible</option>
              <option value="hidden">Hidden</option>
            </select>
          </Field>
          <Field label="Regular price (₹)">
            <input
              className={inputClass}
              type="number"
              min="0"
              value={resource.cashPrice ?? ""}
              onChange={(event) =>
                onUpdate({ cashPrice: event.target.value === "" ? null : Number(event.target.value) })
              }
            />
          </Field>
          <Field label="Sale price (₹)">
            <input
              className={inputClass}
              type="number"
              min="0"
              value={resource.salePrice ?? ""}
              onChange={(event) =>
                onUpdate({ salePrice: event.target.value === "" ? null : Number(event.target.value) })
              }
            />
          </Field>
          <Field label="EduCoin price">
            <input
              className={inputClass}
              type="number"
              min="0"
              value={resource.coinPrice ?? ""}
              onChange={(event) =>
                onUpdate({ coinPrice: event.target.value === "" ? null : Number(event.target.value) })
              }
            />
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={Boolean(resource.individuallyPurchasable)}
            onChange={(event) =>
              onUpdate({
                individuallyPurchasable: event.target.checked,
                accessLevel: event.target.checked
                  ? "purchasable"
                  : resource.accessLevel === "purchasable"
                  ? "included"
                  : resource.accessLevel,
              })
            }
          />
          Learners can purchase this resource separately
        </label>
      </details>

      <div className="flex flex-wrap gap-2">
        {/* An inline-only experiment has no URL to open — the button appears
            only when a hosted link is set. */}
        {/* A mind map keeps its content in the editor, never behind a link. */}
        {!isBrain && !isMindMap && (!isExperiment || cleanUrl) ? (
          <SecondaryButton
            className="h-9 px-3 text-xs"
            disabled={!cleanUrl}
            onClick={() => cleanUrl && window.open(cleanUrl, "_blank", "noopener,noreferrer")}
          >
            Open URL
          </SecondaryButton>
        ) : null}
        <SecondaryButton className="h-9 px-3 text-xs" disabled={isFirst} onClick={onMoveUp}>
          ↑ Up
        </SecondaryButton>
        <SecondaryButton className="h-9 px-3 text-xs" disabled={isLast} onClick={onMoveDown}>
          ↓ Down
        </SecondaryButton>
        <button
          type="button"
          className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 active:bg-red-50"
          onClick={onRemove}
        >
          Delete resource
        </button>
      </div>
    </article>
  );
}
