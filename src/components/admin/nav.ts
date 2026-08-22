export const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/products", label: "Products & Course Content", icon: "🎓" },
  { href: "/admin/orders", label: "Orders", icon: "🧾" },
  { href: "/admin/customers", label: "Customers", icon: "👥" },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: "💳" },
  { href: "/admin/coupons", label: "Coupons", icon: "🏷️" },
  { href: "/admin/reviews", label: "Reviews", icon: "⭐" },
  { href: "/admin/analytics", label: "Analytics & Reports", icon: "📈" },
  { href: "/admin/revision", label: "Revision · AI & Curriculum", icon: "🧠" },
  { href: "/admin/content", label: "Course Player Controls", icon: "🧩" },
  { href: "/admin/branding", label: "App Branding", icon: "🎨" },
  { href: "/admin/session", label: "Admin Session", icon: "🔐" },
] as const;

export function titleForPath(pathname: string): string {
  const exact = ADMIN_NAV.find((item) => item.href === pathname);
  if (exact) return exact.label;
  const match = [...ADMIN_NAV].reverse().find((item) => item.href !== "/admin" && pathname.startsWith(item.href));
  return match?.label ?? "Admin";
}
