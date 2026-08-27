"use client";

import { AdminLink as Link } from "@/lib/admin/router";
import { useEffect, useState } from "react";
import {
  DangerButton,
  ErrorState,
  KeyValue,
  LoadingState,
  Pill,
  PrimaryButton,
  SectionCard,
} from "@/components/admin/ui";
import { useConfirm, useConnectionStatus, useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";
import { useAuth } from "@/context/AuthContext";
import { clearAdminSession } from "@/utils/adminSession";

type SessionInfo = {
  email: string;
  role: string;
  adminId: number;
  createdAt: string;
  lastVerifiedAt: string;
};

export default function AdminSessionPage() {
  const { logout } = useAuth();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const confirm = useConfirm();
  const { notify } = useToast();
  const { online } = useConnectionStatus();

  const load = async () => {
    setError(null);
    try {
      const res = await adminFetch<SessionInfo>("/api/admin/auth/session");
      setSession(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function reVerify() {
    setVerifying(true);
    try {
      await adminFetch("/api/admin/auth/session");
      await load();
      notify("success", "Session verified.");
    } catch {
      notify("error", "Session verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleLogout() {
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
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!session) return <LoadingState label="Loading session info…" />;

  const sessionExpiryEstimate = session.createdAt
    ? new Date(new Date(session.createdAt).getTime() + 12 * 60 * 60 * 1000).toLocaleString()
    : "Unknown";

  return (
    <div className="space-y-3 pb-6 lg:space-y-4">
      <SectionCard title="Admin session details">
        <KeyValue label="Email" value={session.email} />
        <KeyValue label="Admin ID" value={session.adminId} />
        <KeyValue label="Role" value={<Pill tone="success">{session.role}</Pill>} />
        <KeyValue
          label="Session status"
          value={<Pill tone="success">Active</Pill>}
        />
        <KeyValue
          label="Connection"
          value={
            <Pill tone={online ? "success" : "danger"}>
              {online ? "Connected" : "Offline"}
            </Pill>
          }
        />
        <KeyValue label="Login time" value={new Date(session.createdAt).toLocaleString()} />
        <KeyValue label="Last verified" value={new Date(session.lastVerifiedAt).toLocaleString()} />
        <KeyValue label="Expiry ceiling" value={sessionExpiryEstimate} />
      </SectionCard>

      <SectionCard title="Actions">
        <div className="space-y-2">
          <PrimaryButton className="w-full" loading={verifying} onClick={reVerify}>
            Re-verify session
          </PrimaryButton>
          <Link
            href="/"
            className="flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 text-sm font-medium text-slate-700 active:bg-slate-100"
          >
            ← Back to main app
          </Link>
          <DangerButton className="w-full" onClick={handleLogout}>
            Log out
          </DangerButton>
        </div>
      </SectionCard>

      <SectionCard title="Security note">
        <p className="text-xs text-slate-500">
          This session page displays identity and connection information
          only. Passwords, session tokens, cookie values, API keys, and
          Firebase tokens are never shown in the browser.
        </p>
      </SectionCard>
    </div>
  );
}
