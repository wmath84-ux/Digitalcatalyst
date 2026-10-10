import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/apiBase";
import "./settings.css";

type PublicProfile = { uid: string; name: string; photoURL?: string };
type Activity = { coursesStarted: number; completedItems: number };

export default function PublicProfilePage() {
  const { user } = useAuth();
  const rawUid = window.location.hash.slice("#/learner/".length).split("?")[0] || "";
  let uid = rawUid;
  try { uid = decodeURIComponent(rawUid); } catch { /* API returns a safe unavailable response */ }
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    setLoading(true); setError(""); setProfile(null); setActivity(null);
    void apiFetch(`/api/public-profile?uid=${encodeURIComponent(uid)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) throw new Error(data?.error || "This profile is unavailable. Please retry.");
        if (active) { setProfile(data.profile); setActivity(data.activity || null); }
      })
      .catch((failure) => { if (active) setError(controller.signal.aborted ? "This profile couldn't be loaded. Check your connection and retry." : failure.message); })
      .finally(() => { if (active) setLoading(false); clearTimeout(timeout); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [uid, attempt]);
  return (
    <div data-settings-page data-public-profile className="settings-page">
      <div data-app-frame className="settings-frame"><main className="settings-main">
        <div className="settings-layout">
          <a className="settings-public-link" href={user?.id === uid ? "#/settings" : "#/leaderboard"}><ArrowLeft size={15} /> {user?.id === uid ? "Settings" : "Leaderboard"}</a>
          <p className="settings-eyebrow">Public learner profile</p>
          {loading ? <p className="settings-footnote" role="status">Loading profile…</p> : error ? (
            <div className="settings-alert" role="alert"><p>{error}</p><button onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>
          ) : profile ? <>
            <header className="public-profile-header">
              {profile.photoURL ? <img className="public-profile-avatar" src={profile.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="public-profile-avatar" aria-hidden="true">{profile.name.slice(0, 1).toUpperCase()}</span>}
              <div><h1>{profile.name}</h1><p>Eduvora learner</p></div>
            </header>
            <section className="settings-section" aria-labelledby="public-activity-heading">
              <h2 id="public-activity-heading">Learning activity</h2>
              {activity ? <dl className="public-profile-activity"><div><dt>Courses started</dt><dd>{activity.coursesStarted}</dd></div><div><dt>Completed learning items</dt><dd>{activity.completedItems}</dd></div></dl>
                : <p className="settings-footnote">This learner keeps their learning activity private.</p>}
              <p className="settings-footnote">Only activity counts can be shared. Course names, notes, purchases and contact details are private.</p>
            </section>
          </> : null}
        </div>
      </main></div>
    </div>
  );
}
