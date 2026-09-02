import { Bell, CalendarClock, ClipboardList, Home, LayoutGrid, NotebookPen } from "lucide-react";
import GlassDock, { type GlassDockItem } from "../glass-dock/GlassDock";

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
 * Same glass-dock footer as the main app footer (src/components/BottomNav.tsx):
 * nearby icons magnify and lift as the pointer moves across the dock.
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
    <nav
      data-site-footer-nav
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 w-full overflow-visible px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 md:hidden"
      aria-label="My day"
    >
      <div data-site-footer className="pointer-events-auto mx-auto w-max max-w-full">
        <GlassDock
          siteFooter
          items={dockItems}
          onSelect={(id) => {
            onNavigate(id);
          }}
        />
      </div>
    </nav>
  );
}
