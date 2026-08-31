import { useRef } from "react";
import { motion } from "framer-motion";
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
      className="fp-floaty relative grid h-8 w-8 place-items-center rounded-full border border-fp-text-20 bg-fp-text-6 text-fp-text-70 backdrop-blur-md transition-colors hover:border-violet-400/70 hover:text-fp-text sm:h-9 sm:w-9"
      style={{
        boxShadow: "0 0 0 1px var(--fp-text-6) inset, 0 8px 20px -10px rgba(0,0,0,0.7)",
      }}
    >
      <span className="pointer-events-none absolute inset-[1px] rounded-full bg-gradient-to-br from-white/10 to-transparent" />
      <Plus className="h-4 w-4" strokeWidth={2.4} />
    </motion.button>
  );
}
