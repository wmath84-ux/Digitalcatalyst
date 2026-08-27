"use client";

import { useEffect, useState } from "react";
import { DangerButton, EmptyState, ErrorState, Field, LoadingState, Pill, PrimaryButton, RecordCard, SecondaryButton, Sheet, inputClass, selectClass } from "@/components/admin/ui";
import { useConfirm, useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

type Coupon = {
  id: string;
  code: string;
  discountType: string;
  value: string;
  active: boolean;
  globalUsageLimit: number | null;
  perUserUsageLimit: number | null;
  minOrder: string | null;
  maxDiscount: string | null;
  firstPurchaseOnly: boolean;
  usedCount: number;
};

const EMPTY: Partial<Coupon> = { code: "", discountType: "percentage", value: "10", active: true, globalUsageLimit: 0, perUserUsageLimit: 1, minOrder: "0", maxDiscount: "0", firstPurchaseOnly: false };

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Coupon> | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const { notify } = useToast();

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const res = await adminFetch<{ coupons: Coupon[] }>(`/api/admin/coupons?${params.toString()}`);
      setCoupons(res.coupons);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coupons.");
    }
  };

  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing?.code) { notify("error", "Coupon code is required."); return; }
    setSaving(true);
    try {
      if (editing.id) await adminFetch("/api/admin/coupons", { method: "PATCH", body: JSON.stringify(editing) });
      else await adminFetch("/api/admin/coupons", { method: "POST", body: JSON.stringify(editing) });
      notify("success", "Coupon saved.");
      setEditing(null);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save coupon.");
    } finally { setSaving(false); }
  }

  async function toggleActive(c: Coupon) {
    await adminFetch("/api/admin/coupons", { method: "PATCH", body: JSON.stringify({ id: c.id, active: !c.active }) });
    load();
  }

  async function duplicate(c: Coupon) {
    await adminFetch("/api/admin/coupons", { method: "POST", body: JSON.stringify({ ...c, id: undefined, code: `${c.code}_COPY` }) });
    notify("success", "Coupon duplicated.");
    load();
  }

  async function remove(c: Coupon) {
    const { confirmed } = await confirm({ title: `Delete coupon "${c.code}"?`, destructive: true, confirmLabel: "Delete" });
    if (!confirmed) return;
    await adminFetch("/api/admin/coupons", { method: "PATCH", body: JSON.stringify({ id: c.id, delete: true }) });
    notify("success", "Coupon deleted.");
    load();
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!coupons) return <LoadingState />;

  return (
    <div className="space-y-3 pb-6 lg:space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2">
        <input className={inputClass + " flex-1"} placeholder="Search coupon code" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 lg:text-sm">{coupons.length} coupon(s)</p>
        <PrimaryButton onClick={() => setEditing(EMPTY)}>+ Add coupon</PrimaryButton>
      </div>

      {coupons.length === 0 ? <EmptyState title="No coupons yet" /> : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3 lg:gap-4">
          {coupons.map((c) => (
            <RecordCard key={c.id}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900 lg:text-[15px]">{c.code}</span>
                <Pill tone={c.active ? "success" : "default"}>{c.active ? "active" : "inactive"}</Pill>
              </div>
              <p className="mt-1 text-xs text-slate-600 lg:text-[13px]">
                {c.discountType === "percentage" ? `${c.value}% off` : `₹${c.value} off`} · min order ₹{c.minOrder}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 lg:text-[13px]">Used {c.usedCount}{c.globalUsageLimit ? ` / ${c.globalUsageLimit}` : ""}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => setEditing(c)}>Edit</SecondaryButton>
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => toggleActive(c)}>{c.active ? "Deactivate" : "Activate"}</SecondaryButton>
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => duplicate(c)}>Duplicate</SecondaryButton>
                <DangerButton className="h-9 flex-1 text-xs" onClick={() => remove(c)}>Delete</DangerButton>
              </div>
            </RecordCard>
          ))}
        </div>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit coupon" : "Add coupon"} footer={<PrimaryButton className="w-full" loading={saving} onClick={save}>Save coupon</PrimaryButton>}>
        {editing && (
          <div className="space-y-3">
            <Field label="Code" required><input className={inputClass} value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} /></Field>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Field label="Discount type">
                <select className={selectClass} value={editing.discountType ?? "percentage"} onChange={(e) => setEditing({ ...editing, discountType: e.target.value })}>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </Field>
              <Field label="Value"><input className={inputClass} type="number" value={editing.value ?? "0"} onChange={(e) => setEditing({ ...editing, value: e.target.value })} /></Field>
              <Field label="Global usage limit"><input className={inputClass} type="number" value={editing.globalUsageLimit ?? 0} onChange={(e) => setEditing({ ...editing, globalUsageLimit: Number(e.target.value) })} /></Field>
              <Field label="Per-user limit"><input className={inputClass} type="number" value={editing.perUserUsageLimit ?? 1} onChange={(e) => setEditing({ ...editing, perUserUsageLimit: Number(e.target.value) })} /></Field>
              <Field label="Minimum order (₹)"><input className={inputClass} type="number" value={editing.minOrder ?? "0"} onChange={(e) => setEditing({ ...editing, minOrder: e.target.value })} /></Field>
              <Field label="Maximum discount (₹)"><input className={inputClass} type="number" value={editing.maxDiscount ?? "0"} onChange={(e) => setEditing({ ...editing, maxDiscount: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={!!editing.firstPurchaseOnly} onChange={(e) => setEditing({ ...editing, firstPurchaseOnly: e.target.checked })} />
              First purchase only
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={!!editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Active
            </label>
          </div>
        )}
      </Sheet>
    </div>
  );
}
