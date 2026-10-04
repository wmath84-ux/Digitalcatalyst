// src/course/SplitFilePane.tsx
//
// The Course Player's SECOND pane — the file a learner opened with a DOUBLE tap
// (or double click) on a module file row.
//
// How it gets here (owner's brief, 2026-10-04):
//
//   · a SINGLE tap on a module file keeps the behaviour it has always had: the
//     file opens in the upper/main area (the Split Deck's lesson pane);
//   · a DOUBLE tap on the SAME row opens that file in the lower/secondary area
//     — the Split Deck's study pane — while the upper area keeps whatever it is
//     already showing, so a lecture and its notes can be read side by side;
//   · the gesture is detected in the row (src/course/CourseOverlay.tsx): two
//     presses inside 320 ms, on the same row, whose finger did not travel (a
//     scroll is never a tap), for both a mouse double-click and a touch
//     double-tap;
//   · the Course Player owns the state, so this pane only renders: a header
//     strip that names the file and carries the two exits (promote it to the
//     upper area, or close the split) plus the file itself, in the same
//     ResourceViewer every other surface uses — same embed rules, same
//     playback/resume store, same desktop-view preference.
//
// Closing it (or pressing any dock tab) hands the study pane straight back to
// the tab body it replaced — nothing else about the player changes.

import { ExternalLink, SplitSquareHorizontal, X } from "lucide-react";
import type { CourseFile } from "../types/course";
import ResourceViewer from "./ResourceViewer";
import type { CoursePlaybackPatch, CoursePlaybackStore } from "./playbackState";

export interface SplitFilePaneProps {
  file: CourseFile;
  /** The player's one resume store, so this view resumes where it left off. */
  playback?: CoursePlaybackStore;
  onPlaybackChange?: (fileId: string, patch: CoursePlaybackPatch) => void;
  /** The Player settings' desktop-view preference, shared with the main pane. */
  desktopView?: boolean;
  /** Put the file back in the upper area and close the split. */
  onPromote?: (file: CourseFile) => void;
  /** Close the split — the study pane returns to the active tab. */
  onClose: () => void;
}

export default function SplitFilePane({
  file,
  playback,
  onPlaybackChange,
  desktopView = true,
  onPromote,
  onClose,
}: SplitFilePaneProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" data-course-split-file data-split-file-id={file.id}>
      {/* The pane's ONLY chrome: what is open here, and the two exits. */}
      <div
        className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#0a0c12]/70 px-2.5 py-1.5"
        data-course-split-file-header
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-200">
          <SplitSquareHorizontal size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-black text-white/90">{file.name}</span>
          <span className="block text-[9px] font-bold uppercase tracking-wide text-[var(--course-muted)]">
            Split view · lower area
          </span>
        </span>
        {onPromote ? (
          <button
            type="button"
            onClick={() => onPromote(file)}
            aria-label={`Open ${file.name} in the main area`}
            title="Open in main area"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/70 ring-1 ring-white/15 transition hover:text-white"
            data-course-split-file-promote
          >
            <ExternalLink size={13} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the split file"
          title="Close split"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/70 ring-1 ring-white/15 transition hover:text-white"
          data-course-split-file-close
        >
          <X size={14} />
        </button>
      </div>

      {/* The file itself — the same viewer the upper pane uses. */}
      <div className="relative min-h-0 flex-1" data-course-split-file-body>
        <ResourceViewer
          file={file}
          active
          playback={playback}
          onPlaybackChange={onPlaybackChange}
          desktopView={desktopView}
        />
      </div>
    </div>
  );
}
