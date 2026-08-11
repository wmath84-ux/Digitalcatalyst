interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export const PWA_INSTALL_OPEN_EVENT = "eduvora-open-install";
export const DESKTOP_MAINTENANCE_EVENT = "eduvora-desktop-maintenance";

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

export function openInstallPanel() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PWA_INSTALL_OPEN_EVENT));
  }
}

export function showDesktopMaintenanceNotice() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DESKTOP_MAINTENANCE_EVENT));
  }
}

export function isPwaInstalled() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export function isInstallPromptReady() {
  return deferredInstallPrompt !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isPwaInstalled()) return true;
  if (!deferredInstallPrompt) return false;

  await deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice.outcome === "accepted") deferredInstallPrompt = null;
  return choice.outcome === "accepted";
}
