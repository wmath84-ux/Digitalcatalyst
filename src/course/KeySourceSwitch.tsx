// src/course/KeySourceSwitch.tsx
//
// "MERI APNI KEY YA MASTER KI?" — the learner's own switch, in Settings.
//
// Both search engines have a key, and both can be paid for in two ways: the
// LEARNER'S own key (their quota) or the MASTER's (the school's). The
// learner chooses — right here, in the very Settings section where the key
// itself is set up.
//
// The choice is never a trap:
//
//   · "mine"   — their own key goes first, and the master's takes over BY
//     ITSELF the moment their daily quota is gone. The search simply keeps
//     working; nobody is interrupted;
//   · "master" — the school's key, because they asked for it.
//
// If the school has no key configured at all, the "master" option says so and
// stays out of the way — a dead search is never offered.

import { useCallback, useEffect, useState } from "react";
import { Building2, UserRound } from "lucide-react";
import { toast } from "../components/ui/glass-toast";
import {
  readSearchKeySource,
  subscribeSearchKeySource,
  type SearchEngineId,
  type SearchKeySource,
} from "./searchKeySource";

export type KeySourceSwitchProps = {
  /** Which engine this switch belongs to. */
  engine: SearchEngineId;
  /** The signed-in learner — the choice is stored per account. */
  uid?: string | null;
  /** Is the school's (master's) key configured at all? */
  masterAvailable: boolean;
  /** Write the choice — the engine's own setter, so its pages re-read it. */
  onChoose: (source: SearchKeySource) => void;
  /** What the learner is choosing between (for the sentence below). */
  label?: string;
  className?: string;
};

export default function KeySourceSwitch({
  engine,
  uid = null,
  masterAvailable,
  onChoose,
  label = "key",
  className = "",
}: KeySourceSwitchProps) {
  const [source, setSource] = useState<SearchKeySource>(() => readSearchKeySource(engine, uid));

  /** Re-read the choice whenever it changes — here or in another tab. */
  const refresh = useCallback(() => {
    setSource(readSearchKeySource(engine, uid));
  }, [engine, uid]);

  useEffect(() => {
    refresh();
    return subscribeSearchKeySource(refresh);
  }, [refresh]);

  const choose = useCallback(
    (next: SearchKeySource) => {
      if (next === "master" && !masterAvailable) return;
      onChoose(next);
      setSource(next);
      toast({
        title: next === "master" ? "Ab master ki key se chalega" : "Ab aapki apni key se chalega",
        variant: "success",
        duration: 2200,
      });
    },
    [masterAvailable, onChoose],
  );

  const button = (value: SearchKeySource, text: string, Icon: typeof UserRound) => {
    const active = source === value;
    const disabled = value === "master" && !masterAvailable;
    return (
      <button
        type="button"
        onClick={() => choose(value)}
        disabled={disabled}
        aria-pressed={active}
        data-key-source-option={value}
        data-key-source-active={active ? "true" : "false"}
        data-key-source-disabled={disabled ? "true" : "false"}
        className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[11.5px] font-black transition ${
          disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
            : active
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <Icon size={13} aria-hidden="true" />
        {text}
      </button>
    );
  };

  return (
    <div
      className={`mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5 ${className}`}
      data-key-source-switch
      data-key-source-engine={engine}
      data-key-source-active={source}
    >
      <p className="text-[11.5px] font-black text-slate-800">
        {label} kahan se aayegi?
      </p>
      <div className="mt-1.5 flex gap-2">
        {button("mine", "Meri apni", UserRound)}
        {button("master", "Master ki", Building2)}
      </div>
      <p className="mt-1.5 text-[11px] font-medium leading-4.5 text-slate-500" data-key-source-hint>
        {!masterAvailable
          ? "School ki key abhi configure nahi hai — sirf aapki apni key se chalega."
          : source === "master"
            ? "School ki key se chalega — aapka apna quota bilkul nahi lagega."
            : "Aapki key pehle chalegi. Aapki quota khatam ho jaye to master ki key apne aap chalu ho jayegi — search chalta rahega, koi tok nahi."}
      </p>
    </div>
  );
}
