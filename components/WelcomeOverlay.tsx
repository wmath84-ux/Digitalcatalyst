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
    }, 3400);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-2xl">
      <div className="relative flex h-[min(82vw,24rem)] w-[min(82vw,24rem)] items-center justify-center rounded-full bg-gradient-to-br from-white via-cyan-50 to-sky-100 p-7 text-center text-slate-900 shadow-[0_24px_80px_rgba(14,165,233,0.34)] animate-[welcomeCirclePop_0.35s_cubic-bezier(0.16,1,0.3,1)_both] sm:p-10">
        <div className="absolute inset-4 rounded-full bg-[radial-gradient(circle_at_32%_24%,rgba(255,255,255,0.98),transparent_34%),linear-gradient(145deg,rgba(236,254,255,0.95),rgba(219,234,254,0.8))]" />
        <div className="absolute -inset-2 rounded-full bg-cyan-300/25 blur-2xl" />
        <svg className="absolute inset-0 h-full w-full -rotate-90 overflow-visible" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(14,165,233,0.16)" strokeWidth="1.4" />
          <circle className="welcome-circle-draw" cx="50" cy="50" r="47" fill="none" stroke="url(#welcomeCircleGradient)" strokeLinecap="round" strokeWidth="2.6" />
          <defs>
            <linearGradient id="welcomeCircleGradient" x1="18" x2="82" y1="18" y2="82" gradientUnits="userSpaceOnUse">
              <stop stopColor="#22d3ee" />
              <stop offset="0.55" stopColor="#2563eb" />
              <stop offset="1" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute left-[17%] top-[18%] h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.8)] animate-[welcomeSpark_3s_ease-in-out_both]" />
        <div className="relative z-10 flex max-w-[18rem] flex-col items-center">
          <p className="welcome-write-text text-5xl font-semibold leading-tight tracking-wide text-slate-950 sm:text-7xl" style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive' }}>
            Welcome
          </p>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.42em] text-cyan-700 opacity-0 animate-[slideUp_0.45s_ease-out_2.55s_forwards] sm:text-sm">Digital Catalyst</p>
        </div>
      </div>
    </div>
  );
};

export default WelcomeOverlay;
