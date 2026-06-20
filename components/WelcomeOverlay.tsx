import React, { useEffect, useRef, useState } from 'react';

interface WelcomeOverlayProps {
  message?: string;
  onAnimationComplete?: () => void;
}

const WELCOME_DURATION_MS = 3600;

const WelcomeOverlay: React.FC<WelcomeOverlayProps> = ({ message = '', onAnimationComplete }) => {
  const [visible, setVisible] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState('');
  const completionRef = useRef(onAnimationComplete);
  const completedRef = useRef(false);

  useEffect(() => {
    completionRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  const finishWelcome = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setVisible(false);
    completionRef.current?.();
  };

  useEffect(() => {
    if (!message) return;

    completedRef.current = false;
    setOverlayMessage(message);
    setVisible(true);

    const timer = window.setTimeout(finishWelcome, WELCOME_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (message) return;

    try {
      const seen = sessionStorage.getItem('welcomeOverlaySeen');
      if (seen) {
        const timer = window.setTimeout(() => completionRef.current?.(), 250);
        return () => window.clearTimeout(timer);
      }

      sessionStorage.setItem('welcomeOverlaySeen', '1');
    } catch {
      // Welcome overlay is only visual. Never block the app because storage failed.
    }

    completedRef.current = false;
    setOverlayMessage('Digital Catalyst');
    setVisible(true);

    const timer = window.setTimeout(finishWelcome, WELCOME_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="welcome-overlay-safe fixed inset-0 z-[1800] flex items-center justify-center overflow-hidden bg-slate-950/80 px-4 backdrop-blur-2xl">
      <style>{`
        .welcome-overlay-safe,
        .welcome-overlay-safe * {
          animation-play-state: running !important;
        }

        .welcome-overlay-backdrop {
          animation: welcomeBackdropIn 420ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
        }

        .welcome-overlay-card {
          animation: welcomeCirclePop 520ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
          transform-origin: center;
          will-change: opacity, transform;
        }

        .welcome-orbit-ring {
          stroke-dasharray: 295.31;
          stroke-dashoffset: 295.31;
          animation: welcomeCircleDraw 2300ms cubic-bezier(0.65, 0, 0.35, 1) 220ms forwards !important;
        }

        .welcome-write-text {
          display: inline-block;
          opacity: 1 !important;
          position: relative;
          clip-path: inset(0 100% 0 0);
          animation: welcomeTextWrite 1850ms steps(7, end) 520ms forwards !important;
        }

        .welcome-write-text::after {
          background: currentColor;
          content: '';
          height: 0.9em;
          position: absolute;
          right: -0.15em;
          top: 0.08em;
          width: 0.045em;
          animation: welcomeCaretBlink 520ms steps(1, end) 520ms 5 both !important;
        }

        .welcome-subtitle {
          opacity: 0;
          animation: welcomeSubtitleIn 520ms cubic-bezier(0.16, 1, 0.3, 1) 2050ms forwards !important;
        }

        .welcome-spark-one {
          animation: welcomeSpark 2200ms ease-in-out 320ms both !important;
        }

        .welcome-spark-two {
          animation: welcomeSpark 2400ms ease-in-out 620ms both !important;
        }

        .welcome-glow-pulse {
          animation: welcomeGlowPulse 2600ms ease-in-out infinite !important;
        }

        @keyframes welcomeBackdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes welcomeCirclePop {
          0% { opacity: 0; transform: scale(0.82) rotate(-2deg); }
          70% { opacity: 1; transform: scale(1.035) rotate(0deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }

        @keyframes welcomeCircleDraw {
          from { stroke-dashoffset: 295.31; }
          to { stroke-dashoffset: 0; }
        }

        @keyframes welcomeTextWrite {
          from { clip-path: inset(0 100% 0 0); }
          to { clip-path: inset(0 0 0 0); }
        }

        @keyframes welcomeCaretBlink {
          0%, 45% { opacity: 1; }
          46%, 100% { opacity: 0; }
        }

        @keyframes welcomeSubtitleIn {
          from { opacity: 0; transform: translateY(18px) scale(0.96); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }

        @keyframes welcomeSpark {
          0% { opacity: 0; transform: scale(0.35); }
          20%, 78% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.45); }
        }

        @keyframes welcomeGlowPulse {
          0%, 100% { opacity: 0.55; transform: scale(0.96); }
          50% { opacity: 0.9; transform: scale(1.05); }
        }
      `}</style>

      <div className="welcome-overlay-backdrop absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(14,165,233,0.22),transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.88),rgba(15,23,42,0.78))]" />

      <div className="welcome-overlay-card relative flex h-[min(82vw,24rem)] w-[min(82vw,24rem)] items-center justify-center rounded-full bg-gradient-to-br from-white via-cyan-100 to-sky-200 p-7 text-center text-slate-900 shadow-[0_24px_90px_rgba(14,165,233,0.38),0_0_70px_rgba(103,232,249,0.28)] sm:p-10">
        <div className="welcome-glow-pulse absolute -inset-3 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute inset-4 rounded-full bg-[radial-gradient(circle_at_32%_24%,rgba(255,255,255,0.98),transparent_34%),linear-gradient(145deg,rgba(236,254,255,0.95),rgba(219,234,254,0.82))]" />
        <div className="absolute inset-7 rounded-full border border-white/65 shadow-[inset_0_0_40px_rgba(14,165,233,0.12)]" />

        <svg className="absolute inset-0 h-full w-full -rotate-90 overflow-visible" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(165,243,252,0.58)" strokeWidth="1.4" />
          <circle className="welcome-orbit-ring" cx="50" cy="50" r="47" fill="none" stroke="url(#welcomeCircleGradient)" strokeLinecap="round" strokeWidth="2.8" />
          <defs>
            <linearGradient id="welcomeCircleGradient" x1="18" x2="82" y1="18" y2="82" gradientUnits="userSpaceOnUse">
              <stop stopColor="#22d3ee" />
              <stop offset="0.55" stopColor="#2563eb" />
              <stop offset="1" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
        </svg>

        <div className="welcome-spark-one absolute left-[18%] top-[17%] h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.85)]" />
        <div className="welcome-spark-two absolute bottom-[20%] right-[19%] h-2.5 w-2.5 rounded-full bg-violet-300 shadow-[0_0_18px_rgba(124,58,237,0.8)]" />

        <div className="relative z-10 flex max-w-[18rem] flex-col items-center">
          <p className="welcome-write-text text-5xl font-semibold leading-tight tracking-wide text-slate-950 sm:text-7xl" style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive' }}>
            Welcome
          </p>
          <p className="welcome-subtitle mt-4 max-w-[15rem] text-xs font-black uppercase tracking-[0.24em] text-cyan-700 sm:text-sm">
            {overlayMessage || 'Digital Catalyst'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default WelcomeOverlay;
