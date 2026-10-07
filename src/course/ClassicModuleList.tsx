// src/course/ClassicModuleList.tsx
//
// The CLASSIC module listing style — a simple, traditional list without
// magnifying icons or dock-style effects. This is the "old style" that
// learners can switch to from the Player settings (default).
//
// Each module is a plain button with:
//   · a numbered badge (depth + 1)
//   · the module title
//   · file count
//   · chevron to expand/collapse
//   · lock icon if locked
//
// Files inside an expanded module are indented and show their type icon.
// No animations, no magnification — just a clean, readable list.

import { ChevronDown, ChevronRight, LockKeyhole, Eye } from "lucide-react";
import type { ReactNode } from "react";
import type { CourseFile, CourseModule } from "../types/course";

// ── Types ──────────────────────────────────────────────────────────────

interface ClassicModuleListProps {
  modules: Array<{ module: CourseModule; depth: number }>;
  expanded: Set<string>;
  toggleModule: (moduleId: string) => void;
  selectedFileId: string | null;
  onSelectFile: (file: CourseFile) => void;
  accessibleModuleIds: Set<string>;
  lockedModuleIds: Set<string>;
  previewModuleIds: Set<string>;
  fileIcon: (file: CourseFile) => React.ComponentType<{ size?: number; className?: string }>;
  isBrainFile: (file: CourseFile) => boolean;
  isVisibleFile: (file: CourseFile) => boolean;
  moduleFiles: (module: CourseModule) => CourseFile[];
}

// ── Component ──────────────────────────────────────────────────────────

export default function ClassicModuleList({
  modules,
  expanded,
  toggleModule,
  selectedFileId,
  onSelectFile,
  accessibleModuleIds,
  lockedModuleIds,
  previewModuleIds,
  fileIcon,
  isBrainFile,
  isVisibleFile,
  moduleFiles,
}: ClassicModuleListProps) {
  if (modules.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-xs text-[var(--course-muted)]">
        No modules to show yet.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-3 py-3">
      <div className="space-y-1">
        {modules.map(({ module, depth }) => {
          const moduleId = String(module.id);
          const accessible = accessibleModuleIds.has(moduleId);
          const locked = lockedModuleIds.has(moduleId);
          const preview = previewModuleIds.has(moduleId);
          const open = expanded.has(moduleId);
          const files = moduleFiles(module).filter(
            (file) => file.type !== "read" && file.type !== "note" && isVisibleFile(file),
          );
          const holdsSelected = files.some((file) => file.id === selectedFileId);

          return (
            <div key={moduleId} data-classic-module={moduleId}>
              {/* Module button */}
              <button
                type="button"
                onClick={() => toggleModule(moduleId)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                  holdsSelected
                    ? "bg-violet-500/20 ring-1 ring-violet-400/30"
                    : "hover:bg-white/5"
                }`}
                data-classic-module-button
                data-locked={locked ? "true" : "false"}
              >
                {/* Number badge */}
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                    holdsSelected
                      ? "bg-violet-500 text-white"
                      : "bg-white/10 text-white/70"
                  }`}
                >
                  {depth + 1}
                </span>

                {/* Title + file count */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-white/90">
                    {module.title}
                  </p>
                  <p className="text-[10px] font-semibold text-[var(--course-muted)]">
                    {files.length} {files.length === 1 ? "file" : "files"}
                  </p>
                </div>

                {/* Icons */}
                <div className="flex shrink-0 items-center gap-1">
                  {preview ? <Eye size={13} className="text-sky-300" /> : null}
                  {locked && !preview ? (
                    <LockKeyhole size={13} className="text-amber-400" />
                  ) : null}
                  {files.length > 0 ? (
                    open ? (
                      <ChevronDown size={15} className="text-[var(--course-muted)]" />
                    ) : (
                      <ChevronRight size={15} className="text-[var(--course-muted)]" />
                    )
                  ) : null}
                </div>
              </button>

              {/* Expanded files */}
              {open && files.length > 0 ? (
                <div className="ml-8 mt-1 space-y-0.5 border-l-2 border-white/10 pl-3">
                  {files.map((file) => {
                    const Icon = fileIcon(file);
                    const fileLocked = locked;
                    const selected = selectedFileId === file.id;

                    return (
                      <button
                        key={file.id}
                        type="button"
                        onClick={fileLocked ? undefined : () => onSelectFile(file)}
                        disabled={fileLocked}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                          selected
                            ? "bg-violet-500/20 ring-1 ring-violet-400/30"
                            : fileLocked
                              ? "cursor-not-allowed opacity-50"
                              : "hover:bg-white/5"
                        }`}
                        data-classic-file-button
                        data-file-id={file.id}
                        data-locked={fileLocked ? "true" : "false"}
                      >
                        <Icon size={16} className="shrink-0 text-white/60" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold text-white/85">
                            {file.name}
                          </p>
                          <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--course-muted)]">
                            {isBrainFile(file)
                              ? `${file.practiceQuestions?.length ?? 0} practice questions`
                              : file.type}
                          </p>
                        </div>
                        {fileLocked ? (
                          <LockKeyhole size={12} className="text-amber-400" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
