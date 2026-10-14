import { Archive, ArrowUpRight, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../recall/components/ui/dialog";
import { Button } from "../recall/components/ui/button";
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent aria-label="Test Bank notice" className="max-w-[460px] rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-on-primary">
            <Archive className="h-7 w-7" />
          </span>

        </div>

        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.16em] text-primary">Cloud storage limit</p>
        <DialogTitle className="mt-1 text-2xl font-black tracking-tight">Your Test Bank is full</DialogTitle>
        <DialogDescription className="mt-2 leading-relaxed text-on-surface-variant">
          Your <strong className="text-on-surface">{planName} ({cycle})</strong> plan can save up to{" "}
          <strong className="text-on-surface">{limit} tests</strong>. You currently have {used} of {limit} tests saved.
        </DialogDescription>

        <div className="mt-5 rounded-2xl border border-indigo-400/30 bg-indigo-500/15 p-4">
          <div className="flex items-center justify-between text-xs font-bold text-on-surface">
            <span>Test Bank capacity</span>
            <span>{used}/{limit}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full border border-outline-variant">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, limit > 0 ? (used / limit) * 100 : 100)}%` }} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-primary">
            Delete an older saved test to make room, or upgrade to a plan with a larger cloud Test Bank. Retakes never use another slot.
          </p>
        </div>

        <Button variant="outline" className="mt-5 w-full" onClick={onManageBank}>
          <Trash2 className="h-4.5 w-4.5" /> Manage Test Bank
        </Button>
        <Button className="mt-2.5 w-full" onClick={onExplorePlans}>
          Explore Plans <ArrowUpRight className="h-4.5 w-4.5" />
        </Button>
        <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-xs font-bold text-on-surface-variant">Not now</button>
      </DialogContent>
    </Dialog>
  );
}
