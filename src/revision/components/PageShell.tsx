import type { ReactNode } from "react";
import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";
import { useRegisterRevisionHeader } from "./RevisionHeaderContext";

export default function PageShell({
  title,
  subtitle,
  backHref,
  rightSlot,
  children,
  hideNav,
  route,
  mergeIntoMainHeader = false,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  hideNav?: boolean;
  route: string;
  /**
   * Top-level tab pages (Revision, Test Bank, Weak Topics, Progress,
   * Profile) set this to render their title/subtitle/rightSlot in the shared
   * website header instead of a second stacked feature header. Pages that
   * need their own back button keep passing `backHref` and leave this off.
   */
  mergeIntoMainHeader?: boolean;
}) {
  useRegisterRevisionHeader(mergeIntoMainHeader, title, subtitle, rightSlot);
  return (
    <>
      {!mergeIntoMainHeader && (
        <AppHeader title={title} subtitle={subtitle} backHref={backHref} rightSlot={rightSlot} />
      )}
      <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</main>
      {!hideNav && <BottomNav route={route} />}
    </>
  );
}
