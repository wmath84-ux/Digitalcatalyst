// src/subscription/components/PromoCodeInput.tsx
//
// Part 9 — coupon input (server-validated). The component is
// generic enough to support either a "coupon" or "referral"
// input, but Part 9 only wires the coupon flow (the referral
// path is left as a future Part).

import { useState } from "react";
import { motion } from "framer-motion";
import { Tag, Users, CheckCircle2, XCircle, X, Loader2 } from "lucide-react";

export interface PromoResult {
  valid: boolean;
  message: string;
}

interface Props {
  kind: "coupon" | "referral";
  label: string;
  placeholder: string;
  appliedCode: string | null;
  appliedMessage: string | null;
  onApply: (code: string) => Promise<PromoResult> | PromoResult;
  onRemove: () => void;
  /** Server-refused error message (rendered below the input). */
  errorMessage?: string | null;
  disabled?: boolean;
}

export default function PromoCodeInput({
  label,
  placeholder,
  appliedCode,
  appliedMessage,
  onApply,
  onRemove,
  kind,
  errorMessage,
  disabled,
}: Props) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "error" | "loading">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [shake, setShake] = useState(0);

  const Icon = kind === "coupon" ? Tag : Users;

  const handleApply = async () => {
    const code = value.trim();
    if (!code) return;
    setStatus("loading");
    const result = await onApply(code);
    if (result.valid) {
      setStatus("idle");
      setValue("");
      setErrorMsg("");
    } else {
      setStatus("error");
      setErrorMsg(result.message);
      setShake((s) => s + 1);
    }
  };

  const displayError = errorMsg || errorMessage || "";

  return (
    <div data-subscription-coupon-input>
      {appliedCode ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-sm font-extrabold text-emerald-900">{appliedCode} applied</p>
              <p className="text-[11px] text-emerald-700">{appliedMessage || "Verified savings"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500 active:scale-90 transition-transform"
            aria-label="Remove code"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      ) : (
        <div>
          <label className="mb-1.5 block text-[11px] font-bold text-slate-500">{label}</label>
          <motion.div
            key={shake}
            animate={shake > 0 ? { x: [-4, 4, -3, 3, 0] } : undefined}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-2"
          >
            <div className="flex flex-1 items-center gap-2 rounded-2xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-violet-400">
              <Icon className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value.toUpperCase())}
                placeholder={placeholder}
                disabled={Boolean(disabled) || status === "loading"}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleApply();
                  }
                }}
                className="w-full bg-transparent text-sm font-bold uppercase tracking-wider text-slate-800 placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
              />
            </div>
            <button
              type="button"
              onClick={handleApply}
              disabled={!value.trim() || status === "loading" || Boolean(disabled)}
              className="flex h-10 w-20 items-center justify-center rounded-2xl bg-slate-900 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm active:scale-[0.98] transition-transform disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
            </button>
          </motion.div>
          {displayError ? (
            <p
              role="alert"
              data-subscription-coupon-error
              className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-rose-600"
            >
              <XCircle className="h-3.5 w-3.5 shrink-0" /> {displayError}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
