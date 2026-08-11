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
}

export default function PromoCodeInput({
  label,
  placeholder,
  appliedCode,
  appliedMessage,
  onApply,
  onRemove,
  kind,
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

  if (appliedCode) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15">
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
          </span>
          <div>
            <p className="text-sm font-bold text-emerald-700">
              "{appliedCode}" applied
            </p>
            <p className="text-[11px] text-emerald-600/80">{appliedMessage}</p>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm active:scale-90 transition-transform"
          aria-label="Remove code"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <motion.div
        key={shake}
        animate={
          status === "error"
            ? { x: [0, -8, 8, -6, 6, 0] }
            : { x: 0 }
        }
        transition={{ duration: 0.4 }}
        className={`flex items-center gap-2 rounded-2xl border bg-white px-3.5 py-1 ${
          status === "error" ? "border-rose-300" : "border-slate-200"
        } focus-within:border-violet-400`}
      >
        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value.toUpperCase());
            if (status === "error") setStatus("idle");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleApply()}
          placeholder={placeholder}
          className="w-full bg-transparent py-2.5 text-sm font-medium uppercase tracking-wide text-slate-800 placeholder:text-slate-400 placeholder:tracking-normal placeholder:font-normal focus:outline-none"
        />
        <button
          onClick={handleApply}
          disabled={!value.trim() || status === "loading"}
          className="shrink-0 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-30 active:scale-95 transition-transform"
        >
          {status === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Apply"
          )}
        </button>
      </motion.div>
      {status === "error" && (
        <p className="mt-1.5 flex items-center gap-1 pl-1 text-xs font-medium text-rose-500">
          <XCircle className="h-3.5 w-3.5" /> {errorMsg}
        </p>
      )}
      {!appliedCode && status !== "error" && (
        <p className="mt-1.5 pl-1 text-[11px] text-slate-400">{label}</p>
      )}
    </div>
  );
}
