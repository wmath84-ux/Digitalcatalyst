import { Archive, ArrowUpRight, Trash2, X } from "lucide-react";
import type { RevisionBankStatus } from "../engine/cloudRevisionService";

type Props = {
  open: boolean;
  bank: RevisionBankStatus | null;
  onClose: () => void;
  onManageBank: () => void;
  onExplorePlans: () => void;
};

export default function TestBankLimitGate({ open, bank, onClose, onManageBank, onExplorePlans }: Props) {
  if (!open) return null;
  const used = bank?.used ?? 0;
  const limit = bank?.limit ?? 20;
  const cycle = bank?.cycle === "yearly" ? "Yearly" : "Monthly";
  const planName = bank?.planName || "Current";

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 px-0 backdrop-blur-sm sm:items-center sm:p-5">
      <button type="button" aria-label="Close Test Bank notice" className="absolute inset-0" onClick={onClose} />
      <section className="relative w-full max-w-[460px] overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]">
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-indigo-100 blur-3xl" />
        <div className="relative px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
          <div className="flex items-start justify-between gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200">
              <Archive className="h-7 w-7" />
            </span>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500 active:scale-95">
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.16em] text-indigo-600">Cloud storage limit</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Your Test Bank is full</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Your <strong className="text-slate-700">{planName} ({cycle})</strong> plan can save up to{" "}
            <strong className="text-slate-700">{limit} tests</strong>. You currently have {used} of {limit} tests saved.
          </p>

          <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Test Bank capacity</span>
              <span>{used}/{limit}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-indigo-100">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600" style={{ width: `${Math.min(100, limit > 0 ? (used / limit) * 100 : 100)}%` }} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-indigo-800">
              Delete an older saved test to make room, or upgrade to a plan with a larger cloud Test Bank. Retakes never use another slot.
            </p>
          </div>

          <button type="button" onClick={onManageBank} className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-black text-white shadow-lg active:scale-[0.99]">
            <Trash2 className="h-4.5 w-4.5" /> Manage Test Bank
          </button>
          <button type="button" onClick={onExplorePlans} className="mt-2.5 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-sm font-black text-white shadow-lg shadow-indigo-200 active:scale-[0.99]">
            Explore Plans <ArrowUpRight className="h-4.5 w-4.5" />
          </button>
          <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-xs font-bold text-slate-400">Not now</button>
        </div>
      </section>
    </div>
  );
}
