"use client";

import { useEffect, useState } from "react";
import { DangerButton, EmptyState, ErrorState, Field, LoadingState, Pill, PrimaryButton, RecordCard, SecondaryButton, Sheet, inputClass, selectClass, textareaClass } from "@/components/admin/ui";
import { useConfirm, useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

type Streak = {
  id: string;
  title: string;
  icon: string | null;
  category: string | null;
  metric: string | null;
  goal: number;
  unit: string | null;
  frequency: string | null;
  consecutiveRequirement: number;
  gracePeriodHours: number;
  coinReward: number;
  motivationNote: string | null;
  status: string;
};

const EMPTY: Partial<Streak> = { title: "", icon: "", category: "", metric: "", goal: 1, unit: "days", frequency: "daily", consecutiveRequirement: 1, gracePeriodHours: 0, coinReward: 0, motivationNote: "", status: "draft" };

export function StreaksPanel() {
  const [streaks, setStreaks] = useState<Streak[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Streak> | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const { notify } = useToast();

  const load = async () => {
    try {
      const res = await adminFetch<{ streaks: Streak[] }>("/api/admin/rewards/streaks");
      setStreaks(res.streaks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load streaks.");
    }
  };

  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing?.title) { notify("error", "Title is required."); return; }
    setSaving(true);
    try {
      if (editing.id) await adminFetch("/api/admin/rewards/streaks", { method: "PATCH", body: JSON.stringify(editing) });
      else await adminFetch("/api/admin/rewards/streaks", { method: "POST", body: JSON.stringify(editing) });
      notify("success", "Streak saved.");
      setEditing(null);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save streak.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: Streak) {
    const { confirmed } = await confirm({ title: `Delete "${s.title}"?`, destructive: true, confirmLabel: "Delete" });
    if (!confirmed) return;
    await adminFetch("/api/admin/rewards/streaks", { method: "PATCH", body: JSON.stringify({ id: s.id, delete: true }) });
    notify("success", "Streak deleted.");
    load();
  }

  async function duplicate(s: Streak) {
    await adminFetch("/api/admin/rewards/streaks", { method: "POST", body: JSON.stringify({ ...s, id: undefined, title: `${s.title} (Copy)`, status: "draft" }) });
    notify("success", "Streak duplicated.");
    load();
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!streaks) return <LoadingState />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{streaks.length} streak(s)</p>
        <PrimaryButton onClick={() => setEditing(EMPTY)}>+ Add streak</PrimaryButton>
      </div>
      {streaks.length === 0 ? <EmptyState title="No streaks yet" /> : (
        <div className="space-y-2">
          {streaks.map((s) => (
            <RecordCard key={s.id}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{s.icon} {s.title}</span>
                <Pill tone={s.status === "active" ? "success" : "warn"}>{s.status}</Pill>
              </div>
              <p className="mt-1 text-xs text-slate-600">{s.goal} {s.unit} · {s.frequency} · {s.coinReward} coins</p>
              <div className="mt-2 flex gap-2">
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => setEditing(s)}>Edit</SecondaryButton>
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => duplicate(s)}>Duplicate</SecondaryButton>
                <DangerButton className="h-9 flex-1 text-xs" onClick={() => remove(s)}>Delete</DangerButton>
              </div>
            </RecordCard>
          ))}
        </div>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit streak" : "Add streak"} footer={<PrimaryButton className="w-full" loading={saving} onClick={save}>Save streak</PrimaryButton>}>
        {editing && (
          <div className="space-y-3">
            <Field label="Title" required><input className={inputClass} value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="Icon"><input className={inputClass} value={editing.icon ?? ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category"><input className={inputClass} value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></Field>
              <Field label="Metric"><input className={inputClass} value={editing.metric ?? ""} onChange={(e) => setEditing({ ...editing, metric: e.target.value })} /></Field>
              <Field label="Goal"><input className={inputClass} type="number" value={editing.goal ?? 1} onChange={(e) => setEditing({ ...editing, goal: Number(e.target.value) })} /></Field>
              <Field label="Unit"><input className={inputClass} value={editing.unit ?? ""} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} /></Field>
              <Field label="Frequency">
                <select className={selectClass} value={editing.frequency ?? "daily"} onChange={(e) => setEditing({ ...editing, frequency: e.target.value })}>
                  {["daily", "weekly", "monthly"].map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Consecutive requirement"><input className={inputClass} type="number" value={editing.consecutiveRequirement ?? 1} onChange={(e) => setEditing({ ...editing, consecutiveRequirement: Number(e.target.value) })} /></Field>
              <Field label="Grace period (hours)"><input className={inputClass} type="number" value={editing.gracePeriodHours ?? 0} onChange={(e) => setEditing({ ...editing, gracePeriodHours: Number(e.target.value) })} /></Field>
              <Field label="Coin reward"><input className={inputClass} type="number" value={editing.coinReward ?? 0} onChange={(e) => setEditing({ ...editing, coinReward: Number(e.target.value) })} /></Field>
            </div>
            <Field label="Motivation note"><textarea className={textareaClass} value={editing.motivationNote ?? ""} onChange={(e) => setEditing({ ...editing, motivationNote: e.target.value })} /></Field>
            <Field label="Status">
              <select className={selectClass} value={editing.status ?? "draft"} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                {["draft", "active", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        )}
      </Sheet>
    </div>
  );
}
