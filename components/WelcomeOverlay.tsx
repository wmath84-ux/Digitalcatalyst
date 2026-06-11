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
    }, 3600);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-white/70 px-4 backdrop-blur-2xl">
      <div className="relative flex h-[min(82vw,24rem)] w-[min(82vw,24rem)] items-center justify-center rounded-full border border-white/70 bg-gradient-to-br from-white/95 via-cyan-50/90 to-blue-100/90 p-7 text-center text-slate-900 shadow-[0_18px_60px_rgba(14,165,233,0.22)] animate-[welcomeCirclePop_0.55s_cubic-bezier(0.16,1,0.3,1)_both] sm:p-10">
        <div className="absolute inset-3 rounded-full border border-cyan-200/80" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.95),transparent_34%)]" />
        <div className="relative z-10 flex max-w-[18rem] flex-col items-center">
          <p className="text-2xl font-semibold leading-snug tracking-wide text-slate-900 opacity-0 animate-[circleTextReveal_1.75s_steps(62,end)_0.25s_forwards] sm:text-4xl" style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive' }}>
            Hello students, warm welcome to your own distraction free app — Eduvora Omaa.
          </p>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.42em] text-cyan-700 opacity-0 animate-[slideUp_0.45s_ease-out_1.7s_forwards] sm:text-sm">Digital Catalyst</p>
        </div>
      </div>
    </div>
  );
};

export default WelcomeOverlay;
