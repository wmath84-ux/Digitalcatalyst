// src/components/QueryCard.tsx
//
// One user query, drawn as a feed card: a round avatar + author name + contact
// on the left, the question as the body, a subordinate timestamp, and — once
// the owner has answered — the reply as a visually separated secondary block
// underneath.
//
// Deliberately NOT glass. This page's surface follows the owner's pinned
// feed-card reference: an opaque panel with a hard gradient hairline, real
// shadow depth and solid inset panels for the nested sections. There is no
// backdrop-filter and no translucent fill anywhere in this file — the winter
// scene behind it is not meant to show through, and text has to stay razor
// sharp over a busy background. Every colour below is fully opaque.
//
// Structure is two layers, as in the reference: an outer shell that paints the
// gradient hairline and the shadow, and an inner content container that paints
// the opaque face and holds header → body → timestamp → secondary blocks.
//
// Data mapping (src/utils/userQueries.ts → the card's slots):
//   query.name            → author name (the avatar's initials are derived from
//                           it; the API stores no photo, so no external image
//                           is ever requested)
//   query.email           → secondary identifier under the name
//   query.status          → the verification-style mark + the status pill
//   query.message         → card body
//   query.createdAt       → timestamp
//   query.reply           → the secondary reply block
//   query.repliedAt       → that block's own timestamp
//   query.replyEmailStatus→ the block's delivery note

import { useCallback, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, CornerUpLeft, Loader2, Mail, Send } from "lucide-react";
import { cn } from "../utils/cn";
import { replyToUserQuery, type UserQuery } from "../utils/userQueries";
import FatZebraButton from "./ui/FatZebraButton";

/**
 * The card's palette — all opaque, all local to this component.
 *
 * FACE sits one step lighter than the winter background's own top stop
 * (`#0a1224`) so the boundary reads without a blur separating the layers;
 * INSET is darker again, which is what makes the reply/composer blocks read as
 * *inside* the card rather than as a second card.
 */
const FACE = "#101A2C";
const INSET = "#0A1120";
const HAIRLINE = "#263149";
const INK = "#EAF0FA";
const INK_SECONDARY = "#93A1BE";
const INK_TERTIARY = "#7C8AA8";
const ACCENT = "#38BDF8";

/** The hairline gradient: muted at rest, lit up on hover / keyboard focus. */
const RING_REST = "linear-gradient(135deg,#5B4BC4 0%,#2E7FC0 46%,#1A2440 100%)";
const RING_ACTIVE = "linear-gradient(135deg,#8B5CF6 0%,#22D3EE 46%,#26355A 100%)";

const formatWhen = (value: number) => {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};

const isoWhen = (value: number) => {
  if (!value) return undefined;
  const date = new Date(value);
  // A malformed Firestore value must not take the card down with a RangeError.
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/** Up to two initials — the avatar is generated from the name, never fetched. */
const initialsFor = (name: string) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const head = parts[0]?.[0] ?? "";
  const tail = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (head + tail).toUpperCase() || "?";
};

export default function QueryCard({
  query,
  canReply,
  onReplied,
}: {
  query: UserQuery;
  canReply: boolean;
  onReplied: (next: UserQuery) => void;
}) {
  const replied = query.status === "replied";
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const nameId = useId();
  const composerId = useId();
  const hintId = useId();

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await replyToUserQuery(query.id, text);
      onReplied(result.query);
      setDraft("");
      setNotice(result.emailed ? `Emailed to ${query.email}` : result.emailStatus);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the reply.");
    } finally {
      setSending(false);
    }
  };

  /**
   * The card's header action. It does not own a second reply flow — it hands
   * focus to the composer that already talks to `replyToUserQuery`, so the
   * keyboard path and the pointer path end up in the same handler.
   */
  const focusComposer = useCallback(() => {
    const node = composerRef.current;
    if (!node) return;
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    node.focus({ preventScroll: true });
  }, []);

  const showComposer = canReply && !replied;
  const displayName = query.name?.trim() || "Learner";

  return (
    /* framer-motion writes an inline `transform` for its enter/exit/layout
       animation, which would beat any CSS hover transform — so the motion
       wrapper only animates, and the card shell below owns hover. */
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      data-user-query
      data-status={query.status}
      className="w-full min-w-0"
    >
      <div
        className={cn(
          "group relative w-full min-w-0 rounded-[22px] p-[1.5px]",
          "shadow-[0_16px_34px_-20px_rgba(2,6,23,0.9)]",
          "transition-[translate,box-shadow] duration-200 ease-out",
          "hover:-translate-y-0.5 hover:shadow-[0_26px_46px_-18px_rgba(2,6,23,0.95)]",
          "focus-within:shadow-[0_26px_46px_-18px_rgba(2,6,23,0.95)]",
        )}
      >
        {/* The gradient hairline. Two stacked opaque layers, the lit one fading
            in — gradients are not interpolable, so this is what makes the
            hover smooth without a JS handler. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[22px]"
          style={{ backgroundImage: RING_REST }}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[22px] opacity-0 transition-opacity duration-200",
            "group-hover:opacity-100 group-focus-within:opacity-100",
          )}
          style={{ backgroundImage: RING_ACTIVE }}
        />

        <article
          aria-labelledby={nameId}
          className="relative w-full min-w-0 rounded-[20.5px] px-4 py-3.5 sm:px-5 sm:py-4"
          style={{ backgroundColor: FACE }}
        >
          {/* ── Header: avatar · author hierarchy · right-side action ───────── */}
          <header className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-extrabold text-white sm:size-11"
              style={{ backgroundImage: "linear-gradient(135deg,#6D28D9,#0369A1)" }}
            >
              {initialsFor(displayName)}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <p
                  id={nameId}
                  className="truncate text-[15px] font-bold leading-tight sm:text-base"
                  style={{ color: INK }}
                >
                  {displayName}
                </p>
                {/* This thread's verification-style mark: the owner has acted.
                    The status pill next to it carries the text for AT. */}
                {replied ? (
                  <BadgeCheck
                    size={16}
                    aria-hidden="true"
                    className="shrink-0"
                    style={{ color: ACCENT }}
                  />
                ) : null}
              </div>
              <p
                data-user-query-contact
                className="mt-0.5 truncate text-[12.5px] leading-tight sm:text-[13px]"
                style={{ color: INK_SECONDARY }}
              >
                {query.email || "no email"}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <span
                data-user-query-status
                className="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide sm:text-[11px]"
                style={
                  replied
                    ? { backgroundColor: "#0C3B33", borderColor: "#155E50", color: "#5EEAD4" }
                    : { backgroundColor: "#3A2C05", borderColor: "#5C4409", color: "#FCD34D" }
                }
              >
                {replied ? "Replied" : "Awaiting"}
                <span className="hidden sm:inline"> reply</span>
              </span>

              {showComposer ? (
                <button
                  type="button"
                  onClick={focusComposer}
                  aria-label={`Reply to ${displayName}`}
                  title={`Reply to ${displayName}`}
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full border transition-colors duration-150",
                    "border-[#263149] bg-[#0A1120] text-[#93A1BE]",
                    "hover:border-[#3B4A6B] hover:text-white",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC] focus-visible:ring-offset-2 focus-visible:ring-offset-[#101A2C]",
                  )}
                >
                  <CornerUpLeft size={16} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </header>

          {/* ── Body: the question itself, never clamped ────────────────────── */}
          <p
            data-user-query-message
            className="mt-3 whitespace-pre-wrap break-words text-[15px] font-medium leading-[1.65]"
            style={{ color: replied ? INK_SECONDARY : INK }}
          >
            {query.message}
          </p>

          {/* ── Timestamp: present, but clearly subordinate ─────────────────── */}
          <p className="mt-2.5 text-[12px] font-medium leading-tight" style={{ color: INK_TERTIARY }}>
            <time dateTime={isoWhen(query.createdAt)}>{formatWhen(query.createdAt)}</time>
          </p>

          {/* ── Secondary block: the owner's answer ─────────────────────────── */}
          {replied && query.reply ? (
            <div
              data-user-query-reply
              className="mt-3.5 border-t pt-3.5"
              style={{ borderColor: HAIRLINE }}
            >
              <div
                className="rounded-xl p-3 sm:p-3.5"
                style={{
                  backgroundColor: INSET,
                  border: `1px solid ${HAIRLINE}`,
                  borderLeft: `2px solid #10B981`,
                }}
              >
                <p
                  className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: "#5EEAD4" }}
                >
                  <Mail size={12} aria-hidden="true" />
                  <span>Your reply</span>
                  {query.repliedAt ? (
                    <time
                      dateTime={isoWhen(query.repliedAt)}
                      className="font-semibold normal-case tracking-normal"
                      style={{ color: INK_TERTIARY }}
                    >
                      · {formatWhen(query.repliedAt)}
                    </time>
                  ) : null}
                </p>
                <p
                  className="mt-2 whitespace-pre-wrap break-words text-[14px] font-medium leading-[1.6]"
                  style={{ color: "#D5DEEE" }}
                >
                  {query.reply}
                </p>
                {query.replyEmailStatus ? (
                  <p className="mt-2 text-[11px] font-medium" style={{ color: INK_TERTIARY }}>
                    {query.replyEmailStatus}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ── Secondary block: the composer (owner only, until answered) ──── */}
          {showComposer ? (
            <div className="mt-3.5 border-t pt-3.5" style={{ borderColor: HAIRLINE }}>
              <label
                htmlFor={composerId}
                className="text-[11px] font-bold uppercase tracking-wide"
                style={{ color: INK_TERTIARY }}
              >
                Reply to {displayName}
              </label>
              <textarea
                ref={composerRef}
                id={composerId}
                aria-describedby={hintId}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit();
                }}
                rows={3}
                placeholder={`Reply to ${displayName}…`}
                className={cn(
                  "mt-2 w-full resize-y rounded-xl px-3 py-2.5 text-[14px] font-medium leading-[1.6] outline-none",
                  "focus-visible:ring-2 focus-visible:ring-[#5B8DEF]",
                )}
                style={{ backgroundColor: INSET, border: `1px solid ${HAIRLINE}`, color: INK }}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p
                  id={hintId}
                  className="min-w-0 flex-1 basis-full truncate text-[11px] font-medium sm:basis-0"
                  style={{ color: INK_TERTIARY }}
                >
                  Sends to {query.email || "— no email on this query"}
                </p>
                <FatZebraButton
                  type="button"
                  size="sm"
                  plane={!sending}
                  onClick={() => void submit()}
                  disabled={sending || !draft.trim()}
                  icon={
                    sending ? (
                      <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Send size={15} aria-hidden="true" />
                    )
                  }
                  label={sending ? "Sending…" : "Send reply"}
                />
              </div>
              {error ? (
                <p role="alert" className="mt-2 text-[12px] font-semibold text-[#FDA4AF]">
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p role="status" className="mt-2 text-[12px] font-semibold text-[#6EE7B7]">
                  {notice}
                </p>
              ) : null}
            </div>
          ) : null}
        </article>
      </div>
    </motion.div>
  );
}
