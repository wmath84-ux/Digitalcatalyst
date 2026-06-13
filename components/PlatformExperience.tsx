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
    <section className="tagmaster-section-theme relative overflow-hidden py-20 text-[var(--text-body)] sm:py-24 lg:py-24">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(37,99,235,0.42),transparent_30%),radial-gradient(circle_at_82%_8%,rgba(124,58,237,0.34),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.62))]" />
      <div className="absolute left-1/2 top-0 h-px w-[82%] -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />

      <div className="relative container mx-auto px-6">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-cyan-700">Creator commerce OS</p>
          <h2 className="mt-4 text-[clamp(2.5rem,4vw,4.2rem)] font-[820] leading-[1.05] tracking-[-0.045em] text-[var(--text-heading)]">
            A nested, premium learning app for selling notes, subscriptions, and video courses.
          </h2>
          <p className="mt-6 text-lg leading-8 text-[var(--text-body)]">
            {siteName} now presents your idea as a polished content marketplace with Amazon-like discovery, Google Docs inspired reading, AI-assisted courses, EduCoins, and a focused student profile.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((item) => (
            <article key={item.title} className="group relative overflow-hidden flex h-full flex-col rounded-[28px] border border-[var(--border-soft)] bg-white p-9 shadow-[var(--shadow-card)] transition duration-300 hover:-translate-y-1 hover:border-[var(--border-active)] hover:shadow-[0_22px_55px_rgba(8,26,69,0.10)]">
              <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[#E8F2FF] text-2xl text-[var(--primary)]">{item.icon}</div>
              <h3 className="text-xl font-black text-[var(--text-title)]">{item.title}</h3>
              <p className="mt-3 text-[0.98rem] leading-7 text-[var(--text-body)]">{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PlatformExperience;
