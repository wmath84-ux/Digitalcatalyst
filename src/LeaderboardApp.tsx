import { useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import "./leaderboard-minimal.css";
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import { useCatalog } from "./context/CatalogContext";
import { useCommerce } from "./context/CommerceContext";
import { useBranding } from "./context/BrandingContext";
import { apiFetch } from "./utils/apiBase";

type SubscriberRow = {
  uid: string;
  name: string;
  photoURL: string | null;
  planId: string;
  referralCode: string;
  usedCount: number;
  available: boolean;
};

type UserRow = {
  uid: string;
  name: string;
  photoURL: string | null;
};

type View = "all" | "subscribers" | "unused";

function Avatar({
  name,
  photoURL,
  size = 44,
}: {
  name: string;
  photoURL: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = photoURL && photoURL.trim() && !failed ? photoURL.trim() : "";
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="grid place-items-center rounded-full bg-violet-100 font-black text-violet-700"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {(name || "U").slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function LeaderboardApp() {
  const { cartIds } = useCommerce();
  const { purchasedIds } = useCatalog();
  const { appName } = useBranding();
  const [view, setView] = useState<View>("all");
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedReferralCode, setCopiedReferralCode] = useState("");
  const [copyError, setCopyError] = useState("");
  const [revision, setRevision] = useState(0);

  const copyReferralCode = async (code: string) => {
    if (!code) return;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard is unavailable");
      await navigator.clipboard.writeText(code);
      setCopyError("");
      setCopiedReferralCode(code);
      window.setTimeout(
        () =>
          setCopiedReferralCode((current) => (current === code ? "" : current)),
        1400
      );
    } catch {
      setCopiedReferralCode("");
      setCopyError(
        "Could not copy the code. Select the referral ID to copy it manually."
      );
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await apiFetch("/api/referral-leaderboard");
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          subscribers?: SubscriberRow[];
          users?: UserRow[];
          error?: string;
          code?: string;
        };
        if (response.ok && data.ok) {
          if (!cancelled) {
            setSubscribers(
              Array.isArray(data.subscribers) ? data.subscribers : []
            );
            setUsers(Array.isArray(data.users) ? data.users : []);
          }
          return;
        }
        const reason =
          data.code === "firebase_admin_not_configured"
            ? "Leaderboard service is not configured. Add the Firebase service account on the server, then try again."
            : data.error || "Could not open leaderboard.";
        throw new Error(reason);
      } catch (loadError) {
        // Only the server may use cached rows: it verifies each learner's
        // CURRENT privacy preference before returning them. An unchecked
        // Firestore fallback could republish a profile after it was hidden.
        const message =
          loadError instanceof Error && loadError.message
            ? loadError.message
            : "Could not open leaderboard. Please try again shortly.";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const allUsers = useMemo(() => {
    if (users.length > 0) return users;
    return subscribers.map((row) => ({
      uid: row.uid,
      name: row.name,
      photoURL: row.photoURL,
    }));
  }, [subscribers, users]);

  const unusedSubscribers = useMemo(
    () =>
      subscribers.filter(
        (row) =>
          row.usedCount < 1 &&
          row.available &&
          Boolean(row.referralCode?.trim())
      ),
    [subscribers]
  );

  const listedSubscribers = view === "unused" ? unusedSubscribers : subscribers;

  // Stats for flexible header
  const stats = useMemo(() => {
    return {
      totalUsers: allUsers.length,
      totalSubscribers: subscribers.length,
      unused: unusedSubscribers.length,
    };
  }, [allUsers.length, subscribers.length, unusedSubscribers.length]);

  return (
    <div data-leaderboard-page data-leaderboard-minimal>
      <div
        data-app-frame
        className="relative mx-auto flex min-h-screen w-full flex-col"
      >
        <Header
          cartCount={cartIds.size}
          notifCount={1}
          onNavigateToSubscription={() => {
            window.location.hash = "#/subscription";
          }}
          onNavigateToCart={() => {
            window.location.hash = "#/cart";
          }}
          onNavigateToNotifications={() => {
            window.location.hash = "#/notifications";
          }}
        />
        <main
          data-footer-nav-space
          data-leaderboard-content
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="dc-leaderboard-layout">
            <header className="dc-leaderboard-heading">
              <div>
                <p className="dc-leaderboard-brand">{appName} community</p>
                <h1>Leaderboard</h1>
                <p>Members and single-use referral codes.</p>
              </div>
              <button
                type="button"
                className="dc-leaderboard-action"
                disabled={loading}
                onClick={() => setRevision((value) => value + 1)}
              >
                {loading ? "Loading…" : "Refresh"}
              </button>
            </header>
            {!loading && !error ? (
              <dl className="dc-leaderboard-stats">
                <div>
                  <dt>Listed members</dt>
                  <dd>{stats.totalUsers}</dd>
                </div>
                <div>
                  <dt>Subscribers</dt>
                  <dd>{stats.totalSubscribers}</dd>
                </div>
                <div>
                  <dt>Unused IDs</dt>
                  <dd>{stats.unused}</dd>
                </div>
              </dl>
            ) : null}
            <div
              role="group"
              aria-label="Leaderboard view"
              className="dc-leaderboard-views"
            >
              {(
                [
                  { id: "all", label: "Members" },
                  { id: "subscribers", label: "Subscribers" },
                  { id: "unused", label: "Unused IDs" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={view === item.id}
                  onClick={() => setView(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {view !== "all" ? (
              <p className="dc-leaderboard-note">
                Default referral benefit: ₹250. Each available ID is single-use,
                excludes its owner, and applies to eligible subscriptions.
                Checkout verifies the configured reduction and final payable.
              </p>
            ) : null}
            {copyError ? (
              <p role="alert" className="dc-leaderboard-error">
                {copyError}
              </p>
            ) : null}
            <p role="status" aria-live="polite" className="sr-only">
              {copiedReferralCode ? `Copied ${copiedReferralCode}` : ""}
            </p>
            {loading ? (
              <div role="status" className="dc-leaderboard-state">
                <LoaderCircle
                  className="h-5 w-5 animate-spin"
                  aria-hidden="true"
                />
                <p>Loading leaderboard…</p>
              </div>
            ) : error ? (
              <div role="alert" className="dc-leaderboard-state">
                <h2>Leaderboard unavailable</h2>
                <p className="dc-leaderboard-note">{error}</p>
                <button
                  className="dc-leaderboard-action"
                  type="button"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  Try again
                </button>
              </div>
            ) : view === "all" ? (
              allUsers.length ? (
                <ol
                  className="dc-leaderboard-list"
                  aria-label="Community members"
                >
                  {allUsers.map((row, index) => (
                    <li key={row.uid} data-leaderboard-member>
                      <span className="dc-leaderboard-position">
                        {index + 1}
                      </span>
                      <Avatar name={row.name} photoURL={row.photoURL} />
                      <strong>{row.name}</strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="dc-leaderboard-state">
                  <h2>No members listed yet</h2>
                </div>
              )
            ) : listedSubscribers.length ? (
              <ul
                className="dc-leaderboard-list"
                aria-label="Subscriber referral codes"
              >
                {listedSubscribers.map((row, index) => {
                  const used = row.usedCount > 0;
                  const available =
                    !used && row.available && Boolean(row.referralCode?.trim());
                  return (
                    <li
                      key={row.uid}
                      data-referral-used={used ? "true" : "false"}
                      className="dc-leaderboard-subscriber"
                    >
                      <span className="dc-leaderboard-position">
                        {index + 1}
                      </span>
                      <Avatar name={row.name} photoURL={row.photoURL} />
                      <div className="dc-leaderboard-person">
                        <strong>{row.name}</strong>
                        <p>{row.planId} subscriber</p>
                      </div>
                      <div className="dc-leaderboard-referral">
                        <span>Referral ID</span>
                        <code>{row.referralCode || "Not issued"}</code>
                      </div>
                      <span
                        className={`dc-leaderboard-code-status ${
                          available ? "is-available" : ""
                        }`}
                      >
                        {used
                          ? "Used"
                          : available
                          ? "Available"
                          : "Unavailable"}
                      </span>
                      <button
                        type="button"
                        className="dc-leaderboard-action"
                        disabled={!available || !row.referralCode}
                        aria-label={`Copy referral ID ${row.referralCode}`}
                        onClick={() => void copyReferralCode(row.referralCode)}
                      >
                        {copiedReferralCode === row.referralCode
                          ? "Copied"
                          : "Copy"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="dc-leaderboard-state">
                <h2>
                  {view === "unused"
                    ? "No unused referral IDs"
                    : "No subscribers listed yet"}
                </h2>
              </div>
            )}
          </div>
        </main>
        <BottomNav
          active={null}
          purchasesBadge={purchasedIds.size}
          onChange={(tab) => {
            if (tab === "home") window.location.hash = "#/home";
            else if (tab === "myday") window.location.hash = "#/my-day";
            else if (tab === "store") window.location.hash = "#/store";
            else if (tab === "purchases")
              window.location.hash = "#/store/purchases";
            else if (tab === "profile") window.location.hash = "#/profile";
            else if (tab === "revision") window.location.hash = "#/revision";
          }}
        />
      </div>
    </div>
  );
}
