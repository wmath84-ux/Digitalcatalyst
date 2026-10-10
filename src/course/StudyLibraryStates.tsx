// src/course/StudyLibraryStates.tsx
//
// The shared empty, loading and sync-error states for every Course Player
// library listing (Modules, Notes, Mind Maps). One component each, so the
// three libraries cannot drift apart.

import { AlertCircle, FileText, LoaderCircle, Network } from "lucide-react";
import "./study-library-states.css";

export type StudyLibraryKind = "note" | "mind-map";

export function StudyLibraryEmptyState({
  kind,
  title,
  description,
}: {
  kind: StudyLibraryKind;
  title: string;
  description: string;
}) {
  const Icon = kind === "note" ? FileText : Network;
  return (
    <div className="study-library-empty" data-study-library-empty data-resource-kind={kind}>
      <span className="study-library-empty__icon" aria-hidden="true"><Icon size={23} strokeWidth={1.9} /></span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function StudyLibraryNotice({
  state,
  title,
  message,
  onRetry,
}: {
  state: "loading" | "error";
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  const icon = state === "loading"
    ? <LoaderCircle size={16} aria-hidden="true" />
    : <AlertCircle size={16} aria-hidden="true" />;
  return (
    <div className={`study-library-notice study-library-notice--${state}`} role={state === "error" ? "alert" : "status"} data-study-library-notice={state}>
      <span className="study-library-notice__icon" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="study-library-notice__title">{title}</p>
        <p className="study-library-notice__message">{message}</p>
      </div>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="study-library-notice__retry" data-study-library-retry>
          Try again
        </button>
      ) : null}
    </div>
  );
}
