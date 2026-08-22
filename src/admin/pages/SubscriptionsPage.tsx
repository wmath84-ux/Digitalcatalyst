"use client";

import { useEffect, useMemo, useState } from "react";
import { DangerButton, EmptyState, ErrorState, Field, LoadingState, Pill, PrimaryButton, RecordCard, SecondaryButton, Sheet, Tabs, inputClass, selectClass, textareaClass } from "@/components/admin/ui";
import { useConfirm, useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";
import { resolveFeaturePrice, toPaise } from "../../../utils/featurePricing";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  billingCycles: { cycle: string; label: string; price: number }[] | null;
  accessTier: string | null;
  badge: string | null;
  cta: string | null;
  featured: boolean;
  active: boolean;
  revisionTestBankLimits: { monthly: number; yearly: number };
  aiAllowances: {
    monthly: { dailyGenerationLimit: number; costBudgetMicros: number };
    yearly: { dailyGenerationLimit: number; costBudgetMicros: number };
  };
};

/** Per-plan price override stored on a feature doc. */
type PlanPriceOverride = { included?: boolean; monthly?: number | string | null; yearly?: number | string | null };

type FeatureRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  individualPrice: string | null;
  /** Optional cycle-specific base rates (rupees). Blank = use flat price. */
  monthlyPrice?: string | null;
  yearlyPrice?: string | null;
  /** Optional per-plan overrides keyed by plan id. */
  planPricing?: Record<string, PlanPriceOverride>;
  icon: string | null;
  included: boolean;
  badge: string | null;
  sortOrder: number;
  active: boolean;
  /** Non-subscriber item creations allowed each calendar day (My Day only). */
  freeItemsPerDay?: number;
};

/** Subscription add-on product (like features but unlocks real products). */
type ProductOption = {
  id: string;
  title: string;
  category?: string | null;
  productType?: string | null;
  regularPrice?: string | number | null;
  salePrice?: string | number | null;
  price?: string | number | null;
  visibility?: string | null;
  availableForSale?: boolean;
  isFree?: boolean;
  images?: Array<{ url: string }> | null;
};

type SubscriptionProductRow = {
  id: string;
  productId: string;
  name: string;
  description?: string | null;
  individualPrice: string | null;
  monthlyPrice?: string | null;
  yearlyPrice?: string | null;
  planPricing?: Record<string, PlanPriceOverride>;
  included: boolean;
  sortOrder: number;
  active: boolean;
  /** True when an explicit pricing doc exists in subscriptionPlanProducts (vs virtual auto row) */
  hasOverride?: boolean;
};

const EMPTY_PLAN: Partial<Plan> = { name: "", description: "", billingCycles: [{ cycle: "monthly", label: "Monthly", price: 0 }, { cycle: "yearly", label: "Yearly", price: 0 }], revisionTestBankLimits: { monthly: 20, yearly: 20 }, aiAllowances: { monthly: { dailyGenerationLimit: 20, costBudgetMicros: -1 }, yearly: { dailyGenerationLimit: 20, costBudgetMicros: -1 } }, accessTier: "basic", cta: "Subscribe", featured: false, active: true };
const EMPTY_FEATURE: Partial<FeatureRow> = { key: "", name: "", description: "", individualPrice: "0", monthlyPrice: "", yearlyPrice: "", planPricing: {}, icon: "sparkles", included: false, badge: "", sortOrder: 0, freeItemsPerDay: 1, active: true };
const EMPTY_SUB_PRODUCT: Partial<SubscriptionProductRow> = { productId: "", name: "", individualPrice: "0", monthlyPrice: "", yearlyPrice: "", planPricing: {}, included: false, sortOrder: 0, active: true };

export default function SubscriptionsPage() {
  const [tab, setTab] = useState("plans");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [features, setFeatures] = useState<FeatureRow[] | null>(null);
  const [subscriptionProducts, setSubscriptionProducts] = useState<SubscriptionProductRow[] | null>(null);
  const [availableProducts, setAvailableProducts] = useState<ProductOption[]>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  // New: dedicated catalog picker for the Products tab's Add Product flow
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [quickAddingId, setQuickAddingId] = useState<string | null>(null);
  const [referralSettings, setReferralSettings] = useState({ enabled: true, discountPaise: 25000, maxUsesPerReferrer: null as number | null });
  const [error, setError] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<Partial<Plan> | null>(null);
  const [editingFeature, setEditingFeature] = useState<Partial<FeatureRow> | null>(null);
  const [editingSubscriptionProduct, setEditingSubscriptionProduct] = useState<Partial<SubscriptionProductRow> | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const { notify } = useToast();

  const load = async () => {
    try {
      const [p, f, sp, r, allProducts] = await Promise.all([
        adminFetch<{ plans: Plan[] }>("/api/admin/subscriptions/plans"),
        adminFetch<{ features: FeatureRow[] }>("/api/admin/subscriptions/features"),
        adminFetch<{ products: SubscriptionProductRow[] }>("/api/admin/subscriptions/products"),
        adminFetch<{ settings: { enabled?: boolean; discountPaise?: number; maxUsesPerReferrer?: number | null } }>("/api/admin/subscriptions/referrals"),
        adminFetch<{ products: ProductOption[] }>("/api/admin/products"),
      ]);
      setPlans(p.plans);
      // Keep every active/inactive catalog feature visible here. The public
      // subscription page is driven by this same collection, so hiding all
      // but My Day made the other feature cards impossible to configure.
      setFeatures(f.features);
      setSubscriptionProducts(sp.products || []);
      setReferralSettings({ enabled: r.settings.enabled !== false, discountPaise: Number(r.settings.discountPaise ?? 25000), maxUsesPerReferrer: r.settings.maxUsesPerReferrer ?? null });
      setAvailableProducts(allProducts.products || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscriptions.");
    }
  };

  useEffect(() => { load(); }, []);

  // Auto-refresh when viewing Products tab so a newly created product
  // appears directly without manual reload — as requested.
  useEffect(() => {
    if (tab !== "products") return;
    const interval = setInterval(() => { load(); }, 15000);
    return () => clearInterval(interval);
  }, [tab]);

  async function savePlan() {
    if (!editingPlan?.name) { notify("error", "Plan name required."); return; }
    setSaving(true);
    try {
      if (editingPlan.id) await adminFetch("/api/admin/subscriptions/plans", { method: "PATCH", body: JSON.stringify(editingPlan) });
      else await adminFetch("/api/admin/subscriptions/plans", { method: "POST", body: JSON.stringify(editingPlan) });
      notify("success", "Plan saved.");
      setEditingPlan(null);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save plan.");
    } finally { setSaving(false); }
  }

  async function removePlan(p: Plan) {
    const { confirmed } = await confirm({ title: `Delete plan "${p.name}"?`, destructive: true, confirmLabel: "Delete" });
    if (!confirmed) return;
    await adminFetch("/api/admin/subscriptions/plans", { method: "PATCH", body: JSON.stringify({ id: p.id, delete: true }) });
    notify("success", "Plan deleted.");
    load();
  }

  async function saveFeature() {
    if (!editingFeature?.name || !editingFeature?.key) { notify("error", "Feature key and name required."); return; }
    setSaving(true);
    try {
      if (editingFeature.id) await adminFetch("/api/admin/subscriptions/features", { method: "PATCH", body: JSON.stringify(editingFeature) });
      else await adminFetch("/api/admin/subscriptions/features", { method: "POST", body: JSON.stringify(editingFeature) });
      notify("success", "Feature saved.");
      setEditingFeature(null);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save feature.");
    } finally { setSaving(false); }
  }

  async function removeFeature(f: FeatureRow) {
    const { confirmed } = await confirm({ title: `Delete feature "${f.name}"?`, destructive: true, confirmLabel: "Delete" });
    if (!confirmed) return;
    await adminFetch("/api/admin/subscriptions/features", { method: "PATCH", body: JSON.stringify({ id: f.id, delete: true }) });
    notify("success", "Feature deleted.");
    load();
  }

  async function saveReferralSettings() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/subscriptions/referrals", { method: "PATCH", body: JSON.stringify(referralSettings) });
      notify("success", "Referral settings saved.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not save referral settings.");
    } finally { setSaving(false); }
  }

  async function saveSubscriptionProduct() {
    if (!editingSubscriptionProduct?.name || !editingSubscriptionProduct?.productId) { notify("error", "Product ID and name required."); return; }
    setSaving(true);
    try {
      if (editingSubscriptionProduct.id) await adminFetch("/api/admin/subscriptions/products", { method: "PATCH", body: JSON.stringify(editingSubscriptionProduct) });
      else await adminFetch("/api/admin/subscriptions/products", { method: "POST", body: JSON.stringify(editingSubscriptionProduct) });
      notify("success", "Subscription product saved.");
      setEditingSubscriptionProduct(null);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save subscription product.");
    } finally { setSaving(false); }
  }

  async function removeSubscriptionProduct(p: SubscriptionProductRow) {
    const { confirmed } = await confirm({ title: `Delete subscription product "${p.name}"?`, destructive: true, confirmLabel: "Delete" });
    if (!confirmed) return;
    await adminFetch("/api/admin/subscriptions/products", { method: "PATCH", body: JSON.stringify({ id: p.id, delete: true }) });
    notify("success", "Subscription product deleted.");
    load();
  }

  const rupeeNumber = (value: unknown) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
  const productPrice = (product: ProductOption) => product.isFree ? 0 : rupeeNumber(product.salePrice ?? product.regularPrice ?? product.price ?? 0);
  const selectAvailableProduct = (product: ProductOption) => {
    setEditingSubscriptionProduct({
      ...editingSubscriptionProduct,
      productId: String(product.id),
      name: product.title || String(product.id),
      description: product.category || product.productType || editingSubscriptionProduct?.description || "",
      individualPrice: String(productPrice(product)),
      active: product.visibility !== "hidden" && product.availableForSale !== false,
    });
    setProductPickerOpen(false);
  };

  // Keep EMPTY_SUB_PRODUCT referenced so TS noEmit stays clean (used as fallback defaults)
  void EMPTY_SUB_PRODUCT;
  // Direct one-click add from catalog picker → creates/updates the subscription product pricing doc
  const handleQuickAdd = async (product: ProductOption) => {
    const productId = String(product.id);
    setQuickAddingId(productId);
    try {
      const price = productPrice(product);
      // Check if already has override — if yes, just open editor for pricing config
      const existing = (subscriptionProducts || []).find((sp) => String(sp.productId) === productId);
      // If it's already a real configured product, open its editor instead of duplicate toast
      if (existing && existing.hasOverride) {
        setCatalogPickerOpen(false);
        setEditingSubscriptionProduct(existing);
        return;
      }
      // Create / ensure pricing doc exists so it is explicitly part of subscription feature
      await adminFetch("/api/admin/subscriptions/products", {
        method: "POST",
        body: JSON.stringify({
          id: productId,
          productId,
          name: product.title || productId,
          description: product.category || product.productType || "",
          individualPrice: String(price),
          monthlyPrice: "",
          yearlyPrice: "",
          planPricing: {},
          included: false,
          sortOrder: 0,
          active: product.visibility !== "hidden" && product.availableForSale !== false,
        }),
      });
      notify("success", `"${product.title || productId}" subscription product feature me add ho gaya.`);
      setCatalogPickerOpen(false);
      // Reload so the new/updated row appears directly in the list
      await load();
      // Optionally open editor for immediate plan-wise pricing configuration
      // Find the fresh row and open it
      // We delay slightly to allow state update
      setTimeout(() => {
        // Re-find from latest — but we can just open with product data prefilled
        setEditingSubscriptionProduct({
          productId,
          name: product.title || productId,
          description: product.category || product.productType || "",
          individualPrice: String(price),
          monthlyPrice: "",
          yearlyPrice: "",
          planPricing: {},
          included: false,
          sortOrder: 0,
          active: true,
        });
      }, 300);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to add product to subscription.");
    } finally {
      setQuickAddingId(null);
    }
  };

  const filteredCatalogProducts = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return availableProducts;
    return availableProducts.filter((p) => `${p.id} ${p.title} ${p.category || ""} ${p.productType || ""}`.toLowerCase().includes(q));
  }, [availableProducts, catalogSearch]);

  const hasOverrideSet = useMemo(() => {
    const s = new Set<string>();
    for (const sp of subscriptionProducts || []) {
      if (sp.hasOverride) s.add(String(sp.productId));
    }
    return s;
  }, [subscriptionProducts]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!plans || !features) return <LoadingState />;

  return (
    <div className="space-y-3 pb-6">
      <Tabs tabs={[{ key: "plans", label: "Plans" }, { key: "features", label: "Features" }, { key: "products", label: "Products" }, { key: "referrals", label: "Referrals" }]} active={tab} onChange={setTab} />

      {tab === "plans" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{plans.length} plan(s)</p>
            <PrimaryButton onClick={() => setEditingPlan(EMPTY_PLAN)}>+ Add plan</PrimaryButton>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3 text-xs leading-relaxed text-violet-900">
            <p className="font-semibold">💡 Customise prices for subscribed users</p>
            <p className="mt-1 text-[11px]">
              Every price on this page is per subscriber: the <strong>plan price</strong> is
              charged at checkout, and each <strong>feature / product</strong> can have its own
              monthly, yearly and per-plan rate (or be free on a specific plan). Set an item
              cheaper on a higher plan — or free on it — and upgrading becomes cheaper than
              buying the item separately. Existing members can upgrade to any plan, and they
              can also add features / courses to their current plan while paying only for the
              new items.
            </p>
          </div>
          {plans.length === 0 ? <EmptyState title="No plans yet" /> : (
            <div className="space-y-2">
              {plans.map((p) => (
                <RecordCard key={p.id}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{p.name} {p.featured && "⭐"}</span>
                    <Pill tone={p.active ? "success" : "default"}>{p.active ? "active" : "inactive"}</Pill>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{p.description}</p>
                  <p className="mt-1 text-xs text-slate-600">{p.billingCycles?.map((c) => `${c.label}: ${Number(c.price) === 0 ? "FREE" : `₹${c.price}`}`).join(" · ")}</p>
                  <p className="mt-1 text-[11px] font-semibold text-indigo-600">
                    Test Bank: {p.revisionTestBankLimits?.monthly === -1 ? "Unlimited" : `${p.revisionTestBankLimits?.monthly ?? 20} monthly`} · {p.revisionTestBankLimits?.yearly === -1 ? "Unlimited yearly" : `${p.revisionTestBankLimits?.yearly ?? 20} yearly`}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-violet-600">
                    School AI/day: {p.aiAllowances?.monthly?.dailyGenerationLimit === 0 ? "Unlimited" : p.aiAllowances?.monthly?.dailyGenerationLimit ?? 20} monthly · {p.aiAllowances?.yearly?.dailyGenerationLimit === 0 ? "Unlimited" : p.aiAllowances?.yearly?.dailyGenerationLimit ?? 20} yearly
                  </p>
                  <div className="mt-2 flex gap-2">
                    <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => setEditingPlan(p)}>Edit</SecondaryButton>
                    <DangerButton className="h-9 flex-1 text-xs" onClick={() => removePlan(p)}>Delete</DangerButton>
                  </div>
                </RecordCard>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "features" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{features.length} feature(s) · Configure My Day or any feature · Delete/deactivate to remove its subscription gate</p>
            <PrimaryButton onClick={() => setEditingFeature({ ...EMPTY_FEATURE })}>+ Add feature</PrimaryButton>
          </div>
          {features.length === 0 ? <EmptyState title="No features yet" /> : (
            <div className="space-y-2">
              {features.map((f) => (
                <RecordCard key={f.id}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{f.name}</span>
                    <Pill tone={f.active ? "success" : "default"}>{f.active ? "active" : "inactive"}</Pill>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{f.key} · {f.included ? "Included in plan" : `₹${f.individualPrice} base`} {f.badge ? `· ${f.badge}` : ""}</p>
                  {!f.included && (f.monthlyPrice || f.yearlyPrice || Object.keys(f.planPricing ?? {}).length > 0) && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {f.monthlyPrice ? <Pill tone="info">mo ₹{f.monthlyPrice}</Pill> : null}
                      {f.yearlyPrice ? <Pill tone="info">yr ₹{f.yearlyPrice}</Pill> : null}
                      {Object.entries(f.planPricing ?? {}).map(([planId, override]) => (
                        <Pill key={planId} tone={override.included ? "success" : "default"}>
                          {(plans.find((p) => p.id === planId)?.name ?? planId)}
                          {override.included ? ": free" : `: ${override.monthly ? `₹${override.monthly}/mo` : ""}${override.monthly && override.yearly ? " · " : ""}${override.yearly ? `₹${override.yearly}/yr` : ""}`}
                        </Pill>
                      ))}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => setEditingFeature(f)}>Edit</SecondaryButton>
                    <DangerButton className="h-9 flex-1 text-xs" onClick={() => removeFeature(f)}>Delete</DangerButton>
                  </div>
                </RecordCard>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "products" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-900">
            <p className="font-semibold">🔄 Auto-sync enabled</p>
            <p className="mt-0.5">Jo bhi naya product aap Products section me add karenge, wo yahan <strong>directly dikhega</strong> — har 15 second me list refresh hoti hai. Naye product ko subscription feature me add karne ke liye <strong>+ Add product</strong> dabayein.</p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">{(subscriptionProducts || []).length} subscription product(s) · Add products that can be purchased individually or unlocked free per plan / duration</p>
            <div className="flex items-center gap-2">
              <SecondaryButton className="h-9 px-3 text-xs" onClick={() => load()}>↻ Refresh</SecondaryButton>
              <PrimaryButton onClick={() => { setCatalogSearch(""); setCatalogPickerOpen(true); }}>+ Add product</PrimaryButton>
            </div>
          </div>
          {(subscriptionProducts || []).length === 0 ? <EmptyState title="No subscription products yet" description="Click + Add product to choose from your available products." /> : (
            <div className="space-y-2">
              {(subscriptionProducts || []).map((sp) => (
                <RecordCard key={sp.id}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{sp.name}</span>
                    <div className="flex items-center gap-1.5">
                      {sp.hasOverride ? <Pill tone="info">custom pricing</Pill> : <Pill tone="default">auto</Pill>}
                      <Pill tone={sp.active ? "success" : "default"}>{sp.active ? "active" : "inactive"}</Pill>
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{sp.productId} · {sp.included ? "Included / free" : `₹${sp.individualPrice} base`} {sp.hasOverride ? "" : "· auto-synced from Products"}</p>
                  {!sp.included && (sp.monthlyPrice || sp.yearlyPrice || Object.keys(sp.planPricing ?? {}).length > 0) && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {sp.monthlyPrice ? <Pill tone="info">mo ₹{sp.monthlyPrice}</Pill> : null}
                      {sp.yearlyPrice ? <Pill tone="info">yr ₹{sp.yearlyPrice}</Pill> : null}
                      {Object.entries(sp.planPricing ?? {}).map(([planId, override]) => (
                        <Pill key={planId} tone={override.included ? "success" : "default"}>
                          {(plans.find((p) => p.id === planId)?.name ?? planId)}
                          {override.included ? ": free" : `: ${override.monthly ? `₹${override.monthly}/mo` : ""}${override.monthly && override.yearly ? " · " : ""}${override.yearly ? `₹${override.yearly}/yr` : ""}`}
                        </Pill>
                      ))}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => setEditingSubscriptionProduct(sp)}>Edit</SecondaryButton>
                    <DangerButton className="h-9 flex-1 text-xs" onClick={() => removeSubscriptionProduct(sp)}>Delete</DangerButton>
                  </div>
                </RecordCard>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "referrals" && (
        <RecordCard>
          <div className="space-y-4">
            <div><h3 className="text-sm font-semibold text-slate-900">Subscriber referral program</h3><p className="mt-1 text-xs text-slate-500">Codes are generated automatically after verified subscription payment.</p></div>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-5 w-5" checked={referralSettings.enabled} onChange={(event) => setReferralSettings({ ...referralSettings, enabled: event.target.checked })} /> Referral program enabled</label>
            <Field label="Referral discount (₹)"><input className={inputClass} type="number" min="0" value={referralSettings.discountPaise / 100} onChange={(event) => setReferralSettings({ ...referralSettings, discountPaise: Math.max(0, Math.round(Number(event.target.value || 0) * 100)) })} /></Field>
            <p className="text-xs text-slate-500">Each referral ID can be used only once. After that it shows as Used on the leaderboard.</p>
            <PrimaryButton className="w-full" loading={saving} onClick={saveReferralSettings}>Save referral settings</PrimaryButton>
          </div>
        </RecordCard>
      )}

      <Sheet open={!!editingPlan} onClose={() => setEditingPlan(null)} title={editingPlan?.id ? "Edit plan" : "Add plan"} footer={<PrimaryButton className="w-full" loading={saving} onClick={savePlan}>Save plan</PrimaryButton>}>
        {editingPlan && (
          <div className="space-y-3">
            <Field label="Name" required><input className={inputClass} value={editingPlan.name ?? ""} onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })} /></Field>
            <Field label="Description"><textarea className={textareaClass} value={editingPlan.description ?? ""} onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })} /></Field>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800">
              These plan prices are charged at checkout. Feature and product add-on prices are added separately.
              <span className="mt-1 block font-semibold text-emerald-700">Set a price to ₹0 to make this subscription FREE — buyers activate it without any payment (paid add-ons they select are still charged).</span>
            </div>
            <Field label="Monthly plan price (₹)">
              <input
                className={inputClass}
                type="number"
                value={editingPlan.billingCycles?.[0]?.price ?? 0}
                onChange={(e) => setEditingPlan({ ...editingPlan, billingCycles: [{ cycle: "monthly", label: "Monthly", price: Number(e.target.value) }, ...(editingPlan.billingCycles?.slice(1) ?? [])] })}
              />
            </Field>
            <Field label="Yearly plan price (₹)">
              <input
                className={inputClass}
                type="number"
                value={editingPlan.billingCycles?.[1]?.price ?? 0}
                onChange={(e) => setEditingPlan({ ...editingPlan, billingCycles: [editingPlan.billingCycles?.[0] ?? { cycle: "monthly", label: "Monthly", price: 0 }, { cycle: "yearly", label: "Yearly", price: Number(e.target.value) }] })}
              />
            </Field>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
              <p className="text-sm font-semibold text-slate-900">Revision Test Bank capacity</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                Maximum cloud-saved tests for each duration. Use −1 for unlimited. Retakes do not use another slot.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Monthly saved tests">
                  <input
                    className={inputClass}
                    type="number"
                    min={-1}
                    max={1000}
                    value={editingPlan.revisionTestBankLimits?.monthly ?? 20}
                    onChange={(e) => setEditingPlan({
                      ...editingPlan,
                      revisionTestBankLimits: {
                        monthly: Math.max(-1, Math.min(1000, Math.round(Number(e.target.value) || 0))),
                        yearly: editingPlan.revisionTestBankLimits?.yearly ?? 20,
                      },
                    })}
                  />
                </Field>
                <Field label="Yearly saved tests">
                  <input
                    className={inputClass}
                    type="number"
                    min={-1}
                    max={1000}
                    value={editingPlan.revisionTestBankLimits?.yearly ?? 20}
                    onChange={(e) => setEditingPlan({
                      ...editingPlan,
                      revisionTestBankLimits: {
                        monthly: editingPlan.revisionTestBankLimits?.monthly ?? 20,
                        yearly: Math.max(-1, Math.min(1000, Math.round(Number(e.target.value) || 0))),
                      },
                    })}
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
              <p className="text-sm font-semibold text-slate-900">School AI allowances</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                Configure each billing duration independently. Every successfully generated complete test uses one daily generation. Cost budget is the maximum school-model spend for that purchased term; leave it blank for unlimited. A learner&apos;s own API key never uses either allowance.
              </p>
              {(["monthly", "yearly"] as const).map((cycle) => {
                const allowance = editingPlan.aiAllowances?.[cycle] ?? { dailyGenerationLimit: 20, costBudgetMicros: -1 };
                const setAllowance = (patch: Partial<typeof allowance>) => setEditingPlan({
                  ...editingPlan,
                  aiAllowances: {
                    monthly: editingPlan.aiAllowances?.monthly ?? { dailyGenerationLimit: 20, costBudgetMicros: -1 },
                    yearly: editingPlan.aiAllowances?.yearly ?? { dailyGenerationLimit: 20, costBudgetMicros: -1 },
                    [cycle]: { ...allowance, ...patch },
                  },
                });
                return (
                  <div key={cycle} className="mt-3 rounded-lg border border-violet-100 bg-white p-2.5">
                    <p className="mb-2 text-xs font-bold capitalize text-violet-800">{cycle} membership</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Successful tests / day" hint="0 = unlimited">
                        <input
                          className={inputClass}
                          type="number"
                          min={0}
                          max={10000}
                          value={allowance.dailyGenerationLimit}
                          onChange={(e) => setAllowance({ dailyGenerationLimit: Math.max(0, Math.min(10000, Math.round(Number(e.target.value) || 0))) })}
                        />
                      </Field>
                      <Field label="Term cost budget (USD)" hint="Blank = unlimited">
                        <input
                          className={inputClass}
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Unlimited"
                          value={allowance.costBudgetMicros < 0 ? "" : allowance.costBudgetMicros / 1_000_000}
                          onChange={(e) => setAllowance({ costBudgetMicros: e.target.value === "" ? -1 : Math.max(0, Math.min(1_000_000_000_000, Math.round(Number(e.target.value) * 1_000_000))) })}
                        />
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Access tier">
                <select className={selectClass} value={editingPlan.accessTier ?? "basic"} onChange={(e) => setEditingPlan({ ...editingPlan, accessTier: e.target.value })}>
                  {["basic", "pro", "premium"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="CTA label"><input className={inputClass} value={editingPlan.cta ?? ""} onChange={(e) => setEditingPlan({ ...editingPlan, cta: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={!!editingPlan.featured} onChange={(e) => setEditingPlan({ ...editingPlan, featured: e.target.checked })} />
              Featured plan
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={!!editingPlan.active} onChange={(e) => setEditingPlan({ ...editingPlan, active: e.target.checked })} />
              Active
            </label>
          </div>
        )}
      </Sheet>

      <Sheet open={!!editingFeature} onClose={() => setEditingFeature(null)} title={editingFeature?.id ? "Edit feature" : "Add feature"} footer={<PrimaryButton className="w-full" loading={saving} onClick={saveFeature}>Save feature</PrimaryButton>}>
        {editingFeature && (
          <div className="space-y-3">
            <Field label="Feature key" required hint="Unique ID used by the subscription catalog"><input className={inputClass} placeholder="for example: ai-mentor" value={editingFeature.key ?? ""} disabled={!!editingFeature.id} onChange={(e) => setEditingFeature({ ...editingFeature, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-") })} /></Field>
            <Field label="Name" required><input className={inputClass} placeholder="Feature name shown to customers" value={editingFeature.name ?? ""} onChange={(e) => setEditingFeature({ ...editingFeature, name: e.target.value })} /></Field>
            <Field label="Description"><textarea className={textareaClass} placeholder="Explain what this feature includes" value={editingFeature.description ?? ""} onChange={(e) => setEditingFeature({ ...editingFeature, description: e.target.value })} /></Field>
            {(editingFeature.id === "my-day" || editingFeature.key === "my-day") && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
                <p className="text-sm font-semibold text-slate-900">Non-subscriber daily free creations</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                  Learners without an active My Day subscription can browse normally and create this many new tasks, schedule items, notes or reminders per calendar day. After it is used, creation is gated until the next daily reset.
                </p>
                <div className="mt-2">
                  <Field label="Free items per day" hint="Default 1 · use 0 for browse-only">
                    <input className={inputClass} type="number" min={0} max={100} value={editingFeature.freeItemsPerDay ?? 1} onChange={(e) => setEditingFeature({ ...editingFeature, freeItemsPerDay: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} />
                  </Field>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Individual price (₹)" hint="Base rate; overridden by the cycle/plan rules below"><input className={inputClass} type="number" min="0" value={editingFeature.individualPrice ?? "0"} onChange={(e) => setEditingFeature({ ...editingFeature, individualPrice: e.target.value })} /></Field>
              <Field label="Icon key" hint="calendar, brain, refresh-cw, rocket, code, users…"><input className={inputClass} value={editingFeature.icon ?? "sparkles"} onChange={(e) => setEditingFeature({ ...editingFeature, icon: e.target.value })} /></Field>
            </div>

            {/* Cycle-specific base rates — apply to every plan that has no
                explicit override below. Blank falls back to the base price. */}
            {editingFeature.included ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-800">This feature is marked free for everyone</p>
                <p className="mt-0.5 text-[11px] text-emerald-700">Buyers always see it as Free. Untick "Included / free feature" below to charge for it and unlock the Monthly / Yearly and plan-wise pricing controls.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">Monthly / Yearly pricing (optional)</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Charge a different rate per billing cycle on every plan. Leave blank to charge the individual price above for both cycles.</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Field label="Monthly (₹)"><input className={inputClass} type="number" min="0" placeholder="base" value={editingFeature.monthlyPrice ?? ""} onChange={(e) => setEditingFeature({ ...editingFeature, monthlyPrice: e.target.value })} /></Field>
                  <Field label="Yearly (₹)"><input className={inputClass} type="number" min="0" placeholder="base" value={editingFeature.yearlyPrice ?? ""} onChange={(e) => setEditingFeature({ ...editingFeature, yearlyPrice: e.target.value })} /></Field>
                </div>
              </div>
            )}

            {/* Per-plan overrides — the strongest rule. Lets the same feature
                cost differently (or be free) on each plan. */}
            {!editingFeature.included && plans.length > 0 && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                <p className="text-xs font-semibold text-slate-700">Plan-wise pricing (optional)</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Overrides the rates above for a specific plan. Blank = inherit.</p>
                <div className="mt-2 space-y-2">
                  {plans.map((plan) => {
                    const override: PlanPriceOverride = editingFeature.planPricing?.[plan.id] ?? {};
                    const setOverride = (next: PlanPriceOverride) => {
                      const map = { ...(editingFeature.planPricing ?? {}) };
                      const cleaned: PlanPriceOverride = { ...override, ...next };
                      const empty = !cleaned.included && (cleaned.monthly === "" || cleaned.monthly === null || cleaned.monthly === undefined) && (cleaned.yearly === "" || cleaned.yearly === null || cleaned.yearly === undefined);
                      if (empty) delete map[plan.id];
                      else map[plan.id] = cleaned;
                      setEditingFeature({ ...editingFeature, planPricing: map });
                    };
                    return (
                      <div key={plan.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800">{plan.name}</span>
                          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                            <input type="checkbox" className="h-4 w-4" checked={override.included === true} onChange={(e) => setOverride({ included: e.target.checked })} />
                            Free on this plan
                          </label>
                        </div>
                        {!override.included && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <input className={inputClass} type="number" min="0" placeholder="Monthly ₹" value={(override.monthly as string) ?? ""} onChange={(e) => setOverride({ monthly: e.target.value })} />
                            <input className={inputClass} type="number" min="0" placeholder="Yearly ₹" value={(override.yearly as string) ?? ""} onChange={(e) => setOverride({ yearly: e.target.value })} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Live preview — resolves the price with the SAME engine the
                subscription page and the payment server use, so the admin
                sees exactly what the buyer will be shown before saving. */}
            {plans.length > 0 && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                <p className="text-xs font-semibold text-slate-700">What buyers will see</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Resolved from the values above — same engine the subscription page and checkout use.</p>
                <div className="mt-2 space-y-1">
                  {plans.filter((p) => p.active).map((plan) => {
                    const previewDoc = {
                      id: editingFeature.key || "preview",
                      included: editingFeature.included === true,
                      pricePaise: toPaise(editingFeature.individualPrice ?? 0),
                      monthlyPricePaise: editingFeature.monthlyPrice === "" || editingFeature.monthlyPrice === null || editingFeature.monthlyPrice === undefined ? null : toPaise(editingFeature.monthlyPrice),
                      yearlyPricePaise: editingFeature.yearlyPrice === "" || editingFeature.yearlyPrice === null || editingFeature.yearlyPrice === undefined ? null : toPaise(editingFeature.yearlyPrice),
                      planPricing: editingFeature.planPricing ?? {},
                    };
                    const monthly = resolveFeaturePrice(previewDoc, plan.id, "monthly");
                    const yearly = resolveFeaturePrice(previewDoc, plan.id, "yearly");
                    const fmt = (r: { pricePaise: number; included: boolean }) => (r.included || r.pricePaise === 0 ? "Free" : `₹${Math.round(r.pricePaise / 100).toLocaleString("en-IN")}`);
                    return (
                      <div key={plan.id} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-[11px]">
                        <span className="font-semibold text-slate-800">{plan.name}</span>
                        <span className="text-slate-600">{fmt(monthly)}/mo · {fmt(yearly)}/yr</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Badge"><input className={inputClass} placeholder="POPULAR" value={editingFeature.badge ?? ""} onChange={(e) => setEditingFeature({ ...editingFeature, badge: e.target.value })} /></Field>
              <Field label="Display order"><input className={inputClass} type="number" value={editingFeature.sortOrder ?? 0} onChange={(e) => setEditingFeature({ ...editingFeature, sortOrder: Number(e.target.value || 0) })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={!!editingFeature.included} onChange={(e) => setEditingFeature({ ...editingFeature, included: e.target.checked, individualPrice: e.target.checked ? "0" : (editingFeature.individualPrice || "0") })} />
              Included / free feature (no add-on charge)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={!!editingFeature.active} onChange={(e) => setEditingFeature({ ...editingFeature, active: e.target.checked })} />
              Visible and selectable on subscription page
            </label>
          </div>
        )}
      </Sheet>

      {/* Catalog picker: shows every available product and lets admin one-click add to subscription */}
      <Sheet open={catalogPickerOpen} onClose={() => setCatalogPickerOpen(false)} title="Add product to subscription" footer={
        <div className="flex gap-2">
          <SecondaryButton className="flex-1" onClick={() => setCatalogPickerOpen(false)}>Close</SecondaryButton>
          <PrimaryButton className="flex-1" onClick={() => load()}>↻ Refresh list</PrimaryButton>
        </div>
      }>
        <div className="space-y-3">
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
            <p className="text-xs font-semibold text-slate-800">Sabhi available products</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Kisi bhi product per click karke use <strong>directly subscription product feature me add</strong> kar sakte hain. Naye products yahan automatically dikhenge.</p>
          </div>
          <input
            className={inputClass}
            placeholder="Search products — title, category ya ID se..."
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-slate-500">{filteredCatalogProducts.length} product(s) · {availableProducts.length} total · {subscriptionProducts?.length ?? 0} in subscription</p>
          {availableProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">Koi product nahi mila</p>
              <p className="mt-1 text-xs text-slate-500">Pehle <strong>Products → + Add product</strong> se product banayein — yahan wo turant dikhega.</p>
            </div>
          ) : filteredCatalogProducts.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Search se koi product nahi mila.</p>
          ) : (
            <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
              {filteredCatalogProducts.map((product) => {
                const alreadyHasOverride = hasOverrideSet.has(String(product.id));
                const existingRow = (subscriptionProducts || []).find((sp) => String(sp.productId) === String(product.id));
                const isAuto = existingRow && !existingRow.hasOverride;
                const isAdding = quickAddingId === String(product.id);
                return (
                  <div key={product.id} className={`flex items-center gap-3 rounded-xl border p-2.5 ${alreadyHasOverride ? "border-emerald-200 bg-emerald-50/50" : isAuto ? "border-slate-200 bg-slate-50" : "border-violet-200 bg-white"}`}>
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {product.images?.[0]?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.images[0].url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg">📦</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{product.title || product.id}</p>
                      <p className="truncate text-[11px] text-slate-500">{product.id} · {product.category || product.productType || "Product"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Pill tone={product.visibility === "visible" ? "success" : "default"}>{product.visibility || "hidden"}</Pill>
                        {product.isFree ? <Pill tone="info">free</Pill> : <Pill tone="default">₹{productPrice(product).toLocaleString("en-IN")}</Pill>}
                        {alreadyHasOverride ? <Pill tone="success">added ✓</Pill> : isAuto ? <Pill tone="default">auto visible</Pill> : null}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {alreadyHasOverride ? (
                        <SecondaryButton className="h-9 px-3 text-xs" onClick={() => { setCatalogPickerOpen(false); if (existingRow) setEditingSubscriptionProduct(existingRow); }}>
                          Configure
                        </SecondaryButton>
                      ) : (
                        <PrimaryButton className="h-9 px-3 text-xs" loading={isAdding} onClick={() => handleQuickAdd(product)}>
                          + Add
                        </PrimaryButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
            <p className="font-semibold text-slate-800">Kaise kaam karta hai?</p>
            <ul className="mt-1 list-disc pl-4">
              <li><strong>+ Add</strong> per click karte hi product subscription feature me add ho jata hai aur list me <strong>directly dikhne lagta hai</strong>.</li>
              <li>Uske baad <strong>Configure</strong> se aap monthly / yearly aur per-plan price (Free on this plan) set kar sakte hain.</li>
              <li>Delete karne se wo subscription listing se hat jata hai, lekin Products me bana rehta hai.</li>
            </ul>
          </div>
        </div>
      </Sheet>

      {/* Subscription Products Sheet — add individual products (courses) with per-plan / per-duration pricing + free checkbox */}
      <Sheet open={!!editingSubscriptionProduct} onClose={() => { setEditingSubscriptionProduct(null); setProductPickerOpen(false); }} title={editingSubscriptionProduct?.id ? "Edit subscription product" : "Add subscription product"} footer={<PrimaryButton className="w-full" loading={saving} onClick={saveSubscriptionProduct}>Save subscription product</PrimaryButton>}>
        {editingSubscriptionProduct && (
          <div className="space-y-3">
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">Available products</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Pick a live product and it will be linked to this subscription add-on automatically.</p>
                </div>
                <SecondaryButton className="h-9 shrink-0 px-3 text-xs" onClick={() => setProductPickerOpen((open) => !open)}>
                  {productPickerOpen ? "Close" : "See available products"}
                </SecondaryButton>
              </div>
              {editingSubscriptionProduct.productId ? (
                <p className="mt-2 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-violet-800">
                  Selected: {editingSubscriptionProduct.name || editingSubscriptionProduct.productId} · {editingSubscriptionProduct.productId}
                </p>
              ) : null}
              {productPickerOpen ? (
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-violet-100 bg-white p-1.5 shadow-inner">
                  {availableProducts.length === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-slate-500">No products found. Create products first.</p>
                  ) : availableProducts.map((product) => {
                    const selected = String(editingSubscriptionProduct.productId || "") === String(product.id);
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => selectAvailableProduct(product)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${selected ? "bg-violet-600 text-white" : "hover:bg-violet-50"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{product.title || product.id}</span>
                          <span className={`block truncate text-[10px] ${selected ? "text-violet-100" : "text-slate-500"}`}>{product.id} · {product.category || product.productType || "Product"}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${selected ? "bg-white/20" : "bg-slate-100 text-slate-700"}`}>₹{productPrice(product).toLocaleString("en-IN")}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <Field label="Product ID (auto-filled from Products)" required hint="Manual editing is still allowed if you need a legacy ID"><input className={inputClass} placeholder="e.g. 1001 or course-xyz" value={editingSubscriptionProduct.productId ?? ""} onChange={(e) => setEditingSubscriptionProduct({ ...editingSubscriptionProduct, productId: e.target.value })} /></Field>
            <Field label="Display name" required><input className={inputClass} placeholder="e.g. AI Mastery Course" value={editingSubscriptionProduct.name ?? ""} onChange={(e) => setEditingSubscriptionProduct({ ...editingSubscriptionProduct, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Individual price (₹)" hint="Base rate"><input className={inputClass} type="number" min="0" value={editingSubscriptionProduct.individualPrice ?? "0"} onChange={(e) => setEditingSubscriptionProduct({ ...editingSubscriptionProduct, individualPrice: e.target.value })} /></Field>
              <Field label="Sort order"><input className={inputClass} type="number" value={editingSubscriptionProduct.sortOrder ?? 0} onChange={(e) => setEditingSubscriptionProduct({ ...editingSubscriptionProduct, sortOrder: Number(e.target.value || 0) })} /></Field>
            </div>

            {editingSubscriptionProduct.included ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-800">Marked free / included for everyone</p>
                <p className="mt-0.5 text-[11px] text-emerald-700">Buyers always get it free. Untick "Free / included" to unlock per-plan & duration pricing.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">Monthly / Yearly pricing (optional)</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Field label="Monthly (₹)"><input className={inputClass} type="number" min="0" placeholder="base" value={editingSubscriptionProduct.monthlyPrice ?? ""} onChange={(e) => setEditingSubscriptionProduct({ ...editingSubscriptionProduct, monthlyPrice: e.target.value })} /></Field>
                  <Field label="Yearly (₹)"><input className={inputClass} type="number" min="0" placeholder="base" value={editingSubscriptionProduct.yearlyPrice ?? ""} onChange={(e) => setEditingSubscriptionProduct({ ...editingSubscriptionProduct, yearlyPrice: e.target.value })} /></Field>
                </div>
              </div>
            )}

            {!editingSubscriptionProduct.included && plans.length > 0 && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                <p className="text-xs font-semibold text-slate-700">Plan-wise pricing + free toggle (optional)</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Override for each plan. "Free on this plan" unlocks it for buyers of that plan.</p>
                <div className="mt-2 space-y-2">
                  {plans.map((plan) => {
                    const override: PlanPriceOverride = editingSubscriptionProduct.planPricing?.[plan.id] ?? {};
                    const setOverride = (next: PlanPriceOverride) => {
                      const map = { ...(editingSubscriptionProduct.planPricing ?? {}) };
                      const cleaned: PlanPriceOverride = { ...override, ...next };
                      const empty = !cleaned.included && (cleaned.monthly === "" || cleaned.monthly === null || cleaned.monthly === undefined) && (cleaned.yearly === "" || cleaned.yearly === null || cleaned.yearly === undefined);
                      if (empty) delete map[plan.id];
                      else map[plan.id] = cleaned;
                      setEditingSubscriptionProduct({ ...editingSubscriptionProduct, planPricing: map });
                    };
                    return (
                      <div key={plan.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800">{plan.name}</span>
                          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                            <input type="checkbox" className="h-4 w-4" checked={override.included === true} onChange={(e) => setOverride({ included: e.target.checked })} />
                            Free on this plan
                          </label>
                        </div>
                        {!override.included && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <input className={inputClass} type="number" min="0" placeholder="Monthly ₹" value={(override.monthly as string) ?? ""} onChange={(e) => setOverride({ monthly: e.target.value })} />
                            <input className={inputClass} type="number" min="0" placeholder="Yearly ₹" value={(override.yearly as string) ?? ""} onChange={(e) => setOverride({ yearly: e.target.value })} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <p className="text-xs font-semibold text-slate-700">Preview — what buyers will see</p>
              <div className="mt-2 space-y-1">
                {plans.filter((p) => p.active).map((plan) => {
                  const previewDoc: any = {
                    id: editingSubscriptionProduct.productId || "preview",
                    included: editingSubscriptionProduct.included === true,
                    pricePaise: toPaise(editingSubscriptionProduct.individualPrice ?? 0),
                    monthlyPricePaise: editingSubscriptionProduct.monthlyPrice ? toPaise(editingSubscriptionProduct.monthlyPrice) : null,
                    yearlyPricePaise: editingSubscriptionProduct.yearlyPrice ? toPaise(editingSubscriptionProduct.yearlyPrice) : null,
                    planPricing: editingSubscriptionProduct.planPricing ?? {},
                  };
                  const monthly = resolveFeaturePrice(previewDoc, plan.id, "monthly");
                  const yearly = resolveFeaturePrice(previewDoc, plan.id, "yearly");
                  const fmt = (r: { pricePaise: number; included: boolean }) => (r.included || r.pricePaise === 0 ? "Free" : `₹${Math.round(r.pricePaise / 100).toLocaleString("en-IN")}`);
                  return (
                    <div key={plan.id} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-[11px]">
                      <span className="font-semibold text-slate-800">{plan.name}</span>
                      <span className="text-slate-600">{fmt(monthly)}/mo · {fmt(yearly)}/yr</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={!!editingSubscriptionProduct.included} onChange={(e) => setEditingSubscriptionProduct({ ...editingSubscriptionProduct, included: e.target.checked, individualPrice: e.target.checked ? "0" : (editingSubscriptionProduct.individualPrice || "0") })} />
              Free / included (unlocks for free when any plan is purchased)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={!!editingSubscriptionProduct.active} onChange={(e) => setEditingSubscriptionProduct({ ...editingSubscriptionProduct, active: e.target.checked })} />
              Active / selectable on subscription page
            </label>
          </div>
        )}
      </Sheet>
    </div>
  );
}
