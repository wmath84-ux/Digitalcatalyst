import { ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";
import { Sheet } from "./Sheet";
import { useApp } from "../context/AppContext";

export function CoinHistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { coins, coinHistory } = useApp();

  const earnMethods = [
    { icon: "📘", text: "Complete a course or lesson" },
    { icon: "🔥", text: "Maintain your daily login streak" },
    { icon: "🧠", text: "Score well on quizzes & assessments" },
    { icon: "🤝", text: "Refer friends using your referral ID" },
  ];
  const spendMethods = [
    { icon: "🎟️", text: "Redeem coupons in the Coupon Store" },
    { icon: "⭐", text: "Unlock premium trial features" },
    { icon: "🎁", text: "Gift EduCoins to a friend (coming soon)" },
  ];

  return (
    <Sheet open={open} onClose={onClose} title="EduCoin Wallet">
      <div className="mb-5 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-white shadow-lg shadow-orange-200">
        <p className="text-xs font-medium text-white/80">Current Balance</p>
        <p className="text-3xl font-extrabold">🪙 {coins}</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
          <p className="mb-2 text-xs font-bold text-emerald-700 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" /> How to Earn
          </p>
          <ul className="space-y-1.5">
            {earnMethods.map((m) => (
              <li key={m.text} className="flex items-start gap-1.5 text-[11px] text-emerald-800">
                <span>{m.icon}</span>
                <span>{m.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-rose-50 p-3 ring-1 ring-rose-100">
          <p className="mb-2 text-xs font-bold text-rose-700 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" /> How to Spend
          </p>
          <ul className="space-y-1.5">
            {spendMethods.map((m) => (
              <li key={m.text} className="flex items-start gap-1.5 text-[11px] text-rose-800">
                <span>{m.icon}</span>
                <span>{m.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
        Transaction History
      </p>
      <div className="space-y-2">
        {coinHistory.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center justify-between rounded-2xl bg-neutral-50 px-3.5 py-3 ring-1 ring-neutral-100"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  tx.type === "earn" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                }`}
              >
                {tx.type === "earn" ? (
                  <ArrowUpRight className="h-4.5 w-4.5" />
                ) : (
                  <ArrowDownRight className="h-4.5 w-4.5" />
                )}
              </span>
              <div>
                <p className="text-xs font-semibold text-neutral-800 leading-tight max-w-[170px]">
                  {tx.reason}
                </p>
                <p className="text-[10.5px] text-neutral-400">{tx.date}</p>
              </div>
            </div>
            <span
              className={`text-sm font-bold ${
                tx.type === "earn" ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {tx.type === "earn" ? "+" : "-"}
              {tx.amount}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
