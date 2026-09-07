// src/classroom3d/panels.tsx
//
// The DOM bodies that live on the classroom's surfaces.
//
//   BoardPanel → the chalk rail above the big front screen; its body is the
//                Course Player's own viewer stack, passed in as children, so
//                every file type behaves exactly as it does in flat mode.
//   DeskPanel  → the tablet on the desk: module switcher, lesson switcher,
//                progress, mark-complete, and the "turn my head" buttons.
//   WallHeader → the shared header the notes / mind map walls wear.

import { memo, useRef, type ReactNode } from "react";
import {
  BookOpen,
  CircleCheck,
  Expand,
  LockKeyhole,
  Maximize,
  Network,
  NotebookPen,
  Presentation,
  ShoppingBag,
  Shrink,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  BOARD_ZOOM_MAX,
  BOARD_ZOOM_MIN,
  FILE_KIND_LABEL,
  FOCUS_PRESETS,
  type ClassroomFocus,
  type FlatModule,
} from "./state";

/* ── Board ─────────────────────────────────────────────────────────────── */

// Memoized (Part 13): the room re-renders on every pinch tick and focus hop,
// but the board chrome only depends on its own props — and the heavy viewer
// subtree bails out on its stable `children` identity either way.
export const BoardPanel = memo(function BoardPanel({
  title,
  subtitle,
  children,
  zoom = BOARD_ZOOM_MIN,
  boardFullscreen = false,
  onZoomIn,
  onZoomOut,
  onFit,
  onToggleFullscreen,
  onToggleZoom,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** The room's board lean — shown as a percentage next to the + / − keys. */
  zoom?: number;
  /** True while this panel holds the browser fullscreen top layer. */
  boardFullscreen?: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFit?: () => void;
  onToggleFullscreen?: () => void;
  /** Double-tap / double-click on the board chrome toggles the close-up. */
  onToggleZoom?: () => void;
}) {
  // Double-TAP detection for touch (mobile browsers don't reliably fire
  // `dblclick`): two pointer-ups within 350 ms and 48 px.
  const tap = useRef({ time: 0, x: 0, y: 0 });
  // A touch toggle's trailing synthetic `dblclick` must not toggle straight back.
  const touchToggledAt = useRef(0);
  const showControls = Boolean(onZoomIn || onZoomOut || onFit || onToggleFullscreen);
  const zoomedOut = zoom <= BOARD_ZOOM_MIN + 1e-6;
  const zoomedIn = zoom >= BOARD_ZOOM_MAX - 1e-6;
  // A gesture that starts inside the lesson viewer belongs to the viewer:
  // double-clicking a diagram zooms the DIAGRAM (flat-mode behaviour) — it
  // must never also lean the camera.
  const insideViewer = (target: EventTarget | null) =>
    Boolean(
      target &&
        typeof (target as HTMLElement).closest === "function" &&
        (target as HTMLElement).closest("[data-course-viewer]"),
    );

  return (
    <div
      className="flex h-full w-full flex-col bg-[#060910] text-white"
      data-classroom-board-panel
      data-board-fullscreen={boardFullscreen ? "true" : "false"}
      onDoubleClick={(event) => {
        if (!onToggleZoom || insideViewer(event.target)) return;
        if (Date.now() - touchToggledAt.current < 600) return;
        onToggleZoom();
      }}
      onPointerUp={(event) => {
        if (!onToggleZoom || event.pointerType === "mouse" || insideViewer(event.target)) return;
        const now = Date.now();
        const travelled = Math.hypot(event.clientX - tap.current.x, event.clientY - tap.current.y);
        if (now - tap.current.time < 350 && travelled < 48) {
          touchToggledAt.current = now;
          tap.current.time = 0;
          onToggleZoom();
        } else {
          tap.current = { time: now, x: event.clientX, y: event.clientY };
        }
      }}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#0d1424] px-5 py-3">
        <Presentation size={18} className="text-[#7dd3fc]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-black tracking-wide text-white/90">
            {title || "Choose a lesson from your desk"}
          </p>
          <p className="truncate text-[11px] font-semibold text-white/45">{subtitle}</p>
        </div>
        {showControls && (
          <div
            className="dc-classroom-board-controls"
            data-classroom-board-controls
            // Tapping the keys themselves is not a board double-tap.
            onDoubleClick={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onZoomOut}
              disabled={!onZoomOut || zoomedOut}
              className="dc-classroom-board-btn"
              data-classroom-board-zoom-out
              aria-label="Zoom out"
              title="Lean back"
            >
              <ZoomOut size={14} />
            </button>
            <span
              key={Math.round(zoom * 100)}
              className="dc-classroom-board-pct"
              data-classroom-board-zoom-pct
              aria-live="polite"
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={onZoomIn}
              disabled={!onZoomIn || zoomedIn}
              className="dc-classroom-board-btn"
              data-classroom-board-zoom-in
              aria-label="Zoom in"
              title="Lean closer"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={onFit}
              disabled={!onFit}
              className="dc-classroom-board-btn"
              data-classroom-board-zoom-fit
              aria-label="Fit to screen"
              title="Fit to screen"
            >
              <Maximize size={14} />
            </button>
            <button
              type="button"
              onClick={onToggleFullscreen}
              disabled={!onToggleFullscreen}
              className="dc-classroom-board-btn"
              data-classroom-board-fullscreen
              data-active={boardFullscreen ? "true" : "false"}
              aria-label={boardFullscreen ? "Exit fullscreen" : "Fullscreen"}
              title={boardFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {boardFullscreen ? <Shrink size={14} /> : <Expand size={14} />}
            </button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
});

/* ── Desk console ──────────────────────────────────────────────────────── */

export interface DeskPanelProps {
  modules: FlatModule[];
  /** Which module the LIST is browsing (may differ from what is playing). */
  browseIndex: number;
  /** Where the playing lesson actually lives. */
  playingModuleIndex: number;
  playingFileIndex: number;
  selectedFileId: string | null;
  onBrowseModule: (index: number) => void;
  onOpenFile: (moduleIndex: number, fileIndex: number) => void;
  onStep: (direction: 1 | -1) => void;
  focus: ClassroomFocus;
  onFocus: (focus: ClassroomFocus) => void;
  progress: number;
  isDone: boolean;
  canMarkComplete: boolean;
  onToggleComplete?: () => void;
  noteCount: number;
  mapCount: number;
  activeFileName: string;
  onExit?: () => void;
  exitLabel?: string;
}

const FOCUS_ICON: Record<ClassroomFocus, typeof BookOpen> = {
  board: Presentation,
  notes: NotebookPen,
  mind: Network,
  desk: BookOpen,
};

// Memoized (Part 13): this is the biggest DOM reconcile in the room (two
// scrollable lists), and pinch-zoom ticks must not rebuild it — none of its
// props change while the board lean moves, so the whole subtree is skipped.
export const DeskPanel = memo(function DeskPanel({
  modules,
  browseIndex,
  playingModuleIndex,
  playingFileIndex,
  selectedFileId,
  onBrowseModule,
  onOpenFile,
  onStep,
  focus,
  onFocus,
  progress,
  isDone,
  canMarkComplete,
  onToggleComplete,
  noteCount,
  mapCount,
  activeFileName,
  onExit,
  exitLabel = "Flat player",
}: DeskPanelProps) {
  const browsed = modules[browseIndex];
  const files = browsed?.files ?? [];

  return (
    // `data-classroom-wall="desk"` is the hook WallVisibility uses to stop
    // painting the tablet while the learner looks up (visibility only — the
    // console never unmounts and its state is untouched).
    <div
      data-classroom-wall="desk"
      className="flex h-full w-full flex-col bg-gradient-to-b from-[#0b1024] to-[#070a14] px-5 py-4 text-white"
    >
      {/* Focus row — the head-turn buttons */}
      <div className="flex shrink-0 items-center gap-2">
        {FOCUS_PRESETS.map((preset) => {
          const Icon = FOCUS_ICON[preset.id];
          const active = focus === preset.id;
          const badge = preset.id === "notes" ? noteCount : preset.id === "mind" ? mapCount : 0;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onFocus(preset.id)}
              className="flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition"
              style={{
                background: active ? "rgba(139,92,246,0.24)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${active ? "rgba(167,139,250,0.6)" : "rgba(255,255,255,0.09)"}`,
                boxShadow: active ? "0 0 22px rgba(139,92,246,0.35)" : "none",
              }}
            >
              <Icon size={18} className={active ? "text-[#c4b5fd]" : "text-white/55"} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-black">{preset.label}</span>
                <span className="block truncate text-[10px] font-semibold text-white/45">{preset.hint}</span>
              </span>
              {badge > 0 && (
                <span className="ml-auto rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-black">{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Progress + mark complete */}
      <div className="mt-3 flex shrink-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-white/45">
            <span>Course progress</span>
            <span className="text-[#a5f3d0]">{progress}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#22d3ee] to-[#a78bfa] transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={!canMarkComplete}
          onClick={onToggleComplete}
          className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-black transition disabled:opacity-35"
          style={{
            background: isDone ? "rgba(52,211,153,0.18)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${isDone ? "rgba(110,231,183,0.5)" : "rgba(255,255,255,0.1)"}`,
            color: isDone ? "#6ee7b7" : "rgba(255,255,255,0.72)",
          }}
        >
          <CircleCheck size={16} />
          {isDone ? "Completed" : "Mark complete"}
        </button>
      </div>

      {/* Module + lesson columns */}
      <div className="mt-3 grid min-h-0 flex-1 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3">
        <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-2">
          <p className="px-2 pb-1.5 text-[10px] font-black uppercase tracking-widest text-white/40">Modules</p>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {modules.length === 0 && (
              <p className="px-2 py-6 text-center text-[12px] font-semibold text-white/40">
                No modules available yet.
              </p>
            )}
            {modules.map((module, index) => {
              const browsing = index === browseIndex;
              const playing = index === playingModuleIndex;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => onBrowseModule(index)}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition"
                  style={{
                    background: browsing ? "rgba(34,211,238,0.16)" : "transparent",
                    border: `1px solid ${browsing ? "rgba(34,211,238,0.45)" : "transparent"}`,
                  }}
                >
                  {module.locked ? (
                    <LockKeyhole size={14} className="shrink-0 text-amber-300/80" />
                  ) : (
                    <BookOpen
                      size={14}
                      className={browsing ? "shrink-0 text-[#67e8f9]" : "shrink-0 text-white/40"}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold">{module.title}</span>
                    <span className="block text-[10px] font-semibold text-white/40">
                      {module.locked ? "Locked · tap a lesson to unlock" : `${module.files.length} item${module.files.length === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  {playing && (
                    <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#a78bfa] shadow-[0_0_8px_#a78bfa]" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-2">
          <p className="px-2 pb-1.5 text-[10px] font-black uppercase tracking-widest text-white/40">
            Lessons in this module
          </p>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {files.length === 0 && (
              <p className="px-2 py-6 text-center text-[12px] font-semibold text-white/40">
                This module has no playable file.
              </p>
            )}
            {files.map((file, index) => {
              const active =
                browseIndex === playingModuleIndex && index === playingFileIndex && Boolean(selectedFileId);
              const locked = browsed?.locked;
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => onOpenFile(browseIndex, index)}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition"
                  style={{
                    background: active ? "rgba(167,139,250,0.16)" : "transparent",
                    border: `1px solid ${active ? "rgba(167,139,250,0.45)" : "transparent"}`,
                  }}
                >
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-black"
                    style={{
                      background: active ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.07)",
                      color: active ? "#ddd6fe" : "rgba(255,255,255,0.6)",
                    }}
                  >
                    {locked ? <LockKeyhole size={12} /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold">{file.name}</span>
                    <span className="block text-[10px] font-semibold text-white/40">
                      {FILE_KIND_LABEL[file.type] || file.type}
                    </span>
                  </span>
                  {locked && <ShoppingBag size={14} className="shrink-0 text-amber-300/80" />}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Transport */}
      <div className="mt-3 flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onStep(-1)}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] font-black"
        >
          <SkipBack size={15} /> Prev
        </button>
        <div className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[12px] font-bold text-white/70">
          {activeFileName || "No lesson selected"}
        </div>
        <button
          type="button"
          onClick={() => onStep(1)}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] font-black"
        >
          Next <SkipForward size={15} />
        </button>
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] font-black text-white/70"
          >
            {exitLabel}
          </button>
        )}
      </div>
    </div>
  );
});

/* ── A small header the wall panels share ──────────────────────────────── */

// Memoized with the rest (Part 13): static chrome must not reconcile on ticks.
export const WallHeader = memo(function WallHeader({
  icon: Icon,
  title,
  hint,
  accent,
}: {
  icon: typeof NotebookPen;
  title: string;
  hint: string;
  accent: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#0b1120] px-4 py-2.5">
      <span
        className="grid h-8 w-8 place-items-center rounded-xl"
        style={{ background: `${accent}22`, border: `1px solid ${accent}55`, color: accent }}
      >
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-black text-white/90">{title}</p>
        <p className="truncate text-[11px] font-semibold text-white/40">{hint}</p>
      </div>
    </div>
  );
});
