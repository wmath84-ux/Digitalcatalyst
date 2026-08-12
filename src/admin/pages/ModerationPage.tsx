"use client";

import { AdminLink as Link } from "@/lib/admin/router";
import { useEffect, useState } from "react";
import {
  DangerButton,
  EmptyState,
  ErrorState,
  Field,
  KeyValue,
  LoadingState,
  Pill,
  PrimaryButton,
  RecordCard,
  SecondaryButton,
  SectionCard,
  Sheet,
  StatCard,
  Tabs,
  inputClass,
  selectClass,
  textareaClass,
} from "@/components/admin/ui";
import { useConfirm, useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ReportRow = {
  id: string;
  contentType: string;
  targetId: string;
  reporterId: string;
  reason: string;
  status: string;
  moderationReason: string | null;
  resolvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

type PostRow = {
  id: string;
  type: string;
  authorId: string;
  authorName: string;
  content: string | null;
  media: string[] | null;
  pollOptions: { label: string; votes: number }[] | null;
  pollClosed: boolean;
  commentCount: number;
  reportCount: number;
  hidden: boolean;
  createdAt: string;
};

type CommentRow = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  content: string | null;
  reportCount: number;
  hidden: boolean;
  createdAt: string;
};

type ModUser = {
  uid: string;
  name: string;
  email: string;
  status: string;
  reportCount?: number;
  removedCount?: number;
  suspended?: boolean;
};

/* ------------------------------------------------------------------ */
/* Moderation page                                                     */
/* ------------------------------------------------------------------ */

const MOD_TABS = [
  { key: "reports", label: "Reports" },
  { key: "posts", label: "Posts" },
  { key: "comments", label: "Comments" },
  { key: "users", label: "Users" },
];

export default function ModerationPage() {
  const [tab, setTab] = useState("reports");
  const confirm = useConfirm();
  const { notify } = useToast();

  return (
    <div className="space-y-3 pb-6">
      <Tabs tabs={MOD_TABS} active={tab} onChange={setTab} />
      <div className="mt-3">
        {tab === "reports" && <ReportsTab confirm={confirm} notify={notify} />}
        {tab === "posts" && <PostsTab confirm={confirm} notify={notify} />}
        {tab === "comments" && <CommentsTab confirm={confirm} notify={notify} />}
        {tab === "users" && <UsersTab confirm={confirm} notify={notify} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reports tab                                                         */
/* ------------------------------------------------------------------ */

function ReportsTab({
  confirm: _confirm,
  notify,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
}) {
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [resolveTarget, setResolveTarget] = useState<ReportRow | null>(null);
  const [resolveReason, setResolveReason] = useState("");
  const [dismissTarget, setDismissTarget] = useState<ReportRow | null>(null);
  const [dismissReason, setDismissReason] = useState("");

  const load = async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const res = await adminFetch<{ reports: ReportRow[] }>(
        `/api/admin/moderation/reports?${params.toString()}`
      );
      setReports(res.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const stats = reports
    ? {
        open: reports.filter((r) => r.status === "open").length,
        underReview: reports.filter((r) => r.status === "under_review").length,
        resolved: reports.filter((r) => r.status === "resolved").length,
      }
    : null;

  async function startReview(r: ReportRow) {
    await adminFetch("/api/admin/moderation/reports", {
      method: "PATCH",
      body: JSON.stringify({
        id: r.id,
        status: "under_review",
        moderationReason: "Review started by admin.",
      }),
    });
    notify("success", "Report marked as under review.");
    load();
  }

  async function submitResolve() {
    if (!resolveTarget || !resolveReason.trim()) {
      notify("error", "A moderation reason is required.");
      return;
    }
    await adminFetch("/api/admin/moderation/reports", {
      method: "PATCH",
      body: JSON.stringify({
        id: resolveTarget.id,
        status: "resolved",
        moderationReason: resolveReason.trim(),
      }),
    });
    notify("success", "Report resolved.");
    setResolveTarget(null);
    setResolveReason("");
    load();
  }

  async function submitDismiss() {
    if (!dismissTarget || !dismissReason.trim()) {
      notify("error", "A moderation reason is required.");
      return;
    }
    await adminFetch("/api/admin/moderation/reports", {
      method: "PATCH",
      body: JSON.stringify({
        id: dismissTarget.id,
        status: "dismissed",
        moderationReason: dismissReason.trim(),
      }),
    });
    notify("success", "Report dismissed.");
    setDismissTarget(null);
    setDismissReason("");
    load();
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!reports) return <LoadingState label="Loading reports…" />;

  return (
    <div className="space-y-3">
      {stats && (
        <SectionCard title="Report summary">
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Open" value={stats.open} tone={stats.open > 0 ? "danger" : undefined} />
            <StatCard label="Under review" value={stats.underReview} tone="warn" />
            <StatCard label="Resolved" value={stats.resolved} tone="ok" />
          </div>
        </SectionCard>
      )}

      <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All reports</option>
        {["open", "under_review", "resolved", "dismissed"].map((s) => (
          <option key={s} value={s}>{s.replace("_", " ")}</option>
        ))}
      </select>

      {reports.length === 0 ? (
        <EmptyState title="No reports found" />
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <RecordCard key={r.id}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">
                  {r.id}
                </span>
                <Pill
                  tone={
                    r.status === "open"
                      ? "danger"
                      : r.status === "resolved"
                        ? "success"
                        : "warn"
                  }
                >
                  {r.status.replace("_", " ")}
                </Pill>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {r.contentType} · target {r.targetId}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Reporter: {r.reporterId}
              </p>
              <p className="mt-1 text-sm text-slate-700">{r.reason}</p>
              {r.moderationReason && (
                <p className="mt-1 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                  Mod note: {r.moderationReason} {r.resolvedBy ? `· by ${r.resolvedBy}` : ""}
                </p>
              )}
              <p className="mt-1 text-[11px] text-slate-400">
                {new Date(r.createdAt).toLocaleString()}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(r.status === "open" || r.status === "dismissed") && (
                  <SecondaryButton
                    className="h-9 flex-1 text-xs"
                    onClick={() => startReview(r)}
                  >
                    Start review
                  </SecondaryButton>
                )}
                {(r.status === "open" || r.status === "under_review") && (
                  <SecondaryButton
                    className="h-9 flex-1 text-xs"
                    onClick={() => setResolveTarget(r)}
                  >
                    Resolve
                  </SecondaryButton>
                )}
                {(r.status === "open" || r.status === "under_review") && (
                  <SecondaryButton
                    className="h-9 flex-1 text-xs"
                    onClick={() => setDismissTarget(r)}
                  >
                    Dismiss
                  </SecondaryButton>
                )}
              </div>
            </RecordCard>
          ))}
        </div>
      )}

      <Sheet
        open={!!resolveTarget}
        onClose={() => setResolveTarget(null)}
        title="Resolve report"
        footer={
          <PrimaryButton className="w-full" onClick={submitResolve}>
            Confirm resolution
          </PrimaryButton>
        }
      >
        <Field label="Moderation reason" required>
          <textarea
            className={textareaClass}
            value={resolveReason}
            onChange={(e) => setResolveReason(e.target.value)}
            placeholder="Detail the moderation action taken…"
          />
        </Field>
      </Sheet>

      <Sheet
        open={!!dismissTarget}
        onClose={() => setDismissTarget(null)}
        title="Dismiss report"
        footer={
          <PrimaryButton className="w-full" onClick={submitDismiss}>
            Confirm dismissal
          </PrimaryButton>
        }
      >
        <Field label="Reason" required>
          <textarea
            className={textareaClass}
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
            placeholder="Explain why this report is being dismissed…"
          />
        </Field>
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Posts tab                                                           */
/* ------------------------------------------------------------------ */

function PostsTab({
  confirm,
  notify,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
}) {
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [detailTarget, setDetailTarget] = useState<PostRow | null>(null);
  const [commentsPreview, setCommentsPreview] = useState<CommentRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      const res = await adminFetch<{ posts: PostRow[] }>(
        `/api/admin/moderation/posts?${params.toString()}`
      );
      setPosts(res.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load posts.");
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function toggleHide(post: PostRow) {
    const nextHidden = !post.hidden;
    const { confirmed, reason } = await confirm({
      title: nextHidden ? "Hide this post?" : "Unhide this post?",
      description: nextHidden
        ? "The post will no longer be visible to users."
        : "The post will be visible again.",
      confirmLabel: nextHidden ? "Hide post" : "Unhide post",
      destructive: nextHidden,
      requireReason: nextHidden,
    });
    if (!confirmed) return;
    await adminFetch("/api/admin/moderation/posts", {
      method: "PATCH",
      body: JSON.stringify({ id: post.id, hidden: nextHidden, reason }),
    });
    notify("success", nextHidden ? "Post hidden." : "Post restored.");
    load();
  }

  async function remove(post: PostRow) {
    const { confirmed, reason } = await confirm({
      title: "Delete this post?",
      description: "This permanently removes the post. This action cannot be undone.",
      confirmLabel: "Delete post",
      destructive: true,
      requireReason: true,
    });
    if (!confirmed) return;
    await adminFetch("/api/admin/moderation/posts", {
      method: "PATCH",
      body: JSON.stringify({ id: post.id, delete: true, reason }),
    });
    notify("success", "Post deleted.");
    load();
  }

  async function openDetail(post: PostRow) {
    setDetailTarget(post);
    setLoadingDetail(true);
    try {
      const res = await adminFetch<{ comments: CommentRow[] }>(
        "/api/admin/moderation/comments"
      );
      setCommentsPreview(
        res.comments.filter((c) => c.postId === post.id).slice(0, 10)
      );
    } catch {
      setCommentsPreview([]);
    } finally {
      setLoadingDetail(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!posts) return <LoadingState label="Loading posts…" />;

  const filtered = posts.filter((p) => {
    if (q) {
      const query = q.toLowerCase();
      return (
        p.id.toLowerCase().includes(query) ||
        p.authorName.toLowerCase().includes(query) ||
        (p.content ?? "").toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className={inputClass + " flex-1"}
          placeholder="Search posts, content, author"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={selectClass + " w-32"} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="post">Text posts</option>
          <option value="story">Stories</option>
          <option value="poll">Polls</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{filtered.length} post(s)</p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No posts found" />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <RecordCard key={p.id}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{p.authorName}</span>
                <div className="flex gap-1">
                  <Pill tone={p.hidden ? "danger" : "success"}>
                    {p.hidden ? "hidden" : "visible"}
                  </Pill>
                  {p.type !== "post" && <Pill>{p.type}</Pill>}
                </div>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-700">{p.content || "—"}</p>
              {p.media && p.media.length > 0 && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {p.media.length} media attachment(s)
                </p>
              )}
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>
                  💬 {p.commentCount} · 🚩 {p.reportCount} reports
                </span>
                <span>{new Date(p.createdAt).toLocaleString()}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => openDetail(p)}>
                  Details
                </SecondaryButton>
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => toggleHide(p)}>
                  {p.hidden ? "Unhide" : "Hide"}
                </SecondaryButton>
                <DangerButton className="h-9 flex-1 text-xs" onClick={() => remove(p)}>
                  Delete
                </DangerButton>
              </div>
            </RecordCard>
          ))}
        </div>
      )}

      <Sheet
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title="Post details"
      >
        {detailTarget && (
          <div className="space-y-3">
            <SectionCard title="Post">
              <KeyValue label="ID" value={detailTarget.id} />
              <KeyValue label="Type" value={detailTarget.type} />
              <KeyValue label="Author" value={detailTarget.authorName} />
              <KeyValue label="Author ID" value={detailTarget.authorId} />
              <KeyValue label="Created" value={new Date(detailTarget.createdAt).toLocaleString()} />
              <KeyValue label="Comments" value={detailTarget.commentCount} />
              <KeyValue label="Reports" value={detailTarget.reportCount} />
              <KeyValue label="Status" value={detailTarget.hidden ? "Hidden" : "Visible"} />
              {detailTarget.pollClosed !== undefined && (
                <KeyValue label="Poll" value={detailTarget.pollClosed ? "Closed" : "Open"} />
              )}
            </SectionCard>
            <SectionCard title="Content">
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {detailTarget.content || "(no text content)"}
              </p>
              {detailTarget.media && detailTarget.media.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-medium text-slate-600">Media:</p>
                  {detailTarget.media.map((url, i) => (
                    <p key={i} className="truncate text-xs text-slate-500">{url}</p>
                  ))}
                </div>
              )}
              {detailTarget.pollOptions && detailTarget.pollOptions.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-medium text-slate-600">Poll options:</p>
                  {detailTarget.pollOptions.map((opt, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span>{opt.label}</span>
                      <span className="text-slate-500">{opt.votes} votes</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
            {loadingDetail ? (
              <LoadingState label="Loading comments…" />
            ) : (
              <SectionCard title={`Recent comments (${commentsPreview.length})`}>
                {commentsPreview.length === 0 ? (
                  <p className="text-sm text-slate-500">No comments found.</p>
                ) : (
                  <div className="space-y-2">
                    {commentsPreview.map((c) => (
                      <div key={c.id} className="rounded-lg border border-slate-200 p-2">
                        <p className="text-xs font-medium text-slate-700">{c.authorName}</p>
                        <p className="mt-0.5 text-xs text-slate-600">{c.content}</p>
                        {c.hidden && <Pill tone="danger">hidden</Pill>}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Comments tab                                                        */
/* ------------------------------------------------------------------ */

function CommentsTab({
  confirm,
  notify,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
}) {
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = async () => {
    setError(null);
    try {
      const res = await adminFetch<{ comments: CommentRow[] }>(
        "/api/admin/moderation/comments"
      );
      setComments(res.comments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comments.");
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, []);

  async function toggleHide(c: CommentRow) {
    const nextHidden = !c.hidden;
    const { confirmed, reason } = await confirm({
      title: nextHidden ? "Remove this comment?" : "Restore this comment?",
      confirmLabel: nextHidden ? "Remove" : "Restore",
      destructive: nextHidden,
      requireReason: nextHidden,
    });
    if (!confirmed) return;
    await adminFetch("/api/admin/moderation/comments", {
      method: "PATCH",
      body: JSON.stringify({ id: c.id, hidden: nextHidden, reason }),
    });
    notify("success", nextHidden ? "Comment removed." : "Comment restored.");
    load();
  }

  async function remove(c: CommentRow) {
    const { confirmed, reason } = await confirm({
      title: "Delete this comment?",
      description: "This permanently removes the comment.",
      confirmLabel: "Delete comment",
      destructive: true,
      requireReason: true,
    });
    if (!confirmed) return;
    await adminFetch("/api/admin/moderation/comments", {
      method: "PATCH",
      body: JSON.stringify({ id: c.id, delete: true, reason }),
    });
    notify("success", "Comment deleted.");
    load();
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!comments) return <LoadingState label="Loading comments…" />;

  const filtered = comments.filter((c) => {
    if (q) {
      const query = q.toLowerCase();
      return (
        c.authorName.toLowerCase().includes(query) ||
        (c.content ?? "").toLowerCase().includes(query) ||
        c.postId.toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <input
        className={inputClass}
        placeholder="Search by author, content, post ID"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <p className="text-xs text-slate-500">{filtered.length} comment(s)</p>

      {filtered.length === 0 ? (
        <EmptyState title="No comments found" />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <RecordCard key={c.id}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{c.authorName}</span>
                <div className="flex gap-1">
                  {c.hidden && <Pill tone="danger">Removed</Pill>}
                  {c.reportCount > 0 && <Pill tone="warn">{c.reportCount} 🚩</Pill>}
                </div>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">Post: {c.postId}</p>
              <p className="mt-1 text-sm text-slate-700">{c.content}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {new Date(c.createdAt).toLocaleString()}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <SecondaryButton className="h-9 flex-1 text-xs" onClick={() => toggleHide(c)}>
                  {c.hidden ? "Restore" : "Remove"}
                </SecondaryButton>
                <DangerButton className="h-9 flex-1 text-xs" onClick={() => remove(c)}>
                  Delete
                </DangerButton>
              </div>
            </RecordCard>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Users tab                                                           */
/* ------------------------------------------------------------------ */

function UsersTab({
  confirm,
  notify,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
}) {
  const [users, setUsers] = useState<ModUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = async () => {
    setError(null);
    try {
      const res = await adminFetch<{ customers: ModUser[] }>("/api/admin/customers");
      setUsers(res.customers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(u: ModUser) {
    const nextStatus = u.status === "active" ? "blocked" : "active";
    const { confirmed, reason } = await confirm({
      title:
        nextStatus === "blocked"
          ? `Block ${u.name || u.email}?`
          : `Activate ${u.name || u.email}?`,
      description:
        nextStatus === "blocked"
          ? "The user will lose community access until reactivated."
          : undefined,
      confirmLabel: nextStatus === "blocked" ? "Block user" : "Activate user",
      destructive: nextStatus === "blocked",
      requireReason: nextStatus === "blocked",
    });
    if (!confirmed) return;
    try {
      await adminFetch(`/api/admin/customers/${u.uid}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, reason }),
      });
      notify("success", `User ${nextStatus === "blocked" ? "blocked" : "activated"}.`);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to update user.");
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!users) return <LoadingState label="Loading users…" />;

  const filtered = users.filter((u) => {
    if (q) {
      const query = q.toLowerCase();
      return (
        u.name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.uid.toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <input
        className={inputClass}
        placeholder="Search by name, email, UID"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <p className="text-xs text-slate-500">{filtered.length} user(s)</p>

      {filtered.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <RecordCard key={u.uid}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">
                  {u.name || "Unnamed user"}
                </span>
                <Pill tone={u.status === "active" ? "success" : "danger"}>
                  {u.status}
                </Pill>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{u.email}</p>
              <p className="mt-0.5 text-xs text-slate-400">UID: {u.uid}</p>
              <div className="mt-2 flex gap-2">
                <Link
                  href={`/admin/customers/${u.uid}`}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-300 text-xs font-medium text-slate-700 active:bg-slate-100"
                >
                  View profile
                </Link>
                <SecondaryButton
                  className="h-9 flex-1 text-xs"
                  onClick={() => toggleStatus(u)}
                >
                  {u.status === "active" ? "Block" : "Activate"}
                </SecondaryButton>
              </div>
            </RecordCard>
          ))}
        </div>
      )}
    </div>
  );
}
