interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
  });
}

export async function promptInstall(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  if (standalone) return true;

  if (!deferredInstallPrompt) {
    window.dispatchEvent(new CustomEvent("eduvora-install-help"));
    window.alert("To install Eduvora, open your browser menu and choose ‘Install app’ or ‘Add to Home Screen’.");
    return false;
  }

  await deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice.outcome === "accepted") deferredInstallPrompt = null;
  return choice.outcome === "accepted";
}
