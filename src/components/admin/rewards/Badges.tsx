"use client";

import { useEffect, useState } from "react";
import { DangerButton, EmptyState, ErrorState, Field, LoadingState, Pill, PrimaryButton, RecordCard, SecondaryButton, Sheet, inputClass, selectClass, textareaClass } from "@/components/admin/ui";
import { useConfirm, useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

type Badge = {
  id: string;
  title: string;
  icon: string | null;
  description: string | null;
  category: string | null;
  rarity: string | null;
  triggerMetric: string | null;
  requirement: string | null;
  coinReward: number;
  claimLimit: number | null;
  sortOrder: number;
  status: string;
  claimedCount: number;
};

const EMPTY: Partial<Badge> = { title: "", icon: "", description: "", category: "", rarity: "common", triggerMetric: "", requirement: "", coinReward: 0, claimLimit: 0, sortOrder: 0, status: "draft" };

export function BadgesPanel() {
  const [badges, setBadges] = useState<Badge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Badge> | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const { notify } = useToast();

  const load = async () => {
    try {
      const res = await adminFetch<{ badges: Badge[] }>("/api/admin/rewards/badges");
      setBadges(res.badges);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load badges.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editing?.title) {
      notify("error", "Title is required.");
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        await adminFetch("/api/admin/rewards/badges", { method: "PATCH", body: JSON.stringify(editing) });
      } else {
        await adminFetch("/api/admin/rewards/badges", { method: "POST", body: JSON.stringify(editing) });
      }
      notify("success", "Badge saved.");
      setEditing(null);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save badge.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(badge: Badge) {
    if (badge.claimedCount > 0) {
      notify("error", "This badge has already been claimed. Archive it instead of deleting.");
      return;
    }
    const { confirmed } = await confirm({ title: `Delete "${badge.title}"?`, destructive: true, confirmLabel: "Delete" });
    if (!confirmed) return;
    await adminFetch("/api/admin/rewards/badges", { method: "PATCH", body: JSON.stringify({ id: badge.id, delete: true }) });
    notify("success", "Badge deleted.");
    load();
  }

  async function duplicate(badge: Badge) {
    await adminFetch("/api/admin/rewards/badges", { method: "POST", body: JSON.stringify({ ...badge, id: undefined, title: `${badge.title} (Copy)`, status: "draft", claimedCount: 0 }) });
    notify("success", "Badge duplicated.");
    load();
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!badges) return <LoadingState />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{badges.length} badge(s)</p>
        <PrimaryButton onClick={() => setEditing(EMPTY)}>+ Add badge</PrimaryButton>
      </div>
      {badges.length === 0 ? (
        <EmptyState title="No badges yet" />
      ) : (
        <div className="space-y-2">
          {badges.map((b) => (
            <RecordCard key={b.id}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{b.icon} {b.title}</span>
                <Pill tone={b.status === "active" ? "success" : b.status === "archived" ? "default" : "warn"}>{b.status}</Pill>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{b.description}</p>
              <p className="mt-1 text-xs text-slate-600">{b.coinReward} coins · {b.claimedCount} claimed · {b.rarity}</p>
              <div className="mt-2 flex gap-2">
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => setEditing(b)}>Edit</SecondaryButton>
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => duplicate(b)}>Duplicate</SecondaryButton>
                <DangerButton className="h-9 flex-1 text-xs" onClick={() => remove(b)}>Delete</DangerButton>
              </div>
            </RecordCard>
          ))}
        </div>
      )}

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit badge" : "Add badge"}
        footer={<PrimaryButton className="w-full" loading={saving} onClick={save}>Save badge</PrimaryButton>}
      >
        {editing && (
          <div className="space-y-3">
            <Field label="Title" required>
              <input className={inputClass} value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </Field>
            <Field label="Icon / emoji or Cloudinary URL">
              <input className={inputClass} value={editing.icon ?? ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} />
            </Field>
            <Field label="Description">
              <textarea className={textareaClass} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <input className={inputClass} value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
              </Field>
              <Field label="Rarity">
                <select className={selectClass} value={editing.rarity ?? "common"} onChange={(e) => setEditing({ ...editing, rarity: e.target.value })}>
                  {["common", "rare", "epic", "legendary"].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Trigger metric">
                <input className={inputClass} value={editing.triggerMetric ?? ""} onChange={(e) => setEditing({ ...editing, triggerMetric: e.target.value })} />
              </Field>
              <Field label="Requirement">
                <input className={inputClass} value={editing.requirement ?? ""} onChange={(e) => setEditing({ ...editing, requirement: e.target.value })} />
              </Field>
              <Field label="Coin reward">
                <input className={inputClass} type="number" value={editing.coinReward ?? 0} onChange={(e) => setEditing({ ...editing, coinReward: Number(e.target.value) })} />
              </Field>
              <Field label="Claim limit">
                <input className={inputClass} type="number" value={editing.claimLimit ?? 0} onChange={(e) => setEditing({ ...editing, claimLimit: Number(e.target.value) })} />
              </Field>
              <Field label="Sort order">
                <input className={inputClass} type="number" value={editing.sortOrder ?? 0} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} />
              </Field>
              <Field label="Status">
                <select className={selectClass} value={editing.status ?? "draft"} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  {["draft", "active", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
