// Browser stub for the app's `firebase.ts` singletons.
const user = { uid: "u1", getIdToken: async () => "stub-token" };
export const auth = {
  currentUser: user,
  authStateReady: async () => undefined,
  onAuthStateChanged: (next: (u: unknown) => void) => {
    setTimeout(() => next(user), 0);
    return () => {};
  },
};
export const db = { __stubDb: true };
export async function getFirebaseStorage() {
  return { __stubStorage: true };
}
