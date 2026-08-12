"use client";

import { useEffect, useState } from "react";
import { DangerButton, EmptyState, ErrorState, Field, LoadingState, Pill, PrimaryButton, RecordCard, SecondaryButton, Sheet, selectClass, textareaClass } from "@/components/admin/ui";
import { useConfirm, useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

type Review = {
  id: string;
  productId: string;
  productTitle: string | null;
  customerName: string | null;
  rating: number;
  comment: string | null;
  verifiedPurchase: boolean;
  status: string;
  reportReason: string | null;
  adminReply: string | null;
  createdAt: string;
};

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [rejectTarget, setRejectTarget] = useState<Review | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [replyTarget, setReplyTarget] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState("");
  const confirm = useConfirm();
  const { notify } = useToast();

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const res = await adminFetch<{ reviews: Review[] }>(`/api/admin/reviews?${params.toString()}`);
      setReviews(res.reviews);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reviews.");
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function approve(r: Review) {
    await adminFetch("/api/admin/reviews", { method: "PATCH", body: JSON.stringify({ id: r.id, status: "published" }) });
    notify("success", "Review published.");
    load();
  }

  async function submitReject() {
    if (!rejectTarget || !rejectReason.trim()) { notify("error", "A rejection reason is required."); return; }
    await adminFetch("/api/admin/reviews", { method: "PATCH", body: JSON.stringify({ id: rejectTarget.id, status: "rejected", reportReason: rejectReason }) });
    notify("success", "Review rejected.");
    setRejectTarget(null);
    setRejectReason("");
    load();
  }

  async function submitReply() {
    if (!replyTarget) return;
    await adminFetch("/api/admin/reviews", { method: "PATCH", body: JSON.stringify({ id: replyTarget.id, adminReply: replyText }) });
    notify("success", "Reply saved.");
    setReplyTarget(null);
    setReplyText("");
    load();
  }

  async function remove(r: Review) {
    const { confirmed, reason } = await confirm({ title: "Delete this review?", destructive: true, confirmLabel: "Delete", requireReason: true });
    if (!confirmed) return;
    await adminFetch("/api/admin/reviews", { method: "PATCH", body: JSON.stringify({ id: r.id, delete: true, reason }) });
    notify("success", "Review deleted.");
    load();
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!reviews) return <LoadingState />;

  return (
    <div className="space-y-3 pb-6">
      <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        {["pending", "published", "rejected", "flagged"].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      {reviews.length === 0 ? <EmptyState title="No reviews found" /> : (
        <div className="space-y-2">
          {reviews.map((r) => (
            <RecordCard key={r.id}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{r.productTitle || r.productId}</span>
                <Pill tone={r.status === "published" ? "success" : r.status === "rejected" ? "danger" : "warn"}>{r.status}</Pill>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{r.customerName} · ⭐ {r.rating} {r.verifiedPurchase && "· verified purchase"}</p>
              <p className="mt-1 text-sm text-slate-700">{r.comment}</p>
              {r.adminReply && <p className="mt-1 rounded-md bg-slate-50 p-2 text-xs text-slate-600">Reply: {r.adminReply}</p>}
              {r.reportReason && <p className="mt-1 text-xs text-red-500">Reason: {r.reportReason}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {r.status !== "published" && <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => approve(r)}>Approve</SecondaryButton>}
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => setRejectTarget(r)}>Reject</SecondaryButton>
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => { setReplyTarget(r); setReplyText(r.adminReply ?? ""); }}>Reply</SecondaryButton>
                <DangerButton className="h-9 flex-1 text-xs" onClick={() => remove(r)}>Delete</DangerButton>
              </div>
            </RecordCard>
          ))}
        </div>
      )}

      <Sheet open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject review" footer={<PrimaryButton className="w-full" onClick={submitReject}>Confirm rejection</PrimaryButton>}>
        <Field label="Reason" required>
          <textarea className={textareaClass} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        </Field>
      </Sheet>

      <Sheet open={!!replyTarget} onClose={() => setReplyTarget(null)} title="Admin reply" footer={<PrimaryButton className="w-full" onClick={submitReply}>Save reply</PrimaryButton>}>
        <Field label="Reply">
          <textarea className={textareaClass} value={replyText} onChange={(e) => setReplyText(e.target.value)} />
        </Field>
      </Sheet>
    </div>
  );
}
