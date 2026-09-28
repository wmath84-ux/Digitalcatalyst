import { useRef } from "react";
import GlassDock, { type GlassDockItem } from "../glass-dock/GlassDock";
import { HomeIcon } from "../icons";

interface BottomDockProps {
  onNavigateToHome?: () => void;
  // Kept for compatibility — previous versions used these for Create menu
  onCreateType?: (type: any) => void;
  onPlanLectures?: () => void;
  onStub?: (group: string, label: string) => void;
  onOpenCurve?: () => void;
}

export function BottomDock({ onNavigateToHome }: BottomDockProps) {
  const homeRef = useRef<HTMLButtonElement>(null);

  // User request: footer navigation mein keval Home button dikhega (Create removed, My Day/Revision removed)
  // Plus icons on stairs open the upgraded create dropdown directly on flow
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
