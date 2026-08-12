// src/components/pdp/PdpPurchaseBuilder.tsx
//
// Part 3: customer-facing Product Detail Page purchase builder.
//
// Renders the three (or four) purchase modes against a single product,
// the module/resource selector, the dependency + already-owned enforcement,
// the dynamic summary panel, and the CTA. The CTA builds a canonical
// `CheckoutSelection` (Part 1 type) and stores it in
// `sessionStorage["pdpPreviewSelection"]` for the debug preview handler. No
// Razorpay / coupon / EduCoin logic is implemented in this part.
//
// The component is mobile-first: every layout-breaking utility class has a
// small-screen counterpart so the build renders without horizontal overflow
// at viewport widths down to 320px (verified in
// `tests/pdpPurchaseBuilderMobileWidths.test.mjs`).

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgePercent,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  Eye,
  Info,
  Lock,
  Package,
  PackageOpen,
  PlayCircle,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Unlock,
} from "lucide-react";
import type {
  CanonicalCourseModule,
  CanonicalCourseResource,
  CanonicalPaidUpdate,
  CheckoutSelection,
} from "@/types/commerce";
import type { Product } from "@/data/products";
import {
  buildCheckoutSelection,
  computeSummary,
  getAvailableModes,
  getAvailablePaidUpdates,
  getBundleModules,
  getIsModuleOwned,
  getIsResourceOwned,
  getModuleEffectivePrice,
  getPurchasableModules,
  getPurchasableResources,
  getResourceEffectivePrice,
  validateSelection,
  type PdpPurchaseMode,
} from "../../../utils/pdpSelection";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PdpPurchaseBuilderProps {
  product: Product;
  /** Base product ownership. Comes from `CatalogContext.purchasedIds`. */
  isProductOwned: boolean;
  /** Paid-update ids already owned by the user for this product. */
  ownedUpdateIds: ReadonlySet<string> | readonly string[];
  /** Per-module ownership. Empty set for Part 3 (plumbed for future). */
  ownedModuleIds?: ReadonlySet<string> | readonly string[];
  /**
   * Per-resource ownership. Part 10 — the canonical resolver
   * feeds these so a resource-only purchase is recognised.
   */
  ownedResourceIds?: ReadonlySet<string> | readonly string[];
  /** Hash to return to after a successful preview (debug-only for Part 3). */
  returnRoute?: string | null;
  /**
   * Called when the user activates a CTA. The handler receives a canonical
   * `CheckoutSelection` that the rest of the app can verify later. For
   * Part 3 the default handler stores the selection in
   * `sessionStorage["pdpPreviewSelection"]` and shows a toast.
   */
  onPreview?: (selection: CheckoutSelection, summary: ReturnType<typeof computeSummary>) => void;
}

const DEFAULT_RETURN_ROUTE = "#/store/purchases";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatPrice = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return null;
  if (value === 0) return "Free";
  return `₹${value.toLocaleString("en-IN")}`;
};

const formatPriceValue = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return null;
  return `₹${value.toLocaleString("en-IN")}`;
};

const RESOURCE_TYPE_LABEL = {
  youtube: "YouTube",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  doc: "Google Doc",
  sheet: "Google Sheet",
  image: "Image",
  google_form: "Google Form",
  ebook: "E-book",
  embed: "Embed",
  mindmap: "Mind map",
};

const RESOURCE_TYPE_ICON = {
  youtube: PlayCircle,
  video: PlayCircle,
  audio: PlayCircle,
  pdf: Package,
  doc: Package,
  sheet: Package,
  image: Package,
  google_form: Package,
  ebook: Package,
  embed: Package,
  mindmap: Sparkles,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PdpPurchaseBuilder({
  product,
  isProductOwned,
  ownedUpdateIds,
  ownedModuleIds,
  ownedResourceIds,
  returnRoute,
  onPreview,
}: PdpPurchaseBuilderProps) {
  const modules = (product.canonicalModules || []) as CanonicalCourseModule[];
  const paidUpdates = (product.paidUpdates || []) as CanonicalPaidUpdate[];

  const purchasableModules = useMemo(() => getPurchasableModules(modules), [modules]);
  const bundleModules = useMemo(() => getBundleModules(modules), [modules]);
  const purchasableResources = useMemo(() => getPurchasableResources(modules), [modules]);
  const availableUpdates = useMemo(
    () => getAvailablePaidUpdates(paidUpdates, ownedUpdateIds),
    [paidUpdates, ownedUpdateIds],
  );

  const availableModes = useMemo(
    () =>
      getAvailableModes({
        isProductOwned,
        hasAnyPurchasableModule: purchasableModules.length > 0,
        hasAnyPurchasableResource: purchasableResources.length > 0,
        hasAnyPaidUpdate: availableUpdates.length > 0,
      }),
    [isProductOwned, purchasableModules, purchasableResources, availableUpdates],
  );

  // Default mode: prefer full_product if available, else selected_modules, else paid_update.
  const [mode, setMode] = useState<PdpPurchaseMode>(() => {
    if (availableModes.includes("full_product")) return "full_product";
    if (availableModes.includes("selected_modules")) return "selected_modules";
    if (availableModes.includes("selected_resources")) return "selected_resources";
    if (availableModes.includes("paid_update")) return "paid_update";
    return "free_entitlement";
  });

  // If the current mode becomes unavailable (e.g. user switches from full to modules and
  // the product has no purchasable modules), fall back to the next best mode.
  useEffect(() => {
    if (!availableModes.includes(mode)) {
      setMode(availableModes[0] || "free_entitlement");
    }
  }, [availableModes, mode]);

  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<string>>(() => new Set());
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(() => new Set());
  const [selectedUpdateId, setSelectedUpdateId] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => new Set());
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);

  const ownershipState = useMemo(
    () => ({
      isProductOwned,
      ownedUpdateIds,
      ownedModuleIds: ownedModuleIds || [],
      ownedResourceIds: ownedResourceIds || [],
    }),
    [isProductOwned, ownedUpdateIds, ownedModuleIds, ownedResourceIds],
  );

  // Validation
  const validation = useMemo(
    () =>
      validateSelection({
        mode,
        selectedIds:
          mode === "paid_update"
            ? new Set(selectedUpdateId ? [selectedUpdateId] : [])
            : mode === "selected_modules"
              ? selectedModuleIds
              : selectedResourceIds,
        modules,
        isProductOwned,
        ownedUpdateIds,
        ownedModuleIds,
      }),
    [mode, selectedModuleIds, selectedResourceIds, selectedUpdateId, modules, isProductOwned, ownedUpdateIds, ownedModuleIds],
  );

  // Summary
  const summary = useMemo(
    () =>
      computeSummary({
        product,
        mode,
        selectedIds:
          mode === "paid_update"
            ? new Set(selectedUpdateId ? [selectedUpdateId] : [])
            : mode === "selected_modules"
              ? selectedModuleIds
              : selectedResourceIds,
        modules,
        paidUpdates,
        isProductOwned,
        ownedUpdateIds,
        ownedModuleIds,
      }),
    [product, mode, selectedModuleIds, selectedResourceIds, selectedUpdateId, modules, paidUpdates, isProductOwned, ownedUpdateIds, ownedModuleIds],
  );

  // ---- Handlers ----

  const toggleModule = (id: string) => {
    setSelectedModuleIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // Re-validate after toggle to give the user immediate feedback on
        // dependencies. The summary panel re-derives everything anyway.
        next.add(id);
        const check = validateSelection({
          mode: "selected_modules",
          selectedIds: next,
          modules,
          isProductOwned,
          ownedUpdateIds,
          ownedModuleIds,
        });
        if (!check.ok) {
          setPreviewNotice(check.reason);
          return current; // ignore
        }
        // Auto-add dependencies.
        const module = modules.flatMap((m) => [m, ...(m.modules || [])]).find((m) => m.id === id);
        if (module) {
          for (const depId of module.requiredPreviousModuleIds || []) {
            if (!next.has(depId)) {
              const depModule = (modules.flatMap((m) => [m, ...(m.modules || [])])).find((m) => m.id === depId);
              if (depModule && !getIsModuleOwned(depModule, ownershipState) && depModule.individuallyPurchasable) {
                next.add(depId);
              }
            }
          }
        }
      }
      setPreviewNotice(null);
      return next;
    });
  };

  const toggleResource = (id: string) => {
    setSelectedResourceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandModule = (id: string) => {
    setExpandedModules((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePreview = () => {
    if (!validation.ok) {
      setPreviewNotice(validation.reason);
      return;
    }
    const selection = buildCheckoutSelection({
      product,
      mode,
      selectedIds: mode === "paid_update"
        ? new Set(selectedUpdateId ? [selectedUpdateId] : [])
        : mode === "selected_modules"
          ? selectedModuleIds
          : selectedResourceIds,
      paidUpdateId: selectedUpdateId,
      returnRoute: returnRoute || DEFAULT_RETURN_ROUTE,
    });
    if (onPreview) {
      onPreview(selection, summary);
    } else {
      try {
        sessionStorage.setItem("pdpPreviewSelection", JSON.stringify({ selection, summary, savedAt: Date.now() }));
      } catch {
        /* sessionStorage may be unavailable in some test environments */
      }
      setPreviewNotice(`Preview saved: ${selection.purchaseKind} · ${summary.selectedCount} item(s) · ${formatPrice(summary.effectiveSubtotal) || "₹0"}`);
      // Debug visibility — easy to inspect in the console.
      // eslint-disable-next-line no-console
      console.log("[PDP] CheckoutSelection preview", selection, summary);
    }
  };

  // ---- Render helpers ----

  if (availableModes.length === 0) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-black">This course has nothing to buy yet.</p>
            <p className="mt-1 text-xs text-amber-700/80">Come back later — the admin is still setting it up.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-pdp-purchase-builder>
      <ModeSwitcher modes={availableModes} mode={mode} onChange={setMode} />

      {mode === "full_product" && (
        <FullCoursePanel
          modules={bundleModules}
          isProductOwned={isProductOwned}
          fullCourse={summary.fullCourse}
        />
      )}

      {mode === "selected_modules" && (
        <ModuleSelector
          modules={purchasableModules}
          allModules={modules}
          selectedIds={selectedModuleIds}
          expandedIds={expandedModules}
          ownershipState={ownershipState}
          onToggle={toggleModule}
          onExpand={expandModule}
        />
      )}

      {mode === "selected_resources" && (
        <ResourceSelector
          resources={purchasableResources}
          modules={modules}
          selectedIds={selectedResourceIds}
          ownershipState={ownershipState}
          onToggle={toggleResource}
        />
      )}

      {mode === "paid_update" && (
        <PaidUpdateSelector
          updates={availableUpdates}
          selectedId={selectedUpdateId}
          onSelect={setSelectedUpdateId}
        />
      )}

      <SummaryPanel summary={summary} />

      <CtaBar
        mode={mode}
        summary={summary}
        isProductOwned={isProductOwned}
        validation={validation}
        previewNotice={previewNotice}
        onPreview={handlePreview}
        onClearNotice={() => setPreviewNotice(null)}
      />
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function ModeSwitcher({ modes, mode, onChange }: { modes: PdpPurchaseMode[]; mode: PdpPurchaseMode; onChange: (m: PdpPurchaseMode) => void }) {
  const labels: Record<PdpPurchaseMode, { short: string; long: string; icon: typeof Tag }> = {
    full_product: { short: "Full course", long: "Full course", icon: Package },
    selected_modules: { short: "Modules", long: "Choose modules", icon: PackageOpen },
    selected_resources: { short: "Resources", long: "Resources", icon: Unlock },
    paid_update: { short: "Update", long: "Paid update", icon: BadgePercent },
    free_entitlement: { short: "Free", long: "Free", icon: Sparkles },
  };
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Purchase mode">
      {modes.map((m) => {
        const isActive = mode === m;
        const Icon = labels[m].icon;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(m)}
            className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-xs font-black transition sm:text-sm ${
              isActive
                ? "border-violet-600 bg-violet-600 text-white shadow-md shadow-violet-200"
                : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:text-violet-700"
            }`}
          >
            <Icon size={14} className="shrink-0" />
            <span className="truncate">{labels[m].short}</span>
          </button>
        );
      })}
    </div>
  );
}

function FullCoursePanel({
  modules,
  isProductOwned,
  fullCourse,
}: {
  modules: CanonicalCourseModule[];
  isProductOwned: boolean;
  fullCourse: { regularPrice: number; salePrice: number | null; effectivePrice: number };
}) {
  const discount =
    fullCourse.regularPrice > fullCourse.effectivePrice && fullCourse.regularPrice > 0
      ? Math.round(((fullCourse.regularPrice - fullCourse.effectivePrice) / fullCourse.regularPrice) * 100)
      : 0;
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {isProductOwned ? (
        <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-black">You already own this course</p>
            <p className="mt-1 text-xs text-emerald-700/80">Open it from your library to start learning.</p>
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-end gap-2 sm:gap-3">
        <span className="text-3xl font-black sm:text-4xl">
          {isProductOwned ? "Owned" : formatPrice(fullCourse.effectivePrice) || "Free"}
        </span>
        {!isProductOwned && fullCourse.salePrice !== null && fullCourse.salePrice < fullCourse.regularPrice ? (
          <span className="pb-1 text-base text-slate-400 line-through sm:text-lg">
            {formatPriceValue(fullCourse.regularPrice)}
          </span>
        ) : null}
        {!isProductOwned && discount > 0 ? (
          <span className="mb-1 rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">
            SAVE {discount}%
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Full course · {modules.length} module{modules.length === 1 ? "" : "s"} · Lifetime access
      </p>
      <div className="mt-4">
        <p className="text-xs font-black uppercase tracking-wider text-slate-400">What's included</p>
        <ul className="mt-2 space-y-1.5 text-xs text-slate-600 sm:text-sm">
          {modules.slice(0, 6).map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="truncate">{m.title}</span>
            </li>
          ))}
          {modules.length > 6 ? (
            <li className="text-xs font-semibold text-slate-500">+ {modules.length - 6} more module{modules.length - 6 === 1 ? "" : "s"}</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

type ModuleSelectorOwnership = {
  isProductOwned: boolean;
  ownedUpdateIds: ReadonlySet<string> | readonly string[];
  ownedModuleIds?: ReadonlySet<string> | readonly string[];
  ownedResourceIds?: ReadonlySet<string> | readonly string[];
};

function ModuleSelector({
  modules,
  allModules,
  selectedIds,
  expandedIds,
  ownershipState,
  onToggle,
  onExpand,
}: {
  modules: CanonicalCourseModule[];
  allModules: CanonicalCourseModule[];
  selectedIds: Set<string>;
  expandedIds: Set<string>;
  ownershipState: ModuleSelectorOwnership;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
}) {
  if (modules.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        No modules are sold individually for this course.
      </div>
    );
  }
  const allFlat = allModules.flatMap((m) => [m, ...(m.modules || [])]);
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-black uppercase tracking-wider text-slate-400">
        Individually purchasable modules
      </p>
      {modules.map((m) => {
        const isSelected = selectedIds.has(m.id);
        const isExpanded = expandedIds.has(m.id);
        const isOwned = getIsModuleOwned(m, ownershipState);
        const price = getModuleEffectivePrice(m);
        const regular = m.cashPrice;
        const sale = m.salePrice;
        const depIds = m.requiredPreviousModuleIds || [];
        const deps = depIds.map((id) => allFlat.find((x) => x.id === id)).filter(Boolean) as CanonicalCourseModule[];
        const depsMissing = deps.filter((d) => !selectedIds.has(d.id) && !getIsModuleOwned(d, ownershipState));
        return (
          <article
            key={m.id}
            data-pdp-module
            data-module-id={m.id}
            className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
              isSelected ? "border-violet-500 ring-2 ring-violet-200" : "border-slate-200"
            }`}
          >
            <div className="flex items-start gap-3 p-3 sm:p-4">
              <button
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                disabled={isOwned}
                onClick={() => onToggle(m.id)}
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition ${
                  isOwned
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                    : isSelected
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-300 bg-white"
                }`}
              >
                {isOwned ? <Lock size={12} /> : isSelected ? <Check size={14} /> : null}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 truncate text-sm font-black text-slate-900">{m.title}</h3>
                  {m.badge ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
                      {m.badge}
                    </span>
                  ) : null}
                  {m.previewAvailable ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                      <Eye size={10} /> Preview
                    </span>
                  ) : null}
                  {isOwned ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      <CircleCheck size={10} /> Owned
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500 sm:text-sm">
                  {m.description || `${m.resources.length} resource${m.resources.length === 1 ? "" : "s"} included.`}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
                  <span className="font-bold text-slate-500">
                    {m.resources.length} resource{m.resources.length === 1 ? "" : "s"}
                  </span>
                  {price !== null ? (
                    <>
                      <span className="font-black text-slate-900">{formatPrice(price)}</span>
                      {sale !== null && sale < (regular ?? Number.POSITIVE_INFINITY) ? (
                        <span className="text-slate-400 line-through">{formatPriceValue(regular)}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-slate-400">Bundle only</span>
                  )}
                  {m.coinPrice && m.coinPrice > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-700">
                      <Tag size={10} /> {m.coinPrice} coins
                    </span>
                  ) : null}
                </div>
                {deps.length > 0 ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Requires: {deps.map((d) => d.title).join(" · ")}
                    {depsMissing.length > 0 ? (
                      <span className="ml-1 inline-flex items-center gap-1 text-amber-700">
                        <AlertTriangle size={10} /> Auto-added on select
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onExpand(m.id)}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? "Collapse details" : "Expand details"}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100"
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            {isExpanded ? (
              <div className="border-t border-slate-100 bg-slate-50/50 p-3 text-xs text-slate-600 sm:p-4 sm:text-sm">
                {m.description ? (
                  <p className="leading-5">{m.description}</p>
                ) : (
                  <p className="italic text-slate-400">No description provided.</p>
                )}
                {m.resources.length > 0 ? (
                  <ul className="mt-3 space-y-1.5">
                    {m.resources.slice(0, 8).map((r) => (
                      <li key={r.id} className="flex items-center gap-2">
                        <span className="grid h-5 w-5 place-items-center rounded bg-white text-slate-400 ring-1 ring-slate-200">
                          <Package size={10} />
                        </span>
                        <span className="truncate">{r.name}</span>
                        <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-400">
                          {RESOURCE_TYPE_LABEL[r.type] || r.type}
                        </span>
                      </li>
                    ))}
                    {m.resources.length > 8 ? (
                      <li className="text-[11px] text-slate-500">+ {m.resources.length - 8} more</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function ResourceSelector({
  resources,
  modules,
  selectedIds,
  ownershipState,
  onToggle,
}: {
  resources: Array<CanonicalCourseResource & { parentTitle: string; parentModuleId: string }>;
  modules: CanonicalCourseModule[];
  selectedIds: Set<string>;
  ownershipState: { isProductOwned: boolean; ownedUpdateIds: ReadonlySet<string> | readonly string[]; ownedModuleIds?: ReadonlySet<string> | readonly string[] };
  onToggle: (id: string) => void;
}) {
  if (resources.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        No resources are sold individually for this course.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-black uppercase tracking-wider text-slate-400">
        Individually purchasable resources
      </p>
      {resources.map((r) => {
        const isSelected = selectedIds.has(r.id);
        const isOwned = getIsResourceOwned(r, modules, ownershipState);
        const price = getResourceEffectivePrice(r);
        const regular = r.cashPrice;
        const sale = r.salePrice;
        const TypeIcon = RESOURCE_TYPE_ICON[r.type] || Package;
        return (
          <article
            key={r.id}
            data-pdp-resource
            data-resource-id={r.id}
            className={`flex items-start gap-3 rounded-2xl border bg-white p-3 shadow-sm transition sm:p-4 ${
              isSelected ? "border-violet-500 ring-2 ring-violet-200" : "border-slate-200"
            }`}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              disabled={isOwned}
              onClick={() => onToggle(r.id)}
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition ${
                isOwned
                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                  : isSelected
                    ? "border-violet-600 bg-violet-600 text-white"
                    : "border-slate-300 bg-white"
              }`}
            >
              {isOwned ? <Lock size={12} /> : isSelected ? <Check size={14} /> : null}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-50 text-slate-500">
                  <TypeIcon size={12} />
                </span>
                <h3 className="min-w-0 truncate text-sm font-black text-slate-900">{r.name}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                  {RESOURCE_TYPE_LABEL[r.type] || r.type}
                </span>
                {isOwned ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    <CircleCheck size={10} /> Owned
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">
                {r.parentTitle ? `From “${r.parentTitle}”` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
                {price !== null ? (
                  <>
                    <span className="font-black text-slate-900">{formatPrice(price)}</span>
                    {sale !== null && sale < (regular ?? Number.POSITIVE_INFINITY) ? (
                      <span className="text-slate-400 line-through">{formatPriceValue(regular)}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-slate-400">No price</span>
                )}
                {r.coinPrice && r.coinPrice > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-700">
                    <Tag size={10} /> {r.coinPrice} coins
                  </span>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PaidUpdateSelector({
  updates,
  selectedId,
  onSelect,
}: {
  updates: CanonicalPaidUpdate[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (updates.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        No paid updates are available for this course right now.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-black uppercase tracking-wider text-slate-400">Available paid updates</p>
      {updates.map((u) => {
        const isSelected = selectedId === u.id;
        return (
          <button
            type="button"
            key={u.id}
            data-pdp-update
            data-update-id={u.id}
            onClick={() => onSelect(isSelected ? null : u.id)}
            className={`flex w-full items-start gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm transition sm:p-4 ${
              isSelected ? "border-violet-500 ring-2 ring-violet-200" : "border-slate-200 hover:border-violet-300"
            }`}
          >
            <span
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 ${
                isSelected ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white"
              }`}
            >
              {isSelected ? <Check size={14} /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black text-slate-900">{u.title}</h3>
              {u.description ? (
                <p className="mt-1 line-clamp-2 text-xs text-slate-500 sm:text-sm">{u.description}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
                <span className="font-black text-slate-900">{formatPrice(u.cashPrice)}</span>
                {u.coinPrice > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-700">
                    <Tag size={10} /> {u.coinPrice} coins
                  </span>
                ) : null}
                {u.publishDate ? (
                  <span className="text-slate-400">Published {new Date(u.publishDate).toLocaleDateString("en-IN")}</span>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SummaryPanel({
  summary,
}: {
  summary: ReturnType<typeof computeSummary>;
}) {
  const diff = summary.fullCourseDifference;
  const diffLabel = diff > 0
    ? `You save ${formatPriceValue(diff) || ""} vs full course`
    : diff < 0
      ? `Full course is ${formatPriceValue(-diff) || ""} cheaper`
      : "Same price as full course";
  return (
    <section data-pdp-summary className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-slate-400">Order summary</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{summary.selectedCount} item{summary.selectedCount === 1 ? "" : "s"}</p>
      </div>
      <div className="mt-3 space-y-1.5 text-sm">
        {summary.selectedTitles.length > 0 ? (
          <ul className="space-y-1 text-xs text-slate-600 sm:text-sm">
            {summary.lineItems.filter((l) => !l.alreadyOwned).map((line) => (
              <li key={line.id} className="flex items-center gap-2">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700">
                  <Check size={10} />
                </span>
                <span className="truncate">{line.title}</span>
                {line.parentTitle ? (
                  <span className="ml-1 truncate text-xs text-slate-400">· {line.parentTitle}</span>
                ) : null}
                <span className="ml-auto shrink-0 font-bold text-slate-900">
                  {line.regularPrice === line.effectivePrice
                    ? formatPriceValue(line.effectivePrice)
                    : (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-slate-400 line-through">{formatPriceValue(line.regularPrice)}</span>
                        <span>{formatPriceValue(line.effectivePrice)}</span>
                      </span>
                    )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs italic text-slate-400 sm:text-sm">Nothing selected yet — choose a mode above.</p>
        )}
      </div>
      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
        <div className="flex items-center justify-between text-slate-500">
          <span>Regular subtotal</span>
          <span className="font-medium text-slate-700">{formatPriceValue(summary.regularSubtotal) || "₹0"}</span>
        </div>
        {summary.saleSavings > 0 ? (
          <div className="flex items-center justify-between text-emerald-600">
            <span className="inline-flex items-center gap-1">
              <BadgePercent size={12} /> Sale savings
            </span>
            <span className="font-medium">− {formatPriceValue(summary.saleSavings) || ""}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-base font-black text-slate-900 sm:text-lg">
          <span>Total due today</span>
          <span>{formatPrice(summary.effectiveSubtotal)}</span>
        </div>
      </div>
      {summary.fullCourse.effectivePrice > 0 ? (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500 sm:text-sm">
          <span className="inline-flex items-center gap-1">
            <ShoppingBag size={12} /> Full course: {formatPriceValue(summary.fullCourse.effectivePrice)}
          </span>
          <span className="font-semibold text-slate-700">{diffLabel}</span>
        </div>
      ) : null}
    </section>
  );
}

function CtaBar({
  mode,
  summary,
  isProductOwned,
  validation,
  previewNotice,
  onPreview,
  onClearNotice,
}: {
  mode: PdpPurchaseMode;
  summary: ReturnType<typeof computeSummary>;
  isProductOwned: boolean;
  validation: { ok: boolean; reason?: string };
  previewNotice: string | null;
  onPreview: () => void;
  onClearNotice: () => void;
}) {
  let label = "Continue";
  let icon: typeof ShoppingBag = ShoppingBag;
  let disabled = false;
  let helper: string | null = null;
  if (mode === "full_product") {
    if (isProductOwned) {
      label = "Open owned course";
      icon = CircleCheck;
      helper = "You already own this course.";
    } else if (summary.effectiveSubtotal === 0) {
      label = "Get free access";
      icon = Sparkles;
    } else {
      label = `Buy full course — ${formatPriceValue(summary.effectiveSubtotal) || ""}`;
    }
  } else if (mode === "selected_modules") {
    if (summary.selectedCount === 0) {
      label = "Nothing selected";
      icon = PackageOpen;
      disabled = true;
      helper = "Pick at least one module to continue.";
    } else {
      label = `Buy ${summary.selectedCount} module${summary.selectedCount === 1 ? "" : "s"} — ${formatPriceValue(summary.effectiveSubtotal) || ""}`;
      icon = PackageOpen;
    }
  } else if (mode === "selected_resources") {
    if (summary.selectedCount === 0) {
      label = "Nothing selected";
      icon = Unlock;
      disabled = true;
      helper = "Pick at least one resource to continue.";
    } else {
      label = `Buy ${summary.selectedCount} resource${summary.selectedCount === 1 ? "" : "s"} — ${formatPriceValue(summary.effectiveSubtotal) || ""}`;
      icon = Unlock;
    }
  } else if (mode === "paid_update") {
    if (summary.selectedCount === 0) {
      label = "Nothing selected";
      icon = BadgePercent;
      disabled = true;
      helper = "Pick an update to continue.";
    } else {
      label = `Buy update — ${formatPriceValue(summary.effectiveSubtotal) || ""}`;
      icon = BadgePercent;
    }
  } else {
    label = "Nothing to buy";
    icon = Info;
    disabled = true;
  }
  if (!validation.ok) {
    disabled = true;
    if (!helper) helper = validation.reason || "Please adjust your selection.";
  }
  return (
    <div className="space-y-2" data-pdp-cta>
      {previewNotice && !validation.ok ? (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 sm:text-sm">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-black">{previewNotice}</p>
          </div>
          <button type="button" onClick={onClearNotice} className="text-amber-700 underline">
            Dismiss
          </button>
        </div>
      ) : null}
      {previewNotice && validation.ok ? (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 sm:text-sm">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="font-semibold">{previewNotice}</p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onPreview}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-4 text-base font-black text-white shadow-lg shadow-violet-200 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Star className="hidden sm:block" size={16} />
        {icon ? (() => {
          const Icon = icon;
          return <Icon size={18} />;
        })() : null}
        <span className="truncate">{label}</span>
      </button>
      {helper ? <p className="px-1 text-center text-[11px] font-semibold text-slate-400">{helper}</p> : null}
      <p className="px-1 text-center text-[10px] font-medium text-slate-400">
        Preview-only — payment wiring is coming next.
      </p>
    </div>
  );
}
