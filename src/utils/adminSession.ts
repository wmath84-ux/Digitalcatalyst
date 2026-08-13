export const APPROVED_ADMIN_EMAIL = "wmath84@gmail.com";
export const ADMIN_SESSION_KEY = "digitalCatalyst.adminSession.v1";

type AdminSession = { uid: string; email: string; createdAt: number; nonce: string };

export const createAdminSession = (uid: string, email: string) => {
  const session: AdminSession = {
    uid,
    email: email.trim().toLowerCase(),
    createdAt: Date.now(),
    nonce: crypto.randomUUID(),
  };
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  } catch {
    try { localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session)); } catch { /* no-op */ }
  }
};

export const readAdminSession = (): AdminSession | null => {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY) || localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<AdminSession>;
    if (!session.uid || session.email !== APPROVED_ADMIN_EMAIL || !session.createdAt || !session.nonce) return null;
    return session as AdminSession;
  } catch {
    return null;
  }
};

export const hasAdminSession = (uid?: string, email?: string, role?: string) => {
  const session = readAdminSession();
  return Boolean(
    session
    && uid
    && session.uid === uid
    && String(email || "").trim().toLowerCase() === APPROVED_ADMIN_EMAIL
    && role === "admin",
  );
};

export const clearAdminSession = () => {
  try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* no-op */ }
};
