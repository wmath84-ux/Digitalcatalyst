import React from 'react';
import { WebsiteSettings } from '../App';

interface PlatformExperienceProps {
  settings: WebsiteSettings;
  onLoginClick: () => void;
  onExploreClick: () => void;
}

const capabilities = [
  { title: 'Storefront for notes & courses', text: 'Browse premium notes, video courses, favourite lists, coupons, reviews, and subscriptions in one clean marketplace.', icon: '🛍️' },
  { title: 'Google Docs style learning', text: 'Read rich formatted notes in a focused document workspace with highlighting, lists, headings, and print/PDF support.', icon: '📄' },
  { title: 'Private video classroom', text: 'Watch embedded lessons directly inside the app with a dedicated course sidebar and distraction-free learning mode.', icon: '🎥' },
  { title: 'AI study assistant', text: 'Ask doubts while learning and get clear explanations from the in-course AI mentor when your key is configured.', icon: '🤖' },
  { title: 'EduCoins & rewards', text: 'Build a daily study habit, earn EduCoins, unlock discounts, and see progress from your learner profile.', icon: '🪙' },
  { title: 'Focused study profile', text: 'Track your purchased notes, available coupons, course progress, study minutes, and learning streak in one profile.', icon: '🎯' },
];

const PlatformExperience: React.FC<PlatformExperienceProps> = ({ settings, onLoginClick, onExploreClick }) => {
  return (
    <section className="relative bg-slate-950 text-white py-20 sm:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(82,143,240,0.28),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.2),transparent_30%)]" />
      <div className="relative container mx-auto px-6">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-10 items-center">
          <div>
            <p className="text-sm font-black tracking-[0.3em] uppercase text-blue-300">Creator commerce OS</p>
            <h2 className="mt-4 text-4xl sm:text-5xl font-black leading-tight">A nested, premium learning app for selling notes, subscriptions, and video courses.</h2>
            <p className="mt-5 text-lg text-slate-300 leading-relaxed">{settings.content.siteName} now presents your idea as a polished content marketplace: beautiful landing page, OTP onboarding, Amazon-like discovery, Google Docs inspired reading, course player with notes + AI, EduCoins, and a focused student profile.</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button onClick={onLoginClick} className="px-7 py-4 rounded-2xl bg-white text-slate-950 font-black hover:-translate-y-1 hover:shadow-2xl transition-all">Login / Sign up</button>
              <button onClick={onExploreClick} className="px-7 py-4 rounded-2xl bg-white/10 border border-white/15 font-black hover:bg-white/15 transition-colors">Explore products</button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {capabilities.map((item, index) => (
              <article key={item.title} className={`rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur ${index === 1 ? 'sm:translate-y-8' : ''}`}>
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-2xl mb-4">{item.icon}</div>
                <h3 className="text-lg font-black">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PlatformExperience;
