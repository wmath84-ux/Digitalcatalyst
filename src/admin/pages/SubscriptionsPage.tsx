"use client";

import { useEffect, useState } from "react";
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
};

/** Subscription add-on product (like features but unlocks real products). */
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
};

const EMPTY_PLAN: Partial<Plan> = { name: "", description: "", billingCycles: [{ cycle: "monthly", label: "Monthly", price: 0 }], accessTier: "basic", cta: "Subscribe", featured: false, active: true };
const EMPTY_FEATURE: Partial<FeatureRow> = { key: "", name: "", description: "", individualPrice: "0", monthlyPrice: "", yearlyPrice: "", planPricing: {}, icon: "sparkles", included: false, badge: "", sortOrder: 0, active: true };
const EMPTY_SUB_PRODUCT: Partial<SubscriptionProductRow> = { productId: "", name: "", individualPrice: "0", monthlyPrice: "", yearlyPrice: "", planPricing: {}, included: false, sortOrder: 0, active: true };

export default function SubscriptionsPage() {
  const [tab, setTab] = useState("plans");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [features, setFeatures] = useState<FeatureRow[] | null>(null);
  const [subscriptionProducts, setSubscriptionProducts] = useState<SubscriptionProductRow[] | null>(null);
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
      const [p, f, sp, r] = await Promise.all([
        adminFetch<{ plans: Plan[] }>("/api/admin/subscriptions/plans"),
        adminFetch<{ features: FeatureRow[] }>("/api/admin/subscriptions/features"),
        adminFetch<{ products: SubscriptionProductRow[] }>("/api/admin/subscriptions/products"),
        adminFetch<{ settings: { enabled?: boolean; discountPaise?: number; maxUsesPerReferrer?: number | null } }>("/api/admin/subscriptions/referrals"),
      ]);
      setPlans(p.plans);
      // Keep every active/inactive catalog feature visible here. The public
      // subscription page is driven by this same collection, so hiding all
      // but My Day made the other feature cards impossible to configure.
      setFeatures(f.features);
      setSubscriptionProducts(sp.products || []);
      setReferralSettings({ enabled: r.settings.enabled !== false, discountPaise: Number(r.settings.discountPaise ?? 25000), maxUsesPerReferrer: r.settings.maxUsesPerReferrer ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscriptions.");
    }
  };

  useEffect(() => { load(); }, []);

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
          {plans.length === 0 ? <EmptyState title="No plans yet" /> : (
            <div className="space-y-2">
              {plans.map((p) => (
                <RecordCard key={p.id}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{p.name} {p.featured && "⭐"}</span>
                    <Pill tone={p.active ? "success" : "default"}>{p.active ? "active" : "inactive"}</Pill>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{p.description}</p>
                  <p className="mt-1 text-xs text-slate-600">{p.billingCycles?.map((c) => `${c.label}: ₹${c.price}`).join(" · ")}</p>
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
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{(subscriptionProducts || []).length} subscription product(s) · Add products that can be purchased individually or unlocked free per plan / duration</p>
            <PrimaryButton onClick={() => setEditingSubscriptionProduct({ ...EMPTY_SUB_PRODUCT })}>+ Add product</PrimaryButton>
          </div>
          {(subscriptionProducts || []).length === 0 ? <EmptyState title="No subscription products yet" /> : (
            <div className="space-y-2">
              {(subscriptionProducts || []).map((sp) => (
                <RecordCard key={sp.id}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{sp.name}</span>
                    <Pill tone={sp.active ? "success" : "default"}>{sp.active ? "active" : "inactive"}</Pill>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{sp.productId} · {sp.included ? "Included / free" : `₹${sp.individualPrice} base`}</p>
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Individual price (₹)" hint="Base rate; overridden by the cycle/plan rules below"><input className={inputClass} type="number" min="0" value={editingFeature.individualPrice ?? "0"} onChange={(e) => setEditingFeature({ ...editingFeature, individualPrice: e.target.value })} /></Field>
              <Field label="Icon key" hint="calendar, rocket, code, users…"><input className={inputClass} value={editingFeature.icon ?? "sparkles"} onChange={(e) => setEditingFeature({ ...editingFeature, icon: e.target.value })} /></Field>
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

      {/* Subscription Products Sheet — add individual products (courses) with per-plan / per-duration pricing + free checkbox */}
      <Sheet open={!!editingSubscriptionProduct} onClose={() => setEditingSubscriptionProduct(null)} title={editingSubscriptionProduct?.id ? "Edit subscription product" : "Add subscription product"} footer={<PrimaryButton className="w-full" loading={saving} onClick={saveSubscriptionProduct}>Save subscription product</PrimaryButton>}>
        {editingSubscriptionProduct && (
          <div className="space-y-3">
            <Field label="Product ID (exact id from Products)" required hint="Must match a live product id or document id"><input className={inputClass} placeholder="e.g. 1001 or course-xyz" value={editingSubscriptionProduct.productId ?? ""} onChange={(e) => setEditingSubscriptionProduct({ ...editingSubscriptionProduct, productId: e.target.value })} /></Field>
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
