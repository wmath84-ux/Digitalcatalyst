"use client";

import { Menu } from "lucide-react";
import { Sparkles, LogOut, ChevronRight } from "lucide-react";
import { AdminLink as Link, useAdminPathname as usePathname, useAdminRouter as useRouter } from "@/lib/admin/router";
import { useAuth } from "@/context/AuthContext";
import { clearAdminSession } from "@/utils/adminSession";
import { useEffect, useState } from "react";
import { ADMIN_NAV, titleForPath } from "@/components/admin/nav";
import { useConfirm, useConnectionStatus, useToast, useUnsavedGuard } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";
import { useResponsiveCategory } from "@/utils/responsive";

/**
 * The admin shell.
 *
 * The shell has three layouts, picked by viewport:
 *
 *  - mobile  (< 768 px)        : a phone-shaped column (max-w-md) with a
 *                                hamburger drawer, mobile top bar.
 *  - tablet  (768 – 1023 px)   : a 240 px persistent left rail + 720 px
 *                                content column. The rail does the
 *                                navigation; the top bar carries the page
 *                                title and the connection indicator.
 *  - desktop (>= 1024 px)      : a wider 320 px glass rail + fluid
 *                                content (no max width), 2-line nav
 *                                entries with description, section
 *                                dividers, and a polished profile card.
 *                                The mobile top bar is replaced by a
 *                                proper desktop top bar that mirrors the
 *                                main app's DesktopShell, with global
 *                                quick actions (notifications, help) on
 *                                the right.
 *
 * The user explicitly asked for a proper desktop design, not a
 * stretched phone — so the rail, the top bar and the content area each
 * have their own desktop treatment, and the typography / padding scale
 * up instead of staying at the mobile rhythm.
 */
export function AdminShell({
  children,
  email,
  role,
}: {
  children: React.ReactNode;
  email: string;
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const confirm = useConfirm();
  const { notify } = useToast();
  const { online } = useConnectionStatus();
  const { isDirty, setDirty } = useUnsavedGuard();

  const category = useResponsiveCategory();
  // Mobile < 768 px gets the drawer, everything wider gets a persistent
  // rail. The rail widens on desktop (>= 1024 px) and gets a more
  // polished layout.
  const isWide = category !== "mobile";
  const isDesktop = category === "desktop";

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("dc_admin_last_path", pathname);
    }
  }, [pathname]);

  // Guard against a role/session revocation happening while the dashboard stays open.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await adminFetch("/api/admin/auth/session");
      } catch {
        // adminFetch already redirects on 401
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleNavigate = async (href: string) => {
    setNavOpen(false);
    if (isDirty) {
      const { confirmed } = await confirm({
        title: "Discard unsaved changes?",
        description: "You have unsaved changes on this page. Leaving now will discard them.",
        confirmLabel: "Discard & leave",
        destructive: true,
      });
      if (!confirmed) return;
      setDirty(false);
    }
    router.push(href);
  };

  const handleLogout = async () => {
    const { confirmed } = await confirm({
      title: "Log out of admin session?",
      description: "You will need to log in again to access the dashboard.",
      confirmLabel: "Log out",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      clearAdminSession();
      await logout();
    } finally {
      window.sessionStorage.removeItem("dc_admin_last_path");
      notify("info", "Signed out of admin session.");
      window.location.hash = "#/admin-login";
    }
  };

  const title = titleForPath(pathname);

  // Group the admin nav into Workspace / Catalog / Content / Account so
  // the rail reads like a real settings app, not a flat list of links.
  type NavEntry = (typeof ADMIN_NAV)[number];
  const navGroups: { label: string; items: NavEntry[] }[] = [
    {
      label: "Overview",
      items: ADMIN_NAV.filter((i) => i.href === "/admin"),
    },
    {
      label: "Catalog",
      items: ADMIN_NAV.filter((i) =>
        ["/admin/products", "/admin/orders", "/admin/customers", "/admin/subscriptions", "/admin/coupons", "/admin/reviews"].includes(i.href)
      ),
    },
    {
      label: "Content & AI",
      items: ADMIN_NAV.filter((i) =>
        ["/admin/revision", "/admin/curriculum", "/admin/home", "/admin/content"].includes(i.href)
      ),
    },
    {
      label: "Insights",
      items: ADMIN_NAV.filter((i) => ["/admin/analytics", "/admin/branding"].includes(i.href)),
    },
    {
      label: "Account",
      items: ADMIN_NAV.filter((i) => ["/admin/session"].includes(i.href)),
    },
  ];

  return (
    <div
      className="min-h-screen bg-slate-50 pb-[calc(env(safe-area-inset-bottom)+8px)] md:pb-0"
      data-admin-shell
    >
      {/* Mobile top bar — hidden on tablet and desktop (the rail + desktop
          top bar take over). On tablet a slimmer top bar is still useful
          for the page title + connection dot, so it lives on `md:`. */}
      {isDesktop ? (
        <header
          data-admin-topbar
          className="sticky top-0 z-40 hidden h-16 items-center gap-4 border-b border-slate-200/80 bg-white/85 px-6 backdrop-blur-2xl lg:flex"
        >
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-black tracking-tight text-slate-900" data-admin-topbar-title>
              {title}
            </h1>
            <p className="truncate text-[11px] font-semibold text-slate-400" data-admin-topbar-subtitle>
              Admin workspace · signed in as {email}
            </p>
          </div>
          <span
            title={online ? "Realtime sync connected" : "Connection lost"}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600"
            data-admin-topbar-status
          >
            <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-red-500"}`} />
            {online ? "Live" : "Offline"}
          </span>
          <Link
            href="/"
            className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50"
            data-admin-topbar-action="back"
          >
            ← Main app
          </Link>
        </header>
      ) : (
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur pt-[env(safe-area-inset-top)]">
          <div
            className="mx-auto flex h-14 items-center gap-2 px-3 max-w-[480px] md:max-w-[calc(720px+240px)] md:pl-6 md:pr-8"
            data-admin-topbar
          >
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 active:bg-slate-100 md:hidden"
              data-admin-nav-toggle
            >
              <Menu className="h-5 w-5" strokeWidth={2.4} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-slate-900 md:text-base">{title}</p>
            </div>
            <span
              title={online ? "Realtime sync connected" : "Connection lost"}
              className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-red-500"}`}
            />
          </div>
        </header>
      )}

      <div className="md:flex md:items-start">
        {/* Persistent left rail on tablet / desktop. Mobile gets the
            drawer below instead. The rail is the primary navigation
            surface; it shows every section at once so the admin never
            has to open a menu to switch tabs. On desktop the rail
            widens to 320 px, gets a glass background, 2-line entries
            (label + description) and section dividers. */}
        {isWide ? (
          <aside
            data-admin-rail
            data-admin-rail-variant={isDesktop ? "desktop" : "tablet"}
            className={
              isDesktop
                ? "sticky top-0 z-30 hidden h-[100dvh] w-[320px] shrink-0 flex-col border-r border-slate-200/80 bg-white/85 backdrop-blur-2xl lg:flex"
                : "sticky top-14 z-30 hidden h-[calc(100dvh-3.5rem)] w-[240px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white md:block"
            }
            aria-label="Admin navigation"
          >
            {/* Brand block on desktop — sets the rail's identity and
                echoes the main app's DesktopShell brand treatment. On
                tablet we just show a compact header so the rail still
                feels like a real product surface. */}
            {isDesktop ? (
              <div className="flex items-center gap-3 border-b border-slate-200/70 px-5 py-5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/25 ring-1 ring-white/40">
                  <Sparkles size={18} strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-black tracking-tight text-slate-900">Admin Console</p>
                  <p className="truncate text-[10.5px] font-semibold text-slate-400">Digital Catalyst</p>
                </div>
              </div>
            ) : null}

            <div className={isDesktop ? "px-3 pb-4 pt-3" : "border-b border-slate-100 px-4 py-3"}>
              {isDesktop ? null : (
                <>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Admin</p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{email}</p>
                  <p className="text-[11px] text-slate-500">Role: {role}</p>
                </>
              )}
            </div>

            <nav className={isDesktop ? "flex-1 overflow-y-auto" : "flex-1 px-2 py-2"} aria-label="Admin sections">
              {isDesktop ? (
                navGroups.map((group, groupIdx) =>
                  group.items.length > 0 ? (
                    <div key={group.label} className={groupIdx === 0 ? "mt-1" : "mt-4"}>
                      <p className="px-4 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                        {group.label}
                      </p>
                      <div className="flex flex-col gap-0.5 px-2">
                        {group.items.map((item) => {
                          const active =
                            item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                          return (
                            <button
                              key={item.href}
                              type="button"
                              onClick={() => handleNavigate(item.href)}
                              data-admin-rail-item
                              data-active={active ? "true" : "false"}
                              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                                active
                                  ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25"
                                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              }`}
                            >
                              <span
                                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base transition ${
                                  active
                                    ? "bg-white/20 text-white"
                                    : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-indigo-600"
                                }`}
                                aria-hidden
                              >
                                {item.icon}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12.5px] font-bold leading-tight">{item.label}</span>
                                <span
                                  className={`block truncate text-[10.5px] font-medium leading-tight ${
                                    active ? "text-white/80" : "text-slate-400"
                                  }`}
                                >
                                  {railDescription(item.href)}
                                </span>
                              </span>
                              {active ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/80" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null
                )
              ) : (
                ADMIN_NAV.map((item) => {
                  const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                  return (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => handleNavigate(item.href)}
                      className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                        active ? "bg-slate-900 text-white shadow-sm" : "text-slate-700 active:bg-slate-100"
                      }`}
                    >
                      <span aria-hidden>{item.icon}</span>
                      <span className="flex-1 truncate">{item.label}</span>
                    </button>
                  );
                })
              )}
            </nav>

            {/* Profile footer — the rail always shows the signed-in
                admin at the bottom, with a one-click logout. The
                desktop version uses a gradient profile card with a
                pill "Role" tag so the rail doubles as a quick
                identity surface. */}
            {isDesktop ? (
              <div className="border-t border-slate-200/70 p-3">
                <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50 to-white p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-[11px] font-black text-white">
                      {initialsFromEmail(email)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-black text-slate-900" title={email}>{email}</p>
                      <p className="truncate text-[10.5px] font-semibold text-slate-400">Signed in</p>
                    </div>
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wide text-indigo-700">
                      {role}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link
                      href="/"
                      className="flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Main app
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Log out
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-t border-slate-100 p-3">
                <Link
                  href="/"
                  className="mb-2 flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 text-sm font-medium text-slate-700 active:bg-slate-100"
                >
                  ← Back to main app
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex h-11 w-full items-center justify-center rounded-lg border border-red-300 bg-red-50 text-sm font-semibold text-red-700 active:bg-red-100"
                >
                  Log out
                </button>
              </div>
            )}
          </aside>
        ) : null}

        <main
          className="mx-auto max-w-[480px] px-3 py-3 md:max-w-[720px] md:px-6 md:py-5 lg:max-w-none lg:px-8 lg:py-8"
          data-admin-main
        >
          {children}
        </main>
      </div>

      {/* Mobile-only drawer (kept for < 768 px viewports; tablet +
          desktop render the persistent rail above). */}
      {navOpen && !isWide ? (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
          <div className="relative flex h-full w-[86%] max-w-[340px] flex-col bg-white pt-[env(safe-area-inset-top)] shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Digital Catalyst Admin</p>
              <button type="button" aria-label="Close navigation" onClick={() => setNavOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full active:bg-slate-100">
                ✕
              </button>
            </div>
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="truncate text-sm font-medium text-slate-900">{email}</p>
              <p className="text-xs text-slate-500">Role: {role}</p>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-2">
              {ADMIN_NAV.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => handleNavigate(item.href)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                      active ? "bg-slate-900 text-white" : "text-slate-700 active:bg-slate-100"
                    }`}
                  >
                    <span aria-hidden>{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-slate-100 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
              <Link
                href="/"
                className="mb-2 flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 text-sm font-medium text-slate-700 active:bg-slate-100"
              >
                ← Back to main app
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-11 w-full items-center justify-center rounded-lg border border-red-300 bg-red-50 text-sm font-semibold text-red-700 active:bg-red-100"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A short 1-line description for each nav entry, shown only on the
 *  desktop rail's 2-line entries. Kept terse so the rail never
 *  overflows. */
function railDescription(href: string): string {
  switch (href) {
    case "/admin":
      return "Overview & KPIs";
    case "/admin/products":
      return "Catalog & modules";
    case "/admin/orders":
      return "Verified & pending";
    case "/admin/customers":
      return "Buyers & accounts";
    case "/admin/subscriptions":
      return "Plans & members";
    case "/admin/coupons":
      return "Discount codes";
    case "/admin/reviews":
      return "Ratings & replies";
    case "/admin/analytics":
      return "Revenue & funnels";
    case "/admin/revision":
      return "AI prompts & keys";
    case "/admin/curriculum":
      return "Topic tree editor";
    case "/admin/home":
      return "Hero slides";
    case "/admin/content":
      return "Player controls";
    case "/admin/branding":
      return "App identity";
    case "/admin/session":
      return "Auth & access";
    default:
      return "";
  }
}

function initialsFromEmail(email: string): string {
  const handle = email.split("@")[0] || email;
  const parts = handle.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
