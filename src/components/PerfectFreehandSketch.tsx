// src/components/PerfectFreehandSketch.tsx
//
// The Course Player's QUICK SKETCH canvas — the perfect-freehand editor
// (perfectfreehand.com, github.com/steveruizok/perfect-freehand), rebuilt
// inside the Sketch tab.
//
// ── What this is ────────────────────────────────────────────────────────
// The real `getStroke()` pipeline and the editor's own design: a white board,
// a collapsible options panel on the left (Size, Thinning, Streamline,
// Smoothing, Easing, both ends' Taper / Cap / Easing, Fill, Stroke), "Draw"
// bottom-left, Undo · Redo · Clear bottom-right, and the three panel buttons
// the editor ends on (Reset Options, Copy Options, Copy to SVG). Options are
// ONE style for the whole drawing and apply live to every stroke, exactly like
// the editor — that is what makes thinning a slider you can feel.
//
// ── Two bugs this file exists to not have ───────────────────────────────
//   1. A stroke used to vanish the instant the finger lifted: the hook stored
//      the new list in a ref but never told React, so the canvas kept
//      rendering the list from before the stroke was finished. Every write now
//      goes through `write()` → the hook's `updateStrokes()`, which puts the
//      list in state (and persists it).
//   2. Nothing saved: every Quick Sketch document was written to
//      `users/{uid}/quickSketches/…`, a collection firestore.rules did not
//      cover, so Firestore refused every write. The collection now has its own
//      rule (owner-only, the same composite id shape as the Excalidraw boards).
//
// ── Where a stroke lives ────────────────────────────────────────────────
// Strokes are geometry only (`{id, points}`) and the style is the drawing's,
// both defined in `src/utils/quickSketch.ts` + `quickSketchStyle.ts`. Saving,
// offline mirroring, canvases and cloud sync belong to
// `src/course/usePerfectFreehandSketch.ts`; this component owns the canvas,
// the undo history and the chrome.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu, Plus, Trash2 } from "lucide-react";
import "./quickSketch/quickSketch.css";
import QuickSketchPanel from "./quickSketch/QuickSketchPanel";
import {
  MAX_QUICK_SKETCH_STROKES,
  canAddQuickSketchStroke,
  eraseRadiusFor,
  eraseStrokesAt,
  quickSketchStrokeId,
  quickSketchStyleStorageKey,
  sameQuickSketchStrokes,
  type QuickSketchPoint,
  type QuickSketchStroke,
} from "../utils/quickSketch";
import {
  DEFAULT_QUICK_SKETCH_STYLE,
  quickSketchStyleFrom,
  quickSketchStyleText,
  sameQuickSketchStyle,
  type QuickSketchStyle,
} from "../utils/quickSketchStyle";
import { quickSketchStrokePath, quickSketchSvgDocument } from "../utils/quickSketchSvg";
import { usePerfectFreehandSketch } from "../course/usePerfectFreehandSketch";

/** One undoable moment of the board: the strokes and the style together. */
interface QuickSketchSnapshot {
  strokes: QuickSketchStroke[];
  style: QuickSketchStyle;
}

const HISTORY_LIMIT = 50;

/** The device's remembered style for this learner. Never throws. */
function readStoredStyle(uid?: string | null): QuickSketchStyle {
  try {
    const raw = localStorage.getItem(quickSketchStyleStorageKey(uid));
    return raw ? quickSketchStyleFrom(JSON.parse(raw)) : DEFAULT_QUICK_SKETCH_STYLE;
  } catch {
    return DEFAULT_QUICK_SKETCH_STYLE;
  }
}

function writeStoredStyle(uid: string | null | undefined, style: QuickSketchStyle) {
  try {
    localStorage.setItem(quickSketchStyleStorageKey(uid), JSON.stringify(style));
  } catch {
    // A full / disabled device store costs the learner their remembered
    // style, never their drawing: the strokes have their own mirror.
  }
}

/** Copy text, with the fallback the editor uses when the API is blocked. */
function copyText(value: string): boolean {
  try {
    void navigator.clipboard?.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "true");
      area.style.position = "fixed";
      area.style.top = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
      return true;
    } catch {
      return false;
    }
  }
}

export default function PerfectFreehandSketch({
  uid,
  productId,
  moduleId,
  resourceId,
  resourceName,
  debounceMs,
}: {
  /** The signed-in learner — scopes the board and the remembered style. */
  uid?: string | null;
  /** Course / module the board belongs to (the module is the scope). */
  productId?: string | number | null;
  moduleId?: string | number | null;
  /** Optional association: the resource open beside the canvas. */
  resourceId?: string | null;
  resourceName?: string | null;
  /** Milliseconds of quiet before a drawing reaches the cloud (tests shrink it). */
  debounceMs?: number;
}) {
  const sketch = usePerfectFreehandSketch({ uid, productId, moduleId, resourceId, resourceName, debounceMs });

  const [strokes, setStrokes] = useState<QuickSketchStroke[]>([]);
  const [style, setStyle] = useState<QuickSketchStyle>(() => readStoredStyle(uid));
  const [tool, setTool] = useState<"draw" | "erase">("draw");
  const [panelOpen, setPanelOpen] = useState(true);
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false);
  const [liveStroke, setLiveStroke] = useState<QuickSketchStroke | null>(null);
  const [notice, setNotice] = useState("");
  const [undoStack, setUndoStack] = useState<QuickSketchSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<QuickSketchSnapshot[]>([]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  /** The live values, readable from a pointer handler between renders. */
  const strokesRef = useRef<QuickSketchStroke[]>([]);
  const styleRef = useRef<QuickSketchStyle>(style);
  /** The state a gesture started from — the "before" of its undo step. */
  const gestureRef = useRef<QuickSketchSnapshot | null>(null);
  const erasingRef = useRef(false);
  const noticeTimerRef = useRef<number | null>(null);
  const outlineCacheRef = useRef(new WeakMap<QuickSketchStroke, { revision: number; path: string }>());
  /** The last list this component wrote — anything else is a board load. */
  const lastWriteRef = useRef<QuickSketchStroke[] | null>(null);
  const styleRevisionRef = useRef(0);

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 2600);
  }, []);

  // ── The board the hook loaded ─────────────────────────────────────────
  // Adopting the hook's list is what makes a cloud copy, another device's
  // strokes, or a canvas switch appear; an equal-but-identical list (our own
  // write echoing back) changes nothing, so this can never fight the canvas.
  useEffect(() => {
    strokesRef.current = sketch.strokes;
    setStrokes((previous) => (previous === sketch.strokes ? previous : sketch.strokes));
    // A list that this component did not write is a BOARD LOAD (the cloud
    // answering, a canvas switch): the old canvas's history must not survive
    // into the new one, or an undo would drag strokes across canvases.
    if (sketch.strokes !== lastWriteRef.current) {
      lastWriteRef.current = sketch.strokes;
      setUndoStack((stack) => (stack.length === 0 ? stack : []));
      setRedoStack((stack) => (stack.length === 0 ? stack : []));
    }
  }, [sketch.strokes]);

  useEffect(() => {
    styleRef.current = style;
  }, [style]);

  /** The one way a stroke list changes: state, the ref, and the cloud. */
  const write = useCallback(
    (next: QuickSketchStroke[]) => {
      strokesRef.current = next;
      lastWriteRef.current = next;
      setStrokes(next);
      sketch.updateStrokes(next);
    },
    [sketch],
  );

  const currentSnapshot = useCallback(
    (): QuickSketchSnapshot => ({ strokes: strokesRef.current, style: styleRef.current }),
    [],
  );

  /**
   * THE way the style changes. The revision counter is not book-keeping: every
   * committed stroke's outline is cached, and an outline is only valid for the
   * style it was computed from — so a style change (a slider, a reset, an
   * UNDO) must invalidate the cache or the canvas would keep showing the old
   * ink after the style went back.
   */
  const commitStyle = useCallback((next: QuickSketchStyle) => {
    styleRef.current = next;
    styleRevisionRef.current += 1;
    setStyle(next);
  }, []);

  const applySnapshot = useCallback(
    (snapshot: QuickSketchSnapshot) => {
      commitStyle(snapshot.style);
      writeStoredStyle(uid, snapshot.style);
      write(snapshot.strokes);
    },
    [commitStyle, uid, write],
  );

  /** Close an undo step — skipped when the gesture changed nothing. */
  const pushHistory = useCallback((before: QuickSketchSnapshot | null) => {
    if (!before) return;
    const after = { strokes: strokesRef.current, style: styleRef.current };
    if (sameQuickSketchStrokes(before.strokes, after.strokes) && sameQuickSketchStyle(before.style, after.style)) {
      return;
    }
    setUndoStack((stack) => [...stack, before].slice(-HISTORY_LIMIT));
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const before = undoStack[undoStack.length - 1];
    const current = currentSnapshot();
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, current].slice(-HISTORY_LIMIT));
    applySnapshot(before);
  }, [applySnapshot, currentSnapshot, undoStack]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const after = redoStack[redoStack.length - 1];
    const current = currentSnapshot();
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, current].slice(-HISTORY_LIMIT));
    applySnapshot(after);
  }, [applySnapshot, currentSnapshot, redoStack]);

  // ── Style ─────────────────────────────────────────────────────────────
  const previewStyle = useCallback(
    (patch: Partial<QuickSketchStyle>) => {
      commitStyle({ ...styleRef.current, ...patch });
    },
    [commitStyle],
  );

  /** A one-step change (select / checkbox / colour): its own undo step. */
  const applyStyle = useCallback(
    (patch: Partial<QuickSketchStyle>) => {
      const before = currentSnapshot();
      previewStyle(patch);
      pushHistory(before);
      writeStoredStyle(uid, styleRef.current);
    },
    [currentSnapshot, previewStyle, pushHistory, uid],
  );

  /**
   * Open a style gesture. Idempotent on purpose: a slider's pointerdown, the
   * first keystroke in its number field and the field's own focus all call it,
   * and the FIRST of them is the undo step's "before".
   */
  const beginStyleGesture = useCallback(() => {
    if (!gestureRef.current) gestureRef.current = currentSnapshot();
  }, [currentSnapshot]);

  const commitStyleGesture = useCallback(() => {
    pushHistory(gestureRef.current);
    gestureRef.current = null;
    writeStoredStyle(uid, styleRef.current);
  }, [pushHistory, uid]);

  const resetStyleProp = useCallback(
    (prop: keyof QuickSketchStyle) => {
      applyStyle({ [prop]: DEFAULT_QUICK_SKETCH_STYLE[prop] } as Partial<QuickSketchStyle>);
    },
    [applyStyle],
  );

  const resetStyle = useCallback(() => {
    const before = currentSnapshot();
    previewStyle(DEFAULT_QUICK_SKETCH_STYLE);
    pushHistory(before);
    writeStoredStyle(uid, styleRef.current);
    flash("Options reset");
  }, [currentSnapshot, flash, previewStyle, pushHistory, uid]);

  const copyOptions = useCallback(() => {
    flash(copyText(quickSketchStyleText(styleRef.current)) ? "Options copied" : "Couldn't copy");
  }, [flash]);

  const copySvg = useCallback(() => {
    const svg = quickSketchSvgDocument(strokesRef.current, styleRef.current);
    flash(copyText(svg) ? "SVG copied" : "Couldn't copy");
  }, [flash]);

  // ── Pointer drawing ───────────────────────────────────────────────────
  const pointFromEvent = useCallback((event: React.PointerEvent<SVGSVGElement>): QuickSketchPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, pressure: 0.5 };
    // A mouse (and most touch screens) report the spec's flat 0.5 pressure —
    // perfect-freehand then simulates it from velocity instead, which is what
    // makes a mouse drawing look like ink rather than a constant-width line.
    const pressure = event.pointerType === "pen" ? event.pressure || 0.5 : 0.5;
    return { x: Math.round((event.clientX - rect.left) * 100) / 100, y: Math.round((event.clientY - rect.top) * 100) / 100, pressure: Math.round(pressure * 100) / 100 };
  }, []);

  const eraseAt = useCallback(
    (point: QuickSketchPoint) => {
      const next = eraseStrokesAt(strokesRef.current, point, eraseRadiusFor(styleRef.current.size));
      if (next !== strokesRef.current) write(next);
    },
    [write],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      // Only the first finger: a second one must never join the same stroke.
      if (event.isPrimary === false) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const point = pointFromEvent(event);
      gestureRef.current = currentSnapshot();
      if (tool === "erase") {
        erasingRef.current = true;
        eraseAt(point);
        return;
      }
      if (!canAddQuickSketchStroke(strokesRef.current)) {
        gestureRef.current = null;
        flash(`Canvas is full (${MAX_QUICK_SKETCH_STROKES} strokes) — clear it or open a new canvas`);
        return;
      }
      const existing = new Set(strokesRef.current.map((stroke) => stroke.id));
      setLiveStroke({ id: quickSketchStrokeId(existing), points: [point] });
    },
    [currentSnapshot, eraseAt, flash, pointFromEvent, tool],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.isPrimary === false) return;
      const point = pointFromEvent(event);
      if (tool === "erase") {
        if (erasingRef.current) eraseAt(point);
        return;
      }
      setLiveStroke((current) => (current ? { ...current, points: [...current.points, point] } : current));
    },
    [eraseAt, pointFromEvent, tool],
  );

  const handlePointerUp = useCallback(() => {
    const before = gestureRef.current;
    gestureRef.current = null;
    erasingRef.current = false;
    if (tool === "draw" && liveStroke) {
      if (liveStroke.points.length === 1) {
        // A tap is a dot: perfect-freehand turns a single point into a real
        // little blob, so a learner's tap leaves a mark instead of nothing.
        setLiveStroke(null);
        write([...strokesRef.current, liveStroke]);
        pushHistory(before);
        return;
      }
      write([...strokesRef.current, liveStroke]);
      setLiveStroke(null);
      pushHistory(before);
      return;
    }
    setLiveStroke(null);
    pushHistory(before);
  }, [liveStroke, pushHistory, tool, write]);

  const clearCanvas = useCallback(() => {
    const before = currentSnapshot();
    write([]);
    setLiveStroke(null);
    pushHistory(before);
  }, [currentSnapshot, pushHistory, write]);

  // ── Keyboard (only while the learner is actually on this canvas) ──────
  useEffect(() => {
    const isActive = () => {
      const root = rootRef.current;
      if (!root) return false;
      const active = document.activeElement;
      return !active || active === document.body || root.contains(active);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isActive()) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "c") {
        event.preventDefault();
        if (event.shiftKey) copyOptions();
        else copySvg();
        return;
      }
      if (event.key === "e" || event.key === "Backspace") {
        event.preventDefault();
        clearCanvas();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearCanvas, copyOptions, copySvg, redo, undo]);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  // ── Rendering ─────────────────────────────────────────────────────────
  // The outline of a committed stroke is cached (keyed by the stroke object
  // and the style's revision) — a drag restyles every stroke, and a long board
  // would otherwise re-run perfect-freehand on all of them per pointer move.
  const outlineFor = useCallback(
    (stroke: QuickSketchStroke, last: boolean): string => {
      // The live stroke is re-outlined on every move — it is still growing.
      if (!last) return quickSketchStrokePath(stroke, style, { last: false });
      const cached = outlineCacheRef.current.get(stroke);
      if (cached && cached.revision === styleRevisionRef.current) return cached.path;
      const path = quickSketchStrokePath(stroke, style, { last: true });
      outlineCacheRef.current.set(stroke, { revision: styleRevisionRef.current, path });
      return path;
    },
    [style],
  );

  const renderedStrokes = useMemo(
    () => (liveStroke ? [...strokes, liveStroke] : strokes),
    [liveStroke, strokes],
  );

  const statusText = useMemo(() => {
    if (sketch.loading) return "Loading…";
    switch (sketch.status) {
      case "saving":
        return "Saving…";
      case "saved":
        return "Saved";
      case "pending":
        return "Unsaved changes…";
      case "error":
        return "Sync paused";
      default:
        return sketch.scoped ? "Ready" : "Not saving";
    }
  }, [sketch.loading, sketch.scoped, sketch.status]);

  const statusState = sketch.status === "error" ? "error" : sketch.status;

  return (
    <div ref={rootRef} className="dc-qsk" data-quick-sketch="" data-quick-sketch-tool={tool}>
      {sketch.loading ? (
        <div className="dc-qsk-loading" data-quick-sketch-loading="">
          <span aria-label="Loading your sketch" />
        </div>
      ) : null}

      <svg
        ref={svgRef}
        className="dc-qsk-canvas"
        data-quick-sketch-canvas=""
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={(event) => {
          if (event.buttons === 0) handlePointerUp();
        }}
      >
        {renderedStrokes.map((stroke) => {
          const isLive = stroke === liveStroke;
          const d = outlineFor(stroke, !isLive);
          if (!d) return null;
          return (
            <g key={stroke.id} data-quick-sketch-stroke={stroke.id}>
              {style.strokeWidth > 0 ? (
                <path
                  className="dc-qsk-stroke"
                  data-quick-sketch-path="stroke"
                  d={d}
                  fill="transparent"
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              <path
                className="dc-qsk-stroke"
                data-quick-sketch-path="fill"
                d={d}
                fill={style.isFilled ? style.fill : "transparent"}
                stroke={style.isFilled || style.strokeWidth > 0 ? "transparent" : "#000000"}
                strokeWidth={style.isFilled || style.strokeWidth > 0 ? 0 : 1}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>

      {/* Top-left: the panel's handle — the editor's own hamburger. */}
      <div className="dc-qsk-corner dc-qsk-corner--top-left">
        <button
          type="button"
          className="dc-qsk-icon-button"
          data-quick-sketch-menu=""
          aria-expanded={panelOpen}
          aria-label={panelOpen ? "Hide the sketch options" : "Show the sketch options"}
          title={panelOpen ? "Hide options" : "Show options"}
          onClick={() => setPanelOpen((open) => !open)}
        >
          <Menu size={20} aria-hidden />
        </button>
      </div>

      {/* Top-centre: the canvas's name, its save state and its switcher. */}
      <div className="dc-qsk-corner dc-qsk-corner--top-center">
        <div className="dc-qsk-chip" data-quick-sketch-chip="">
          <button
            type="button"
            className="dc-qsk-chip-button"
            data-quick-sketch-canvases=""
            aria-expanded={canvasMenuOpen}
            onClick={() => setCanvasMenuOpen((open) => !open)}
            title="Your canvases for this module"
          >
            {sketch.activeBoardTitle}
          </button>
          <span className="dc-qsk-chip-status" data-quick-sketch-status={statusState} role="status" aria-live="polite">
            {statusText}
          </span>
          {sketch.status === "error" && sketch.scoped ? (
            <button
              type="button"
              className="dc-qsk-chip-button"
              data-quick-sketch-retry=""
              onClick={() => sketch.retry()}
              title="Try saving again (your drawing is kept on this device)"
            >
              Retry
            </button>
          ) : null}
          <button
            type="button"
            className="dc-qsk-chip-button"
            data-quick-sketch-new-canvas=""
            disabled={!sketch.canCreateBoard}
            onClick={() => {
              const key = sketch.createBoard();
              if (!key) flash("Canvas limit reached for this module");
            }}
            title="New canvas"
            aria-label="New canvas"
          >
            <Plus size={14} aria-hidden />
          </button>

          {canvasMenuOpen ? (
            <div className="dc-qsk-canvas-menu" data-quick-sketch-canvas-menu="" role="menu">
              {sketch.boards.map((board) => (
                <div key={board.sketchKey} className="dc-qsk-canvas-row" data-active={board.sketchKey === sketch.activeBoardKey ? "true" : "false"} role="menuitem">
                  <button
                    type="button"
                    className="dc-qsk-chip-button"
                    onClick={() => {
                      setCanvasMenuOpen(false);
                      sketch.selectBoard(board.sketchKey);
                    }}
                  >
                    <span>
                      {board.title}
                      <small>{board.strokeCount} strokes</small>
                    </span>
                  </button>
                  {board.sketchKey !== "main" && sketch.boards.length > 1 ? (
                    <button
                      type="button"
                      className="dc-qsk-canvas-trash"
                      data-quick-sketch-delete-canvas={board.sketchKey}
                      title={`Delete ${board.title}`}
                      onClick={() => {
                        setCanvasMenuOpen(false);
                        sketch.deleteBoard(board.sketchKey);
                      }}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <QuickSketchPanel
        style={style}
        open={panelOpen}
        onPreview={previewStyle}
        onBegin={beginStyleGesture}
        onCommit={commitStyleGesture}
        onApply={applyStyle}
        onResetProp={resetStyleProp}
        onResetAll={resetStyle}
        onCopyOptions={copyOptions}
        onCopySvg={copySvg}
        notice={notice}
      />

      {/* Bottom-left: the tools — the editor's "Draw" (and its eraser). */}
      <div className="dc-qsk-corner dc-qsk-corner--bottom-left">
        <button
          type="button"
          className="dc-qsk-text-button"
          data-quick-sketch-tool-button="draw"
          data-active={tool === "draw" ? "true" : "false"}
          onClick={() => setTool("draw")}
          title="Draw (D)"
        >
          Draw
        </button>
        <button
          type="button"
          className="dc-qsk-text-button"
          data-quick-sketch-tool-button="erase"
          data-active={tool === "erase" ? "true" : "false"}
          onClick={() => setTool("erase")}
          title="Erase whole strokes (E)"
        >
          Erase
        </button>
      </div>

      {/* Bottom-right: Undo · Redo · Clear — the editor's own three. */}
      <div className="dc-qsk-corner dc-qsk-corner--bottom-right">
        <button
          type="button"
          className="dc-qsk-text-button"
          data-quick-sketch-undo=""
          disabled={undoStack.length === 0}
          onClick={undo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          className="dc-qsk-text-button"
          data-quick-sketch-redo=""
          disabled={redoStack.length === 0}
          onClick={redo}
          title="Redo (Ctrl+Shift+Z)"
        >
          Redo
        </button>
        <button
          type="button"
          className="dc-qsk-text-button"
          data-quick-sketch-clear=""
          disabled={strokes.length === 0}
          onClick={clearCanvas}
          title="Clear the canvas (undoable)"
        >
          Clear
        </button>
      </div>

      {!sketch.scoped && !sketch.loading ? (
        <div className="dc-qsk-scoped-note" data-quick-sketch-unscoped="">
          Kept on this device — open a lesson to save it with the module
        </div>
      ) : null}
    </div>
  );
}
