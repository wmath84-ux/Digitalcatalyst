import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  total: number;
  cycle: string;
  courseCount: number;
  featureCount: number;
}

export default function SuccessOverlay({
  open,
  onClose,
  total,
  cycle,
  courseCount,
  featureCount,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="relative w-full max-w-sm rounded-[28px] bg-white p-6 text-center shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-transform"
            >
              <X className="h-4 w-4" />
            </button>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                delay: 0.15,
                type: "spring",
                stiffness: 260,
                damping: 16,
              }}
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50"
            >
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            </motion.div>

            <h3 className="text-xl font-extrabold text-slate-900">
              You're all set!
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Your Pro Unified Plan ({cycle}) is now active with {courseCount}{" "}
              course{courseCount !== 1 ? "s" : ""} and {featureCount} feature
              {featureCount !== 1 ? "s" : ""}.
            </p>

            <div className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Amount charged</span>
                <span className="font-extrabold text-slate-900">
                  ${total.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Courses</span>
                <span>{courseCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Premium features</span>
                <span>{featureCount}</span>
              </div>
            </div>

            <button
              onClick={() => {
                onClose();
                window.location.hash = "#/store/purchases";
              }}
              className="mt-5 w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-bold text-white active:scale-[0.98] transition-transform"
            >
              Start Learning
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
