// src/hooks/usePersonalDriveCopy.ts
//
// Per-student personal Google Drive copies.
//
// Mapping storage: `users/{uid}/driveCopies/{sourceFileId}` — one doc per
// master file, carrying the student's own `copyFileId`. Owner-only per
// firestore.rules. The same copy re-opens instantly on every visit and on
// every device.
//
// The heavy lifting (OAuth token + Drive `files.copy`) lives in
// `src/utils/googleDriveCopy.ts`; this hook adds the Firestore read/write
// and busy/error state for the viewer UI.

import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import {
  copyDriveFile,
  friendlyDriveCopyError,
  requestDriveAccessToken,
} from "../utils/googleDriveCopy";

export type PersonalCopyStatus = "idle" | "authorizing" | "copying" | "ready" | "error";

export interface PersonalCopyState {
  /** The student's copy id, once known (from Firestore or a fresh copy). */
  copyFileId: string;
  status: PersonalCopyStatus;
  errorMessage: string | null;
}

export interface UsePersonalDriveCopyInput {
  uid: string | null | undefined;
  sourceFileId: string;
  /** Suggested name for the copy, e.g. "Notes — Rahul's copy". */
  copyName: string;
  clientId: string;
}

export function usePersonalDriveCopy({ uid, sourceFileId, copyName, clientId }: UsePersonalDriveCopyInput) {
  const [state, setState] = useState<PersonalCopyState>({ copyFileId: "", status: "idle", errorMessage: null });
  const busyRef = useRef(false);

  // Live mapping — a copy created on another device appears here too.
  useEffect(() => {
    if (!uid || !sourceFileId) {
      setState({ copyFileId: "", status: "idle", errorMessage: null });
      return undefined;
    }
    return onSnapshot(
      doc(db, "users", uid, "driveCopies", sourceFileId),
      (snapshot) => {
        const copyFileId = snapshot.exists() ? String(snapshot.data()?.copyFileId || "") : "";
        setState((current) => ({
          copyFileId,
          // Never downgrade an in-flight create; otherwise reflect stored state.
          status: busyRef.current ? current.status : copyFileId ? "ready" : "idle",
          errorMessage: busyRef.current ? current.errorMessage : null,
        }));
      },
      () => setState({ copyFileId: "", status: "idle", errorMessage: null }),
    );
  }, [uid, sourceFileId]);

  /** Create (or fetch) the personal copy. Safe to call repeatedly. */
  const createCopy = useCallback(async (): Promise<string> => {
    if (!uid) throw new Error("Sign in to create your personal copy.");
    if (!sourceFileId) throw new Error("This file has no Google Drive source.");
    if (busyRef.current) return state.copyFileId;

    // Someone else's snapshot may have landed already.
    const mappingRef = doc(db, "users", uid, "driveCopies", sourceFileId);
    const existing = await getDoc(mappingRef).catch(() => null);
    const existingId = existing?.exists() ? String(existing.data()?.copyFileId || "") : "";
    if (existingId) {
      setState({ copyFileId: existingId, status: "ready", errorMessage: null });
      return existingId;
    }

    busyRef.current = true;
    setState((current) => ({ ...current, status: "authorizing", errorMessage: null }));
    try {
      const token = await requestDriveAccessToken(clientId);
      setState((current) => ({ ...current, status: "copying" }));
      const copy = await copyDriveFile(token, sourceFileId, copyName);
      await setDoc(mappingRef, {
        uid,
        sourceFileId,
        copyFileId: copy.id,
        copyName: copy.name,
        mimeType: copy.mimeType,
        createdAt: serverTimestamp(),
      }, { merge: true });
      setState({ copyFileId: copy.id, status: "ready", errorMessage: null });
      return copy.id;
    } catch (error) {
      const message = friendlyDriveCopyError(error);
      setState((current) => ({ ...current, status: "error", errorMessage: message }));
      throw new Error(message);
    } finally {
      busyRef.current = false;
    }
  }, [uid, sourceFileId, copyName, clientId, state.copyFileId]);

  return { ...state, createCopy };
}

export default usePersonalDriveCopy;
