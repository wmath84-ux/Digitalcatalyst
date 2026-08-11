import { GraduationCap, LogIn } from "lucide-react";
import { useApp } from "../context/AppContext";

export function LoggedOutPage() {
  const { login, user } = useApp();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 px-8 text-center text-white">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 ring-1 ring-white/30 backdrop-blur">
        <GraduationCap className="h-10 w-10" />
      </div>
      <h1 className="text-2xl font-extrabold">You've been logged out</h1>
      <p className="mt-2 max-w-xs text-sm text-white/80">
        Thanks for learning with EduHive, {user.name.split(" ")[0]}! Log back in anytime to continue
        your journey.
      </p>
      <button
        type="button"
        onClick={login}
        className="mt-8 flex items-center gap-2 rounded-2xl bg-white px-8 py-3.5 text-sm font-bold text-indigo-700 shadow-xl active:scale-95 transition"
      >
        <LogIn className="h-4.5 w-4.5" /> Log Back In
      </button>
    </div>
  );
}
