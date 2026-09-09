import { useEffect, useRef, useState } from "react";
import { ArrowUp, Crop, ImagePlus, Square, X } from "lucide-react";
import { IMAGE_ACCEPT, isImageFile, readImageAttachment } from "../lib/utils";
import { tierLte } from "../lib/tier";
import { PERF } from "../lib/perf";
import { useKeepInputVisible } from "../lib/useViewportKeyboard";
import type { Attachment, Tier } from "../lib/types";
import { cn } from "../utils/cn";

/**
 * Typing state is deliberately LOCAL. Keystrokes never touch the global
 * chat tree — drafts sync upward debounced (and flush on unmount/send),
 * so typing stays instant even while a response streams elsewhere.
 */
export default function Composer({
  tier,
  courseShort,
  initialDraft,
  attachments,
  generating,
  onDraftSync,
  onAddAttachments,
  onRemoveAttachment,
  onSend,
  onStop,
  onScreenshot,
  autofocus,
}: {
  tier: Tier;
  courseShort: string;
  initialDraft: string;
  attachments: Attachment[];
  generating: boolean;
  onDraftSync: (v: string) => void;
  onAddAttachments: (atts: Attachment[]) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onScreenshot: () => void;
  autofocus?: boolean;
}) {
  const [value, setValue] = useState(initialDraft);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const prevInitial = useRef(initialDraft);
  const [dragging, setDragging] = useState(false);
  const dragCount = useRef(0);

  const micro = tier === "xxs";
  const small = tierLte(tier, "sm");
  const canSend = value.trim().length > 0 || attachments.length > 0;

  // External fills (prompt starters, suggestions) land here.
  useEffect(() => {
    if (initialDraft !== prevInitial.current) {
      prevInitial.current = initialDraft;
      if (initialDraft) {
        setValue((v) => (v.trim() ? v : initialDraft));
        taRef.current?.focus();
      }
    }
  }, [initialDraft]);

  // Debounced persistence of the draft (no per-keystroke global renders).
  useEffect(() => {
    const t = window.setTimeout(() => onDraftSync(valueRef.current), PERF.DRAFT_SYNC_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Flush whatever hasn't synced yet when leaving this composer.
  useEffect(() => {
    return () => onDraftSync(valueRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-grow textarea.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, 190)}px`;
  }, [value, tier]);

  useEffect(() => {
    if (autofocus && window.matchMedia("(pointer: fine)").matches) taRef.current?.focus();
  }, [autofocus]);

  // Keeps the caret above the keyboard by scrolling the chat container.
  useKeepInputVisible(taRef);

  const sendNow = () => {
    const text = valueRef.current; // always the freshest, no stale closure
    if (!(text.trim().length > 0 || attachments.length > 0) || generating) return;
    onSend(text);
    setValue("");
    onDraftSync("");
  };

  const addFiles = async (files: Iterable<File>) => {
    const imgs = Array.from(files).filter(isImageFile);
    if (!imgs.length) return;
    const atts = await Promise.all(imgs.map((f) => readImageAttachment(f)));
    onAddAttachments(atts);
    taRef.current?.focus();
  };

  const placeholder = micro ? "Message…" : small ? `Ask about ${courseShort}…` : `Ask about ${courseShort}, or attach a screenshot…`;

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[820px] flex-none",
        micro ? "px-2.5" : tier === "xs" ? "px-3" : tier === "sm" ? "px-4" : tier === "md" ? "px-5" : "px-7"
      )}
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))", paddingTop: 2 }}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          dragCount.current += 1;
          setDragging(true);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragCount.current -= 1;
        if (dragCount.current <= 0) {
          dragCount.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragCount.current = 0;
        setDragging(false);
        void addFiles(e.dataTransfer.files);
      }}
    >
      <div className={cn("composer", dragging && "is-dragover")} aria-label="Message composer">
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className={cn("flex gap-2 overflow-x-auto px-3 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", micro && "px-2.5 pt-2.5")}>
            {attachments.map((a) => (
              <div key={a.id} className="attach-chip anim-fade-up">
                <img src={a.src} alt={a.name} title={a.name} loading="lazy" decoding="async" className={cn(micro ? "h-[44px] w-[44px]" : "h-[56px] w-[56px]")} />
                {a.kind === "screenshot" && <span className="attach-chip__badge">Shot</span>}
                <button type="button" onClick={() => onRemoveAttachment(a.id)} aria-label={`Remove ${a.name}`} className="attach-chip__remove focus-ring">
                  <X size={11} strokeWidth={3} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text input */}
        <textarea
          ref={taRef}
          value={value}
          rows={1}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              sendNow();
            }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter(isImageFile);
            if (files.length) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          placeholder={placeholder}
          aria-label="Message Lumen"
          enterKeyHint="send"
          className={cn(micro ? "px-3 pb-1.5 pt-2.5 text-[14px]" : small ? "px-3.5 pb-2 pt-3 text-[16px]" : "px-3.5 pb-2 pt-3 text-[15px]")}
        />

        {/* Toolbar */}
        <div className={cn("flex items-center gap-0.5 px-2 pb-2", micro && "gap-0 px-1.5 pb-1.5")}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach an image"
            title="Attach image (JPG, PNG, WEBP, GIF, SVG)"
            className={cn("icon-btn focus-ring", small ? "is-sm" : "", micro && "is-xs")}
          >
            <ImagePlus size={micro ? 15 : 16.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onScreenshot}
            aria-label="Capture a region of the screen"
            title="Capture screen region"
            className={cn("icon-btn focus-ring", small ? "is-sm" : "", micro && "is-xs")}
          >
            <Crop size={micro ? 15 : 16.5} aria-hidden="true" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <div className="flex-1" />

          {generating ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating"
              className={cn(
                "focus-ring flex flex-none items-center justify-center rounded-[10px] bg-[--ink] text-white transition-colors hover:bg-[#000000]",
                micro ? "h-[28px] w-[28px]" : "h-[32px] w-[32px]"
              )}
            >
              <Square size={micro ? 10 : 11} fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={sendNow}
              disabled={!canSend}
              aria-label={canSend ? "Send message" : "Type a message or attach an image to send"}
              title="Send"
              className={cn(
                "focus-ring flex flex-none items-center justify-center rounded-[10px] transition-all",
                micro ? "h-[28px] w-[28px]" : "h-[32px] w-[32px]",
                canSend ? "bg-[--accent] text-white hover:bg-[--accent-hover] active:bg-[--accent-press]" : "cursor-not-allowed bg-[--active] text-[--ink-4]"
              )}
            >
              <ArrowUp size={micro ? 14.5 : 16} strokeWidth={2.5} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {!small && (
        <div className="composer-disclaimer select-none px-2 pb-0.5 pt-2 text-center text-[11px] text-[--ink-4]">
          Lumen can make mistakes — double-check important course information.
        </div>
      )}
    </div>
  );
}
