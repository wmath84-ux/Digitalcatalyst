// src/components/PerfectFreehandSketch.tsx
//
// A lightweight, pressure-sensitive freehand sketch tool using the
// `perfect-freehand` library (github.com/steveruizok/perfect-freehand).
//
// This is an EMBEDDED component — meant to live inside the existing
// SketchPanel as a "Quick Sketch" mode. It supports:
//   • Pointer-based drawing with simulated pressure
//   • Pen/eraser tools, colour and size pickers
//   • Undo/redo, clear
//   • PNG download + PDF print
//   • Multiple canvases (create, switch, delete)
//   • Firestore persistence with offline fallback
//
// Strokes are rendered as filled SVG <path>s whose outline is computed by
// `getStroke` — giving natural, calligraphic lines that respond to speed /
// pressure. The canvas works with mouse, touch and pen (pointer events).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";
import { Download, Printer, Plus, Trash2, Check, X } from "lucide-react";
import { getSvgPathFromStroke } from "../utils/svgPathFromStroke";
import { usePerfectFreehandSketch, type Stroke, type StrokePoint } from "../course/usePerfectFreehandSketch";

// ── Colour + size presets ────────────────────────────────────────────────
const COLOURS = [
  "#1e1e1e",
  "#e03131",
  "#2f9e44",
  "#1971c2",
  "#f08c00",
  "#9c36b5",
  "#ffffff",
];
const SIZES = [2, 4, 8, 16];

// ── Component ────────────────────────────────────────────────────────────
export default function PerfectFreehandSketch({
  onBack,
  uid,
  productId,
  moduleId,
  resourceId,
  resourceName,
}: {
  /** When set, a compact "Back to Editor" button is shown in the top bar. */
  onBack?: () => void;
  /** User ID for persistence */
  uid?: string | null;
  /** Product ID for scoping */
  productId?: string | number | null;
  /** Module ID for scoping */
  moduleId?: string | number | null;
  /** Optional resource association */
  resourceId?: string | null;
  resourceName?: string | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [undoneStrokes, setUndoneStrokes] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [colour, setColour] = useState(COLOURS[0]);
  const [size, setSize] = useState(SIZES[2]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showBoardSelector, setShowBoardSelector] = useState(false);

  // ── Persistence hook ──────────────────────────────────────────────────
  const sketch = usePerfectFreehandSketch({
    uid,
    productId,
    moduleId,
    resourceId,
    resourceName,
  });

  // ── Pointer handlers ─────────────────────────────────────────────────
  const getPointFromEvent = useCallback(
    (event: React.PointerEvent<SVGSVGElement>): StrokePoint => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0, pressure: 0.5 };
      const rect = svg.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        pressure: event.pressure || 0.5,
      };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDrawing(true);
      const point = getPointFromEvent(event);
      const newStroke: Stroke = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        points: [point],
        color: tool === "eraser" ? "#ffffff" : colour,
        size: tool === "eraser" ? size * 4 : size,
        isEraser: tool === "eraser",
      };
      setCurrentStroke(newStroke);
      // Any new stroke invalidates the redo stack.
      if (undoneStrokes.length > 0) setUndoneStrokes([]);
    },
    [getPointFromEvent, tool, colour, size, undoneStrokes.length],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!isDrawing || !currentStroke) return;
      const point = getPointFromEvent(event);
      setCurrentStroke({
        ...currentStroke,
        points: [...currentStroke.points, point],
      });
    },
    [isDrawing, currentStroke, getPointFromEvent],
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawing || !currentStroke) return;
    const newStrokes = [...sketch.strokes, currentStroke];
    sketch.updateStrokes(newStrokes);
    setCurrentStroke(null);
    setIsDrawing(false);
  }, [isDrawing, currentStroke, sketch]);

  // ── Undo / redo / clear ──────────────────────────────────────────────
  const undo = useCallback(() => {
    if (sketch.strokes.length === 0) return;
    const last = sketch.strokes[sketch.strokes.length - 1];
    setUndoneStrokes((u) => [...u, last]);
    sketch.updateStrokes(sketch.strokes.slice(0, -1));
  }, [sketch]);

  const redo = useCallback(() => {
    if (undoneStrokes.length === 0) return;
    const last = undoneStrokes[undoneStrokes.length - 1];
    setUndoneStrokes((u) => u.slice(0, -1));
    sketch.updateStrokes([...sketch.strokes, last]);
  }, [undoneStrokes, sketch]);

  const clear = useCallback(() => {
    sketch.updateStrokes([]);
    setUndoneStrokes([]);
    setCurrentStroke(null);
  }, [sketch]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      // Skip when a text input is focused
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if ((event.ctrlKey || event.metaKey) && event.key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [undo, redo]);

  // ── Stroke rendering helper ──────────────────────────────────────────
  const renderStroke = useCallback((stroke: Stroke) => {
    const outlinePoints = getStroke(stroke.points, {
      size: stroke.size,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: true,
      easing: (t) => t * (2 - t),
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    });
    const pathData = getSvgPathFromStroke(outlinePoints);
    return (
      <path
        key={stroke.id}
        d={pathData}
        fill={stroke.color}
        stroke="none"
        style={stroke.isEraser ? { mixBlendMode: "destination-out" } : undefined}
      />
    );
  }, []);

  // ── Download as PNG ──────────────────────────────────────────────────
  const downloadPNG = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svg.clientWidth * 2;
      canvas.height = svg.clientHeight * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `sketch-${sketch.activeBoardTitle}-${Date.now()}.png`;
      link.href = pngUrl;
      link.click();
    };
    img.src = url;
  }, [sketch.activeBoardTitle]);

  // ── Print / PDF export ───────────────────────────────────────────────
  const handlePrint = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svg.clientWidth * 2;
      canvas.height = svg.clientHeight * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL("image/png");
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${sketch.activeBoardTitle}</title>
            <style>
              body { margin: 0; padding: 20px; font-family: sans-serif; }
              img { max-width: 100%; height: auto; }
              h1 { font-size: 18px; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <h1>${sketch.activeBoardTitle}</h1>
            <img src="${pngUrl}" />
            <script>
              window.onload = () => {
                setTimeout(() => {
                  window.print();
                  window.close();
                }, 250);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    };
    img.src = url;
  }, [sketch.activeBoardTitle]);

  // ── Derived render state ─────────────────────────────────────────────
  const allStrokes = useMemo(() => {
    return currentStroke ? [...sketch.strokes, currentStroke] : sketch.strokes;
  }, [sketch.strokes, currentStroke]);

  // ── Status indicator ─────────────────────────────────────────────────
  const statusText = useMemo(() => {
    switch (sketch.status) {
      case "loading":
        return "Loading...";
      case "saving":
        return "Saving...";
      case "saved":
        return "Saved";
      case "pending":
        return "Unsaved changes";
      case "error":
        return "Sync paused";
      default:
        return "";
    }
  }, [sketch.status]);

  const statusColor = useMemo(() => {
    switch (sketch.status) {
      case "saved":
        return "text-green-400";
      case "pending":
        return "text-amber-400";
      case "error":
        return "text-red-400";
      default:
        return "text-slate-400";
    }
  }, [sketch.status]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#1b1b21]">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#222228] px-3 py-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            title="Back to full editor"
          >
            ← Editor
          </button>
        ) : null}

        {/* Board selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowBoardSelector(!showBoardSelector)}
            className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            title="Switch canvas"
          >
            {sketch.activeBoardTitle}
          </button>

          {showBoardSelector ? (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-white/15 bg-[#1b1b21] p-2 shadow-2xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Canvases
                </span>
                <button
                  type="button"
                  onClick={() => {
                    sketch.createBoard();
                    setShowBoardSelector(false);
                  }}
                  disabled={!sketch.canCreateBoard}
                  className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  title="New canvas"
                >
                  <Plus size={12} />
                </button>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {sketch.boards.map((board) => (
                  <div
                    key={board.sketchKey}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors ${
                      board.sketchKey === sketch.activeBoardKey
                        ? "bg-white/10 text-white"
                        : "text-white/70 hover:bg-white/5"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        sketch.selectBoard(board.sketchKey);
                        setShowBoardSelector(false);
                      }}
                      className="flex-1 text-left"
                    >
                      <div className="font-semibold">{board.title}</div>
                      <div className="text-[9px] text-white/50">
                        {board.strokeCount} strokes
                      </div>
                    </button>
                    {board.sketchKey !== "main" && sketch.boards.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete "${board.title}"?`)) {
                            sketch.deleteBoard(board.sketchKey);
                          }
                        }}
                        className="rounded p-1 text-white/50 transition-colors hover:bg-red-500/20 hover:text-red-400"
                        title="Delete canvas"
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="h-5 w-px bg-white/10" aria-hidden />

        {/* Tool buttons */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTool("pen")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              tool === "pen"
                ? "bg-orange-500 text-white"
                : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
            }`}
            title="Pen (P)"
          >
            ✏️ Pen
          </button>
          <button
            type="button"
            onClick={() => setTool("eraser")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              tool === "eraser"
                ? "bg-orange-500 text-white"
                : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
            }`}
            title="Eraser (E)"
          >
            🧽 Eraser
          </button>
        </div>

        <div className="h-5 w-px bg-white/10" aria-hidden />

        {/* Colour swatches */}
        <div className="flex items-center gap-1">
          {COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColour(c);
                if (tool === "eraser") setTool("pen");
              }}
              className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                colour === c && tool === "pen"
                  ? "border-orange-500 scale-110"
                  : "border-white/30"
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Colour ${c}`}
            />
          ))}
        </div>

        <div className="h-5 w-px bg-white/10" aria-hidden />

        {/* Size pickers */}
        <div className="flex items-center gap-1">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                size === s
                  ? "bg-orange-500 text-white"
                  : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
              title={`Size ${s}`}
            >
              <div
                className="rounded-full bg-current"
                style={{ width: Math.max(4, s), height: Math.max(4, s) }}
              />
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={sketch.strokes.length === 0}
            className="rounded-md bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={undoneStrokes.length === 0}
            className="rounded-md bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            title="Redo (Ctrl+Shift+Z)"
          >
            ↷ Redo
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded-md bg-red-500/20 px-2 py-1 text-[11px] font-semibold text-red-400 transition-colors hover:bg-red-500/30"
            title="Clear all"
          >
            🗑 Clear
          </button>
          <button
            type="button"
            onClick={downloadPNG}
            disabled={sketch.strokes.length === 0}
            className="rounded-md bg-emerald-500/20 px-2 py-1 text-[11px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            title="Download as PNG"
          >
            <Download size={14} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={sketch.strokes.length === 0}
            className="rounded-md bg-blue-500/20 px-2 py-1 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            title="Print / PDF"
          >
            <Printer size={14} />
          </button>
        </div>
      </div>

      {/* ── Status line ─────────────────────────────────────────────────── */}
      {sketch.scoped ? (
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 bg-[#1f1f25] px-3 py-1">
          <span className={`text-[10px] font-semibold ${statusColor}`}>
            {statusText}
          </span>
          <span className="text-[10px] font-semibold text-white/50">
            {sketch.strokeCount} strokes
          </span>
        </div>
      ) : null}

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {sketch.loading ? (
          <div className="absolute inset-0 grid place-items-center">
            <span className="block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-orange-400" />
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              className="h-full w-full cursor-crosshair touch-none bg-white"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <g style={{ isolation: "isolate" }}>
                {allStrokes.map((stroke) => renderStroke(stroke))}
              </g>
            </svg>

            {sketch.strokes.length === 0 && !isDrawing ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-500">
                    Quick Sketch — draw anything
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Notes • Calculations • Diagrams • Questions
                  </p>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
