// src/course/EmbedImpostor.tsx
//
// The game's-billboard answer to third-party iframes (Part 14, item A):
// while the classroom camera moves, the live iframe is visually swapped for
// this static placeholder — kind icon, file title, kind label — and swapped
// back on settle. It is NEVER a screenshot: cross-origin iframes cannot be
// canvas-captured (hard browser security limit — html2canvas and friends
// silently fail or throw on them), so no pixel reading is even attempted;
// chrome-styled placeholder only.
//
// Two modes, one component:
//   · "motion" — rendered ALONGSIDE the loaded iframe in the classroom and
//     shown/hidden purely by CSS (`.dc-embed-moving` on the canvas parent
//     flips the iframe to visibility:hidden and this div to grid). The
//     iframe element is never unmounted: scroll, form input, doc cursors
//     and auth state survive the swap untouched.
//   · "lazy" — rendered INSTEAD of the iframe until its wall is first faced
//     (E9): no iframe, no src, zero cost — then the real frame mounts once
//     and stays mounted forever.
//
// Both modes are pointer-events-none and aria-hidden: during motion the
// gestures belong to the room, and the placeholder is never interacted with.

import {
  ClipboardList,
  FileQuestion,
  FileText,
  Globe,
  HardDrive,
  MonitorPlay,
  Network,
  Presentation,
  Table,
  type LucideIcon,
} from "lucide-react";

export type EmbedImpostorMode = "motion" | "lazy";

const KIND_ICON: Record<string, LucideIcon> = {
  youtube: MonitorPlay,
  pdf: FileText,
  doc: FileText,
  sheet: Table,
  slides: Presentation,
  form: ClipboardList,
  drive: HardDrive,
  mindmap: Network,
  embed: Globe,
};

const KIND_LABEL: Record<string, string> = {
  youtube: "YouTube video",
  pdf: "PDF document",
  doc: "Google Doc",
  sheet: "Google Sheet",
  slides: "Google Slides",
  form: "Google Form",
  drive: "Drive file",
  mindmap: "Whimsical board",
  embed: "Embedded page",
};

export default function EmbedImpostor({
  kind,
  title,
  mode,
}: {
  /** Embed kind from ResourceViewer (drives icon + label). */
  kind: string;
  /** File title, matching the wall chrome. */
  title: string;
  /** "motion" is CSS-toggled beside a live iframe; "lazy" stands alone pre-load. */
  mode: EmbedImpostorMode;
}) {
  const Icon = KIND_ICON[kind] ?? FileQuestion;
  const label = KIND_LABEL[kind] ?? "Embedded content";
  return (
    <div
      data-embed-impostor
      data-impostor-mode={mode}
      data-embed-kind={kind}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 place-items-center overflow-hidden bg-[#0b1120] text-white"
      // Display is CSS-owned: the motion impostor only grids while
      // `.dc-embed-moving` holds (see classroom3d.css); lazy always shows.
      style={mode === "lazy" ? { display: "grid" } : undefined}
    >
      <div className="flex max-w-[80%] flex-col items-center gap-2 px-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
          <Icon size={26} className="text-white/80" />
        </span>
        <p className="w-full truncate text-[15px] font-black text-white/90">{title || label}</p>
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/45">{label}</p>
        {mode === "lazy" ? (
          <p className="text-[11px] font-semibold text-white/40">Loads the moment you face this wall</p>
        ) : null}
      </div>
    </div>
  );
}
