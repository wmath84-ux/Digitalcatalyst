import { useEffect, useId, useRef, useState } from "react";
import { Library, Plus } from "lucide-react";
import { BagIcon, CalendarIcon, FlowPathIcon, HomeIcon, SparkBookIcon, StoreIcon, UserIcon } from "./icons";
import type { GlassDockItem } from "./glass-dock/GlassDock";
import "./youtube-footer-nav.css";

type FooterPosition = "absolute" | "fixed";

type Props = {
  label?: string;
  items: GlassDockItem[];
  position?: FooterPosition;
  dataAttrs?: Record<string, string | undefined>;
};

const QUICK_ACTIONS = [
  { id: "myday", label: "My Day", route: "#/my-day", Icon: CalendarIcon },
  { id: "study-library", label: "My Study Library", route: "#/study-library", Icon: Library },
  { id: "revision", label: "Revision", route: "#/revision", Icon: SparkBookIcon },
  { id: "flowpath", label: "FlowPath", route: "#/flowpath", Icon: FlowPathIcon },
] as const;

const PRIMARY_TABS = [
  { id: "home", label: "Home", route: "#/home", Icon: HomeIcon },
  { id: "store", label: "Store", route: "#/store", Icon: StoreIcon },
  { id: "purchases", label: "Purchases", route: "#/store/purchases", Icon: BagIcon },
  { id: "profile", label: "You", route: "#/profile", Icon: UserIcon },
] as const;

function activeFromHash(hash: string): string | null {
  if (hash.startsWith("#/store/purchases")) return "purchases";
  if (!hash || hash === "#" || hash === "#/" || hash.startsWith("#/home") || hash.startsWith("#/leaderboard")) return "home";
  if (
    hash.startsWith("#/store") || hash.startsWith("#/product") || hash.startsWith("#/cart")
    || hash.startsWith("#/favorites") || hash.startsWith("#/checkout") || hash.startsWith("#/subscription")
  ) return "store";
  if (
    hash.startsWith("#/profile") || hash.startsWith("#/settings") || hash.startsWith("#/usage-limits")
    || hash.startsWith("#/learner")
  ) return "profile";
  if (
    hash.startsWith("#/my-day") || hash.startsWith("#/study-library")
    || hash.startsWith("#/revision") || hash.startsWith("#/flowpath")
  ) return "quick";
  return null;
}

function shortcutFromHash(hash: string): string | null {
  if (hash.startsWith("#/my-day")) return "myday";
  if (hash.startsWith("#/study-library")) return "study-library";
  if (hash.startsWith("#/revision")) return "revision";
  if (hash.startsWith("#/flowpath")) return "flowpath";
  return null;
}

function formatBadge(badge: number | undefined): string | null {
  if (!badge || badge < 1) return null;
  return badge > 99 ? "99+" : String(badge);
}

/**
 * Full-bleed, edge-attached mobile navigation inspired by YouTube's bottom bar.
 * Primary destinations are stable on every screen, including nested revision
 * and cart pages. The center action preserves access to the app's quick routes.
 */
export default function YoutubeFooterNav({
  label = "Primary navigation",
  items,
  position = "absolute",
  dataAttrs,
}: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const shouldFocusMenuRef = useRef(false);
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
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
    if (!menuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)
        || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const buttons = Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? buttons.length - 1
          : (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[nextIndex]?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || !shouldFocusMenuRef.current) return;
    shouldFocusMenuRef.current = false;
    menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]')?.focus();
  }, [menuOpen]);

  const active = activeFromHash(currentHash);
  const activeShortcut = shortcutFromHash(currentHash);
  const positionClass = position === "fixed" ? "dc-youtube-footer-nav--fixed" : "dc-youtube-footer-nav--absolute";
  const storeBadge = formatBadge(items.find((item) => item.id === "store")?.badge);
  const purchasesBadge = formatBadge(items.find((item) => item.id === "purchases")?.badge);

  const renderTab = (tab: (typeof PRIMARY_TABS)[number]) => {
    const Icon = tab.Icon;
    const badge = tab.id === "store" ? storeBadge : tab.id === "purchases" ? purchasesBadge : null;
    const isActive = active === tab.id;
    return (
      <button
        key={tab.id}
        type="button"
        className="dc-youtube-footer-tab"
        data-youtube-tab={tab.id}
        aria-label={badge ? tab.label + ", " + badge + " items" : tab.label}
        aria-current={isActive ? "page" : undefined}
        title={tab.label}
        onClick={() => {
          setMenuOpen(false);
          window.location.hash = tab.route;
        }}
      >
        <span className="dc-youtube-footer-icon" aria-hidden="true">
          <Icon />
          {badge ? <span className="dc-youtube-footer-badge">{badge}</span> : null}
        </span>
        <span className="dc-youtube-footer-label">{tab.label}</span>
      </button>
    );
  };

  return (
    <nav
      ref={rootRef}
      data-site-footer-nav
      data-footer-nav-design="youtube"
      data-dock-count="5"
      {...dataAttrs}
      className={"dc-youtube-footer-nav " + positionClass}
      aria-label={label}
    >
      <div data-site-footer className="dc-youtube-footer">
        {renderTab(PRIMARY_TABS[0])}
        {renderTab(PRIMARY_TABS[1])}
        <div className="dc-youtube-footer-action-anchor">
          <button
            ref={triggerRef}
            type="button"
            className="dc-youtube-footer-tab dc-youtube-footer-create"
            data-youtube-tab="quick"
            data-active={active === "quick" ? "true" : undefined}
            aria-label="Quick actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            title="Quick actions"
            onClick={() => setMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (!menuOpen && (event.key === "Enter" || event.key === " " || event.key === "Spacebar")) {
                shouldFocusMenuRef.current = true;
              }
            }}
          >
            <span className="dc-youtube-footer-create-icon" aria-hidden="true">
              <Plus size={25} strokeWidth={2.25} />
            </span>
          </button>
          <div
            ref={menuRef}
            id={menuId}
            className="dc-youtube-footer-quick-menu"
            data-open={menuOpen ? "true" : "false"}
            role="menu"
            aria-label="Quick actions"
            aria-hidden={!menuOpen}
          >
            {QUICK_ACTIONS.map((item) => {
              const Icon = item.Icon;
              const selected = activeShortcut === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  tabIndex={menuOpen ? 0 : -1}
                  aria-current={selected ? "page" : undefined}
                  className="dc-youtube-footer-quick-item"
                  onClick={() => {
                    setMenuOpen(false);
                    window.location.hash = item.route;
                  }}
                >
                  <span className="dc-youtube-footer-quick-icon" aria-hidden="true"><Icon /></span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {renderTab(PRIMARY_TABS[2])}
        {renderTab(PRIMARY_TABS[3])}
      </div>
    </nav>
  );
}
