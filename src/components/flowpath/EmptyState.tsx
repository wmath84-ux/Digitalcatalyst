import { motion } from "framer-motion";

export function EmptyState() {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.8 }}
      className="pointer-events-none absolute left-1/2 top-[30%] w-[85%] max-w-sm -translate-x-1/2 text-center sm:top-[26%]"
    >
      <p className="font-display text-xl font-semibold text-fp-text-85 sm:text-2xl">
        Start your flow.
      </p>
      <p className="mt-2 text-sm text-fp-muted">
        Add your first task, reminder, note or plan — tap a glowing + along the path.
      </p>
    </motion.div>
  );
}
