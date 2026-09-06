// src/classroom3d/panels.tsx
//
// The DOM bodies that live on the classroom's surfaces.
//
//   BoardPanel   → the huge screen straight ahead: the ACTIVE lesson plays
//                  here through the app's real ResourceViewer, so YouTube,
//                  video, audio, PDF, Docs, Sheets, Slides, forms, images and
//                  embeds all behave exactly as they do in the flat player.
//   DeskPanel    → the tablet on the desk: module switcher, lesson switcher,
//                  progress, and the "turn my head" buttons.
//
// The notes wall and the mind wall mount the app's own NotesPanel and
// MindMapPanel directly — no wrappers needed beyond a scroll container.

import { useMemo } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  LockKeyhole,
  Network,
  NotebookPen,
  Presentation,
  SkipBack,
  SkipForward,
} from "lucide-react";
import type { CourseFile } from "../types/course";
import ResourceViewer from "../course/ResourceViewer";
import { FILE_KIND_LABEL, FOCUS_PRESETS, type ClassroomFocus, type FlatModule } from "./state";

/* ── Board ─────────────────────────────────────────────────────────────── */

export function BoardPanel({ file, moduleTitle }: { file: CourseFile | null; moduleTitle: string }) {
  return (
    <div className="flex h-full w-full flex-col bg-[#060910] text-white">
      {/* chalk rail */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#0d1424] px-5 py-3">
        <Presentation size={18} className="text-[#7dd3fc]" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-black tracking-wide text-white/90">
            {file?.name || "Choose a lesson from your desk"}
          </p>
          <p className="truncate text-[11px] font-semibold text-white/45">
            {moduleTitle}
            {file ? ` · ${FILE_KIND_LABEL[file.type] || file.type}` : ""}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ResourceViewer file={file} active desktopView />
      </div>
    </div>
  );
}

/* ── Desk console ──────────────────────────────────────────────────────── */

export interface DeskPanelProps {
  modules: FlatModule[];
  moduleIndex: number;
  fileIndex: number;
  onSelectModule: (index: number) => void;
  onSelectFile: (index: number) => void;
  onStep: (direction: 1 | -1) => void;
  focus: ClassroomFocus;
  onFocus: (focus: ClassroomFocus) => void;
  completed: Set<string>;
  onToggleComplete: (fileId: string) => void;
  noteCount: number;
  mapCount: number;
  onExit?: () => void;
}

const FOCUS_ICON: Record<ClassroomFocus, typeof BookOpen> = {
  board: Presentation,
  notes: NotebookPen,
  mind: Network,
  desk: BookOpen,
};

export function DeskPanel({
  modules,
  moduleIndex,
  fileIndex,
  onSelectModule,
  onSelectFile,
  onStep,
  focus,
  onFocus,
  completed,
  onToggleComplete,
  noteCount,
  mapCount,
  onExit,
}: DeskPanelProps) {
  const activeModule = modules[moduleIndex];
  const files = activeModule?.files ?? [];
  const activeFile = files[fileIndex] ?? null;

  const progress = useMemo(() => {
    const total = modules.reduce((sum, module) => sum + module.files.length, 0);
    return total ? Math.round((completed.size / total) * 100) : 0;
  }, [modules, completed]);

  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-b from-[#0b1024] to-[#070a14] px-5 py-4 text-white">
      {/* Focus row — the head-turn buttons */}
      <div className="flex shrink-0 items-center gap-2">
        {FOCUS_PRESETS.map((preset) => {
          const Icon = FOCUS_ICON[preset.id];
          const active = focus === preset.id;
          const badge =
            preset.id === "notes" ? noteCount : preset.id === "mind" ? mapCount : 0;
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

      {/* Progress */}
      <div className="mt-3 shrink-0">
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

      {/* Module + lesson columns */}
      <div className="mt-3 grid min-h-0 flex-1 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3">
        <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-2">
          <p className="px-2 pb-1.5 text-[10px] font-black uppercase tracking-widest text-white/40">Modules</p>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {modules.map((module, index) => {
              const active = index === moduleIndex;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => onSelectModule(index)}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition"
                  style={{
                    background: active ? "rgba(34,211,238,0.16)" : "transparent",
                    border: `1px solid ${active ? "rgba(34,211,238,0.45)" : "transparent"}`,
                  }}
                >
                  {module.locked ? (
                    <LockKeyhole size={14} className="shrink-0 text-amber-300/80" />
                  ) : (
                    <BookOpen size={14} className={active ? "shrink-0 text-[#67e8f9]" : "shrink-0 text-white/40"} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold">{module.title}</span>
                    <span className="block text-[10px] font-semibold text-white/40">
                      {module.files.length} item{module.files.length === 1 ? "" : "s"}
                    </span>
                  </span>
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
              const active = index === fileIndex;
              const done = completed.has(file.id);
              return (
                <div
                  key={file.id}
                  className="flex items-center gap-1.5 rounded-xl px-1 transition"
                  style={{
                    background: active ? "rgba(167,139,250,0.16)" : "transparent",
                    border: `1px solid ${active ? "rgba(167,139,250,0.45)" : "transparent"}`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectFile(index)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-2 text-left"
                  >
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-black"
                      style={{
                        background: active ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.07)",
                        color: active ? "#ddd6fe" : "rgba(255,255,255,0.6)",
                      }}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold">{file.name}</span>
                      <span className="block text-[10px] font-semibold text-white/40">
                        {FILE_KIND_LABEL[file.type] || file.type}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleComplete(file.id)}
                    title={done ? "Mark as not done" : "Mark complete"}
                    className="mr-1 shrink-0 rounded-lg p-1.5 transition"
                    style={{ color: done ? "#6ee7b7" : "rgba(255,255,255,0.28)" }}
                  >
                    <CircleCheck size={17} />
                  </button>
                </div>
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
          {activeFile ? activeFile.name : "No lesson selected"}
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
            className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] font-black text-white/70"
          >
            Leave room
          </button>
        )}
      </div>
    </div>
  );
}

/* ── A small header the wall panels share ──────────────────────────────── */

export function WallHeader({
  icon: Icon,
  title,
  hint,
  accent,
  onPrev,
  onNext,
}: {
  icon: typeof NotebookPen;
  title: string;
  hint: string;
  accent: string;
  onPrev?: () => void;
  onNext?: () => void;
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
      {onPrev && (
        <button type="button" onClick={onPrev} className="rounded-lg p-1.5 text-white/50 hover:text-white">
          <ChevronLeft size={18} />
        </button>
      )}
      {onNext && (
        <button type="button" onClick={onNext} className="rounded-lg p-1.5 text-white/50 hover:text-white">
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}
