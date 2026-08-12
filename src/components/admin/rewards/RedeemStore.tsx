"use client";

import { useEffect, useState } from "react";
import { DangerButton, EmptyState, ErrorState, Field, LoadingState, Pill, PrimaryButton, RecordCard, SecondaryButton, Sheet, inputClass, selectClass, textareaClass } from "@/components/admin/ui";
import { useConfirm, useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

type RedeemItem = {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  coinCost: number;
  rewardType: string;
  discount: string | null;
  stockLimit: number | null;
  perUserLimit: number;
  confirmationMessage: string | null;
  terms: string | null;
  sortOrder: number;
  status: string;
};

const EMPTY: Partial<RedeemItem> = { title: "", description: "", icon: "", coinCost: 0, rewardType: "coupon", discount: "", stockLimit: 0, perUserLimit: 1, confirmationMessage: "", terms: "", sortOrder: 0, status: "draft" };

export function RedeemStorePanel() {
  const [items, setItems] = useState<RedeemItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<RedeemItem> | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const { notify } = useToast();

  const load = async () => {
    try {
      const res = await adminFetch<{ redeemItems: RedeemItem[] }>("/api/admin/rewards/redeem-items");
      setItems(res.redeemItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load redeem store.");
    }
  };

  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing?.title) { notify("error", "Title is required."); return; }
    setSaving(true);
    try {
      if (editing.id) await adminFetch("/api/admin/rewards/redeem-items", { method: "PATCH", body: JSON.stringify(editing) });
      else await adminFetch("/api/admin/rewards/redeem-items", { method: "POST", body: JSON.stringify(editing) });
      notify("success", "Redeem item saved.");
      setEditing(null);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save item.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: RedeemItem) {
    const { confirmed } = await confirm({ title: `Delete "${item.title}"?`, destructive: true, confirmLabel: "Delete" });
    if (!confirmed) return;
    await adminFetch("/api/admin/rewards/redeem-items", { method: "PATCH", body: JSON.stringify({ id: item.id, delete: true }) });
    notify("success", "Redeem item deleted.");
    load();
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items) return <LoadingState />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{items.length} item(s)</p>
        <PrimaryButton onClick={() => setEditing(EMPTY)}>+ Add reward</PrimaryButton>
      </div>
      {items.length === 0 ? <EmptyState title="Redeem store is empty" /> : (
        <div className="space-y-2">
          {items.map((item) => (
            <RecordCard key={item.id}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{item.icon} {item.title}</span>
                <Pill tone={item.status === "active" ? "success" : "warn"}>{item.status}</Pill>
              </div>
              <p className="mt-1 text-xs text-slate-600">{item.coinCost} coins · {item.rewardType}</p>
              <div className="mt-2 flex gap-2">
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => setEditing(item)}>Edit</SecondaryButton>
                <DangerButton className="h-9 flex-1 text-xs" onClick={() => remove(item)}>Delete</DangerButton>
              </div>
            </RecordCard>
          ))}
        </div>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit reward" : "Add reward"} footer={<PrimaryButton className="w-full" loading={saving} onClick={save}>Save reward</PrimaryButton>}>
        {editing && (
          <div className="space-y-3">
            <Field label="Title" required><input className={inputClass} value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="Description"><textarea className={textareaClass} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Icon"><input className={inputClass} value={editing.icon ?? ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} /></Field>
              <Field label="Coin cost"><input className={inputClass} type="number" value={editing.coinCost ?? 0} onChange={(e) => setEditing({ ...editing, coinCost: Number(e.target.value) })} /></Field>
              <Field label="Reward type">
                <select className={selectClass} value={editing.rewardType ?? "coupon"} onChange={(e) => setEditing({ ...editing, rewardType: e.target.value })}>
                  {["coupon", "product_unlock", "module_unlock", "update_unlock", "subscription_access", "badge"].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Discount"><input className={inputClass} value={editing.discount ?? ""} onChange={(e) => setEditing({ ...editing, discount: e.target.value })} /></Field>
              <Field label="Stock limit"><input className={inputClass} type="number" value={editing.stockLimit ?? 0} onChange={(e) => setEditing({ ...editing, stockLimit: Number(e.target.value) })} /></Field>
              <Field label="Per-user limit"><input className={inputClass} type="number" value={editing.perUserLimit ?? 1} onChange={(e) => setEditing({ ...editing, perUserLimit: Number(e.target.value) })} /></Field>
              <Field label="Sort order"><input className={inputClass} type="number" value={editing.sortOrder ?? 0} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} /></Field>
              <Field label="Status">
                <select className={selectClass} value={editing.status ?? "draft"} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  {["draft", "active", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Confirmation message"><textarea className={textareaClass} value={editing.confirmationMessage ?? ""} onChange={(e) => setEditing({ ...editing, confirmationMessage: e.target.value })} /></Field>
            <Field label="Terms"><textarea className={textareaClass} value={editing.terms ?? ""} onChange={(e) => setEditing({ ...editing, terms: e.target.value })} /></Field>
          </div>
        )}
      </Sheet>
    </div>
  );
}
