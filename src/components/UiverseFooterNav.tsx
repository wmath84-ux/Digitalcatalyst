import { useEffect, useId, useRef, useState } from "react";
import { Library } from "lucide-react";
import { BagIcon, CalendarIcon, FlowPathIcon, HomeIcon, SparkBookIcon, StoreIcon, UserIcon } from "./icons";
import { PopoverItem } from "./ui/glass-popover";
import "./uiverse-footer-nav.css";

type FooterTab = "home" | "store" | "purchases" | "profile";
type FooterPosition = "absolute" | "fixed";

type Props = {
  label?: string;
  purchasesBadge?: number;
  position?: FooterPosition;
  dataAttrs?: Record<string, string | undefined>;
};

const PROFILE_SHORTCUTS = [
  { id: "my-day", label: "My Day", Icon: CalendarIcon },
  { id: "study-library", label: "My Study Library", Icon: Library },
  { id: "revision", label: "Revision", Icon: SparkBookIcon },
  { id: "flowpath", label: "FlowPath", Icon: FlowPathIcon },
] as const;

function routeForTab(tab: FooterTab): string {
  if (tab === "home") return "#/home";
  if (tab === "store") return "#/store";
  if (tab === "purchases") return "#/store/purchases";
  return "#/profile";
}

function activeTabForHash(hash: string): FooterTab | null {
  if (hash.startsWith("#/store/purchases")) return "purchases";
  if (hash === "#/" || hash.startsWith("#/home") || hash.startsWith("#/leaderboard")) return "home";
  if (
    hash.startsWith("#/store") || hash.startsWith("#/product") || hash.startsWith("#/cart")
    || hash.startsWith("#/favorites") || hash.startsWith("#/checkout")
  ) return "store";
  if (
    hash.startsWith("#/profile") || hash.startsWith("#/settings") || hash.startsWith("#/usage-limits")
    || hash.startsWith("#/my-day") || hash.startsWith("#/study-library") || hash.startsWith("#/revision")
    || hash.startsWith("#/flowpath")
  ) return "profile";
  return null;
}

function navigate(hash: string) {
  window.location.hash = hash;
}

export default function UiverseFooterNav({
  label = "Primary navigation",
  purchasesBadge = 0,
  position = "absolute",
  dataAttrs,
}: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const clickTimeRef = useRef<number | null>(null);
  const clickExpiryRef = useRef<number | null>(null);
  const keyboardMenuOpenRef = useRef(false);
  const menuId = useId();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState(() => typeof window === "undefined" ? "" : window.location.hash);

  useEffect(() => {
    const updateHash = () => setCurrentHash(window.location.hash);
    window.addEventListener("hashchange", updateHash);
    window.addEventListener("popstate", updateHash);
    return () => {
      window.removeEventListener("hashchange", updateHash);
      window.removeEventListener("popstate", updateHash);
    };
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) return;
      setProfileMenuOpen(false);
      clickTimeRef.current = null;
      if (clickExpiryRef.current !== null) window.clearTimeout(clickExpiryRef.current);
      clickExpiryRef.current = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        clickTimeRef.current = null;
        profileButtonRef.current?.focus();
        return;
      }
      if (!(event.target instanceof Node) || !profileMenuRef.current?.contains(event.target) || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const buttons = Array.from(profileMenuRef.current?.querySelectorAll<HTMLButtonElement>("button[role='menuitem']") ?? []);
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? buttons.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[nextIndex]?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!profileMenuOpen || !keyboardMenuOpenRef.current) return;
    keyboardMenuOpenRef.current = false;
    profileMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [profileMenuOpen]);

  useEffect(() => () => {
    if (clickExpiryRef.current !== null) window.clearTimeout(clickExpiryRef.current);
  }, []);

  const openProfile = () => {
    setProfileMenuOpen(false);
    keyboardMenuOpenRef.current = false;
    clickTimeRef.current = null;
    if (clickExpiryRef.current !== null) window.clearTimeout(clickExpiryRef.current);
    clickExpiryRef.current = null;
    navigate("#/profile");
  };

  const handleProfileClick = () => {
    const now = Date.now();
    const previous = clickTimeRef.current;
    if (previous !== null && now - previous <= 340) {
      openProfile();
      return;
    }

    clickTimeRef.current = now;
    setProfileMenuOpen((open) => !open);
    if (clickExpiryRef.current !== null) window.clearTimeout(clickExpiryRef.current);
    clickExpiryRef.current = window.setTimeout(() => {
      clickTimeRef.current = null;
      clickExpiryRef.current = null;
    }, 340);
  };

  const active = activeTabForHash(currentHash);
  const positionClass = position === "fixed" ? "dc-uiverse-footer-nav--fixed" : "dc-uiverse-footer-nav--absolute";

  return (
    <nav
      ref={rootRef}
      data-site-footer-nav
      data-footer-nav-design="uiverse"
      data-dock-count="4"
      {...dataAttrs}
      className={`dc-uiverse-footer-nav ${positionClass}`}
      aria-label={label}
    >
      <div data-site-footer className="dc-uiverse-footer">
        <button
          type="button"
          className="dc-uiverse-footer-tab"
          data-uiverse-tab="home"
          aria-label="Home"
          aria-current={active === "home" ? "page" : undefined}
          title="Home"
          onClick={() => navigate(routeForTab("home"))}
        >
          <HomeIcon aria-hidden="true" />
          <span>Home</span>
        </button>
        <button
          type="button"
          className="dc-uiverse-footer-tab"
          data-uiverse-tab="store"
          aria-label="Store"
          aria-current={active === "store" ? "page" : undefined}
          title="Store"
          onClick={() => navigate(routeForTab("store"))}
        >
          <StoreIcon aria-hidden="true" />
          <span>Store</span>
        </button>
        <button
          type="button"
          className="dc-uiverse-footer-tab"
          data-uiverse-tab="purchases"
          aria-label="My Purchases"
          aria-current={active === "purchases" ? "page" : undefined}
          title={purchasesBadge > 0 ? `${purchasesBadge} purchased items` : "My Purchases"}
          onClick={() => navigate(routeForTab("purchases"))}
        >
          <BagIcon aria-hidden="true" />
          <span>My Purchases</span>
          {purchasesBadge > 0 ? <span className="dc-uiverse-footer-badge" aria-hidden="true">{purchasesBadge > 99 ? "99+" : purchasesBadge}</span> : null}
        </button>
        <div className="dc-uiverse-profile-anchor" data-uiverse-profile-anchor>
          <div
            ref={profileMenuRef}
            id={menuId}
            className="dc-compact-glass-window dc-uiverse-profile-menu"
            data-open={profileMenuOpen ? "true" : "false"}
            role="menu"
            aria-label="Profile shortcuts"
            aria-hidden={!profileMenuOpen}
          >
            {PROFILE_SHORTCUTS.map(({ id, label: itemLabel, Icon }) => (
              <PopoverItem
                key={id}
                role="menuitem"
                tabIndex={profileMenuOpen ? 0 : -1}
                aria-label={itemLabel}
                title={itemLabel}
                className="dc-footer-profile-action"
                onClick={() => {
                  setProfileMenuOpen(false);
                  clickTimeRef.current = null;
                  if (clickExpiryRef.current !== null) window.clearTimeout(clickExpiryRef.current);
                  clickExpiryRef.current = null;
                  navigate(`#/${id}`);
                }}
              >
                <Icon aria-hidden="true" className="dc-footer-profile-icon" />
                <span className="dc-footer-profile-action-label">{itemLabel}</span>
              </PopoverItem>
            ))}
          </div>
          <button
            ref={profileButtonRef}
            type="button"
            className="dc-uiverse-footer-tab dc-uiverse-profile-tab"
            data-uiverse-tab="profile"
            aria-label="Profile shortcuts; double-click or double-tap to open Profile"
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            aria-controls={menuId}
            aria-keyshortcuts="Alt+Enter"
            aria-current={active === "profile" ? "page" : undefined}
            title="Tap for learning shortcuts · double-tap to open Profile"
            onClick={handleProfileClick}
            onDoubleClick={(event) => {
              event.preventDefault();
              openProfile();
            }}
            onKeyDown={(event) => {
              if (event.altKey && event.key === "Enter") {
                event.preventDefault();
                openProfile();
              } else if (!profileMenuOpen && ["Enter", " ", "Space", "Spacebar"].includes(event.key)) {
                keyboardMenuOpenRef.current = true;
              }
            }}
          >
            <UserIcon aria-hidden="true" />
            <span>Profile</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
