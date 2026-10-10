import { useRef } from "react";
import GlassDock, { type GlassDockItem } from "../glass-dock/GlassDock";
import { HomeIcon } from "../icons";

interface BottomDockProps {
  onNavigateToHome?: () => void;
}

export function BottomDock({ onNavigateToHome }: BottomDockProps) {
  const homeRef = useRef<HTMLButtonElement>(null);

  // Footer shows Home only. Create and Schedule Lecture live in the stair Plus menu.
  const items: GlassDockItem[] = [
    { id: "home", label: "Home", icon: HomeIcon, color: "#FFBE0B", buttonRef: homeRef },
  ];

  return (
    <div data-fp-dock className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2">
      <div className="pointer-events-auto mx-auto w-max max-w-full">
        <GlassDock
          items={items}
          onSelect={(id) => {
            if (id === "home" && onNavigateToHome) onNavigateToHome();
          }}
        />
      </div>
    </div>
  );
}
