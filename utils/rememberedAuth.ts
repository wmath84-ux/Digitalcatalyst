export type RememberedAuthAccount = {
  uid?: string;
  email: string;
  name?: string;
  photoURL?: string;
  profilePhotoSet?: boolean;
  providerIds?: string[];
  authProvider?: 'google' | 'password' | string;
  lastLoginAt: string;
};

export const REMEMBERED_AUTH_ACCOUNT_KEY = 'digitalCatalyst.rememberedAuthAccount';

const MAX_REMEMBERED_ACCOUNT_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const canUseLocalStorage = () => {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
};

const isExpired = (account: RememberedAuthAccount) => {
  const lastLogin = new Date(account.lastLoginAt).getTime();
  return !Number.isFinite(lastLogin) || Date.now() - lastLogin > MAX_REMEMBERED_ACCOUNT_AGE_MS;
};

const sanitizeRememberedAccount = (value: any): RememberedAuthAccount | null => {
  const email = typeof value?.email === 'string' ? value.email.trim().toLowerCase() : '';
  if (!email) return null;
  const account: RememberedAuthAccount = {
    email,
    lastLoginAt: typeof value?.lastLoginAt === 'string' ? value.lastLoginAt : new Date().toISOString(),
  };
  if (typeof value?.uid === 'string' && value.uid.trim()) account.uid = value.uid.trim();
  if (typeof value?.name === 'string' && value.name.trim()) account.name = value.name.trim();
  account.profilePhotoSet = value?.profilePhotoSet === true;
  if (account.profilePhotoSet && typeof value?.photoURL === 'string' && value.photoURL.trim()) account.photoURL = value.photoURL.trim();
  if (Array.isArray(value?.providerIds)) account.providerIds = Array.from(new Set<string>(value.providerIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id.trim()))));
  if (typeof value?.authProvider === 'string' && value.authProvider.trim()) account.authProvider = value.authProvider.trim();
  return account;
};

export const clearRememberedAuthAccount = (): void => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(REMEMBERED_AUTH_ACCOUNT_KEY);
  } catch {
    // Remembered account is only UI convenience; ignore storage failures.
  }
};

export const getRememberedAuthAccount = (): RememberedAuthAccount | null => {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(REMEMBERED_AUTH_ACCOUNT_KEY);
    if (!raw) return null;
    const account = sanitizeRememberedAccount(JSON.parse(raw));
    if (!account) return null;
    if (isExpired(account)) {
      clearRememberedAuthAccount();
      return null;
    }
    return account;
  } catch {
    return null;
  }
};

export const saveRememberedAuthAccount = (userOrProfile: Partial<RememberedAuthAccount>): void => {
  if (!canUseLocalStorage()) return;
  const current = getRememberedAuthAccount();
  const next = sanitizeRememberedAccount({
    ...current,
    ...userOrProfile,
    profilePhotoSet: userOrProfile.profilePhotoSet ?? current?.profilePhotoSet ?? false,
    photoURL: (userOrProfile.profilePhotoSet ?? current?.profilePhotoSet) ? (userOrProfile.photoURL ?? current?.photoURL ?? '') : '',
    lastLoginAt: new Date().toISOString(),
  });
  if (!next) return;
  try {
    // Store safe public metadata only. Never store passwords, Firebase tokens, Google access tokens, refresh tokens, or credentials.
    window.localStorage.setItem(REMEMBERED_AUTH_ACCOUNT_KEY, JSON.stringify(next));
  } catch {
    // Remembered account is only UI convenience; ignore storage failures.
  }
};

export const hasRememberedAuthAccount = (): boolean => Boolean(getRememberedAuthAccount());
