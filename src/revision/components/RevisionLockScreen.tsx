// src/revision/components/RevisionLockScreen.tsx
//
// Full-screen paywall shown when Revision is configured as a subscription
// feature (Firestore `subscriptionFeatures/revision` active) and the current
// user's membership does not include it. Mirrors the My Day gate: the
// feature only locks while an active catalog entry exists.

import { BankIcon, ChartIcon, FlameIcon, TargetIcon } from "./icons";
import { useExitGuard } from "./ExitGuardContext";

const PERKS = [
  { icon: FlameIcon, title: "Daily tests & revision sessions", text: "Smart question sets built from your subjects, with instant scoring." },
  { icon: BankIcon, title: "Full revision bank", text: "Every question organised by topic, difficulty and past attempts." },
  { icon: TargetIcon, title: "Weak-topic detection", text: "The engine finds the chapters where marks are leaking and drills them." },
  { icon: ChartIcon, title: "Progress & analytics", text: "Streaks, accuracy trends and session history on one dashboard." },
];

export default function RevisionLockScreen({ userName }: { userName: string }) {
  const { navigate } = useExitGuard();
  return (
    <div
      data-revision-lock
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white"
    >
      <div className="relative overflow-hidden px-5 pb-8 pt-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-100/70 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 top-40 h-56 w-56 rounded-full bg-violet-100/60 blur-3xl" />

        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-indigo-600 ring-1 ring-indigo-100">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" /> Subscription feature
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900">
            {userName}, aapki <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Revision Studio</span> membership mein hai
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Daily tests, smart revision sessions aur weak-topic analytics ab Eduvora Plus+ subscription ka hissa hain. Subscribe karke turant shuru karo.
          </p>
        </div>

        <div className="relative mt-6 space-y-3">
          {PERKS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600 ring-1 ring-indigo-100">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-7 rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-violet-700 p-5 text-white shadow-xl shadow-indigo-200">
          <p className="text-[11px] font-black uppercase tracking-wider text-indigo-200">Eduvora Plus+</p>
          <h2 className="mt-1 text-lg font-black">Revision + My Day + premium content, ek hi plan mein</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-indigo-100">
            Feature kharidte hi Revision Studio khul jata hai — aur subscription active rahte tak aapke saare tests, streaks aur progress saved rehte hain.
          </p>
          <button
            type="button"
            data-revision-lock-cta
            onClick={() => navigate("#/subscription")}
            className="mt-4 w-full rounded-2xl bg-white py-3.5 text-sm font-black text-indigo-700 shadow-lg transition hover:bg-indigo-50 active:scale-[0.99]"
          >
            View subscription
          </button>
          <button
            type="button"
            onClick={() => navigate("#/home")}
            className="mt-2.5 w-full rounded-2xl py-2.5 text-xs font-bold text-indigo-100 transition hover:text-white"
          >
            Go back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
