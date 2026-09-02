// src/subscription/components/PromoCodeInput.tsx
//
// Part 9 — coupon input (server-validated). The component is
// generic enough to support either a "coupon" or "referral"
// input, but Part 9 only wires the coupon flow (the referral
// path is left as a future Part).

import { useState } from "react";
import { motion } from "framer-motion";
import { Tag, Users, CheckCircle2, XCircle, X, Loader2, AlertTriangle } from "lucide-react";
import { GlassButton } from "../../components/ui/glass-button";
import { GlassInput } from "../../components/ui/glass-input";

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
          className="flex items-center justify-between rounded-2xl border border-emerald-400/30 bg-emerald-500/15 p-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            <div>
              <p className="text-sm font-extrabold text-emerald-200">{appliedCode} applied</p>
              <p className="text-[11px] text-emerald-200">{appliedMessage || "Verified savings"}</p>
            </div>
          </div>
          <GlassButton
            type="button"
            onClick={onRemove}
            className="[&_.size-12]:size-7"
            aria-label="Remove code"
          >
            <X className="h-3.5 w-3.5" />
          </GlassButton>
        </motion.div>
      ) : (
        <div>
          <label className="mb-1.5 block text-[11px] font-bold text-white/55">{label}</label>
          <motion.div
            key={shake}
            animate={shake > 0 ? { x: [-4, 4, -3, 3, 0] } : undefined}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-2"
          >
            <GlassInput
              icon={<Icon className="h-4 w-4 shrink-0" />}
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
              className="min-w-0 flex-1 [&_input]:font-bold [&_input]:uppercase [&_input]:tracking-wider [&_input]:placeholder:font-normal [&_input]:placeholder:tracking-normal"
            />
            <GlassButton
              variant="capsule"
              type="button"
              onClick={handleApply}
              disabled={!value.trim() || status === "loading" || Boolean(disabled)}
              className="shrink-0 [&>span>div]:h-11 [&>span>div]:w-20 [&>span>div]:px-0 [&>span>div]:text-xs [&>span>div]:font-extrabold [&>span>div]:uppercase [&>span>div]:tracking-wider disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
            </GlassButton>
          </motion.div>
          {displayError ? (
            kind === "referral" && /already used/i.test(displayError) ? (
              <motion.div
                role="alert"
                data-subscription-coupon-error
                data-referral-already-used
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 rounded-2xl border border-rose-400/30 bg-rose-500/15 p-3"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                  <div>
                    <p className="text-sm font-extrabold text-rose-200">
                      This referral is already used by someone
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-rose-200">
                      Each referral ID works only once, and this one has already been redeemed. Try a different code from the leaderboard's unused IDs.
                    </p>
                    <button
                      type="button"
                      onClick={() => { window.location.hash = "#/leaderboard"; }}
                      className="mt-2 rounded-full bg-rose-600 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-white transition hover:bg-rose-500 active:scale-[0.98]"
                    >
                      Open Unused IDs
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div
                role="alert"
                data-subscription-coupon-error
                className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold text-rose-300"
              >
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{displayError}</span>
              </div>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
