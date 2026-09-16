import { Bell, CalendarClock, ClipboardList, Home, LayoutGrid, NotebookPen } from "lucide-react";
import SiteFooterNav from "../SiteFooterNav";
import { type GlassDockItem } from "../glass-dock/GlassDock";

interface BottomNavProps {
  active: string;
  onNavigate: (id: string) => void;
}

const items = [
  { id: "home", label: "Home", icon: Home, color: "#FFBE0B" },
  { id: "overview", label: "Day", icon: LayoutGrid, color: "#06D6A0" },
  { id: "tasks", label: "Tasks", icon: ClipboardList, color: "#FF7B54" },
  { id: "schedule", label: "Schedule", icon: CalendarClock, color: "#C9A96E" },
  { id: "reminders", label: "Remind", icon: Bell, color: "#FF5C8A" },
  { id: "notes", label: "Notes", icon: NotebookPen, color: "#B388FF" },
];

/**
 * My Day's footer — the design every other screen now copies, because this is
 * the one the owner pointed at ("footer navigation ka jo design My Day per hai
 * exactly vahi design har jagah"). It is the shared SiteFooterNav capsule, so
 * the gutters, safe-area padding, magnification wave, label tooltip and the
 * store's frost material are identical on every screen.
 *
 * It is no longer hidden from 768 px up: a tablet in portrait used to lose
 * the footer completely on this feature while Home/Store kept theirs. Tablets
 * now get the same capsule; only the desktop shell (>=960 px, or
 * tablet-landscape desktop mode) hides it, where the left rail is the nav.
 *
 * The Home button is a plain tap (the old long-press → FlowPath shortcut was
 * removed on the owner's direction).
 *
 * The previous white-pill markup is stored at
 * src/components/glass-dock/stored/MyDayBottomNav.original.txt.
 */
export default function BottomNav({ active, onNavigate }: BottomNavProps) {

  const dockItems: GlassDockItem[] = items.map((item) => {
    return {
      id: item.id,
      label: item.label,
      icon: item.icon,
      color: item.color,
      active: active === item.id,
    };
  });

  return (
    <SiteFooterNav
      label="My day"
      items={dockItems}
      onSelect={(id) => {
        onNavigate(id);
      }}
    />
  );
}
