import { useEffect, useState } from "react";
import { Download, Expand, ImageIcon, RefreshCw, Sparkles } from "lucide-react";
import type { GeneratedImage as GenImage, Tier } from "../lib/types";
import { tierLte } from "../lib/tier";
import { cn } from "../utils/cn";

/**
 * An image produced by the assistant.
 * Rendering state reserves the exact final aspect ratio so the conversation
 * never reflows when the image lands.
 */
export default function GeneratedImageCard({
  image,
  tier,
  onExpand,
  onRegenerate,
}: {
  image: GenImage;
  tier: Tier;
  onExpand: () => void;
  onRegenerate: () => void;
}) {
  const rendering = image.status === "rendering";
  const [pct, setPct] = useState(4);
  const narrow = tierLte(tier, "xs");

  useEffect(() => {
    if (!rendering) {
      setPct(100);
      return;
    }
    setPct(4);
    const iv = window.setInterval(() => setPct((p) => (p >= 92 ? 92 : p + Math.max(1, (94 - p) * 0.12))), 90);
    return () => window.clearInterval(iv);
  }, [rendering, image.src]);

  return (
    <figure className="anim-fade-up mt-3 max-w-[560px]">
      <div
        className={cn(
          "relative overflow-hidden rounded-[14px] border border-[--border] bg-[--surface] shadow-[var(--sh-xs)]",
          rendering && "genimg-rendering"
        )}
        style={{ aspectRatio: image.aspect }}
      >
        {rendering ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-5 text-center">
            <span className="lumen-orb is-thinking h-[26px] w-[26px]" aria-hidden="true" />
            <div className="w-full max-w-[220px]">
              <div className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-[--ink-2]">
                <span className="shimmer-text">Rendering illustration</span>
                <span className="mono tabular-nums text-[11px] text-[--ink-3]">{Math.round(pct)}%</span>
              </div>
              <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[--hover]" role="progressbar" aria-label="Generating image" aria-valuenow={Math.round(pct)}>
                <div className="h-full rounded-full bg-[--accent] transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onExpand}
              aria-label={`Expand image: ${image.alt}`}
              className="focus-ring group block h-full w-full cursor-zoom-in"
            >
              <img src={image.src} alt={image.alt} className="anim-fade-in h-full w-full object-cover" />
            </button>
            <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-[6px] bg-[rgba(20,19,14,0.62)] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-white">
              <Sparkles size={9} aria-hidden="true" />
              Generated
            </span>
          </>
        )}
      </div>

      <figcaption className="mt-2 flex items-start gap-2">
        <ImageIcon size={13} className="mt-[3px] flex-none text-[--ink-4]" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-[12px] leading-snug text-[--ink-3]">
          {rendering ? "Generating from your request…" : image.caption}
        </span>
      </figcaption>

      {!rendering && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={onExpand} className="ghost-btn focus-ring h-[28px] px-2.5 text-[12px]">
            <Expand size={12.5} aria-hidden="true" />
            {narrow ? "View" : "View full size"}
          </button>
          <a href={image.src} download className="ghost-btn focus-ring h-[28px] px-2.5 text-[12px]" aria-label="Download image">
            <Download size={12.5} aria-hidden="true" />
            {narrow ? "Save" : "Download"}
          </a>
          <button type="button" onClick={onRegenerate} className="ghost-btn focus-ring h-[28px] px-2.5 text-[12px]">
            <RefreshCw size={12.5} aria-hidden="true" />
            {narrow ? "Redo" : "Regenerate"}
          </button>
        </div>
      )}
    </figure>
  );
}
