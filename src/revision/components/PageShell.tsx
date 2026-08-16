import type { ReactNode } from "react";
import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

export default function PageShell({
  title,
  subtitle,
  backHref,
  rightSlot,
  children,
  hideNav,
  route,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  hideNav?: boolean;
  route: string;
}) {
  return (
    <>
      <AppHeader title={title} subtitle={subtitle} backHref={backHref} rightSlot={rightSlot} />
      <main className="no-scrollbar flex-1 overflow-y-auto overscroll-contain">{children}</main>
      {!hideNav && <BottomNav route={route} />}
    </>
  );
}
