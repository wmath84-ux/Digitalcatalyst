import { Check } from "lucide-react";
import { Sheet } from "./Sheet";
import { useApp } from "../context/AppContext";
import { membershipPlans } from "../data";
import { cn } from "../utils/cn";

export function UpgradeMembershipSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { membership, upgradeMembership } = useApp();

  return (
    <Sheet open={open} onClose={onClose} title="Upgrade Membership">
      <p className="mb-4 text-xs text-neutral-500">
        Choose a plan that fits your learning journey. Upgrade anytime, cancel whenever you like.
      </p>
      <div className="space-y-3">
        {membershipPlans.map((plan) => {
          const isCurrent = membership.planId === plan.id;
          return (
            <div
              key={plan.id}
              className={cn(
                "relative overflow-hidden rounded-2xl p-4 ring-1 transition",
                isCurrent ? "ring-2 ring-indigo-500" : "ring-neutral-100"
              )}
            >
              <div className={cn("absolute inset-0 opacity-[0.07] bg-gradient-to-br", plan.color)} />
              <div className="relative">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-extrabold text-neutral-900">{plan.name}</p>
                    <p className="text-[11px] text-neutral-500">{plan.tagline}</p>
                  </div>
                  <p
                    className={cn(
                      "rounded-full bg-gradient-to-r px-3 py-1 text-xs font-bold text-white",
                      plan.color
                    )}
                  >
                    {plan.price}
                  </p>
                </div>
                <ul className="mb-3 space-y-1.5">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-center gap-1.5 text-[11.5px] text-neutral-700">
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      {perk}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={isCurrent}
                  onClick={() => {
                    upgradeMembership(plan.id);
                    onClose();
                  }}
                  className={cn(
                    "w-full rounded-xl py-2.5 text-xs font-bold transition active:scale-[0.98]",
                    isCurrent
                      ? "bg-neutral-100 text-neutral-400"
                      : "bg-gradient-to-r text-white shadow-md " + plan.color
                  )}
                >
                  {isCurrent ? "Current Plan" : `Choose ${plan.name}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
