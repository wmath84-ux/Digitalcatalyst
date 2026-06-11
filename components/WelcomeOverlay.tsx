import React, { useEffect, useState } from 'react';

const WelcomeOverlay: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = sessionStorage.getItem('welcomeOverlaySeen');
    if (seen) return;
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      sessionStorage.setItem('welcomeOverlaySeen', '1');
    }, 2600);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-white/70 px-4 backdrop-blur-2xl">
      <div className="relative flex h-[min(84vw,24rem)] w-[min(84vw,24rem)] items-center justify-center rounded-full bg-gradient-to-br from-white/95 via-cyan-50/90 to-blue-100/90 p-8 text-center text-slate-900 shadow-[0_18px_60px_rgba(14,165,233,0.22)] sm:p-10">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.95),transparent_34%)]" />
        <svg className="absolute inset-0 h-full w-full -rotate-90 overflow-visible" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(14,165,233,0.16)" strokeWidth="1.5" />
          <circle className="animate-[welcomeCircleDraw_2s_linear_forwards]" cx="50" cy="50" r="48" fill="none" stroke="url(#welcomeCircleGradient)" strokeLinecap="round" strokeWidth="2.4" />
          <defs>
            <linearGradient id="welcomeCircleGradient" x1="0" x2="100" y1="0" y2="100" gradientUnits="userSpaceOnUse">
              <stop stopColor="#06b6d4" />
              <stop offset="1" stopColor="#2563eb" />
            </linearGradient>
          </defs>
        </svg>
        <div className="relative z-10 flex max-w-[18rem] flex-col items-center overflow-hidden">
          <p className="animate-[welcomeMessageWrite_2s_steps(68,end)_forwards] text-2xl font-semibold leading-snug tracking-wide text-slate-900 sm:text-4xl" style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive' }}>
            Hello students, warm welcome to your own distraction free app — Eduvora Omaa.
          </p>
          <p className="mt-5 animate-[welcomeMessageWrite_2s_steps(68,end)_forwards] text-xs font-semibold uppercase tracking-[0.42em] text-cyan-700 sm:text-sm">Digital Catalyst</p>
        </div>
      </div>
    </div>
  );
};

export default WelcomeOverlay;
