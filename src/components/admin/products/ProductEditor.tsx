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
import type { PaidUpdate, ProductImage, ProductModule, ProductResource } from "@/lib/admin/types";

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
  { key: "images", label: "Images" },
  { key: "pricing", label: "Pricing" },
  { key: "modules", label: "Modules" },
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

const RESOURCE_TYPES = [
  "youtube",
  "video_url",
  "audio_url",
  "image_url",
  "gdrive",
  "pdf",
  "gdoc",
  "gsheet",
  "gform",
  "ebook",
  "github_pages",
  "whimsical",
  "iframe",
] as const;

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
    const issues: string[] = [];
    if (!form.title.trim()) issues.push("Product title is required.");
    if (!form.shortDescription.trim()) issues.push("Short description is required.");
    if (form.images.length === 0) issues.push("At least one product image is recommended.");
    if (form.salePrice && Number(form.salePrice) > Number(form.regularPrice)) issues.push("Sale price cannot exceed regular price.");
    if (form.availableForSale && Number(form.regularPrice) <= 0 && !form.isFree) issues.push("Products for sale need a valid price or free toggle.");
    const moduleIds = new Set<string>();
    for (const m of form.modules) {
      if (moduleIds.has(m.id)) issues.push(`Duplicate module ID: ${m.id}`);
      moduleIds.add(m.id);
      if (m.individuallyPurchasable && (m.cashPrice == null || m.cashPrice < 0)) issues.push(`Module "${m.title}" needs a valid cash price.`);
    }
    for (const u of form.paidUpdates) {
      if (u.cashPrice < 0) issues.push(`Paid update "${u.title}" needs a valid price.`);
    }
    return issues;
  }, [form]);

  async function persist(nextStatus?: ProductForm["status"]) {
    setSaving(true);
    try {
      const payload = { ...form, status: nextStatus ?? form.status };
      if (isNew) {
        const res = await adminFetch<{ product: ProductForm }>("/api/admin/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setDirty(false);
        notify("success", "Product created.");
        router.replace(`/admin/products/${res.product.id}`);
      } else {
        const res = await adminFetch<{ product: ProductForm }>(`/api/admin/products/${productId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setForm(res.product);
        setDirty(false);
        notify("success", "Product saved.");
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
            <Field label="Long description">
              <textarea className={textareaClass} value={form.longDescription} onChange={(e) => update("longDescription", e.target.value)} />
            </Field>
            <Field label="Instructor / author">
              <input className={inputClass} value={form.instructor} onChange={(e) => update("instructor", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <input className={inputClass} value={form.category} onChange={(e) => update("category", e.target.value)} />
              </Field>
              <Field label="Product type">
                <input className={inputClass} value={form.productType} onChange={(e) => update("productType", e.target.value)} />
              </Field>
              <Field label="Class / level">
                <input className={inputClass} value={form.classLevel} onChange={(e) => update("classLevel", e.target.value)} />
              </Field>
              <Field label="Subject">
                <input className={inputClass} value={form.subject} onChange={(e) => update("subject", e.target.value)} />
              </Field>

            </div>
            <Field label="Tags" hint="Comma separated">
              <input className={inputClass} value={form.tags.join(", ")} onChange={(e) => update("tags", csvToList(e.target.value))} />
            </Field>
            <Field label="Feature bullets" hint="Comma separated">
              <input className={inputClass} value={form.features.join(", ")} onChange={(e) => update("features", csvToList(e.target.value))} />
            </Field>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <span className="text-sm font-medium text-slate-700">Visible to users</span>
              <ToggleSwitch checked={form.visibility === "visible"} onChange={(v) => update("visibility", v ? "visible" : "hidden")} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <span className="text-sm font-medium text-slate-700">Available for sale</span>
              <ToggleSwitch checked={form.availableForSale} onChange={(v) => update("availableForSale", v)} />
            </div>
          </div>
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
                    const img: ProductImage = {
                      id: genLocalId("img"),
                      url: newImageUrl.trim(),
                      provider: newImageUrl.includes("cloudinary") ? "cloudinary" : "public",
                      sortOrder: form.images.length,
                      isPrimary: form.images.length === 0,
                    };
                    update("images", [...form.images, img]);
                    setNewImageUrl("");
                  }}
                >
                  Add
                </SecondaryButton>
              </div>
            </Field>

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
                <input className={inputClass} type="number" value={form.regularPrice} onChange={(e) => update("regularPrice", e.target.value)} />
              </Field>
              <Field label="Sale price (₹)">
                <input className={inputClass} type="number" value={form.salePrice ?? ""} onChange={(e) => update("salePrice", e.target.value === "" ? null : e.target.value)} />
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
              <ToggleSwitch checked={form.isFree} onChange={(v) => update("isFree", v)} />
            </div>
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
          <ModulesEditor
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
                <ul className="mt-2 space-y-1 text-sm text-amber-700">
                  {validation.map((v) => (
                    <li key={v}>⚠ {v}</li>
                  ))}
                </ul>
              )}
            </div>
            <Field label="Status">
              <select className={selectClass} value={form.status} onChange={(e) => update("status", e.target.value as ProductForm["status"])}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            {!isNew && (
              <div className="flex flex-wrap gap-2">
                <SecondaryButton onClick={handleDuplicate}>Duplicate</SecondaryButton>
                <SecondaryButton onClick={() => window.open(`/admin/products/${productId}`, "_blank")}>Preview</SecondaryButton>
                <DangerButton onClick={handleDelete}>Delete</DangerButton>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pb-[calc(env(safe-area-inset-bottom)+10px)]">
        <div className="mx-auto flex max-w-[480px] gap-2 px-3 py-2.5">
          <SecondaryButton className="flex-1" onClick={() => persist("draft")} disabled={saving}>
            Save draft
          </SecondaryButton>
          <PrimaryButton className="flex-1" onClick={() => persist("published")} loading={saving}>
            {isNew ? "Create & publish" : "Publish / update"}
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

function ModulesEditor({
  modules,
  onChange,
  paidUpdates,
}: {
  modules: ProductModule[];
  onChange: (modules: ProductModule[]) => void;
  paidUpdates: PaidUpdate[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  function addModule() {
    const id = genLocalId("mod");
    const next: ProductModule = {
      id,
      title: "New module",
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
    setExpanded(id);
  }

  function updateModule(id: string, patch: Partial<ProductModule>) {
    onChange(modules.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function removeModule(id: string) {
    onChange(modules.filter((m) => m.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Course module tree ({modules.length})</p>
        <PrimaryButton onClick={addModule}>+ Add module</PrimaryButton>
      </div>
      {modules.length === 0 && <p className="text-sm text-slate-500">No modules yet.</p>}
      {modules.map((m) => (
        <div key={m.id} className="rounded-lg border border-slate-200">
          <button type="button" className="flex w-full items-center justify-between p-3 text-left" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{m.title || "Untitled module"}</p>
              <p className="text-[11px] text-slate-500">{m.resources.length} resource(s) · {m.accessLevel}{m.parentModuleId ? " · nested" : ""}</p>
            </div>
            <span className="text-slate-400">{expanded === m.id ? "▲" : "▼"}</span>
          </button>
          {expanded === m.id && (
            <div className="space-y-3 border-t border-slate-100 p-3">
              <Field label="Module title">
                <input className={inputClass} value={m.title} onChange={(e) => updateModule(m.id, { title: e.target.value })} />
              </Field>
              <Field label="Short description">
                <textarea className={textareaClass} value={m.description} onChange={(e) => updateModule(m.id, { description: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Access level">
                  <select className={selectClass} value={m.accessLevel} onChange={(e) => updateModule(m.id, { accessLevel: e.target.value as ProductModule["accessLevel"] })}>
                    <option value="included">Included</option>
                    <option value="purchasable">Individually purchasable</option>
                    <option value="paid_update">Paid update</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </Field>
                <Field label="Parent module">
                  <select className={selectClass} value={m.parentModuleId ?? ""} onChange={(e) => updateModule(m.id, { parentModuleId: e.target.value || null })}>
                    <option value="">None (root)</option>
                    {modules.filter((o) => o.id !== m.id).map((o) => (
                      <option key={o.id} value={o.id}>{o.title}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Sort order">
                  <input className={inputClass} type="number" value={m.sortOrder} onChange={(e) => updateModule(m.id, { sortOrder: Number(e.target.value) })} />
                </Field>
                <Field label="Badge">
                  <input className={inputClass} value={m.badge ?? ""} onChange={(e) => updateModule(m.id, { badge: e.target.value || null })} />
                </Field>
                <Field label="Cash price (₹)">
                  <input className={inputClass} type="number" value={m.cashPrice ?? ""} onChange={(e) => updateModule(m.id, { cashPrice: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label="Sale price (₹)">
                  <input className={inputClass} type="number" value={m.salePrice ?? ""} onChange={(e) => updateModule(m.id, { salePrice: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>

              </div>
              <Field label="Required previous module IDs" hint="Comma separated">
                <input className={inputClass} value={m.requiredPreviousModuleIds.join(", ")} onChange={(e) => updateModule(m.id, { requiredPreviousModuleIds: csvToList(e.target.value) })} />
              </Field>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-5 w-5" checked={m.individuallyPurchasable} onChange={(e) => updateModule(m.id, { individuallyPurchasable: e.target.checked })} />
                  Individually purchasable
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-5 w-5" checked={m.includeInBundle} onChange={(e) => updateModule(m.id, { includeInBundle: e.target.checked })} />
                  Include in full bundle
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-5 w-5" checked={m.previewAvailable} onChange={(e) => updateModule(m.id, { previewAvailable: e.target.checked })} />
                  Preview available
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-5 w-5" checked={m.active} onChange={(e) => updateModule(m.id, { active: e.target.checked })} />
                  Active
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-5 w-5" checked={m.visibility === "visible"} onChange={(e) => updateModule(m.id, { visibility: e.target.checked ? "visible" : "hidden" })} />
                  Visible
                </label>
              </div>

              <ResourcesEditor
                resources={m.resources}
                onChange={(resources) => updateModule(m.id, { resources })}
                paidUpdates={paidUpdates}
              />

              <DangerButton onClick={() => removeModule(m.id)} className="w-full">Delete module</DangerButton>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ResourcesEditor({
  resources,
  onChange,
  paidUpdates,
}: {
  resources: ProductResource[];
  onChange: (resources: ProductResource[]) => void;
  paidUpdates: PaidUpdate[];
}) {
  function addResource() {
    const id = genLocalId("res");
    const next: ProductResource = {
      id,
      name: "New resource",
      type: "youtube",
      url: "",
      provider: "YouTube",
      sortOrder: resources.length,
      visibility: "visible",
      accessLevel: "included",
      paidUpdateId: null,
      cashPrice: null,
      coinPrice: null,
    };
    onChange([...resources, next]);
  }
  function updateResource(id: string, patch: Partial<ProductResource>) {
    onChange(resources.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeResource(id: string) {
    onChange(resources.filter((r) => r.id !== id));
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700">URL resources ({resources.length})</p>
        <SecondaryButton className="h-8 px-2 text-xs" onClick={addResource}>+ Add resource</SecondaryButton>
      </div>
      {resources.map((r) => (
        <div key={r.id} className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass + " h-9"} placeholder="Name" value={r.name} onChange={(e) => updateResource(r.id, { name: e.target.value })} />
            <select className={selectClass + " h-9"} value={r.type} onChange={(e) => updateResource(r.id, { type: e.target.value as ProductResource["type"] })}>
              {RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <input className={inputClass + " h-9"} placeholder="https:// URL or embed link" value={r.url} onChange={(e) => updateResource(r.id, { url: e.target.value })} />
          {r.type === "whimsical" && (
            <p className="text-[11px] text-slate-500">Whimsical → Share → Enable Public Access → Copy URL</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <select className={selectClass + " h-9"} value={r.accessLevel} onChange={(e) => updateResource(r.id, { accessLevel: e.target.value as ProductResource["accessLevel"] })}>
              <option value="included">Included</option>
              <option value="purchasable">Purchasable</option>
              <option value="paid_update">Paid update</option>
              <option value="hidden">Hidden</option>
            </select>
            <select className={selectClass + " h-9"} value={r.paidUpdateId ?? ""} onChange={(e) => updateResource(r.id, { paidUpdateId: e.target.value || null })}>
              <option value="">No paid update</option>
              {paidUpdates.map((u) => (
                <option key={u.id} value={u.id}>{u.title}</option>
              ))}
            </select>
          </div>
          <input className={inputClass + " h-9"} type="number" placeholder="Cash price" value={r.cashPrice ?? ""} onChange={(e) => updateResource(r.id, { cashPrice: e.target.value === "" ? null : Number(e.target.value) })} />
          <button type="button" className="text-xs text-red-600" onClick={() => removeResource(r.id)}>Remove resource</button>
        </div>
      ))}
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
          <Field label="Included module/resource IDs" hint="Comma separated">
            <input className={inputClass} value={u.includedIds.join(", ")} onChange={(e) => updateOne(u.id, { includedIds: csvToList(e.target.value) })} />
          </Field>
          {modules.length > 0 && <p className="text-[11px] text-slate-400">Available module IDs: {modules.map((m) => m.id).join(", ")}</p>}
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
