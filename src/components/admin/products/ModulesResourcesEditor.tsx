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
import { normalizeResourceUrl } from "../../../../utils/productMapping";
import type { PaidUpdate, ProductModule, ProductResource } from "@/lib/admin/types";

const RESOURCE_TYPES = [
  "youtube",
  "video_url",
  "audio_url",
  "image_url",
  "gdrive",
  "pdf",
  "gdoc",
  "gsheet",
  "gslides",
  "gform",
  "ebook",
  "github_pages",
  "whimsical",
  "iframe",
] as const;

const RESOURCE_TYPE_LABELS: Record<(typeof RESOURCE_TYPES)[number], string> = {
  youtube: "YouTube",
  video_url: "Video URL (MP4/web)",
  audio_url: "Audio URL",
  image_url: "Image (URL or Cloudinary)",
  gdrive: "Google Drive",
  pdf: "PDF",
  gdoc: "Google Doc",
  gsheet: "Google Sheet",
  gslides: "Google Slides",
  gform: "Google Form",
  ebook: "E-book",
  github_pages: "GitHub Pages",
  whimsical: "Whimsical",
  iframe: "Other embed / iframe",
};

function providerForType(type: ProductResource["type"]) {
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
  modules: ProductModule[];
  onChange: (modules: ProductModule[]) => void;
  paidUpdates: PaidUpdate[];
}

export default function ModulesResourcesEditor({
  modules,
  onChange,
  paidUpdates,
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
              onUpdate={(patch) => updateResource(activeModule.id, activeResource.id, patch)}
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
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onMoveToModule,
  modules,
  paidUpdates,
}: {
  module: ProductModule;
  resource: ProductResource;
  onUpdate: (patch: Partial<ProductResource>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToModule: (moduleId: string) => void;
  modules: ProductModule[];
  paidUpdates: PaidUpdate[];
}) {
  const cleanUrl = normalizeResourceUrl(resource.url, resource.type);
  const index = module.resources.findIndex((r) => r.id === resource.id);
  const isFirst = index === 0;
  const isLast = index === module.resources.length - 1;

  return (
    <article
      data-admin-resource-card
      data-resource-id={resource.id}
      className={`space-y-3 rounded-xl border p-3 ${cleanUrl ? "border-slate-200 bg-slate-50/60" : "border-red-300 bg-red-50/30"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Resource {index + 1} · {module.title || "Untitled module"}
        </p>
        <Pill tone={cleanUrl ? "success" : "danger"}>{cleanUrl ? "URL ready" : "URL required"}</Pill>
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
            onChange={(event) => {
              const type = event.target.value as ProductResource["type"];
              onUpdate({ type, provider: providerForType(type) });
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

      {resource.type === "image_url" ? (
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

      {!cleanUrl ? (
        <p className="rounded-lg bg-red-100 p-2 text-xs font-medium text-red-700">
          Add a valid public URL before publishing. This resource cannot appear in the player yet.
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
        <SecondaryButton
          className="h-9 px-3 text-xs"
          disabled={!cleanUrl}
          onClick={() => cleanUrl && window.open(cleanUrl, "_blank", "noopener,noreferrer")}
        >
          Open URL
        </SecondaryButton>
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
