import { useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { UserIcon } from "./icons";
import type { GlassDockItem } from "./glass-dock/GlassDock";
import "./youtube-footer-nav.css";

type FooterPosition = "absolute" | "fixed";

type Props = {
  label?: string;
  items: GlassDockItem[];
  onSelect: (id: string) => void;
  position?: FooterPosition;
  dataAttrs?: Record<string, string | undefined>;
};

const QUICK_ACTION_IDS = ["myday", "study-library", "revision", "flowpath"] as const;

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
 * The center action exposes the app's secondary destinations so none of the
 * existing routes are removed when the five-slot layout is selected.
 */
export default function YoutubeFooterNav({
  label = "Primary navigation",
  items,
  onSelect,
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
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      triggerRef.current?.focus();
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

  const primaryItem = (id: string) => items.find((item) => item.id === id);
  const renderTab = (id: string, labelText: string) => {
    const item = primaryItem(id);
    if (!item) return null;
    const Icon = item.icon;
    const badge = formatBadge(item.badge);
    const isActive = active === id;
    return (
      <button
        key={id}
        type="button"
        className="dc-youtube-footer-tab"
        data-youtube-tab={id}
        aria-label={badge ? labelText + ", " + badge + " items" : labelText}
        aria-current={isActive ? "page" : undefined}
        title={labelText}
        onClick={() => {
          setMenuOpen(false);
          onSelect(id);
        }}
      >
        <span className="dc-youtube-footer-icon" aria-hidden="true">
          <Icon size={22} />
          {badge ? <span className="dc-youtube-footer-badge">{badge}</span> : null}
        </span>
        <span className="dc-youtube-footer-label">{labelText}</span>
      </button>
    );
  };

  const quickActions = QUICK_ACTION_IDS
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is GlassDockItem => Boolean(item));

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
        {renderTab("home", "Home")}
        {renderTab("store", "Store")}
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
            {quickActions.map((item) => {
              const Icon = item.icon;
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
                    onSelect(item.id);
                  }}
                >
                  <span className="dc-youtube-footer-quick-icon" aria-hidden="true"><Icon size={21} /></span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {renderTab("purchases", "Purchases")}
        <button
          type="button"
          className="dc-youtube-footer-tab"
          data-youtube-tab="profile"
          aria-label="Profile"
          aria-current={active === "profile" ? "page" : undefined}
          title="Profile"
          onClick={() => {
            setMenuOpen(false);
            onSelect("profile");
          }}
        >
          <span className="dc-youtube-footer-icon" aria-hidden="true"><UserIcon /></span>
          <span className="dc-youtube-footer-label">You</span>
        </button>
      </div>
    </nav>
  );
}
