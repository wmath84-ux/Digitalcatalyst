import { useEffect, useRef, useState } from "react";
import { Camera, Maximize2, X } from "lucide-react";
import { clamp } from "../lib/utils";
import { cn } from "../utils/cn";

export interface ShotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragState =
  | { kind: "draw"; sx: number; sy: number }
  | { kind: "move"; ox: number; oy: number; rect: ShotRect }
  | { kind: "resize"; dir: string; rect: ShotRect };

const MIN = 14;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const CURSORS: Record<string, string> = {
  nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize", e: "ew-resize",
  se: "nwse-resize", s: "ns-resize", sw: "nesw-resize", w: "ew-resize",
};
const HANDLE_POS: Record<string, { left: string; top: string }> = {
  nw: { left: "-6px", top: "-6px" }, n: { left: "calc(50% - 6px)", top: "-6px" },
  ne: { left: "calc(100% - 6px)", top: "-6px" }, e: { left: "calc(100% - 6px)", top: "calc(50% - 6px)" },
  se: { left: "calc(100% - 6px)", top: "calc(100% - 6px)" }, s: { left: "calc(50% - 6px)", top: "calc(100% - 6px)" },
  sw: { left: "-6px", top: "calc(100% - 6px)" }, w: { left: "-6px", top: "calc(50% - 6px)" },
};

/**
 * Professional screen-region selection.
 * Crosshair draw → resize/reposition with 8 handles → capture or cancel.
 * Rendered with `data-html2canvas-ignore` so it never appears in the capture.
 */
export default function ScreenshotOverlay({
  onCancel,
  onCapture,
}: {
  onCancel: () => void;
  onCapture: (rect: ShotRect) => Promise<void>;
}) {
  const [rect, setRect] = useState<ShotRect | null>(null);
  const [guide, setGuide] = useState<{ x: number; y: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const rectRef = useRef<ShotRect | null>(null);
  rectRef.current = rect;

  useEffect(() => {
    const vw = () => window.innerWidth;
    const vh = () => window.innerHeight;

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) {
        if (!rectRef.current) setGuide({ x: e.clientX, y: e.clientY });
        return;
      }
      e.preventDefault();
      const cx = clamp(e.clientX, 0, vw());
      const cy = clamp(e.clientY, 0, vh());

      if (d.kind === "draw") {
        setRect({
          x: Math.min(d.sx, cx),
          y: Math.min(d.sy, cy),
          w: Math.abs(cx - d.sx),
          h: Math.abs(cy - d.sy),
        });
      } else if (d.kind === "move") {
        setRect({
          ...d.rect,
          x: clamp(cx - d.ox, 0, vw() - d.rect.w),
          y: clamp(cy - d.oy, 0, vh() - d.rect.h),
        });
      } else {
        const r = d.rect;
        let { x, y, w, h } = r;
        if (d.dir.includes("e")) w = clamp(cx - x, MIN, vw() - x);
        if (d.dir.includes("s")) h = clamp(cy - y, MIN, vh() - y);
        if (d.dir.includes("w")) {
          const nx = clamp(cx, 0, x + w - MIN);
          w = w + (x - nx);
          x = nx;
        }
        if (d.dir.includes("n")) {
          const ny = clamp(cy, 0, y + h - MIN);
          h = h + (y - ny);
          y = ny;
        }
        setRect({ x, y, w, h });
      }
    };

    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (d?.kind === "draw" && rectRef.current && (rectRef.current.w < MIN || rectRef.current.h < MIN)) {
        setRect(null); // tap without drag → reset
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && rectRef.current && !capturing) void doCapture();
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

  const doCapture = async () => {
    const r = rectRef.current;
    if (!r || capturing) return;
    setCapturing(true);
    await onCapture({ ...r });
  };

  const startDraw = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { kind: "draw", sx: e.clientX, sy: e.clientY };
    setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    setGuide(null);
  };

  return (
    <div
      className="shot-scrim select-none"
      data-html2canvas-ignore="true"
      role="dialog"
      aria-modal="true"
      aria-label="Select a screen region to capture"
      onPointerDown={startDraw}
    >
      {/* idle crosshair guides */}
      {guide && !rect && (
        <>
          <div className="pointer-events-none fixed top-0 h-full w-px bg-[rgba(255,255,255,0.3)]" style={{ left: guide.x }} aria-hidden="true" />
          <div className="pointer-events-none fixed left-0 h-px w-full bg-[rgba(255,255,255,0.3)]" style={{ top: guide.y }} aria-hidden="true" />
        </>
      )}

      {/* selection rectangle */}
      {rect && rect.w > 0 && rect.h > 0 && (
        <div
          className="shot-rect"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          onPointerDown={(e) => {
            e.stopPropagation();
            dragRef.current = { kind: "move", ox: e.clientX - rect.x, oy: e.clientY - rect.y, rect };
          }}
        >
          {!capturing &&
            HANDLES.map((dir) => (
              <div
                key={dir}
                className="shot-handle"
                style={{ ...HANDLE_POS[dir], cursor: CURSORS[dir] }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  dragRef.current = { kind: "resize", dir, rect: rectRef.current ?? rect };
                }}
              />
            ))}
          {/* size badge */}
          <div
            className={cn(
              "mono pointer-events-none absolute left-0 whitespace-nowrap rounded-[7px] bg-[rgba(24,22,16,0.85)] px-2 py-1 text-[11px] font-medium tabular-nums text-white shadow-[var(--sh-sm)]",
              rect.y < 40 ? "top-2 left-2" : "-top-[34px]"
            )}
            aria-hidden="true"
          >
            {Math.round(rect.w)} × {Math.round(rect.h)}
          </div>
        </div>
      )}

      {/* instruction hint */}
      <div className="shot-hint" onPointerDown={(e) => e.stopPropagation()} role="status">
        <Maximize2 size={14} aria-hidden="true" className="flex-none opacity-80" />
        <span className="truncate">
          {capturing ? "Capturing…" : rect ? "Drag to reposition · use handles to resize" : "Click and drag to select an area"}
        </span>
      </div>

      {/* action bar */}
      <div
        className="fixed left-1/2 z-[103] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[rgba(24,22,16,0.9)] p-1.5 shadow-[var(--sh-pop)]"
        style={{ bottom: "max(16px, env(safe-area-inset-bottom))" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring flex h-[32px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium text-[#f1efe8] transition-colors hover:bg-[rgba(255,255,255,0.1)]"
        >
          <X size={14} aria-hidden="true" />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void doCapture()}
          disabled={!rect || capturing}
          className="focus-ring flex h-[32px] items-center gap-1.5 rounded-full bg-[--accent] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[--accent-hover] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Camera size={14} aria-hidden="true" />
          {capturing ? "Capturing…" : "Capture"}
        </button>
      </div>
    </div>
  );
}
