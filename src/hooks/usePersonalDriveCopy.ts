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
   * did not — today that means the Firestore mapping write was refused. The
   * copy is still remembered on this device (localStorage mirror), so this
   * is a quiet, dismissible note — never a blocker.
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

/**
 * ── Device mirror of the mapping ─────────────────────────────────────────
 * Firestore (`users/{uid}/driveCopies/{sourceFileId}`) is the source of
 * truth, but a refused write (rules not deployed yet, a transient outage)
 * must NEVER strand a copy the learner just created. Every copy id is
 * therefore also mirrored to localStorage: the same device reopens the
 * copy instantly across visits, and the next mount pushes the device copy
 * back into Firestore so the learner's other devices self-heal too.
 */
type LocalCopyMapping = { copyFileId: string; copyName: string; mimeType: string };

const localMappingKey = (uid: string, sourceFileId: string) => `dc.driveCopies.v1.${uid}.${sourceFileId}`;

const readLocalMapping = (uid: string, sourceFileId: string): LocalCopyMapping | null => {
  try {
    const raw = localStorage.getItem(localMappingKey(uid, sourceFileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalCopyMapping>;
    return typeof parsed?.copyFileId === "string" && parsed.copyFileId ? (parsed as LocalCopyMapping) : null;
  } catch {
    return null;
  }
};

const writeLocalMapping = (uid: string, sourceFileId: string, mapping: LocalCopyMapping) => {
  try {
    localStorage.setItem(localMappingKey(uid, sourceFileId), JSON.stringify(mapping));
  } catch {
    /* private mode / full storage — the in-memory id still works this session */
  }
};

export function usePersonalDriveCopy({ uid, sourceFileId, copyName, clientId }: UsePersonalDriveCopyInput) {
  const [state, setState] = useState<PersonalCopyState>({ copyFileId: "", status: "idle", errorMessage: null, warningMessage: null });
  const busyRef = useRef(false);
  /**
   * The copy id for THIS session, held outside Firestore. If the mapping
   * write is refused (rules not deployed yet, for instance) the learner can
   * still open the copy they just made — the device mirror keeps it
   * working across visits and only other devices miss out.
   */
  const localCopyIdRef = useRef("");

  /** Write the mapping to Firestore (owner-scoped per firestore.rules). */
  const persistMapping = useCallback(async (mapping: LocalCopyMapping) => {
    if (!uid) throw new Error("Sign in to sync your personal copy.");
    await setDoc(doc(db, "users", uid, "driveCopies", sourceFileId), {
      uid,
      sourceFileId,
      copyFileId: mapping.copyFileId,
      copyName: mapping.copyName,
      mimeType: mapping.mimeType,
      createdAt: serverTimestamp(),
    }, { merge: true });
  }, [uid, sourceFileId]);

  /** Dismiss the transient "saved on this device" note. */
  const dismissWarning = useCallback(() => {
    setState((current) => (current.warningMessage ? { ...current, warningMessage: null } : current));
  }, []);

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
        const local = readLocalMapping(uid, sourceFileId);
        // Self-heal: a copy that only ever reached the device mirror (the
        // Firestore write was refused when it was made) is pushed back into
        // Firestore so the learner's other devices catch up. Refusals stay
        // silent — the mirror is what keeps the copy opening here.
        if (local?.copyFileId && !stored) {
          void persistMapping(local).catch(() => undefined);
        } else if (stored) {
          writeLocalMapping(uid, sourceFileId, {
            copyFileId: stored,
            copyName: String(snapshot.data()?.copyName || ""),
            mimeType: String(snapshot.data()?.mimeType || ""),
          });
        }
        const copyFileId = stored || localCopyIdRef.current || local?.copyFileId || "";
        setState((current) => ({
          copyFileId,
          // Never downgrade an in-flight create; otherwise reflect stored state.
          status: busyRef.current ? current.status : copyFileId ? "ready" : "idle",
          errorMessage: busyRef.current ? current.errorMessage : null,
          // A stored (or repaired) mapping clears the note; a dismissed note
          // stays dismissed until a new copy attempt.
          warningMessage: busyRef.current ? current.warningMessage : stored ? null : current.warningMessage,
        }));
      },
      // A denied listener must not wipe a copy this session already made.
      () => setState((current) => ({
        copyFileId: localCopyIdRef.current || readLocalMapping(uid, sourceFileId)?.copyFileId || "",
        status: busyRef.current ? current.status : (localCopyIdRef.current || readLocalMapping(uid, sourceFileId)) ? "ready" : "idle",
        errorMessage: busyRef.current ? current.errorMessage : null,
        warningMessage: current.warningMessage,
      })),
    );
  }, [uid, sourceFileId, persistMapping]);

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
    // A mapping that only ever made it to the device mirror (the Firestore
    // write was refused last time) is still THIS learner's copy — reuse it
    // instead of cloning the master a second time, and backfill Firestore
    // while we are here.
    const localId = readLocalMapping(uid, sourceFileId)?.copyFileId || "";
    const cachedId = existingId || localId;
    if (cachedId) {
      localCopyIdRef.current = cachedId;
      if (!existingId) {
        void persistMapping({ copyFileId: cachedId, copyName, mimeType: "" }).catch(() => undefined);
      }
      setState({ copyFileId: cachedId, status: "ready", errorMessage: null, warningMessage: null });
      return cachedId;
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
      // file was sitting in the student's Drive. The device mirror is
      // written FIRST so the copy is remembered no matter what, and a
      // refused sync is a quiet, dismissible note — never a blocker.
      localCopyIdRef.current = copy.id;
      writeLocalMapping(uid, sourceFileId, { copyFileId: copy.id, copyName: copy.name, mimeType: copy.mimeType });
      let warningMessage: string | null = null;
      try {
        await persistMapping({ copyFileId: copy.id, copyName: copy.name, mimeType: copy.mimeType });
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
  }, [uid, sourceFileId, copyName, clientId, state.copyFileId, persistMapping]);

  return { ...state, createCopy, dismissWarning };
}

export default usePersonalDriveCopy;
