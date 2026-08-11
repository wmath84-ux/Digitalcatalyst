import { useEffect, useRef, useState } from "react";

interface RenameDialogProps {
  open: boolean;
  initialValue: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

export function RenameDialog({ open, initialValue, onCancel, onConfirm }: RenameDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [open, initialValue]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] px-4 pb-6 sm:pb-0">
      <div className="w-full max-w-[340px] rounded-2xl bg-white dark:bg-[#16171c] p-5 shadow-2xl animate-pop-in">
        <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
          Rename chat
        </p>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onConfirm(value.trim());
            if (e.key === "Escape") onCancel();
          }}
          className="w-full rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3.5 py-2.5 text-[13.5px] text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-400/50 mb-4"
          placeholder="Chat name"
        />
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl py-2.5 text-[13.5px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={() => value.trim() && onConfirm(value.trim())}
            className="flex-1 rounded-xl py-2.5 text-[13.5px] font-medium text-white bg-gradient-to-r from-indigo-500 to-blue-500 shadow-lg shadow-indigo-500/20"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] px-4 pb-6 sm:pb-0">
      <div className="w-full max-w-[340px] rounded-2xl bg-white dark:bg-[#16171c] p-5 shadow-2xl animate-pop-in">
        <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-50 mb-1.5">{title}</p>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4">{description}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl py-2.5 text-[13.5px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl py-2.5 text-[13.5px] font-medium text-white bg-red-500 active:scale-[0.98] transition"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
