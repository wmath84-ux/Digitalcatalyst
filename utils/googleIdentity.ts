// Google Identity Services (GIS) wrapper.
// Replaces the old Firebase popup/redirect Google login with the modern
// "Sign in with Google" One Tap experience, which renders a native-looking
// bottom sheet account picker directly over the current page.

export type GoogleCredentialResponse = {
  credential: string;
  select_by?: string;
  clientId?: string;
};

export type GoogleMoment = {
  type: 'display' | 'skipped' | 'suppressed' | 'dismissed' | string;
};

type GoogleAccountsId = {
  initialize: (config: Record<string, unknown>) => void;
  prompt: (momentListener?: (moment: GoogleMoment) => void) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
  cancel: () => void;
};

type GoogleIdentityWindow = Window & {
  google?: {
    accounts?: {
      id?: GoogleAccountsId;
    };
  };
};

const GOOGLE_SCRIPT_ID = 'google-gsi-client';
const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const HIDDEN_CHOOSER_CONTAINER_ID = 'google-account-chooser-host';

let loadPromise: Promise<void> | null = null;

export const getGoogleClientId = (): string => {
  try {
    const runtimeEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
    return String(runtimeEnv.VITE_GOOGLE_CLIENT_ID || '').trim();
  } catch {
    return '';
  }
};

export const isGoogleIdentityLoaded = (): boolean =>
  Boolean((window as GoogleIdentityWindow).google?.accounts?.id);

export const loadGoogleIdentityServices = (): Promise<void> => {
  if (isGoogleIdentityLoaded()) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => {
        existing.dataset.loaded = 'true';
        resolve();
      });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services.')));
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services.'));
    document.head.appendChild(script);
  });

  return loadPromise;
};

export const initializeGoogleIdentityServices = (config: {
  clientId: string;
  callback: (response: GoogleCredentialResponse) => void;
}): boolean => {
  const gsi = (window as GoogleIdentityWindow).google?.accounts?.id;
  if (!gsi) return false;

  gsi.initialize({
    client_id: config.clientId,
    callback: config.callback,
    auto_select: false,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
  });
  return true;
};

export const promptGoogleOneTap = (onMoment?: (moment: GoogleMoment) => void): void => {
  const gsi = (window as GoogleIdentityWindow).google?.accounts?.id;
  if (!gsi) return;
  gsi.prompt(moment => {
    if (onMoment && moment) onMoment(moment);
  });
};

export const cancelGoogleOneTap = (): void => {
  (window as GoogleIdentityWindow).google?.accounts?.id?.cancel();
};

export const mountGoogleAccountChooserHost = (): HTMLElement | null => {
  const existing = document.getElementById(HIDDEN_CHOOSER_CONTAINER_ID);
  if (existing) return existing;

  const host = document.createElement('div');
  host.id = HIDDEN_CHOOSER_CONTAINER_ID;
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:200px;height:44px;overflow:hidden;z-index:-1;';
  document.body.appendChild(host);
  return host;
};

export const renderGoogleAccountChooserButton = (host: HTMLElement | null): void => {
  const gsi = (window as GoogleIdentityWindow).google?.accounts?.id;
  if (!gsi || !host) return;
  host.replaceChildren();
  gsi.renderButton(host, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
  });
};

export const triggerGoogleAccountChooser = (host: HTMLElement | null): void => {
  if (!host) return;
  const clickable = (host.querySelector('div[role="button"]') || host.firstElementChild) as HTMLElement | null;
  if (!clickable) return;
  clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
};
