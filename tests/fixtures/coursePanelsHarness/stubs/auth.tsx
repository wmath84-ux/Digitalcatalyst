// Stub for src/context/AuthContext: a signed-in learner, no Firebase.
export function useAuth() {
  return { user: { id: "u1", name: "Learner" }, loading: false, restoringSession: false, logout: async () => {} } as never;
}
export function AuthProvider({ children }: { children: unknown }) {
  return children as never;
}
