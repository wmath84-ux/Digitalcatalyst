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
    }, 5200);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-white/70 backdrop-blur-2xl">
      <div className="rounded-[2rem] border border-white/50 bg-white/70 px-8 py-10 text-center text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <p className="mx-auto max-w-3xl overflow-hidden whitespace-nowrap border-r-2 border-white/70 pr-2 text-xl sm:text-3xl font-semibold tracking-wide animate-[typing_3.2s_steps(70,end),blink_0.7s_step-end_infinite]" style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive' }}>
          Hello students, warm welcome to your own distraction free app — Eduvora Omaa.
        </p>
        <p className="mt-5 text-sm uppercase tracking-[0.55em] text-cyan-700 animate-[slideUp_0.9s_ease-out_forwards]">Digital Catalyst</p>
      </div>
    </div>
  );
};

export default WelcomeOverlay;
