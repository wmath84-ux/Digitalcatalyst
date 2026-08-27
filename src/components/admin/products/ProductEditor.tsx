"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminRouter as useRouter } from "@/lib/admin/router";
import {
  DangerButton,
  ErrorState,
  Field,
  LoadingState,
  Pill,
  PrimaryButton,
  SecondaryButton,
  Tabs,
  inputClass,
  selectClass,
  textareaClass,
} from "@/components/admin/ui";
import { useConfirm, useToast, useUnsavedGuard } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";
import type { PaidUpdate, ProductImage, ProductModule } from "@/lib/admin/types";
import { CloudinaryImageUploadField } from "@/components/admin/products/CloudinaryImageUploadField";
import ModulesResourcesEditor from "@/components/admin/products/ModulesResourcesEditor";
import { normalizeResourceUrl } from "../../../../utils/productMapping";
import {
  DEFAULT_STORE_FILTER_GROUP,
  STORE_FILTER_GROUPS,
  uniqueStoreFilterId,
  type StoreFilter,
} from "@/data/storeFilters";

type ProductForm = {
  id: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  instructor: string;
  category: string;
  productType: string;
  classLevel: string;
  subject: string;
  sku: string;
  tags: string[];
  /** Store page filter chips this product should appear under. */
  filterIds: string[];
  searchKeywords: string[];
  features: string[];
  estimatedDuration: string;
  language: string;
  manualRating: string | null;
  visibility: "visible" | "hidden";
  availableForSale: boolean;
  images: ProductImage[];
  regularPrice: string;
  salePrice: string | null;
  coinPrice: number;
  coinPurchaseEnabled: boolean;
  isFree: boolean;
  eligibleCouponIds: string[];
  minPayableAmount: string;
  availabilityDate: string | null;
  saleStart: string | null;
  saleEnd: string | null;
  modules: ProductModule[];
  paidUpdates: PaidUpdate[];
  status: "draft" | "published" | "archived";
  rating?: string | null;
  reviewCount?: number;
};

const EMPTY_PRODUCT: ProductForm = {
  id: "",
  title: "",
  shortDescription: "",
  longDescription: "",
  instructor: "",
  category: "",
  productType: "course",
  classLevel: "",
  subject: "",
  sku: "",
  tags: [],
  filterIds: [],
  searchKeywords: [],
  features: [],
  estimatedDuration: "",
  language: "English",
  manualRating: null,
  visibility: "hidden",
  availableForSale: false,
  images: [],
  regularPrice: "0",
  salePrice: null,
  coinPrice: 0,
  coinPurchaseEnabled: false,
  isFree: false,
  eligibleCouponIds: [],
  minPayableAmount: "0",
  availabilityDate: null,
  saleStart: null,
  saleEnd: null,
  modules: [],
  paidUpdates: [],
  status: "draft",
};

const TABS = [
  { key: "basic", label: "Basic" },
  { key: "filters", label: "Store filters" },
  { key: "images", label: "Images" },
  { key: "pricing", label: "Pricing" },
  { key: "modules", label: "Modules & Resources" },
  { key: "updates", label: "Paid updates" },
  { key: "review", label: "Review" },
];

function genLocalId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function csvToList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function ProductEditor({ productId }: { productId?: string }) {
  const isNew = !productId;
  const router = useRouter();
  const { notify } = useToast();
  const confirm = useConfirm();
  const { setDirty } = useUnsavedGuard();

  const [form, setForm] = useState<ProductForm>(EMPTY_PRODUCT);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("basic");
  const [newImageUrl, setNewImageUrl] = useState("");

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const res = await adminFetch<{ product: ProductForm }>(`/api/admin/products/${productId}`);
        setForm({
          ...res.product,
          filterIds: Array.isArray(res.product.filterIds) ? res.product.filterIds : [],
          salePrice: res.product.salePrice ?? null,
          manualRating: res.product.manualRating ?? null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load product.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isNew, productId]);

  function update<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  const validation = useMemo(() => {
    const issues: Array<{ message: string; tab: string; blocking: boolean }> = [];
    const add = (message: string, tab: string, blocking = true) => issues.push({ message, tab, blocking });
    if (!form.title.trim()) add("Product title is required.", "basic");
    if (!form.shortDescription.trim()) add("Short description is required.", "basic");
    if (form.images.length === 0) add("Add at least one product image for a better store card.", "images", false);
    if (form.salePrice && Number(form.salePrice) > Number(form.regularPrice)) add("Sale price cannot exceed regular price.", "pricing");
    if (form.manualRating !== null && (!Number.isFinite(Number(form.manualRating)) || Number(form.manualRating) < 0 || Number(form.manualRating) > 5)) add("Manual rating must be between 0 and 5.", "basic");
    if (form.availableForSale && Number(form.regularPrice) <= 0 && !form.isFree) add("Turn on Free product or enter a price before enabling checkout.", "pricing");

    const moduleIds = new Set<string>();
    const resourceIds = new Set<string>();
    for (const m of form.modules) {
      if (!m.id) add(`Module “${m.title || "Untitled"}” needs an ID.`, "modules");
      if (moduleIds.has(m.id)) add(`Duplicate module ID: ${m.id}`, "modules");
      moduleIds.add(m.id);
      if (!m.title.trim()) add("Every module needs a title.", "modules");
      if (m.individuallyPurchasable && (m.cashPrice == null || m.cashPrice < 0)) add(`Module “${m.title}” needs a valid cash price.`, "modules");
      if (m.salePrice != null && (m.cashPrice == null || m.salePrice < 0 || m.salePrice > m.cashPrice)) add(`Module “${m.title}” sale price must be between ₹0 and its cash price.`, "modules");
      for (const r of m.resources || []) {
        if (!r.id) add(`A resource in “${m.title}” needs an ID.`, "modules");
        if (resourceIds.has(r.id)) add(`Duplicate resource ID: ${r.id}`, "modules");
        resourceIds.add(r.id);
        if (!r.name.trim()) add(`A resource in “${m.title}” needs a name.`, "modules");
        if (r.accessLevel === "purchasable" && (r.cashPrice == null || r.cashPrice < 0)) add(`Resource “${r.name}” needs a valid cash price.`, "modules");
        if (r.salePrice != null && (r.cashPrice == null || r.salePrice < 0 || r.salePrice > r.cashPrice)) add(`Resource “${r.name}” sale price must be between ₹0 and its cash price.`, "modules");
        if (!normalizeResourceUrl(r.url, r.type)) {
          const learnerVisible = r.visibility !== "hidden" && r.accessLevel !== "hidden" && m.visibility !== "hidden" && m.accessLevel !== "hidden";
          add(`“${r.name || "Untitled resource"}” in “${m.title}” needs a valid public HTTPS URL, YouTube link/id, or iframe embed code.`, "modules", learnerVisible);
        }
      }
    }

    // Parent cycles would make every affected module disappear from the nested
    // Firestore tree. Detect them before publishing instead of silently saving.
    const parentById = new Map(form.modules.map((module) => [module.id, module.parentModuleId]));
    for (const module of form.modules) {
      if (module.parentModuleId && !moduleIds.has(module.parentModuleId)) add(`Module “${module.title}” refers to a missing parent and will be promoted to a root module.`, "modules", false);
      const seen = new Set<string>([module.id]);
      let parent = module.parentModuleId;
      while (parent) {
        if (seen.has(parent)) {
          add(`Module hierarchy contains a cycle at “${module.title}”.`, "modules");
          break;
        }
        seen.add(parent);
        parent = parentById.get(parent) || null;
      }
    }

    const knownContentIds = new Set([...moduleIds, ...resourceIds]);
    const updateContentIds = new Set(form.paidUpdates.flatMap((update) => update.includedIds).filter((id) => knownContentIds.has(id)));
    for (const u of form.paidUpdates) {
      if (!u.title.trim()) add("Every paid update needs a title.", "updates");
      if (u.cashPrice < 0) add(`Paid update “${u.title}” needs a valid price.`, "updates");
      const validIncludedIds = u.includedIds.filter((id) => knownContentIds.has(id));
      if (u.active && validIncludedIds.length === 0) add(`Paid update “${u.title}” must include at least one module or resource.`, "updates");
      if (validIncludedIds.length !== u.includedIds.length) add(`Paid update “${u.title}” contains deleted content IDs; they will be cleaned automatically on save.`, "updates", false);
    }
    for (const module of form.modules) {
      if (module.accessLevel === "paid_update" && !updateContentIds.has(module.id)) add(`Paid-update module “${module.title}” must be included in a Paid update package.`, "updates");
    }
    return issues;
  }, [form]);

  async function persist(nextStatus?: ProductForm["status"]) {
    const status = nextStatus ?? form.status;
    if (status === "published") {
      const blocker = validation.find((issue) => issue.blocking);
      if (blocker) {
        setTab(blocker.tab);
        notify("error", `Cannot publish: ${blocker.message}`);
        return;
      }
    }

    // Clean references and pasted links before saving. Deleting a resource or
    // module must not leave stale paid-update IDs behind in adminProduct.
    const knownIds = new Set(form.modules.flatMap((module) => [module.id, ...(module.resources || []).map((resource) => resource.id)]));
    const paidUpdateIds = new Set(form.paidUpdates.map((update) => update.id));
    const modules = form.modules.map((module) => ({
      ...module,
      resources: (module.resources || []).map((resource, index) => ({
        ...resource,
        url: normalizeResourceUrl(resource.url, resource.type) || resource.url.trim(),
        sortOrder: index,
        paidUpdateId: resource.paidUpdateId && paidUpdateIds.has(resource.paidUpdateId) ? resource.paidUpdateId : null,
      })),
    }));
    const paidUpdates = form.paidUpdates.map((update) => ({
      ...update,
      includedIds: update.includedIds.filter((id, index, list) => knownIds.has(id) && list.indexOf(id) === index),
    }));
    const payload: ProductForm = {
      ...form,
      modules,
      paidUpdates,
      status,
      // One source of truth: published means visible everywhere; draft and
      // archived mean hidden everywhere.
      visibility: status === "published" ? "visible" : "hidden",
    };

    setSaving(true);
    try {
      if (isNew) {
        const res = await adminFetch<{ product: ProductForm }>("/api/admin/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setForm(res.product);
        setDirty(false);
        notify("success", status === "published" ? "Product published to Home, Store and search." : "Draft saved.");
        router.replace(`/admin/products/${res.product.id}`);
      } else {
        const res = await adminFetch<{ product: ProductForm }>(`/api/admin/products/${productId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setForm(res.product);
        setDirty(false);
        notify("success", status === "published" ? "Product updated live everywhere." : status === "archived" ? "Product archived and hidden." : "Draft saved and hidden from users.");
      }
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save product.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!productId) return;
    const { confirmed, reason } = await confirm({
      title: "Delete this product?",
      description: "This permanently removes the product, its modules and paid updates.",
      confirmLabel: "Delete product",
      destructive: true,
      requireReason: true,
    });
    if (!confirmed) return;
    try {
      await adminFetch(`/api/admin/products/${productId}`, { method: "DELETE", body: JSON.stringify({ reason }) });
      notify("success", "Product deleted.");
      router.replace("/admin/products");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to delete product.");
    }
  }

  async function handleDuplicate() {
    const newId = genLocalId("prod");
    try {
      const res = await adminFetch<{ product: ProductForm }>("/api/admin/products", {
        method: "POST",
        body: JSON.stringify({ ...form, id: newId, title: `${form.title} (Copy)`, status: "draft" }),
      });
      notify("success", "Product duplicated as draft.");
      router.push(`/admin/products/${res.product.id}`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to duplicate product.");
    }
  }

  function addProductImage(url: string, provider: ProductImage["provider"]) {
    const img: ProductImage = {
      id: genLocalId("img"),
      url,
      provider,
      sortOrder: form.images.length,
      isPrimary: form.images.length === 0,
    };
    update("images", [...form.images, img]);
  }

  if (loading) return <LoadingState label="Loading product…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="pb-28">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="mt-3 space-y-4">
        {tab === "basic" && (
          <div className="space-y-3">
            <Field label="Product title" required>
              <input className={inputClass} value={form.title} onChange={(e) => update("title", e.target.value)} />
            </Field>
            <Field label="Short description" required hint="Shown on cards & search results.">
              <textarea className={textareaClass} value={form.shortDescription} onChange={(e) => update("shortDescription", e.target.value)} />
            </Field>
            <Field label="Full description" hint="Detailed copy for the product page.">
              <textarea className={textareaClass + " min-h-[140px]"} value={form.longDescription} onChange={(e) => update("longDescription", e.target.value)} />
            </Field>
            <Field label="Instructor / author">
              <input className={inputClass} value={form.instructor} onChange={(e) => update("instructor", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Product type">
                <select className={selectClass} value={form.productType} onChange={(e) => update("productType", e.target.value)}>
                  <option value="course">Course</option>
                  <option value="pdf">PDF / notes</option>
                  <option value="ebook">E-book</option>
                  <option value="live">Live class</option>
                  <option value="bundle">Bundle</option>
                </select>
              </Field>
              <Field label="SKU / internal code">
                <input className={inputClass} value={form.sku} onChange={(e) => update("sku", e.target.value)} />
              </Field>
              <Field label="Category">
                <input className={inputClass} value={form.category} onChange={(e) => update("category", e.target.value)} />
              </Field>
              <Field label="Class / level">
                <input className={inputClass} value={form.classLevel} onChange={(e) => update("classLevel", e.target.value)} />
              </Field>
              <Field label="Subject">
                <input className={inputClass} value={form.subject} onChange={(e) => update("subject", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Estimated duration">
                <input className={inputClass} placeholder="e.g. 12 hours" value={form.estimatedDuration} onChange={(e) => update("estimatedDuration", e.target.value)} />
              </Field>
              <Field label="Language">
                <input className={inputClass} value={form.language} onChange={(e) => update("language", e.target.value)} />
              </Field>
            </div>
            <Field label="Tags" hint="Comma separated">
              <input className={inputClass} value={form.tags.join(", ")} onChange={(e) => update("tags", csvToList(e.target.value))} />
            </Field>
            <Field label="Search keywords" hint="Comma separated; used by product search.">
              <input className={inputClass} value={form.searchKeywords.join(", ")} onChange={(e) => update("searchKeywords", csvToList(e.target.value))} />
            </Field>
            <Field label="Manual rating" hint="Optional 0–5 fallback until real learner reviews exist.">
              <input className={inputClass} type="number" min="0" max="5" step="0.1" value={form.manualRating ?? ""} onChange={(e) => update("manualRating", e.target.value === "" ? null : e.target.value)} />
            </Field>
            <FeaturesEditor features={form.features} onChange={(features) => update("features", features)} />
            <div className={`rounded-lg border p-3 ${form.status === "published" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">Published in app & store</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">This controls Home, Store, search and direct product pages together.</p>
                </div>
                <ToggleSwitch
                  checked={form.status === "published"}
                  onChange={(published) => {
                    setForm((prev) => ({ ...prev, status: published ? "published" : "draft", visibility: published ? "visible" : "hidden" }));
                    setDirty(true);
                  }}
                />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">Checkout enabled</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Off = product is visible as “Coming soon”, but cannot be purchased.</p>
                </div>
                <ToggleSwitch checked={form.availableForSale} onChange={(v) => update("availableForSale", v)} />
              </div>
            </div>
          </div>
        )}

        {tab === "filters" && (
          <StoreFiltersEditor
            selectedIds={form.filterIds}
            onChange={(filterIds) => update("filterIds", filterIds)}
          />
        )}

        {tab === "images" && (
          <div className="space-y-3">
            <Field label="Add image URL" hint="Public HTTPS or Cloudinary URL">
              <div className="flex gap-2">
                <input className={inputClass + " flex-1"} value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="https://..." />
                <SecondaryButton
                  onClick={() => {
                    if (!newImageUrl.trim().startsWith("https://")) {
                      notify("error", "Image URL must be a public HTTPS URL.");
                      return;
                    }
                    addProductImage(newImageUrl.trim(), newImageUrl.includes("cloudinary") ? "cloudinary" : "public");
                    setNewImageUrl("");
                  }}
                >
                  Add
                </SecondaryButton>
              </div>
            </Field>

            <CloudinaryImageUploadField
              folder="product-images"
              tags={["product"]}
              onUploaded={(hostedUrl) => addProductImage(hostedUrl, "cloudinary")}
            />

            {form.images.length === 0 ? (
              <p className="text-sm text-slate-500">No images yet. The first added image becomes the primary image.</p>
            ) : (
              <div className="space-y-2">
                {form.images.map((img, idx) => (
                  <div key={img.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="h-14 w-14 flex-shrink-0 rounded-md object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-slate-600">{img.url}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {img.isPrimary ? <Pill tone="success">Primary</Pill> : <Pill>{img.provider}</Pill>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-xs active:bg-slate-100"
                        disabled={idx === 0}
                        onClick={() => {
                          const next = [...form.images];
                          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                          update("images", next.map((im, i) => ({ ...im, sortOrder: i })));
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-xs active:bg-slate-100"
                        disabled={idx === form.images.length - 1}
                        onClick={() => {
                          const next = [...form.images];
                          [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                          update("images", next.map((im, i) => ({ ...im, sortOrder: i })));
                        }}
                      >
                        ↓
                      </button>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="h-8 rounded-md border border-slate-200 px-2 text-[11px] active:bg-slate-100"
                        onClick={() => update("images", form.images.map((im) => ({ ...im, isPrimary: im.id === img.id })))}
                      >
                        Set primary
                      </button>
                      <button
                        type="button"
                        className="h-8 rounded-md border border-red-200 px-2 text-[11px] text-red-600 active:bg-red-50"
                        onClick={() => update("images", form.images.filter((im) => im.id !== img.id))}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "pricing" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Regular price (₹)">
                <input className={inputClass} type="number" disabled={form.isFree} value={form.isFree ? "0" : form.regularPrice} onChange={(e) => update("regularPrice", e.target.value)} />
              </Field>
              <Field label="Sale price (₹)">
                <input className={inputClass} type="number" disabled={form.isFree} value={form.isFree ? "" : (form.salePrice ?? "")} onChange={(e) => update("salePrice", e.target.value === "" ? null : e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-slate-500">
              Effective price: <strong>₹{Number(form.salePrice ?? form.regularPrice).toLocaleString("en-IN")}</strong>
              {form.salePrice && Number(form.regularPrice) > 0 && (
                <> · {Math.round((1 - Number(form.salePrice) / Number(form.regularPrice)) * 100)}% off</>
              )}
            </p>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <span className="text-sm font-medium text-slate-700">Free product</span>
              <ToggleSwitch
                checked={form.isFree}
                onChange={(v) => {
                  setForm((prev) => ({
                    ...prev,
                    isFree: v,
                    regularPrice: v ? "0" : prev.regularPrice,
                    salePrice: v ? null : prev.salePrice,
                    minPayableAmount: v ? "0" : prev.minPayableAmount,
                  }));
                  setDirty(true);
                }}
              />
            </div>
            {form.isFree ? (
              <p className="text-xs text-emerald-700">Free products checkout at ₹0. Regular / sale prices are ignored until this toggle is turned off.</p>
            ) : null}
            <Field label="Minimum payable amount (₹)" hint="Floor after coupon discount">
              <input className={inputClass} type="number" value={form.minPayableAmount} onChange={(e) => update("minPayableAmount", e.target.value)} />
            </Field>
            <Field label="Eligible coupon IDs" hint="Comma separated">
              <input className={inputClass} value={form.eligibleCouponIds.join(", ")} onChange={(e) => update("eligibleCouponIds", csvToList(e.target.value))} />
            </Field>
            <div className="grid grid-cols-1 gap-3">
              <Field label="Availability date">
                <input className={inputClass} type="date" value={form.availabilityDate?.slice(0, 10) ?? ""} onChange={(e) => update("availabilityDate", e.target.value || null)} />
              </Field>
              <Field label="Sale start">
                <input className={inputClass} type="date" value={form.saleStart?.slice(0, 10) ?? ""} onChange={(e) => update("saleStart", e.target.value || null)} />
              </Field>
              <Field label="Sale end">
                <input className={inputClass} type="date" value={form.saleEnd?.slice(0, 10) ?? ""} onChange={(e) => update("saleEnd", e.target.value || null)} />
              </Field>
            </div>
          </div>
        )}

        {tab === "modules" && (
          <ModulesResourcesEditor
            modules={form.modules}
            onChange={(modules) => update("modules", modules)}
            paidUpdates={form.paidUpdates}
          />
        )}

        {tab === "updates" && (
          <PaidUpdatesEditor updates={form.paidUpdates} onChange={(updates) => update("paidUpdates", updates)} modules={form.modules} />
        )}

        {tab === "review" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">Publish checklist</p>
              {validation.length === 0 ? (
                <p className="mt-2 text-sm text-emerald-600">Everything looks good — ready to publish.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {validation.map((issue, index) => (
                    <li key={`${issue.message}-${index}`}>
                      <button type="button" className={`text-left ${issue.blocking ? "text-red-700" : "text-amber-700"}`} onClick={() => setTab(issue.tab)}>
                        {issue.blocking ? "✕" : "⚠"} {issue.message} <span className="underline">Fix</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Field label="Status">
              <select
                className={selectClass}
                value={form.status}
                onChange={(e) => {
                  const status = e.target.value as ProductForm["status"];
                  setForm((prev) => ({ ...prev, status, visibility: status === "published" ? "visible" : "hidden" }));
                  setDirty(true);
                }}
              >
                <option value="draft">Draft — hidden from users</option>
                <option value="published">Published — live everywhere</option>
                <option value="archived">Archived — hidden from users</option>
              </select>
            </Field>
            {!isNew && (
              <div className="flex flex-wrap gap-2">
                <SecondaryButton onClick={handleDuplicate}>Duplicate</SecondaryButton>
                <SecondaryButton onClick={() => window.open(`/#/product/${encodeURIComponent(productId || form.id)}`, "_blank", "noopener,noreferrer")}>Preview in app</SecondaryButton>
                <SecondaryButton onClick={() => persist("archived")}>Archive & hide</SecondaryButton>
                <DangerButton onClick={handleDelete}>Delete</DangerButton>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pb-[calc(env(safe-area-inset-bottom)+10px)]">
        <div className="mx-auto flex max-w-[480px] gap-2 px-3 py-2.5">
          <SecondaryButton className="flex-1" onClick={() => persist("draft")} disabled={saving}>
            Save as draft
          </SecondaryButton>
          <PrimaryButton className="flex-1" onClick={() => persist("published")} loading={saving}>
            {isNew ? "Publish to app" : "Update live product"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${checked ? "bg-slate-900" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function FeaturesEditor({ features, onChange }: { features: string[]; onChange: (features: string[]) => void }) {
  function updateFeature(index: number, value: string) {
    onChange(features.map((feature, i) => (i === index ? value : feature)));
  }
  function addFeature() {
    onChange([...features, ""]);
  }
  function removeFeature(index: number) {
    onChange(features.filter((_, i) => i !== index));
  }
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">What's included</p>
          <p className="text-[11px] text-slate-500">Bullets shown on the product detail page. Leave empty to auto-generate from modules.</p>
        </div>
        <SecondaryButton className="h-8 px-2 text-xs" onClick={addFeature}>+ Add</SecondaryButton>
      </div>
      {features.length === 0 && <p className="mt-2 text-xs text-slate-400">No custom bullets yet.</p>}
      <div className="mt-2 space-y-2">
        {features.map((feature, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              className={inputClass + " h-9 flex-1"}
              placeholder={`e.g. ${index + 1}-day access to all lessons`}
              value={feature}
              onChange={(e) => updateFeature(index, e.target.value)}
            />
            <button type="button" className="h-8 w-8 rounded-md border border-red-200 text-xs text-red-600 active:bg-red-50" onClick={() => removeFeature(index)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Store filters                                                        */
/* ------------------------------------------------------------------ */

/**
 * Connect this product to the filter chips shown on the Store page — and
 * create brand-new chips right here.
 *
 * The chip list itself is global (`settings/storeFilters`), so adding,
 * renaming, hiding or deleting a chip is saved immediately and takes effect
 * on every device. Which chips this particular product belongs to is part of
 * the product form and is written when the product is saved.
 */
function StoreFiltersEditor({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const { notify } = useToast();
  const [filters, setFilters] = useState<StoreFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingList, setSavingList] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newGroup, setNewGroup] = useState<string>(DEFAULT_STORE_FILTER_GROUP);

  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch<{ filters: StoreFilter[] }>("/api/admin/store/filters");
        setFilters(res.filters || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load store filters.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Persist the global chip list. Local state updates optimistically. */
  async function persistList(next: StoreFilter[], message: string) {
    const previous = filters;
    const ordered = next.map((filter, index) => ({ ...filter, sortOrder: index }));
    setFilters(ordered);
    setSavingList(true);
    try {
      await adminFetch("/api/admin/store/filters", { method: "PATCH", body: JSON.stringify({ filters: ordered }) });
      notify("success", message);
    } catch (err) {
      setFilters(previous);
      notify("error", err instanceof Error ? err.message : "Failed to save store filters.");
    } finally {
      setSavingList(false);
    }
  }

  function toggleSelected(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  }

  function addFilter() {
    const label = newLabel.trim();
    if (!label) {
      notify("error", "Type a filter name first.");
      return;
    }
    if (filters.some((filter) => filter.label.toLowerCase() === label.toLowerCase())) {
      notify("error", `“${label}” already exists.`);
      return;
    }
    const filter: StoreFilter = {
      id: uniqueStoreFilterId(label, filters.map((item) => item.id)),
      label,
      group: newGroup || DEFAULT_STORE_FILTER_GROUP,
      description: "",
      sortOrder: filters.length,
      active: true,
    };
    setNewLabel("");
    // A newly created filter is attached to the open product straight away —
    // that is almost always why the admin created it.
    onChange([...selectedIds, filter.id]);
    void persistList([...filters, filter], `“${label}” added to the Store filters.`);
  }

  function renameFilter(id: string, label: string) {
    setFilters((current) => current.map((filter) => (filter.id === id ? { ...filter, label } : filter)));
  }

  function commitRename() {
    void persistList(filters.filter((filter) => filter.label.trim()), "Store filters updated.");
  }

  function moveFilter(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= filters.length) return;
    const next = [...filters];
    [next[index], next[target]] = [next[target], next[index]];
    void persistList(next, "Filter order updated.");
  }

  function removeFilter(filter: StoreFilter) {
    onChange(selectedIds.filter((value) => value !== filter.id));
    void persistList(filters.filter((item) => item.id !== filter.id), `“${filter.label}” removed from the Store filters.`);
  }

  const selectedLabels = selectedIds
    .map((id) => filters.find((filter) => filter.id === id)?.label || id)
    .filter(Boolean);

  if (loading) return <LoadingState label="Loading store filters…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-3" data-admin-store-filters>
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <p className="text-sm font-semibold text-slate-900">Show this product under these filters</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          These are the exact chips learners tap above the Store grid. Tick every filter this product should appear
          under — a product can belong to many. Create a new chip below and it shows up on the Store page instantly.
        </p>
        {filters.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">
            No filters created yet. Add the first one below — until then the Store page derives chips from each
            product’s category, class and subject.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {filters.map((filter) => {
              const active = selectedIds.includes(filter.id);
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => toggleSelected(filter.id)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  } ${filter.active ? "" : "opacity-50"}`}
                >
                  {active ? "✓" : "+"} {filter.label}
                  {!filter.active && <span className="text-[9px] uppercase">hidden</span>}
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          {selectedLabels.length === 0
            ? "Not attached to any filter — the product still appears under “All”."
            : `Attached to: ${selectedLabels.join(", ")}`}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <p className="text-sm font-semibold text-slate-900">Add a new filter</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Appears as a chip on the Store page for every learner.</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            className={inputClass + " flex-1"}
            placeholder="e.g. Class 12 Boards"
            value={newLabel}
            maxLength={40}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addFilter();
              }
            }}
          />
          <select className={selectClass + " sm:w-40"} value={newGroup} onChange={(e) => setNewGroup(e.target.value)}>
            {STORE_FILTER_GROUPS.map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
          <SecondaryButton onClick={addFilter} disabled={savingList}>Add filter</SecondaryButton>
        </div>
      </div>

      {filters.length > 0 && (
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-900">Manage the Store filter row</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Rename, reorder, hide or delete chips. Saved instantly for the whole store.
          </p>
          <div className="mt-2 space-y-2">
            {filters.map((filter, index) => (
              <div key={filter.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                <div className="min-w-0 flex-1">
                  <input
                    className={inputClass + " h-9"}
                    value={filter.label}
                    maxLength={40}
                    onChange={(e) => renameFilter(filter.id, e.target.value)}
                    onBlur={commitRename}
                  />
                  <p className="mt-1 truncate text-[10px] text-slate-400">{filter.group} · id: {filter.id}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <button type="button" aria-label="Move filter up" disabled={index === 0} onClick={() => moveFilter(index, -1)}
                    className="h-7 w-7 rounded-md border border-slate-200 text-xs disabled:opacity-30 active:bg-slate-100">↑</button>
                  <button type="button" aria-label="Move filter down" disabled={index === filters.length - 1} onClick={() => moveFilter(index, 1)}
                    className="h-7 w-7 rounded-md border border-slate-200 text-xs disabled:opacity-30 active:bg-slate-100">↓</button>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className="h-7 rounded-md border border-slate-200 px-2 text-[10px] active:bg-slate-100"
                    onClick={() => void persistList(
                      filters.map((item) => (item.id === filter.id ? { ...item, active: !item.active } : item)),
                      filter.active ? `“${filter.label}” hidden from the Store.` : `“${filter.label}” shown on the Store.`,
                    )}
                  >
                    {filter.active ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className="h-7 rounded-md border border-red-200 px-2 text-[10px] text-red-600 active:bg-red-50"
                    onClick={() => removeFilter(filter)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PaidUpdatesEditor({
  updates,
  onChange,
  modules,
}: {
  updates: PaidUpdate[];
  onChange: (updates: PaidUpdate[]) => void;
  modules: ProductModule[];
}) {
  function addUpdate() {
    const id = genLocalId("upd");
    const next: PaidUpdate = {
      id,
      title: "New paid update",
      description: "",
      includedIds: [],
      cashPrice: 0,
      coinPrice: 0,
      active: true,
      publishDate: null,
      visibility: "visible",
      sortOrder: updates.length,
    };
    onChange([...updates, next]);
  }
  function updateOne(id: string, patch: Partial<PaidUpdate>) {
    onChange(updates.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }
  function remove(id: string) {
    onChange(updates.filter((u) => u.id !== id));
  }
  const contentOptions = modules.flatMap((module) => [
    { id: module.id, label: module.title || "Untitled module", kind: "Module" },
    ...(module.resources || []).map((resource) => ({ id: resource.id, label: `${module.title || "Module"} → ${resource.name || "Untitled resource"}`, kind: "Resource" })),
  ]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Paid course updates ({updates.length})</p>
        <PrimaryButton onClick={addUpdate}>+ Add update</PrimaryButton>
      </div>
      {updates.length === 0 && <p className="text-sm text-slate-500">No paid updates configured.</p>}
      {updates.map((u) => (
        <div key={u.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
          <Field label="Update title">
            <input className={inputClass} value={u.title} onChange={(e) => updateOne(u.id, { title: e.target.value })} />
          </Field>
          <Field label="Description">
            <textarea className={textareaClass} value={u.description} onChange={(e) => updateOne(u.id, { description: e.target.value })} />
          </Field>
          <Field label="Included modules & resources" hint="Select exactly what this paid update unlocks.">
            {contentOptions.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Add modules/resources first.</p>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {contentOptions.map((option) => (
                  <label key={option.id} className="flex items-start gap-2 rounded-md p-2 text-xs text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={u.includedIds.includes(option.id)}
                      onChange={(event) => updateOne(u.id, {
                        includedIds: event.target.checked
                          ? [...u.includedIds, option.id]
                          : u.includedIds.filter((id) => id !== option.id),
                      })}
                    />
                    <span><strong>{option.kind}:</strong> {option.label}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>
          <details className="rounded-lg border border-slate-200 p-2">
            <summary className="cursor-pointer text-xs font-medium text-slate-600">Advanced: edit IDs manually</summary>
            <input className={inputClass + " mt-2"} value={u.includedIds.join(", ")} onChange={(e) => updateOne(u.id, { includedIds: csvToList(e.target.value) })} />
          </details>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cash price (₹)">
              <input className={inputClass} type="number" value={u.cashPrice} onChange={(e) => updateOne(u.id, { cashPrice: Number(e.target.value) })} />
            </Field>
            <Field label="Publish date">
              <input className={inputClass} type="date" value={u.publishDate?.slice(0, 10) ?? ""} onChange={(e) => updateOne(u.id, { publishDate: e.target.value || null })} />
            </Field>
            <Field label="Sort order">
              <input className={inputClass} type="number" value={u.sortOrder} onChange={(e) => updateOne(u.id, { sortOrder: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={u.active} onChange={(e) => updateOne(u.id, { active: e.target.checked })} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={u.visibility === "visible"} onChange={(e) => updateOne(u.id, { visibility: e.target.checked ? "visible" : "hidden" })} />
              Visible
            </label>
          </div>
          <button type="button" className="text-xs text-red-600" onClick={() => remove(u.id)}>Remove update</button>
        </div>
      ))}
    </div>
  );
}
