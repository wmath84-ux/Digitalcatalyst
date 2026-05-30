import React from 'react';
import { WebsiteSettings } from '../App';

interface PlatformExperienceProps {
  settings: WebsiteSettings;
}

const capabilities = [
  { title: 'Storefront for notes & courses', text: 'Browse premium notes, video courses, favourite lists, coupons, reviews, and subscriptions in one clean marketplace.', icon: '🛍️' },
  { title: 'Google Docs style learning', text: 'Read rich formatted notes in a focused document workspace with highlighting, lists, headings, and print/PDF support.', icon: '📄' },
  { title: 'Private video classroom', text: 'Watch embedded lessons directly inside the app with a dedicated course sidebar and distraction-free learning mode.', icon: '🎥' },
  { title: 'AI study assistant', text: 'Ask doubts while learning and get clear explanations from the in-course AI mentor when your key is configured.', icon: '🤖' },
  { title: 'EduCoins & rewards', text: 'Build a daily study habit, earn EduCoins, unlock discounts, and see progress from your learner profile.', icon: '🪙' },
  { title: 'Focused study profile', text: 'Track your purchased notes, available coupons, course progress, study minutes, and learning streak in one profile.', icon: '🎯' },
];

const PlatformExperience: React.FC<PlatformExperienceProps> = ({ settings }) => {
  const siteName = settings.content.siteName || 'Digital Catalyst';

  return (
    <section className="relative overflow-hidden bg-slate-950 py-20 text-white sm:py-24">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(37,99,235,0.35),transparent_30%),radial-gradient(circle_at_82%_8%,rgba(168,85,247,0.24),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0),rgba(15,23,42,0.98))]" />
      <div className="absolute left-1/2 top-0 h-px w-[82%] -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />

      <div className="relative container mx-auto px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-cyan-200">Creator commerce OS</p>
          <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
            A nested, premium learning app for selling notes, subscriptions, and video courses.
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            {siteName} now presents your idea as a polished content marketplace with Amazon-like discovery, Google Docs inspired reading, AI-assisted courses, EduCoins, and a focused student profile.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {capabilities.map((item) => (
            <article key={item.title} className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_24px_70px_rgba(2,6,23,0.38)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-cyan-200/35 hover:bg-white/[0.09]">
              <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">{item.icon}</div>
              <h3 className="text-xl font-black text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PlatformExperience;
