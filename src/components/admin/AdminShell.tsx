"use client";

import { AdminLink as Link, useAdminPathname as usePathname, useAdminRouter as useRouter } from "@/lib/admin/router";
import { useAuth } from "@/context/AuthContext";
import { clearAdminSession } from "@/utils/adminSession";
import { useEffect, useState } from "react";
import { ADMIN_NAV, titleForPath } from "@/components/admin/nav";
import { useConfirm, useConnectionStatus, useToast, useUnsavedGuard } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

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

  return (
    <div className="min-h-screen bg-slate-50 pb-[calc(env(safe-area-inset-bottom)+8px)]">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[480px] items-center gap-2 px-3">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-lg active:bg-slate-100"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-slate-900">{title}</p>
          </div>
          <span
            title={online ? "Realtime sync connected" : "Connection lost"}
            className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-red-500"}`}
          />
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-3 py-3">{children}</main>

      {navOpen && (
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
      )}
    </div>
  );
}
