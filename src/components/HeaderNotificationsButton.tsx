import { Bell } from "lucide-react";
import "./header-navigation.css";

export default function HeaderNotificationsButton({
  count = 0,
  onClick,
  size = 40,
  className = "",
}: {
  count?: number;
  onClick: () => void;
  /** Keep the hit target identical to the replaced header control. */
  size?: 36 | 40;
  className?: string;
}) {
  const unreadCount = Math.max(0, Math.floor(count));
  const badge = unreadCount > 99 ? "99+" : String(unreadCount);
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";
  const isCurrent = typeof window !== "undefined" && window.location.hash.startsWith("#/notifications");

  return (
    <button
      type="button"
      className={`dc-header-glass-button dc-header-notifications-button ${className}`.trim()}
      data-header-glass-button="notifications"
      data-button-size={size}
      aria-label={label}
      aria-current={isCurrent ? "page" : undefined}
      title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "Notifications"}
      onClick={onClick}
    >
      <Bell aria-hidden="true" size={40} strokeWidth={2.1} />
      {unreadCount > 0 ? (
        <span className="dc-header-notifications-badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
