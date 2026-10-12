import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { arrayRemove, arrayUnion, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../firebase';
import { LocalProgress } from './localProgress';

// Re-entering a course shares its in-flight acknowledgement; an outgoing
// instance must never overwrite a newer session's device outbox.
const sessions = new Map<string, LocalProgress>();

export default function useLocalCourseProgress(uid: string | null, productId: string) {
  const store = useMemo(() => {
    const key = `dc.progress.v1.${encodeURIComponent(uid || '')}.${encodeURIComponent(productId)}`;
    const existing = sessions.get(key);
    if (existing) return existing;
    const created = new LocalProgress(key, {
      storage: {
        getItem: key => uid ? localStorage.getItem(key) : null,
        setItem: (key, value) => { if (uid) localStorage.setItem(key, value); },
      },
      read: async () => {
        if (!uid || auth.currentUser?.uid !== uid) throw Error('Account not ready');
        const data = (await getDoc(doc(db, 'users', uid, 'courseProgress', productId))).data() || {};
        return { completedFileIds: Array.isArray(data.completedFileIds) ? data.completedFileIds.map(String) : [], lastOpenedFileId: typeof data.lastOpenedFileId === 'string' ? data.lastOpenedFileId : null };
      },
      write: async batch => {
        if (!uid || auth.currentUser?.uid !== uid) throw Error('Account changed');
        const ref = doc(db, 'users', uid, 'courseProgress', productId);
        const added = Object.entries(batch.changes).filter(([, c]) => c.value).map(([id]) => id);
        const removed = Object.entries(batch.changes).filter(([, c]) => !c.value).map(([id]) => id);
        const base = { productId, updatedAt: serverTimestamp(), ...(batch.opened ? { lastOpenedFileId: batch.opened.id, lastOpenedAt: serverTimestamp() } : {}) };
        // Per-file operations preserve unrelated progress on another device.
        if (added.length) await setDoc(ref, { ...base, completedFileIds: arrayUnion(...added) }, { merge: true });
        if (removed.length) await setDoc(ref, { ...base, completedFileIds: arrayRemove(...removed) }, { merge: true });
        if (!added.length && !removed.length) await setDoc(ref, base, { merge: true });
      },
    });
    sessions.set(key, created);
    return created;
  }, [uid, productId]);
  const data = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  useEffect(() => {
    void store.start();
    const flush = () => { void store.flush(); };
    const online = () => { void store.start().then(flush); };
    const unsubscribeAuth = onAuthStateChanged(auth, user => { if (user?.uid === uid) void store.start(); });
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('online', online);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      store.stop(); flush();
      unsubscribeAuth();
      window.removeEventListener('online', online);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [store, uid]);
  return { store, data, error: store.error };
}
