import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { profilePhotoSrc } from "../utils/profilePhoto";
import GlassSidebar, { type GlassSidebarItem } from "./glass-dock/GlassSidebar";

export type MobileHeaderMenuItem = {
  id: string;
  label: string;
  ariaLabel?: string;
  icon: ReactNode;
  badge?: string;
  color?: string;
};

const ACTION_COLORS: Record<string, string> = {
  search: "#3A86FF",
  download: "#06D6A0",
  cart: "#FFBE0B",
  notifications: "#B388FF",
  subscription: "#C9A96E",
  help: "#38BDF8",
  leaderboard: "#FFBE0B",
  profile: "#FF7B54",
  favorites: "#FF5C8A",
  settings: "#9AA5B1",
  "usage-limits": "#8B7CF6",
};

/**
 * The phone-only counterpart to the tablet Glass Sidebar. The normal
 * header keeps just its profile-avatar menu trigger; contextual header actions
 * are listed inside this glass drawer. The desktop/tablet cluster is unchanged.
 */
export default function MobileHeaderMenu({
  items,
  activeId = null,
  onSelect,
  extraContent,
  className = "",
  ariaLabel = "Header actions",
}: {
  items: MobileHeaderMenuItem[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  /** Any bespoke header action (for example Mark all read / Profile). */
  extraContent?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const drawerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const photoSrc = profilePhotoSrc(user?.photoURL);
  const initials = user?.name
    ?.trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

  useEffect(() => setPhotoFailed(false), [photoSrc]);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const sidebarItems: GlassSidebarItem[] = useMemo(
    () => items.map((item) => ({
      id: item.id,
      label: item.label,
      ariaLabel: item.ariaLabel,
      color: item.color ?? ACTION_COLORS[item.id] ?? "#3A86FF",
      icon: item.icon,
      active: item.id === activeId,
      badge: item.badge,
    })),
    [items, activeId],
  );

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const closeAtTabletWidth = () => {
      if (window.innerWidth >= 640) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", closeAtTabletWidth);
    window.addEventListener("orientationchange", closeAtTabletWidth);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", closeAtTabletWidth);
      window.removeEventListener("orientationchange", closeAtTabletWidth);
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    };
  }, [open]);

  const drawer = (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="mobile-header-menu"
          className="fixed inset-0 z-[1000] min-[640px]:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          data-mobile-header-drawer-root
        >
          <motion.button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-[3px]"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            data-mobile-header-drawer-backdrop
          />
          <motion.div
            ref={dialogRef}
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className="absolute inset-y-0 left-0 z-10 w-[232px] max-w-[calc(100vw-12px)] pl-3"
            style={{
              paddingTop: "max(12px, env(safe-area-inset-top))",
              paddingBottom: "max(12px, env(safe-area-inset-bottom))",
            }}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            data-mobile-header-drawer
          >
            <GlassSidebar
              items={sidebarItems}
              open
              remember={false}
              showToggle={false}
              onSelect={(id) => {
                setOpen(false);
                onSelect(id);
              }}
              header={(
                <div className="flex min-w-0 items-center justify-between gap-2 py-1">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-black uppercase tracking-[0.14em] text-white/90">Quick actions</p>
                    <p className="mt-0.5 truncate text-[10px] font-semibold text-white/50">{items.length} available</p>
                  </div>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.07] text-white/75 transition hover:bg-white/[0.12] hover:text-white"
                    data-mobile-header-drawer-close
                  >
                    <X size={17} />
                  </button>
                </div>
              )}
              footer={extraContent ? (
                <div className="flex min-h-10 items-center justify-center border-t border-white/10 pt-2">
                  {extraContent}
                </div>
              ) : undefined}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close menu" : "Open menu"}
        title={open ? "Close quick actions" : "Open quick actions"}
        aria-expanded={open}
        aria-controls={drawerId}
        className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${className}`}
        data-mobile-header-menu-button
      >
        {photoSrc && !photoFailed ? (
          <img
            src={photoSrc}
            alt=""
            width={40}
            height={40}
            className="h-full w-full rounded-full object-cover"
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setPhotoFailed(true)}
            data-mobile-header-avatar
          />
        ) : (
          <span aria-hidden="true" data-mobile-header-avatar-fallback>{initials}</span>
        )}
      </button>
      {typeof document !== "undefined" && open ? createPortal(drawer, document.body) : null}
    </>
  );
}
