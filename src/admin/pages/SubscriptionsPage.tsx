"use client";

import { useEffect, useState } from "react";
import { DangerButton, EmptyState, ErrorState, Field, LoadingState, Pill, PrimaryButton, RecordCard, SecondaryButton, Sheet, Tabs, inputClass, selectClass, textareaClass } from "@/components/admin/ui";
import { useConfirm, useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

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

type FeatureRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  individualPrice: string | null;
  active: boolean;
};

const EMPTY_PLAN: Partial<Plan> = { name: "", description: "", billingCycles: [{ cycle: "monthly", label: "Monthly", price: 0 }], accessTier: "basic", cta: "Subscribe", featured: false, active: false };
const EMPTY_FEATURE: Partial<FeatureRow> = { key: "", name: "", description: "", individualPrice: "0", active: true };

export default function SubscriptionsPage() {
  const [tab, setTab] = useState("plans");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [features, setFeatures] = useState<FeatureRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<Partial<Plan> | null>(null);
  const [editingFeature, setEditingFeature] = useState<Partial<FeatureRow> | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const { notify } = useToast();

  const load = async () => {
    try {
      const [p, f] = await Promise.all([
        adminFetch<{ plans: Plan[] }>("/api/admin/subscriptions/plans"),
        adminFetch<{ features: FeatureRow[] }>("/api/admin/subscriptions/features"),
      ]);
      setPlans(p.plans);
      setFeatures(f.features);
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

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!plans || !features) return <LoadingState />;

  return (
    <div className="space-y-3 pb-6">
      <Tabs tabs={[{ key: "plans", label: "Plans" }, { key: "features", label: "Features" }]} active={tab} onChange={setTab} />

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
            <p className="text-xs text-slate-500">{features.length} feature(s)</p>
            <PrimaryButton onClick={() => setEditingFeature(EMPTY_FEATURE)}>+ Add feature</PrimaryButton>
          </div>
          {features.length === 0 ? <EmptyState title="No features yet" /> : (
            <div className="space-y-2">
              {features.map((f) => (
                <RecordCard key={f.id}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{f.name}</span>
                    <Pill tone={f.active ? "success" : "default"}>{f.active ? "active" : "inactive"}</Pill>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{f.key} · ₹{f.individualPrice}</p>
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

      <Sheet open={!!editingPlan} onClose={() => setEditingPlan(null)} title={editingPlan?.id ? "Edit plan" : "Add plan"} footer={<PrimaryButton className="w-full" loading={saving} onClick={savePlan}>Save plan</PrimaryButton>}>
        {editingPlan && (
          <div className="space-y-3">
            <Field label="Name" required><input className={inputClass} value={editingPlan.name ?? ""} onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })} /></Field>
            <Field label="Description"><textarea className={textareaClass} value={editingPlan.description ?? ""} onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })} /></Field>
            <Field label="Monthly price (₹)">
              <input
                className={inputClass}
                type="number"
                value={editingPlan.billingCycles?.[0]?.price ?? 0}
                onChange={(e) => setEditingPlan({ ...editingPlan, billingCycles: [{ cycle: "monthly", label: "Monthly", price: Number(e.target.value) }, ...(editingPlan.billingCycles?.slice(1) ?? [])] })}
              />
            </Field>
            <Field label="Yearly price (₹)">
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
            <Field label="Feature key" required hint="e.g. ai_tutor"><input className={inputClass} value={editingFeature.key ?? ""} onChange={(e) => setEditingFeature({ ...editingFeature, key: e.target.value })} /></Field>
            <Field label="Name" required><input className={inputClass} value={editingFeature.name ?? ""} onChange={(e) => setEditingFeature({ ...editingFeature, name: e.target.value })} /></Field>
            <Field label="Description"><textarea className={textareaClass} value={editingFeature.description ?? ""} onChange={(e) => setEditingFeature({ ...editingFeature, description: e.target.value })} /></Field>
            <Field label="Individual price (₹)"><input className={inputClass} type="number" value={editingFeature.individualPrice ?? "0"} onChange={(e) => setEditingFeature({ ...editingFeature, individualPrice: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={!!editingFeature.active} onChange={(e) => setEditingFeature({ ...editingFeature, active: e.target.checked })} />
              Active
            </label>
          </div>
        )}
      </Sheet>
    </div>
  );
}
