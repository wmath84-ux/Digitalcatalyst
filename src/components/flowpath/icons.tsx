import {
  BellRing,
  BookOpen,
  CalendarClock,
  CheckSquare,
  HelpCircle,
  Sparkles,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import type { ActivityType, FlowPathActivityKind } from "../../flowpath/types/flowpath";

export const ACTIVITY_ICONS: Record<ActivityType, LucideIcon> = {
  task: CheckSquare,
  reminder: BellRing,
  schedule: CalendarClock,
  note: StickyNote,
  revision: BookOpen,
  mcq: HelpCircle,
  other: Sparkles,
};

/**
 * Icons for every server-side FlowPath kind, including "lecture" which
 * the local ActivityType union does not model. The FlowPath page merges
 * Firestore docs into the local flow; resolving icons through this map
 * keeps a lecture (or any future) kind from rendering an undefined
 * component and crashing the whole page to white.
 */
export const FLOW_KIND_ICONS: Record<FlowPathActivityKind, LucideIcon> = {
  ...ACTIVITY_ICONS,
  lecture: BookOpen,
};

/** Never returns undefined: unknown kinds fall back to HelpCircle. */
export function getFlowKindIcon(kind: string | undefined | null): LucideIcon {
  if (kind && (kind as FlowPathActivityKind) in FLOW_KIND_ICONS) {
    return FLOW_KIND_ICONS[kind as FlowPathActivityKind];
  }
  return HelpCircle;
}
