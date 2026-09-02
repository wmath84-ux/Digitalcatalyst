import { useRef } from "react";
import { motion } from "framer-motion";
import { GlassSurface } from "../ui/glass";
import { Plus } from "lucide-react";

interface PlusNodeProps {
  active: boolean;
  onOpen: (rect: DOMRect) => void;
}

export function PlusNode({ active, onOpen }: PlusNodeProps) {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <motion.button
      ref={ref}
      type="button"
      initial={false}
      animate={{ opacity: 1, scale: active ? 0 : 1 }}
      whileHover={{ scale: 1.16, rotate: 90 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      onClick={() => {
        if (ref.current) onOpen(ref.current.getBoundingClientRect());
      }}
      aria-label="Add activity"
      className="fp-floaty relative rounded-full text-fp-text-70 outline-none transition-colors hover:text-fp-text"
    >
      {/* Wave 13c: the node is a pack Glass Button disc (GlassSurface, tint
          0.4, radius 999) — the frost plate + highlight gradient are gone. */}
      <GlassSurface tint={0.4} radius={999} className="h-8 w-8 sm:h-9 sm:w-9" contentClassName="grid h-full w-full place-items-center">
        <Plus className="h-4 w-4" strokeWidth={2.4} />
      </GlassSurface>
    </motion.button>
  );
}
