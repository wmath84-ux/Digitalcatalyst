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

import { useMemo, useState, type ReactNode } from "react";
import {
  BadgePercent,
  Check,
  CircleAlert,
  CircleCheck,
  Info,
  Package,
  PackageOpen,
  PlayCircle,
  ShoppingBag,
  Sparkles,
  Star,
  Unlock,
} from "lucide-react";
import type {
  CanonicalCourseModule,
  CanonicalCourseResource,
  CanonicalPaidUpdate,
  CheckoutSelection,
} from "@/types/commerce";
import type { Product } from "@/data/products";
import ModuleSelectTrigger from "./ModuleSelectTrigger";
import { GlassSurface } from "../ui/glass";
import { GlassButton } from "../ui/glass-button";
import { GlassCard } from "../ui/GlassCard";
import { GlassCheckbox } from "../ui/glass-checkbox";
import ModuleSelectModal from "./ModuleSelectModal";
import {
  buildCheckoutSelection,
  computeSummary,
  flattenModules,
  getAvailableModes,
  getAvailablePaidUpdates,
  getBundleModules,
  getIsModuleOwned,
  getIsResourceOwned,
  getModuleEffectivePrice,
  getModuleFallbackPrice,
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
  slides: "Google Slides",
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
  slides: Package,
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

  // The purchase mode is DERIVED, not a separate tab state. The "Select
  // course modules" dropdown is the single place for module picking, so the
  // mode follows the selection: picking ≥1 module switches to
  // "selected_modules", an empty selection means the default "full_product"
  // (whose CTA stays enabled). Deriving — instead of a useState that only
  // initialised once — also fixes the bug where the dropdown became a no-op
  // whenever the one-time mode init had landed on "full_product" (e.g. when
  // modules finished loading after the builder had already mounted).
  //
  // Resources / paid updates keep their explicit opt-in because they are not
  // part of the module dropdown; a tiny chip row appears only for products
  // that actually offer them.
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<string>>(() => new Set());
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(() => new Set());
  const [selectedUpdateId, setSelectedUpdateId] = useState<string | null>(null);
  const [extraMode, setExtraMode] = useState<Extract<PdpPurchaseMode, "selected_resources" | "paid_update"> | null>(null);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const fallbackModulePrice = useMemo(() => getModuleFallbackPrice(product, modules), [product, modules]);

  const extraModes = useMemo(
    () =>
      availableModes.filter(
        (m): m is Extract<PdpPurchaseMode, "selected_resources" | "paid_update"> =>
          m === "selected_resources" || m === "paid_update",
      ),
    [availableModes],
  );
  // Priority order mirrors the old default-mode logic: an explicit module
  // selection always wins; otherwise paid updates lead for owners, then the
  // full course for everyone else.
  const baseMode: PdpPurchaseMode = selectedModuleIds.size > 0
    ? "selected_modules"
    : isProductOwned && availableModes.includes("paid_update")
      ? "paid_update"
      : availableModes.includes("full_product")
        ? "full_product"
        : availableModes[0] || "free_entitlement";
  const mode: PdpPurchaseMode = extraMode && extraModes.includes(extraMode) ? extraMode : baseMode;

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

  // Normalize a raw id list coming from the module dropdown: keep only
  // purchasable, not-yet-owned modules and AUTO-ADD any required previous
  // modules — exactly what the old inline selector did per toggle. Without
  // this, picking one dependent module from the dropdown would fail
  // validation and leave the CTA silently disabled.
  const normalizeModuleSelection = (ids: readonly string[]): Set<string> => {
    const flat = flattenModules(modules);
    const byId = new Map(flat.map((m) => [m.id, m]));
    const purchasableIds = new Set(purchasableModules.map((m) => m.id));
    const next = new Set<string>();
    const addWithDeps = (id: string, seen: Set<string>) => {
      if (next.has(id) || seen.has(id) || !purchasableIds.has(id)) return;
      seen.add(id);
      const module = byId.get(id);
      if (!module || getIsModuleOwned(module, ownershipState)) return;
      next.add(id);
      for (const depId of module.requiredPreviousModuleIds || []) addWithDeps(depId, seen);
    };
    ids.forEach((id) => addWithDeps(String(id), new Set()));
    return next;
  };

  const toggleResource = (id: string) => {
    setSelectedResourceIds((current) => {
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

  const modulePicker = (
    <>
      <ModuleSelectTrigger
        totalModules={purchasableModules.length}
        selectedCount={selectedModuleIds.size}
        selectedTotal={purchasableModules.filter((module) => selectedModuleIds.has(module.id)).reduce((sum, module) => sum + (getModuleEffectivePrice(module, fallbackModulePrice) || 0), 0)}
        onOpen={() => setModuleModalOpen(true)}
      />
      <ModuleSelectModal
        open={moduleModalOpen}
        modules={purchasableModules}
        selectedIds={Array.from(selectedModuleIds)}
        ownedIds={new Set(purchasableModules.filter((module) => getIsModuleOwned(module, ownershipState)).map((module) => module.id))}
        fallbackPrice={fallbackModulePrice}
        onClose={() => setModuleModalOpen(false)}
        onChangeSelected={(ids) => {
          // Normalize (dependency auto-add) so the dropdown drives summary,
          // price, CTA and checkout exactly like the selector it replaced.
          // The derived mode then flips to "selected_modules" by itself.
          setSelectedModuleIds(normalizeModuleSelection(ids));
          setExtraMode(null);
          setPreviewNotice(null);
        }}
      />
    </>
  );

  if (availableModes.length === 0) {
    return (
      <div className="space-y-4" data-pdp-purchase-builder>
        {modulePicker}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-pdp-purchase-builder>
      {modulePicker}

      {/* The Full course / Modules tabs were removed: the dropdown above is
          the module picker, and the CTA defaults to the full course. Only
          non-module extras (standalone resources, paid updates) still get an
          explicit opt-in chip row — and only when the product offers them. */}
      {extraModes.length > 0 ? (
        <div data-pdp-extra-modes className="flex flex-wrap gap-2" role="group" aria-label="Extra purchase options">
          <ExtraModeChip
            active={mode !== "selected_resources" && mode !== "paid_update"}
            onClick={() => setExtraMode(null)}
          >
            Course · modules
          </ExtraModeChip>
          {extraModes.map((extra) => (
            <ExtraModeChip key={extra} active={mode === extra} onClick={() => setExtraMode(extra)}>
              {extra === "selected_resources" ? "Resources" : "Paid update"}
            </ExtraModeChip>
          ))}
        </div>
      ) : null}

      {mode === "full_product" && (
        <FullCoursePanel
          modules={bundleModules}
          isProductOwned={isProductOwned}
          fullCourse={summary.fullCourse}
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

/** Compact opt-in chip for the non-module extras (resources / paid updates). */
function ExtraModeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <GlassButton
      variant="capsule"
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`[&>span>div]:h-10 [&>span>div]:px-3 [&>span>div]:text-xs [&>span>div]:font-black sm:[&>span>div]:text-sm ${
        active ? "[&>span>div]:bg-violet-600" : ""
      }`}
    >
      {children}
    </GlassButton>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

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
    <GlassSurface radius={24} className="text-white" contentClassName="p-4 sm:p-5">
      {isProductOwned ? (
        <div className="flex items-start gap-2 rounded-2xl bg-emerald-500/15 p-3 text-sm text-emerald-200 ring-1 ring-emerald-400/30">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-black">You already own this course</p>
            <p className="mt-1 text-xs text-emerald-200/80">Open it from your library to start learning.</p>
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-end gap-2 sm:gap-3">
        <span className="text-3xl font-black sm:text-4xl">
          {isProductOwned ? "Owned" : formatPrice(fullCourse.effectivePrice) || "Free"}
        </span>
        {!isProductOwned && fullCourse.salePrice !== null && fullCourse.salePrice < fullCourse.regularPrice ? (
          <span className="pb-1 text-base text-white/55 line-through sm:text-lg">
            {formatPriceValue(fullCourse.regularPrice)}
          </span>
        ) : null}
        {!isProductOwned && discount > 0 ? (
          <span className="mb-1 rounded-lg bg-emerald-500/20 px-2 py-1 text-xs font-black text-emerald-200">
            SAVE {discount}%
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-white/55">
        Full course · {modules.length} module{modules.length === 1 ? "" : "s"} · Lifetime access
      </p>
      <div className="mt-4">
        <p className="text-xs font-black uppercase tracking-wider text-white/55">What's included</p>
        <ul className="mt-2 space-y-1.5 text-xs text-white/75 sm:text-sm">
          {modules.slice(0, 6).map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
              <span className="truncate">{m.title}</span>
            </li>
          ))}
          {modules.length > 6 ? (
            <li className="text-xs font-semibold text-white/55">+ {modules.length - 6} more module{modules.length - 6 === 1 ? "" : "s"}</li>
          ) : null}
        </ul>
      </div>
    </GlassSurface>
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
      <GlassSurface radius={24} className="text-white/55" contentClassName="p-4 text-sm">
        No resources are sold individually for this course.
      </GlassSurface>
    );
  }
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-black uppercase tracking-wider text-white/55">
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
          <GlassCard
            key={r.id}
            data-pdp-resource
            data-resource-id={r.id}
            className={isSelected ? "ring-2 ring-violet-400/50" : ""}
            contentClassName="flex items-start gap-3 p-3 sm:p-4"
          >
            {/* Wave 10: the pack GlassCheckbox; an owned file shows the checkbox
                checked + disabled with the emerald "Owned" chip carrying the meaning. */}
            <GlassCheckbox
              checked={isOwned ? true : isSelected}
              disabled={isOwned}
              onCheckedChange={() => onToggle(r.id)}
              ariaLabel={isOwned ? `${r.name} — already owned` : `Select ${r.name}`}
              className={`mt-0.5 shrink-0 ${isOwned ? "cursor-not-allowed border-emerald-400/70 bg-emerald-500/80" : ""}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-violet-500/15 text-violet-300">
                  <TypeIcon size={12} />
                </span>
                <h3 className="min-w-0 truncate text-sm font-black text-white">{r.name}</h3>
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase text-white/85">
                  {RESOURCE_TYPE_LABEL[r.type] || r.type}
                </span>
                {isOwned ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                    <CircleCheck size={10} /> Owned
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-xs text-white/55">
                {r.parentTitle ? `From “${r.parentTitle}”` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
                {price !== null ? (
                  <>
                    <span className="font-black text-white">{formatPrice(price)}</span>
                    {sale !== null && sale < (regular ?? Number.POSITIVE_INFINITY) ? (
                      <span className="text-white/55 line-through">{formatPriceValue(regular)}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-white/55">No price</span>
                )}

              </div>
            </div>
          </GlassCard>
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
      <GlassSurface radius={24} className="text-white/55" contentClassName="p-4 text-sm">
        No paid updates are available for this course right now.
      </GlassSurface>
    );
  }
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-black uppercase tracking-wider text-white/55">Available paid updates</p>
      {updates.map((u) => {
        const isSelected = selectedId === u.id;
        return (
          <GlassCard
            key={u.id}
            role="checkbox"
            aria-checked={isSelected}
            tabIndex={0}
            data-pdp-update
            data-update-id={u.id}
            onClick={() => onSelect(isSelected ? null : u.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(isSelected ? null : u.id);
              }
            }}
            className={`w-full cursor-pointer text-left ${isSelected ? "ring-2 ring-violet-400/50" : ""}`}
            contentClassName="flex items-start gap-3 p-3 sm:p-4"
          >
            <GlassCheckbox
              checked={isSelected}
              tabIndex={-1}
              aria-hidden="true"
              onCheckedChange={() => onSelect(isSelected ? null : u.id)}
              onClick={(event) => event.stopPropagation()}
              className="mt-0.5 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black text-white">{u.title}</h3>
              {u.description ? (
                <p className="mt-1 line-clamp-2 text-xs text-white/55 sm:text-sm">{u.description}</p>
              ) : null}
              <p className="mt-1 text-[11px] font-semibold text-violet-300">Includes {u.includedModuleIds.length} module{u.includedModuleIds.length === 1 ? "" : "s"} and {u.includedResourceIds.length} file{u.includedResourceIds.length === 1 ? "" : "s"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
                <span className="font-black text-white">{formatPrice(u.cashPrice)}</span>
                {u.publishDate ? (
                  <span className="text-white/55">Published {new Date(u.publishDate).toLocaleDateString("en-IN")}</span>
                ) : null}
              </div>
            </div>
          </GlassCard>
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
    <GlassSurface data-pdp-summary radius={24} className="text-white" contentClassName="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-white/55">Order summary</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">{summary.selectedCount} item{summary.selectedCount === 1 ? "" : "s"}</p>
      </div>
      <div className="mt-3 space-y-1.5 text-sm">
        {summary.selectedTitles.length > 0 ? (
          <ul className="space-y-1 text-xs text-white/75 sm:text-sm">
            {summary.lineItems.filter((l) => !l.alreadyOwned).map((line) => (
              <li key={line.id} className="flex items-center gap-2">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-violet-500/20 text-violet-200">
                  <Check size={10} />
                </span>
                <span className="truncate">{line.title}</span>
                {line.parentTitle ? (
                  <span className="ml-1 truncate text-xs text-white/55">· {line.parentTitle}</span>
                ) : null}
                <span className="ml-auto shrink-0 font-bold text-white">
                  {line.regularPrice === line.effectivePrice
                    ? formatPriceValue(line.effectivePrice)
                    : (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-white/55 line-through">{formatPriceValue(line.regularPrice)}</span>
                        <span>{formatPriceValue(line.effectivePrice)}</span>
                      </span>
                    )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs italic text-white/55 sm:text-sm">Nothing selected yet — choose a mode above.</p>
        )}
      </div>
      <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-sm">
        <div className="flex items-center justify-between text-white/55">
          <span>Regular subtotal</span>
          <span className="font-medium text-white/85">{formatPriceValue(summary.regularSubtotal) || "₹0"}</span>
        </div>
        {summary.saleSavings > 0 ? (
          <div className="flex items-center justify-between text-emerald-300">
            <span className="inline-flex items-center gap-1">
              <BadgePercent size={12} /> Sale savings
            </span>
            <span className="font-medium">− {formatPriceValue(summary.saleSavings) || ""}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-white/10 pt-2 text-base font-black text-white sm:text-lg">
          <span>Total due today</span>
          <span>{formatPrice(summary.effectiveSubtotal)}</span>
        </div>
      </div>
      {summary.fullCourse.effectivePrice > 0 ? (
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 px-3 py-2 text-xs text-white/55 sm:text-sm">
          <span className="inline-flex items-center gap-1">
            <ShoppingBag size={12} /> Full course: {formatPriceValue(summary.fullCourse.effectivePrice)}
          </span>
          <span className="font-semibold text-white/85">{diffLabel}</span>
        </div>
      ) : null}
    </GlassSurface>
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
        <div className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/15 p-3 text-xs text-amber-200 sm:text-sm">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-black">{previewNotice}</p>
          </div>
          <button type="button" onClick={onClearNotice} className="text-amber-200 underline">
            Dismiss
          </button>
        </div>
      ) : null}
      {previewNotice && validation.ok ? (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 p-3 text-xs text-emerald-200 sm:text-sm">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="font-semibold">{previewNotice}</p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onPreview}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 py-4 text-base font-black text-white transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Star className="hidden sm:block" size={16} />
        {icon ? (() => {
          const Icon = icon;
          return <Icon size={18} />;
        })() : null}
        <span className="truncate">{label}</span>
      </button>
      {helper ? <p className="px-1 text-center text-[11px] font-semibold text-white/55">{helper}</p> : null}
      <p className="px-1 text-center text-[10px] font-medium text-white/55">
        Preview-only — payment wiring is coming next.
      </p>
    </div>
  );
}
