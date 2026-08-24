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
import type { ActivityType } from "../../flowpath/types/flowpath";

export const ACTIVITY_ICONS: Record<ActivityType, LucideIcon> = {
  task: CheckSquare,
  reminder: BellRing,
  schedule: CalendarClock,
  note: StickyNote,
  revision: BookOpen,
  mcq: HelpCircle,
  other: Sparkles,
};
