import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export function EmptyState({ isDarkMode = false }: { isDarkMode?: boolean }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.45 }}
      className="pointer-events-none absolute left-1/2 top-[24%] z-20 w-[88%] max-w-md -translate-x-1/2 rounded-3xl border px-5 py-5 text-center sm:top-[20%] sm:px-7 sm:py-6"
      style={{
        background: isDarkMode ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.98)",
        borderColor: isDarkMode ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.25)",
        boxShadow: isDarkMode
          ? "0 24px 60px -35px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 24px 55px -35px rgba(15, 23, 42, 0.32), inset 0 1px 0 rgba(255,255,255,0.95)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
      }}
    >
      <div
        className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl border"
        style={{
          color: isDarkMode ? "#c4b5fd" : "#4f46e5",
          background: isDarkMode ? "rgba(139, 123, 255, 0.16)" : "linear-gradient(145deg, #eef2ff, #f5f3ff)",
          borderColor: isDarkMode ? "rgba(167, 139, 250, 0.2)" : "rgba(99, 102, 241, 0.12)",
        }}
        aria-hidden="true"
      >
        <Sparkles size={21} strokeWidth={1.9} />
      </div>
      <p className="font-display text-xl font-bold tracking-tight text-fp-text-85 sm:text-2xl">
        Start your flow.
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-fp-muted">
        Add your first task, reminder, note or plan. Tap a glowing + below to get started.
      </p>
    </motion.div>
  );
}
