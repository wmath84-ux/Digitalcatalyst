"use client";

import { motion } from "framer-motion";
import { useBranding } from "@/context/BrandingContext";
import { GlassSurface } from "@/components/ui/glass";

const buildFeatures = (appName: string) => [
  {
    icon: "📚",
    title: "Premium Digital Library",
    desc: "Access high-quality study materials, curated PDFs, e-books, and comprehensive notes across every subject — organized and instantly searchable.",
    tint: "bg-indigo-500/15",
  },
  {
    icon: "🎬",
    title: "Interactive Video Lectures",
    desc: "Enroll in professional courses with cinematic, high-retention video content taught by subject experts, complete with quizzes and progress tracking.",
    tint: "bg-cyan-500/15",
  },
  {
    icon: "🗓️",
    title: "My Day Planner",
    desc: "Keep tasks, schedules, reminders, and quick notes in one focused planner so every study day stays organized.",
    tint: "bg-fuchsia-500/15",
  },
  {
    icon: "🛒",
    title: "Seamless E-Commerce",
    desc: "A secure, frictionless checkout experience for every digital asset — from single notes to full course bundles.",
    tint: "bg-emerald-500/15",
  },
  {
    icon: "📱",
    title: "Cross-Platform Experience",
    desc: `Learn on the web or install the ${appName} PWA for a blazing-fast, native, offline-friendly experience on the go.`,
    tint: "bg-sky-500/15",
  },
];

export default function Features() {
  const { appName } = useBranding();
  const features = buildFeatures(appName);
  return (
    <section id="features" className="relative px-6 py-28 sm:px-8">
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
          <p className="mt-4 text-white/55">
            {appName} blends immersive design with real utility — built to keep
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
              className="group h-full"
            >
              <GlassSurface radius={24} className="h-full text-white" contentClassName="p-7">
              <div
                className={`float-anim grid h-14 w-14 place-items-center rounded-2xl text-2xl ${f.tint}`}
              >
                {f.icon}
              </div>
              <h3 className="mt-5 text-xl font-bold text-white">{f.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/55">{f.desc}</p>
              </GlassSurface>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
