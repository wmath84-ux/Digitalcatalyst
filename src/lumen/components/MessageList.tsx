import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUpRight, Binary, Check, Copy, ImagePlay, ListChecks, RotateCcw, SquareFunction, TriangleAlert,
} from "lucide-react";
import type { Attachment, Chat, Message, Tier } from "../lib/types";
import { tierLte } from "../lib/tier";
import { FORMAT_LABEL } from "../lib/engine";
import { PERF, perf, splitStable, throttle } from "../lib/perf";
import { usePagedMessages } from "../lib/usePagedMessages";
import { copyText } from "../lib/utils";
import { cn } from "../utils/cn";
import GeneratedImageCard from "./GeneratedImage";
import Markdown from "./Markdown";
import QuizCard from "./QuizCard";
import ThinkingBlock from "./ThinkingBlock";

/* ── attachments inside a user turn ─────────────────────────── */

const AttachmentRow = memo(function AttachmentRow({
  attachments, tier, onImageClick,
}: {
  attachments: Attachment[];
  tier: Tier;
  onImageClick: (a: Attachment) => void;
}) {
  return (
    <div className="flex max-w-full flex-wrap justify-end gap-1.5">
      {attachments.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onImageClick(a)}
          title={a.name}
          aria-label={`View ${a.name}`}
          className="focus-ring relative overflow-hidden rounded-[10px] border border-[--border-2] shadow-[var(--sh-xs)] transition-transform hover:scale-[1.02]"
        >
          <img
            src={a.src}
            alt={a.name}
            loading="lazy"
            decoding="async"
            className={cn("w-auto object-cover", tier === "xxs" ? "h-[52px]" : tierLte(tier, "sm") ? "h-[64px]" : "h-[80px]")}
          />
          {a.kind === "screenshot" && (
            <span className="absolute bottom-1 left-1 rounded-[5px] bg-[rgba(20,19,14,0.72)] px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-white">Shot</span>
          )}
        </button>
      ))}
    </div>
  );
});

/* ── user message (memoized — re-renders only when it changes) ── */

const UserMessage = memo(function UserMessage({
  message, tier, onImageClick,
}: {
  message: Message;
  tier: Tier;
  onImageClick: (a: Attachment) => void;
}) {
  perf.bump("messageRenders");
  const maxW = tier === "xxs" ? "max-w-[94%]" : tierLte(tier, "sm") ? "max-w-[88%]" : tier === "md" ? "max-w-[80%]" : "max-w-[76%]";
  return (
    <div className="flex justify-end">
      <div className={cn("flex flex-col items-end gap-1.5", maxW)}>
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentRow attachments={message.attachments} tier={tier} onImageClick={onImageClick} />
        )}
        {message.content && <div className="user-bubble">{message.content}</div>}
      </div>
    </div>
  );
});

/* ── assistant message (isolated render cell) ───────────────── */

const AssistantMessage = memo(function AssistantMessage({
  message, tier, isLast, generating, onRetry, onImageClick, onToggleThinking, onQuizAnswer, onQuizSubmit, onFollowUp,
}: {
  message: Message;
  tier: Tier;
  isLast: boolean;
  generating: boolean;
  onRetry: (id: string) => void;
  onImageClick: (a: Attachment) => void;
  onToggleThinking: (id: string) => void;
  onQuizAnswer: (msgId: string, qIdx: number, optIdx: number) => void;
  onQuizSubmit: (msgId: string) => void;
  onFollowUp: (text: string) => void;
}) {
  perf.bump("messageRenders");
  const [copied, setCopied] = useState(false);
  const live = message.status === "thinking";
  const streaming = message.status === "streaming";

  // Streaming renders: parse-markdown once per completed paragraph,
  // tail flows in as cheap plain text — the parser never sees a token.
  const streamSplit = useMemo(
    () => (streaming ? splitStable(message.content) : null),
    [streaming, message.content]
  );

  return (
    <div>
      {/* label row */}
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn("lumen-orb", live && "is-thinking", tier === "xxs" ? "h-[15px] w-[15px]" : "h-[18px] w-[18px]")}
          aria-hidden="true"
        />
        <span className={cn("font-semibold tracking-[-0.01em] text-[--ink] ", tier === "xxs" ? "text-[12px]" : "text-[12.5px]")}>Lumen</span>
        {message.format && message.status !== "thinking" && (
          <span className="fmt-chip" title={`Answer structured as: ${FORMAT_LABEL[message.format]}`}>
            {message.format === "visual" && <ImagePlay size={9.5} aria-hidden="true" />}
            {FORMAT_LABEL[message.format]}
          </span>
        )}
        {message.modelLabel && !tierLte(tier, "xs") && (
          <span className="truncate text-[11.5px] text-[--ink-4]">{message.modelLabel}</span>
        )}
      </div>

      {message.thinking && message.thinking.length > 0 && (
        <ThinkingBlock
          steps={message.thinking}
          live={live}
          open={!!message.thinkingOpen}
          ms={message.thinkingMs}
          startedAt={message.createdAt}
          onToggle={() => onToggleThinking(message.id)}
        />
      )}

      {message.status === "error" ? (
        <div className="flex max-w-[560px] items-start gap-3 rounded-[12px] border border-[--err-border] bg-[--err-bg] p-3.5" role="alert">
          <TriangleAlert size={17} className="mt-px flex-none text-[--err]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold text-[--err]">Couldn't generate a response</div>
            <div className="mt-0.5 text-[12.5px] leading-snug text-[--ink-2]">
              Something went wrong on our side. Your message is safe — try again.
            </div>
            <button type="button" onClick={() => onRetry(message.id)} disabled={generating} className="ghost-btn focus-ring mt-2.5 h-[30px] text-[12.5px]">
              <RotateCcw size={13.5} aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      ) : (
        <>
          {streaming && streamSplit ? (
            <>
              {streamSplit.stable && (
                <Markdown
                  text={streamSplit.stable}
                  onImageClick={(src, alt) => onImageClick({ id: `md-${src}`, kind: "upload", name: alt || "image", src })}
                />
              )}
              <div className="md whitespace-pre-wrap">
                {streamSplit.tail}
                <span className="stream-caret" aria-hidden="true" />
              </div>
            </>
          ) : (
            <Markdown
              text={message.content}
              onImageClick={(src, alt) => onImageClick({ id: `md-${src}`, kind: "upload", name: alt || "image", src })}
            />
          )}

          {message.image && message.status !== "thinking" && (
            <GeneratedImageCard
              image={message.image}
              tier={tier}
              onExpand={() =>
                onImageClick({
                  id: `gen-${message.id}`,
                  kind: "upload",
                  name: message.image!.caption || "Generated image",
                  src: message.image!.src,
                })
              }
              onRegenerate={() => onRetry(message.id)}
            />
          )}
          {message.quiz && message.status === "complete" && (
            <QuizCard
              quiz={message.quiz}
              onAnswer={(qIdx, optIdx) => onQuizAnswer(message.id, qIdx, optIdx)}
              onSubmit={() => onQuizSubmit(message.id)}
            />
          )}
          {message.status === "complete" && message.followUps && message.followUps.length > 0 && !message.quiz && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {message.followUps.slice(0, tier === "xxs" ? 2 : 3).map((f) => (
                <button key={f} type="button" onClick={() => onFollowUp(f)} disabled={generating} className="chip focus-ring">
                  <ArrowUpRight size={12.5} aria-hidden="true" />
                  <span>{f}</span>
                </button>
              ))}
            </div>
          )}
          {message.status === "complete" && message.content && (
            <div className="mt-1.5 flex items-center gap-0.5">
              <button
                type="button"
                aria-label={copied ? "Copied" : "Copy response"}
                title={copied ? "Copied" : "Copy"}
                onClick={async () => {
                  if (await copyText(message.content)) {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  }
                }}
                className={cn("icon-btn is-xs focus-ring text-[--ink-3] hover:text-[--ink]", copied && "text-[--ok] hover:text-[--ok]")}
              >
                {copied ? <Check size={13.5} aria-hidden="true" /> : <Copy size={13.5} aria-hidden="true" />}
              </button>
              {isLast && (
                <button
                  type="button"
                  onClick={() => onRetry(message.id)}
                  disabled={generating}
                  aria-label="Regenerate response"
                  title="Regenerate"
                  className="icon-btn is-xs focus-ring text-[--ink-3] hover:text-[--ink]"
                >
                  <RotateCcw size={13.5} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
});

/* ── anim wrapper kept out of memo so entrance plays once ────── */

function MessageCell({ children }: { children: React.ReactNode }) {
  // content-visibility virtualizes offscreen cost natively: the browser
  // skips layout/paint for messages outside the viewport, while the DOM
  // (copy, anchors, quiz state) stays fully intact.
  return <div className="msg-virtual anim-fade-up">{children}</div>;
}

/* ── empty state ────────────────────────────────────────────── */

const SUGGESTIONS = [
  { icon: Binary, label: "Explain binary search simply", tag: "CS 101 · Algorithms", prompt: "Explain binary search simply — I keep mixing up the pointers." },
  { icon: ListChecks, label: "Practice quiz — answer right here", tag: "BIO 110 · Cell Biology", prompt: "Give me a practice quiz on Chapter 4: Photosynthesis." },
  { icon: ImagePlay, label: "Draw a diagram of the Calvin cycle", tag: "Generates an image", prompt: "Draw a diagram of photosynthesis and the Calvin cycle." },
  { icon: SquareFunction, label: "Compare the chain and product rules", tag: "MATH 121 · Calculus I", prompt: "What is the difference between the chain rule and the product rule?" },
];

function EmptyState({ tier, courseShort, onSuggestion }: { tier: Tier; courseShort: string; onSuggestion: (text: string) => void }) {
  const small = tierLte(tier, "sm");
  const micro = tier === "xxs";
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-8 text-center">
      <div className={cn("empty-hero lumen-orb", micro ? "mb-3 h-[30px] w-[30px]" : "mb-5 h-[42px] w-[42px]")} aria-hidden="true" />
      <h1
        className={cn(
          "font-semibold tracking-[-0.02em] text-[--ink]",
          micro ? "text-[18px] leading-snug" : tierLte(tier, "xs") ? "text-[21px]" : "text-[24px]"
        )}
      >
        How can I help you{" "}
        <em className="font-serif-display italic" style={{ fontSize: "1.08em" }}>
          learn
        </em>{" "}
        today?
      </h1>
      {!micro && (
        <p className="mt-2 max-w-[380px] text-[13.5px] leading-relaxed text-[--ink-2]">
          Ask about any lesson in {courseShort}, paste a problem, or share a screenshot of where you're stuck.
        </p>
      )}
      <div className={cn("stagger mt-6 grid w-full gap-2", small ? "max-w-[420px] grid-cols-1" : "mt-8 max-w-[600px] grid-cols-2")}>
        {SUGGESTIONS.map(({ icon: Icon, label, tag, prompt }) => (
          <button key={label} type="button" onClick={() => onSuggestion(prompt)} className="suggestion focus-ring">
            <span className="suggestion__icon" aria-hidden="true">
              <Icon size={15.5} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-[--ink]">{label}</span>
              {!micro && <span className="mt-px block truncate text-[11px] text-[--ink-3]">{tag}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── pagination sentinel ────────────────────────────────────── */

function Sentinel({
  hasMore, isLoadingMore, loadError, showBeginning, onRetry, sentinelRef,
}: {
  hasMore: boolean;
  isLoadingMore: boolean;
  loadError: boolean;
  showBeginning: boolean;
  onRetry: () => void;
  sentinelRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <>
      <div ref={sentinelRef} className="h-px" aria-hidden="true" />
      {(isLoadingMore || loadError || showBeginning) && (
        <div className="flex justify-center pb-1 pt-2" aria-live="polite">
          {isLoadingMore ? (
            <span className="flex items-center gap-2 text-[11.5px] text-[--ink-3]">
              <span className="spin-arc" aria-hidden="true" />
              Loading earlier messages…
            </span>
          ) : loadError ? (
            <button type="button" onClick={onRetry} className="ghost-btn focus-ring h-[30px] text-[12.5px]">
              <RotateCcw size={13} aria-hidden="true" />
              Couldn't load earlier messages — retry
            </button>
          ) : showBeginning ? (
            <span className="select-none text-[10.5px] font-medium uppercase tracking-[0.08em] text-[--ink-4]">
              Beginning of conversation
            </span>
          ) : null}
        </div>
      )}
      {hasMore && !isLoadingMore && !loadError && <div className="h-2" aria-hidden="true" />}
    </>
  );
}

/* ── the scrollable conversation ────────────────────────────── */

export default function MessageList({
  chat, tier, generating, onSuggestion, onRetry, onImageClick, onToggleThinking, onQuizAnswer, onQuizSubmit, onFollowUp,
}: {
  chat: Chat;
  tier: Tier;
  generating: boolean;
  onSuggestion: (text: string) => void;
  onRetry: (id: string) => void;
  onImageClick: (a: Attachment) => void;
  onToggleThinking: (id: string) => void;
  onQuizAnswer: (msgId: string, qIdx: number, optIdx: number) => void;
  onQuizSubmit: (msgId: string) => void;
  onFollowUp: (text: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const { visible, hasMore, isLoadingMore, loadError, loadMore, retry } = usePagedMessages(chat, listRef);

  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const didInit = useRef(false);
  const prevChatId = useRef(chat.id);
  const prevLastId = useRef<string | undefined>(undefined);

  const last = chat.messages[chat.messages.length - 1];

  /* throttled programmatic scroll — never more than STREAM_SCROLL_MS */
  const smoothBottom = useMemo(
    () =>
      throttle((behavior: ScrollBehavior) => {
        const el = listRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
      }, PERF.STREAM_SCROLL_MS),
    []
  );

  /* prefetch older history via IntersectionObserver (no scroll polling) */
  useEffect(() => {
    if (!sentinelEl || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root: null, rootMargin: `${PERF.CHAT_PREFETCH_MARGIN}px 0px 0px 0px`, threshold: 0 }
    );
    io.observe(sentinelEl);
    return () => io.disconnect();
  }, [sentinelEl, hasMore, loadMore]);

  /* instant pin-to-bottom on mount and on chat switch */
  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
      return;
    }
    if (prevChatId.current !== chat.id) {
      prevChatId.current = chat.id;
      prevLastId.current = undefined;
      atBottomRef.current = true;
      setAtBottom(true);
      requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
      return;
    }
    // a brand-new message appended → glide down immediately
    if (last && last.id !== prevLastId.current) {
      prevLastId.current = last.id;
      if (atBottomRef.current) {
        const el = listRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id, last?.id]);

  /* streaming growth → throttled auto-follow */
  useEffect(() => {
    if (!last) return;
    if ((last.status === "thinking" || last.status === "streaming") && atBottomRef.current) {
      smoothBottom("auto");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.content, last?.status, smoothBottom]);

  const jumpToBottom = () => {
    atBottomRef.current = true;
    setAtBottom(true);
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const pad = tier === "xxs" ? "px-2.5" : tier === "xs" ? "px-3" : tier === "sm" ? "px-4" : tier === "md" ? "px-5" : "px-7";

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={listRef}
        role="log"
        aria-label="Conversation"
        className="scroll-area absolute inset-0 overflow-y-auto"
        onScroll={(e) => {
          // Cheap, state-change-only updates; reads happen once per event.
          const el = e.currentTarget;
          const b = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
          if (b !== atBottomRef.current) {
            atBottomRef.current = b;
            setAtBottom(b);
          }
        }}
      >
        <div className={cn("mx-auto flex min-h-full w-full flex-col", tierLte(tier, "sm") ? "max-w-none" : "max-w-[820px]", pad, tier === "xxs" ? "pb-4 pt-3" : "pb-8 pt-5")}>
          {chat.messages.length === 0 ? (
            <EmptyState tier={tier} courseShort={chat.courseShort} onSuggestion={onSuggestion} />
          ) : (
            <div className={cn("flex flex-col", tier === "xxs" ? "gap-5" : tierLte(tier, "sm") ? "gap-6" : "gap-7")}>
              <Sentinel
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                loadError={loadError}
                showBeginning={!hasMore && chat.messages.length > PERF.CHAT_INITIAL_PAGE}
                onRetry={retry}
                sentinelRef={setSentinelEl}
              />
              {visible.map((m) => {
                const isLastMsg = m.id === last?.id;
                return (
                  <MessageCell key={m.id}>
                    {m.role === "user" ? (
                      <UserMessage message={m} tier={tier} onImageClick={onImageClick} />
                    ) : (
                      <AssistantMessage
                        message={m}
                        tier={tier}
                        isLast={isLastMsg}
                        generating={generating && m.id !== last?.id}
                        onRetry={onRetry}
                        onImageClick={onImageClick}
                        onToggleThinking={onToggleThinking}
                        onQuizAnswer={onQuizAnswer}
                        onQuizSubmit={onQuizSubmit}
                        onFollowUp={onFollowUp}
                      />
                    )}
                  </MessageCell>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!atBottom && chat.messages.length > 0 && (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label="Jump to latest message"
          className={cn(
            "anim-fade-in focus-ring absolute bottom-3 z-10 flex h-[32px] w-[32px] items-center justify-center rounded-full border border-[--border] bg-[--surface] text-[--ink-2] shadow-[var(--sh-sm)] transition-colors hover:bg-[--hover] hover:text-[--ink]",
            tier === "xxs" ? "right-2" : "right-4"
          )}
        >
          <ArrowDown size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
