"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";

type Mode = "login" | "signup";

const readAuthParams = () =>
  new URLSearchParams(typeof window === "undefined" ? "" : window.location.hash.split("?")[1] || "");

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>(() =>
    readAuthParams().get("mode") === "signup" ? "signup" : "login"
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { refresh } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const payload =
        mode === "login" ? { email, password } : { name, email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      await refresh();
      const returnTo = readAuthParams().get("return");
      window.location.hash = returnTo || "#/store";
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl shadow-black/40 sm:p-8"
    >
      <div className="mb-6 flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 text-lg font-black text-white">
          E
        </span>
        <span className="text-lg font-bold text-white">Eduvora</span>
      </div>

      <div className="mb-6 flex rounded-2xl bg-white/5 p-1">
        {(["login", "signup"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              mode === m
                ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {m === "login" ? "Login" : "Sign Up"}
          </button>
        ))}
      </div>

      <h1 className="text-2xl font-black text-white">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        {mode === "login"
          ? "Log in to continue your Eduvora journey."
          : "Join Eduvora and start earning EduCoins today."}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <AnimatePresence mode="wait">
          {mode === "signup" && (
            <motion.div
              key="name"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Full Name
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-violet-400"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Email
          </label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@eduvora.com"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-violet-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Password
          </label>
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={6}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-violet-400"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={submitting}
          className="pulse-glow w-full rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 py-3.5 text-base font-bold text-white shadow-lg shadow-fuchsia-500/30 transition disabled:opacity-60"
        >
          {submitting ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}
        </motion.button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-500">
        After {mode === "login" ? "logging in" : "signing up"}, you&apos;ll return to the item
        you were trying to unlock.
      </p>
    </motion.div>
  );
}
