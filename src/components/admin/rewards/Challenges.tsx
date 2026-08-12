"use client";

import { useEffect, useState } from "react";
import { DangerButton, EmptyState, ErrorState, Field, LoadingState, Pill, PrimaryButton, RecordCard, SecondaryButton, Sheet, inputClass, selectClass, textareaClass } from "@/components/admin/ui";
import { useConfirm, useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

type Challenge = {
  id: string;
  title: string;
  icon: string | null;
  description: string | null;
  category: string | null;
  metric: string | null;
  requirement: string | null;
  repeatable: boolean;
  perUserClaimLimit: number;
  coinReward: number;
  ctaLabel: string | null;
  sortOrder: number;
  status: string;
};

const EMPTY: Partial<Challenge> = { title: "", icon: "", description: "", category: "", metric: "", requirement: "", repeatable: false, perUserClaimLimit: 1, coinReward: 0, ctaLabel: "Join challenge", sortOrder: 0, status: "draft" };

export function ChallengesPanel() {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Challenge> | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const { notify } = useToast();

  const load = async () => {
    try {
      const res = await adminFetch<{ challenges: Challenge[] }>("/api/admin/rewards/challenges");
      setChallenges(res.challenges);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load challenges.");
    }
  };

  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing?.title) { notify("error", "Title is required."); return; }
    setSaving(true);
    try {
      if (editing.id) await adminFetch("/api/admin/rewards/challenges", { method: "PATCH", body: JSON.stringify(editing) });
      else await adminFetch("/api/admin/rewards/challenges", { method: "POST", body: JSON.stringify(editing) });
      notify("success", "Challenge saved.");
      setEditing(null);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save challenge.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Challenge) {
    const { confirmed } = await confirm({ title: `Delete "${c.title}"?`, destructive: true, confirmLabel: "Delete" });
    if (!confirmed) return;
    await adminFetch("/api/admin/rewards/challenges", { method: "PATCH", body: JSON.stringify({ id: c.id, delete: true }) });
    notify("success", "Challenge deleted.");
    load();
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!challenges) return <LoadingState />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{challenges.length} challenge(s)</p>
        <PrimaryButton onClick={() => setEditing(EMPTY)}>+ Add challenge</PrimaryButton>
      </div>
      {challenges.length === 0 ? <EmptyState title="No challenges yet" /> : (
        <div className="space-y-2">
          {challenges.map((c) => (
            <RecordCard key={c.id}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{c.icon} {c.title}</span>
                <Pill tone={c.status === "active" ? "success" : "warn"}>{c.status}</Pill>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{c.description}</p>
              <p className="mt-1 text-xs text-slate-600">{c.coinReward} coins · {c.repeatable ? "repeatable" : "one-time"}</p>
              <div className="mt-2 flex gap-2">
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => setEditing(c)}>Edit</SecondaryButton>
                <DangerButton className="h-9 flex-1 text-xs" onClick={() => remove(c)}>Delete</DangerButton>
              </div>
            </RecordCard>
          ))}
        </div>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit challenge" : "Add challenge"} footer={<PrimaryButton className="w-full" loading={saving} onClick={save}>Save challenge</PrimaryButton>}>
        {editing && (
          <div className="space-y-3">
            <Field label="Title" required><input className={inputClass} value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="Icon"><input className={inputClass} value={editing.icon ?? ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} /></Field>
            <Field label="Description"><textarea className={textareaClass} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category"><input className={inputClass} value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></Field>
              <Field label="Metric"><input className={inputClass} value={editing.metric ?? ""} onChange={(e) => setEditing({ ...editing, metric: e.target.value })} /></Field>
              <Field label="Requirement"><input className={inputClass} value={editing.requirement ?? ""} onChange={(e) => setEditing({ ...editing, requirement: e.target.value })} /></Field>
              <Field label="Per-user claim limit"><input className={inputClass} type="number" value={editing.perUserClaimLimit ?? 1} onChange={(e) => setEditing({ ...editing, perUserClaimLimit: Number(e.target.value) })} /></Field>
              <Field label="Coin reward"><input className={inputClass} type="number" value={editing.coinReward ?? 0} onChange={(e) => setEditing({ ...editing, coinReward: Number(e.target.value) })} /></Field>
              <Field label="Sort order"><input className={inputClass} type="number" value={editing.sortOrder ?? 0} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} /></Field>
              <Field label="CTA label"><input className={inputClass} value={editing.ctaLabel ?? ""} onChange={(e) => setEditing({ ...editing, ctaLabel: e.target.value })} /></Field>
              <Field label="Status">
                <select className={selectClass} value={editing.status ?? "draft"} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  {["draft", "active", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={!!editing.repeatable} onChange={(e) => setEditing({ ...editing, repeatable: e.target.checked })} />
              Repeatable challenge
            </label>
          </div>
        )}
      </Sheet>
    </div>
  );
}
