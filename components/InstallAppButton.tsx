import React, { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const isStandaloneDisplay = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

const InstallAppButton: React.FC = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandaloneDisplay());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setShowFallback(false);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setShowFallback(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const fallbackTimer = window.setTimeout(() => {
      if (!isStandaloneDisplay()) setShowFallback(true);
    }, 2500);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) {
      setShowFallback(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
      setShowFallback(false);
    } else {
      setShowFallback(true);
    }
  };

  if (isInstalled) return null;

  return (
    <aside className="fixed bottom-24 right-4 z-[1450] max-w-xs rounded-3xl border border-blue-100/80 bg-white/90 p-4 text-slate-900 shadow-[0_18px_50px_rgba(37,99,235,0.18)] backdrop-blur-2xl md:bottom-6 md:right-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-black text-white shadow-lg">
          DC
        </div>
        <div>
          <h2 className="text-sm font-black">Install Digital Catalyst</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Add the student learning app to your home screen for faster access and offline app-shell loading.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleInstallClick}
        className="mt-4 w-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(37,99,235,0.28)] transition hover:-translate-y-0.5 hover:opacity-95"
      >
        {installPrompt ? 'Install App' : 'Add to Home Screen'}
      </button>
      {showFallback && (
        <p className="mt-3 text-xs leading-5 text-slate-600">
          Chrome mobile: open the browser menu ⋮, then tap <strong>Install app</strong> or <strong>Add to Home screen</strong>. If it does not appear yet, wait a moment and tap the page once.
        </p>
      )}
    </aside>
  );
};

export default InstallAppButton;
