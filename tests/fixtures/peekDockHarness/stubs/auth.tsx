// Stub for src/context/AuthContext — the peek-dock harness renders the REAL
// DesktopShell, which only needs a signed-out user and a no-op logout (the
// real provider would need Firebase, which the harness must not touch).
export function useAuth() {
  return {
    user: null,
    loading: false,
    restoringSession: false,
    googleNotice: null,
    logout: async () => {},
  } as never;
}

export function AuthProvider({ children }: { children: unknown }) {
  return children as never;
}
