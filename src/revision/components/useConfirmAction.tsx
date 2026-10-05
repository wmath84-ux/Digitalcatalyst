/**
 * Confirmation dialog in the ported Recall style.
 *
 * The retired Revision screens used the app's glass dialog. Destructive actions
 * inside Revision (delete a saved test, reset local data) must now look like the
 * rest of the feature, and the business rule is unchanged: nothing destructive
 * runs without an explicit confirm, and the confirm names the exact thing being
 * deleted.
 *
 * Usage:
 *   const { confirm, dialog } = useConfirmAction();
 *   confirm({ title, body, confirmLabel, onConfirm });
 *   … render {dialog} once inside the page.
 */

import { useCallback, useState, type ReactNode } from "react";

import { Button } from "../recall/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../recall/components/ui/alert-dialog";
import { typeClass } from "../recall/lib/surface";

export interface ConfirmRequest {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `destructive` renders the confirm action in the error colour. */
  tone?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
}

export function useConfirmAction() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = useCallback((next: ConfirmRequest) => setRequest(next), []);

  const dialog = (
    <AlertDialog
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open && !busy) setRequest(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className={typeClass["title-md"]}>{request?.title}</AlertDialogTitle>
          {request?.body ? (
            <AlertDialogDescription className={typeClass["body-md"]}>{request.body}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-5 flex gap-3">
          <AlertDialogCancel asChild>
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setRequest(null)}>
              {request?.cancelLabel ?? "Cancel"}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              className="flex-1"
              variant={request?.tone === "destructive" ? "destructive" : "default"}
              disabled={busy}
              onClick={async () => {
                const action = request;
                if (!action) return;
                setBusy(true);
                try {
                  await action.onConfirm();
                } finally {
                  setBusy(false);
                  setRequest(null);
                }
              }}
            >
              {request?.confirmLabel ?? "Confirm"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
