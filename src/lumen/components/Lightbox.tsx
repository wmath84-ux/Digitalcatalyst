import { useEffect } from "react";
import { X } from "lucide-react";
import { formatBytes } from "../lib/utils";
import type { Attachment } from "../lib/types";

export default function Lightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="anim-fade-in fixed inset-0 z-[120] flex flex-col bg-[rgba(18,17,12,0.86)]"
      role="dialog"
      aria-modal="true"
      aria-label={`Image preview: ${attachment.name}`}
      onClick={onClose}
    >
      <div className="flex flex-none items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-white">{attachment.name}</div>
          <div className="text-[11px] text-[rgba(255,255,255,0.5)]">
            {attachment.kind === "screenshot" ? "Screen capture" : "Image"}
            {attachment.w && attachment.h ? ` · ${attachment.w} × ${attachment.h}` : ""}
            {attachment.size ? ` · ${formatBytes(attachment.size)}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="focus-ring flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] text-[rgba(255,255,255,0.8)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-white"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pb-8" onClick={onClose}>
        <img
          src={attachment.src}
          alt={attachment.name}
          className="max-h-full max-w-full rounded-[10px] object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
