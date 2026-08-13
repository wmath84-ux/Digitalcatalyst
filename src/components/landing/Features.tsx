"use client";

import { motion } from "framer-motion";

const features = [
  {
    icon: "📚",
    title: "Premium Digital Library",
    desc: "Access high-quality study materials, curated PDFs, e-books, and comprehensive notes across every subject — organized and instantly searchable.",
    gradient: "from-violet-500 to-indigo-500",
  },
  {
    icon: "🎬",
    title: "Interactive Video Lectures",
    desc: "Enroll in professional courses with cinematic, high-retention video content taught by subject experts, complete with quizzes and progress tracking.",
    gradient: "from-cyan-500 to-blue-500",
  },
  {
    icon: "🗓️",
    title: "My Day Planner",
    desc: "Keep tasks, schedules, reminders, and quick notes in one focused planner so every study day stays organized.",
    gradient: "from-fuchsia-500 to-pink-500",
  },
  {
    icon: "🛒",
    title: "Seamless E-Commerce",
    desc: "A secure, frictionless checkout experience for every digital asset — from single notes to full course bundles.",
    gradient: "from-emerald-400 to-teal-500",
  },
  {
    icon: "📱",
    title: "Cross-Platform Experience",
    desc: "Learn on the web or install the Eduvora PWA for a blazing-fast, native, offline-friendly experience on the go.",
    gradient: "from-sky-400 to-cyan-400",
  },
];

export default function Features() {
  return (
    <section id="features" className="relative bg-[#05060f] px-6 py-28 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
      <div className="relative mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-fuchsia-400">
            Platform Features
          </span>
          <h2 className="mt-4 text-[clamp(2rem,4.5vw,3.25rem)] font-black leading-tight text-white">
            Everything you need to <span className="gradient-text">learn faster</span>
          </h2>
          <p className="mt-4 text-slate-400">
            Eduvora blends immersive design with real utility — built to keep
            you engaged and always progressing.
          </p>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 40, rotateX: -10 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.55, delay: (i % 3) * 0.12 }}
              whileHover={{ y: -8, rotateX: 4, rotateY: -4 }}
              style={{ transformStyle: "preserve-3d", perspective: 900 }}
              className="glass-panel group relative overflow-hidden rounded-3xl p-7 shadow-2xl shadow-black/40"
            >
              <div
                className={`absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${f.gradient} opacity-20 blur-2xl transition group-hover:opacity-40`}
              />
              <div
                className={`float-anim grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${f.gradient} text-2xl shadow-lg`}
              >
                {f.icon}
              </div>
              <h3 className="mt-5 text-xl font-bold text-white">{f.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
