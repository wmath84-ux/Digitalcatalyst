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

/**
 * Screen-size-based mobile detection.
 * Returns true when the viewport width is at or below the mobile/portrait
 * breakpoint (768 px) AND not in tablet landscape desktop mode.
 * 
 * NEW: Tablet landscape (>=640 landscape) and wide tablet >=960 show desktop,
 * so they are NOT considered mobile.
 */
export const MOBILE_BREAKPOINT = 768;
export const TABLET_LANDSCAPE_MIN = 640;
export const WIDE_TABLET_THRESHOLD = 960;

function isTabletLandscapeDesktop(): boolean {
  if (typeof window === "undefined") return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const landscape = w > h;
  let isTablet = false;
  try {
    const sw = window.screen?.width ?? 0;
    const sh = window.screen?.height ?? 0;
    isTablet = Math.min(sw, sh) >= 600;
  } catch {
    isTablet = w >= TABLET_LANDSCAPE_MIN;
  }
  return w >= WIDE_TABLET_THRESHOLD || (landscape && isTablet && w >= TABLET_LANDSCAPE_MIN);
}

export function isMobileScreenSize(): boolean {
  if (typeof window === "undefined") return false;
  // Tablet landscape desktop should NOT be considered mobile
  if (isTabletLandscapeDesktop()) return false;
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

/**
 * Wide desktop browser (not the installed PWA). The landing page is the
 * default entry for these users — the desktop experience inside the app
 * is fully supported (it is a real desktop layout with a left rail), but
 * new desktop visitors get to see the marketing landing first, exactly
 * like a normal website. After they tap "Open App" the hash routes into
 * the desktop shell, and re-visits land directly inside the app.
 */
export function isDesktopBrowserLocked(): boolean {
  return !isMobileScreenSize() && !isPwaInstalled();
}

/**
 * Mobile browser that has not installed the PWA. Landing is the default
 * entry for these users regardless of login. Installed mobile PWAs never
 * see landing.
 */
export function isMobileBrowserWithoutPwa(): boolean {
  return isMobileScreenSize() && !isPwaInstalled();
}

/** Installed mobile PWA — skip landing and open the app shell. */
export function isInstalledMobilePwa(): boolean {
  return isMobileScreenSize() && isPwaInstalled();
}

/** Navigate from the landing page into the main home app. */
export const OPEN_APP_EVENT = "eduvora-open-app";

export function openApp() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_APP_EVENT));
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
