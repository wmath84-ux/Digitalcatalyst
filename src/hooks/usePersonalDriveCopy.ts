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
  DriveCopyError,
  friendlyDriveCopyError,
  requestDriveAccessToken,
} from "../utils/googleDriveCopy";

export type PersonalCopyStatus = "idle" | "authorizing" | "copying" | "ready" | "error";

export interface PersonalCopyState {
  /** The student's copy id, once known (from Firestore or a fresh copy). */
  copyFileId: string;
  status: PersonalCopyStatus;
  errorMessage: string | null;
  /**
   * Set when the copy itself SUCCEEDED but something non-essential around it
   * did not — today that means the Firestore mapping write was refused, so
   * the copy works now but will not be remembered on the next visit. The
   * learner must never be blocked by this.
   */
  warningMessage: string | null;
}

export interface UsePersonalDriveCopyInput {
  uid: string | null | undefined;
  sourceFileId: string;
  /** Suggested name for the copy, e.g. "Notes — Rahul's copy". */
  copyName: string;
  clientId: string;
}

export function usePersonalDriveCopy({ uid, sourceFileId, copyName, clientId }: UsePersonalDriveCopyInput) {
  const [state, setState] = useState<PersonalCopyState>({ copyFileId: "", status: "idle", errorMessage: null, warningMessage: null });
  const busyRef = useRef(false);
  /**
   * The copy id for THIS session, held outside Firestore. If the mapping
   * write is refused (rules not deployed yet, for instance) the learner can
   * still open the copy they just made — only cross-device memory is lost.
   */
  const localCopyIdRef = useRef("");

  // Live mapping — a copy created on another device appears here too.
  useEffect(() => {
    localCopyIdRef.current = "";
    if (!uid || !sourceFileId) {
      setState({ copyFileId: "", status: "idle", errorMessage: null, warningMessage: null });
      return undefined;
    }
    return onSnapshot(
      doc(db, "users", uid, "driveCopies", sourceFileId),
      (snapshot) => {
        const stored = snapshot.exists() ? String(snapshot.data()?.copyFileId || "") : "";
        const copyFileId = stored || localCopyIdRef.current;
        setState((current) => ({
          copyFileId,
          // Never downgrade an in-flight create; otherwise reflect stored state.
          status: busyRef.current ? current.status : copyFileId ? "ready" : "idle",
          errorMessage: busyRef.current ? current.errorMessage : null,
          warningMessage: busyRef.current ? current.warningMessage : stored ? null : current.warningMessage,
        }));
      },
      // A denied listener must not wipe a copy this session already made.
      () => setState((current) => ({
        copyFileId: localCopyIdRef.current,
        status: busyRef.current ? current.status : localCopyIdRef.current ? "ready" : "idle",
        errorMessage: busyRef.current ? current.errorMessage : null,
        warningMessage: current.warningMessage,
      })),
    );
  }, [uid, sourceFileId]);

  /** Create (or fetch) the personal copy. Safe to call repeatedly. */
  const createCopy = useCallback(async (): Promise<string> => {
    if (!uid) throw new Error("Sign in to create your personal copy.");
    if (!sourceFileId) throw new Error("This file has no Google Drive source.");
    if (busyRef.current) return state.copyFileId;

    // Someone else's snapshot may have landed already. A read that is
    // REFUSED (rules) is not the same as "no copy yet" — but either way the
    // flow simply continues and makes one.
    const mappingRef = doc(db, "users", uid, "driveCopies", sourceFileId);
    const existing = await getDoc(mappingRef).catch(() => null);
    const existingId = existing?.exists() ? String(existing.data()?.copyFileId || "") : "";
    if (existingId) {
      localCopyIdRef.current = existingId;
      setState({ copyFileId: existingId, status: "ready", errorMessage: null, warningMessage: null });
      return existingId;
    }

    busyRef.current = true;
    setState((current) => ({ ...current, status: "authorizing", errorMessage: null, warningMessage: null }));
    try {
      const token = await requestDriveAccessToken(clientId);
      setState((current) => ({ ...current, status: "copying" }));
      const copy = await copyDriveFile(token, sourceFileId, copyName);

      // ── The copy now EXISTS in the student's Drive ──────────────────
      // Everything past this point is bookkeeping. A Firestore rejection
      // ("Missing or insufficient permissions.") used to surface as a red
      // error that made it look like the copy had failed, even though the
      // file was sitting in the student's Drive. It is a warning now: the
      // copy opens immediately and only the cross-device memory is lost.
      localCopyIdRef.current = copy.id;
      let warningMessage: string | null = null;
      try {
        await setDoc(mappingRef, {
          uid,
          sourceFileId,
          copyFileId: copy.id,
          copyName: copy.name,
          mimeType: copy.mimeType,
          createdAt: serverTimestamp(),
        }, { merge: true });
      } catch {
        warningMessage = friendlyDriveCopyError(new DriveCopyError("mapping_denied", "Copy mapping refused."));
      }
      setState({ copyFileId: copy.id, status: "ready", errorMessage: null, warningMessage });
      return copy.id;
    } catch (error) {
      const message = friendlyDriveCopyError(error);
      setState((current) => ({ ...current, status: "error", errorMessage: message, warningMessage: null }));
      throw new Error(message);
    } finally {
      busyRef.current = false;
    }
  }, [uid, sourceFileId, copyName, clientId, state.copyFileId]);

  return { ...state, createCopy };
}

export default usePersonalDriveCopy;
