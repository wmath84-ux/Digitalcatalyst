import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, Loader2 } from "lucide-react";
import { auth } from "../../firebase";
import Header from "../components/Header";
import BottomNav, { type TabKey } from "../components/BottomNav";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";
import { ensureSavedWebPushSubscription, isWebPushSupported } from "../../utils/webPush";
import { getNativePushPermission, isAndroidNative, registerForPush } from "../utils/capacitorBridge";
import { type PreferenceKey } from "../../utils/userPreferences";
import { useUserPreferences } from "./useUserPreferences";
import "./settings.css";

const LABELS: Record<PreferenceKey, string> = {
  push: "Push notifications", email: "Email updates", promotions: "Promotions",
  profileVisible: "Public profile", shareActivity: "Share learning activity",
};

type DeviceState = "checking" | "unsupported" | "blocked" | "not-connected" | "allowed" | "connected" | "error";

export function SettingSwitch({ setting, checked, disabled, saving, description, note, onChange }: {
  setting: PreferenceKey; checked: boolean; disabled: boolean; saving: boolean;
  description: string; note?: string; onChange: (value: boolean) => void;
}) {
  const id = `setting-${setting}`;
  return (
    <div className="settings-row" data-setting={setting} data-saving={saving || undefined}>
      <div className="settings-row-copy">
        <label id={`${id}-label`} htmlFor={id}>{LABELS[setting]}</label>
        <p id={`${id}-description`}>{description}</p>
        {note ? <span className="settings-row-note">{note}</span> : null}
      </div>
      <div className="settings-switch-wrap">
        <label className="settings-switch" htmlFor={id}>
          <input id={id} name={setting} type="checkbox" role="switch" checked={checked}
            disabled={disabled} aria-labelledby={`${id}-label`} aria-describedby={`${id}-description`}
            aria-busy={saving || undefined} onChange={(event) => onChange(event.currentTarget.checked)} />
          <span aria-hidden="true"><span /></span>
        </label>
        <span className="settings-switch-state" aria-hidden="true">{saving ? "Saving" : checked ? "On" : "Off"}</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { cartIds } = useCommerce();
  const { purchasedIds } = useCatalog();
  const settings = useUserPreferences(user?.id);
  const [deviceState, setDeviceState] = useState<DeviceState>("checking");
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState("");
  const native = isAndroidNative();
  const currentAccount = useRef(user?.id);
  currentAccount.current = user?.id;
  const deviceOperation = useRef(0);

  const inspectDevice = async (isCurrent = () => true) => {
    try {
      let next: DeviceState;
      if (native) {
        const permission = await getNativePushPermission();
        next = permission === "granted" ? "allowed" : permission === "denied" ? "blocked" : "not-connected";
      } else next = !isWebPushSupported() ? "unsupported" : Notification.permission === "denied" ? "blocked"
        : Notification.permission !== "granted" ? "not-connected" : "allowed";
      // Permission alone does not confirm cloud registration. Inspecting it
      // needs no push subscription creation, service-worker wait or prompt.
      if (isCurrent()) setDeviceState((current) => next === "allowed" && current === "connected" ? current : next);
    } catch {
      if (isCurrent()) setDeviceState("error");
    }
  };

  useEffect(() => {
    let active = true;
    setDeviceState("checking");
    setDeviceMessage("");
    setDeviceBusy(false);
    ++deviceOperation.current;
    const check = () => { if (active) void inspectDevice(() => active); };
    check();
    window.addEventListener("focus", check);
    return () => { active = false; ++deviceOperation.current; window.removeEventListener("focus", check); };
    // Permission is device-local, not an account preference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, native]);

  const connectDevice = async () => {
    if (!user || deviceBusy) return;
    const uid = user.id;
    const operation = ++deviceOperation.current;
    const isCurrent = () => operation === deviceOperation.current && currentAccount.current === uid && auth.currentUser?.uid === uid;
    setDeviceBusy(true);
    setDeviceMessage("");
    try {
      // Ask browser permission directly inside this gesture, BEFORE awaiting
      // account persistence (Safari/iOS otherwise rejects the prompt).
      if (!native) {
        if (!isWebPushSupported()) throw new Error("This browser does not support push. Use supported Chrome, Edge, or the installed app; the account switch still works.");
        if (Notification.permission === "denied") throw new Error("Allow notifications in this site's browser settings, then return here and retry. Eduvora cannot change a blocked browser permission.");
        if (Notification.permission === "default" && await Notification.requestPermission() !== "granted") {
          throw new Error("Permission was not granted. Your account setting has not been changed; you can try again.");
        }
      }
      if (!isCurrent()) return;
      if (!settings.preferences.push && !await settings.setPreference("push", true)) return;
      if (!isCurrent()) return;
      const deliveryConfigured = native ? settings.capabilities?.fcmConfigured : settings.capabilities?.webPushConfigured;
      if (deliveryConfigured === false) throw new Error("Push delivery is not configured on the server. Your account preference is saved; device setup can be retried later.");
      if (native) {
        const result = await registerForPush(async () => auth.currentUser?.uid === uid ? auth.currentUser.getIdToken() : null, { uid });
        if (!result.ok) throw new Error(result.reason === "permission-denied"
          ? "Allow notifications for Eduvora in your phone's app settings, then retry. Your account preference remains saved."
          : "This device could not be registered. Check your connection and try again.");
      } else if (!await ensureSavedWebPushSubscription(user.id)) {
        throw new Error("Device registration was not confirmed. Check your connection and try again; your account setting remains saved.");
      }
      if (!isCurrent()) return;
      setDeviceState("connected");
      setDeviceMessage("This device is connected. Notifications follow your account settings.");
    } catch (error) {
      if (!isCurrent()) return;
      setDeviceMessage(error instanceof Error ? error.message : "Could not connect this device. Please retry.");
      await inspectDevice(isCurrent);
    } finally { if (isCurrent()) setDeviceBusy(false); }
  };

  const navigateFooter = (tab: TabKey) => {
    const routes: Record<TabKey, string> = { home: "#/home", myday: "#/my-day", store: "#/store", purchases: "#/store/purchases", profile: "#/profile", revision: "#/revision", flowpath: "#/flowpath", "study-library": "#/study-library" };
    window.location.hash = routes[tab];
  };

  if (!user) return (
    <div data-settings-page className="settings-page">
      <div data-app-frame className="settings-frame">
        <main data-settings-content className="settings-signed-out">
          <p className="settings-eyebrow">Your account</p>
          <h1>Settings</h1><p>Sign in to manage notifications and privacy.</p>
          <button className="settings-primary" onClick={() => { window.location.hash = "#/auth?mode=login&return=%23%2Fsettings"; }}>Sign in <ChevronRight size={16} /></button>
        </main>
      </div>
    </div>
  );

  const renderSwitch = (key: PreferenceKey, description: string, note?: string) => (
    <SettingSwitch key={key} setting={key} checked={settings.preferences[key]} description={description} note={note}
      disabled={!settings.ready || settings.savingKeys.includes(key)} saving={settings.savingKeys.includes(key)}
      onChange={(value) => { void settings.setPreference(key, value); }} />
  );
  const accountPushOff = !settings.preferences.push;
  const deviceLabel: Record<DeviceState, string> = { checking: "Checking permission", unsupported: "Not supported here", blocked: "Permission blocked", "not-connected": "Not connected", allowed: "Permission allowed", connected: "Connected", error: "Could not check permission" };
  const deviceDescription = accountPushOff
    ? "Push is off for your account. Turn it on whenever you're ready; device permission is separate."
    : deviceState === "blocked"
      ? native ? "Allow notifications in your phone's Eduvora app settings, then retry." : "Allow notifications in this site's browser settings, then retry."
      : deviceState === "unsupported"
        ? "Your account preference is saved. This browser can't receive push; other connected devices still can."
        : "Connect this browser or phone to receive push alerts. We only ask for permission when you choose to connect.";

  return (
    <div data-settings-page className="settings-page">
      <div data-app-frame className="settings-frame">
        <Header title="Settings" subtitle="Your preferences" cartCount={cartIds.size} notifCount={0}
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }} />
        <main data-settings-content className="settings-main">
          <div data-settings-layout className="settings-layout">
            <nav className="settings-breadcrumb" aria-label="Breadcrumb"><a href="#/home">Home</a><span>/</span><a href="#/profile">Profile</a><span>/</span><span aria-current="page">Settings</span></nav>
            <header className="settings-heading">
              <div><a className="settings-back" href="#/profile"><ArrowLeft size={15} /> Profile</a><p className="settings-eyebrow">Your account</p><h1>Settings</h1><p>Choose how we reach you and what others can see.</p></div>
              <span className="settings-save-state" role="status" aria-live="polite">
                {settings.savingKeys.length ? <><Loader2 className="settings-spinner" size={14} /> Saving changes</>
                  : settings.loading ? "Loading settings…"
                  : settings.lastSavedKey ? <><Check size={14} /> {LABELS[settings.lastSavedKey]} saved</>
                  : settings.ready && !settings.error ? <><Check size={14} /> Saved to your account</> : null}
              </span>
            </header>
            {settings.error ? <div className="settings-alert" role="alert"><p>{settings.error}</p><button type="button" disabled={settings.savingKeys.length > 0} onClick={() => { void settings.retry(); }}>{settings.failed ? "Retry change" : "Retry connection"}</button></div> : null}
            <section className="settings-section" aria-labelledby="settings-notifications">
              <div className="settings-section-heading"><h2 id="settings-notifications">Notifications</h2><p>Account preferences apply to every device. Your in-app learning and purchase alerts remain available.</p></div>
              {renderSwitch("push", "Receive system alerts on your connected browsers and phones. Turning this off doesn't delete your reminders.")}
              {renderSwitch("email", "Course updates and subscription reminders, sent to your verified account email.", settings.capabilities
                ? settings.capabilities.emailConfigured ? `Delivery address: ${user.email}` : "Email delivery isn't configured on the server yet. Your preference is saved and will be honoured when delivery is available."
                : "Email delivery status hasn't been confirmed. Retry the connection to check it.")}
              {renderSwitch("promotions", "Optional offers and new-product announcements in your inbox and enabled notification channels.", "Off means no promotional alerts. Updates to your purchased courses aren't promotions.")}
              <div className="settings-device" data-device-state={deviceState}>
                <div><p className="settings-device-label">This device <span>{deviceLabel[deviceState]}</span></p><p>{deviceDescription}</p></div>
                <button type="button" className="settings-secondary" disabled={deviceBusy || !settings.ready || settings.savingKeys.includes("push")}
                  onClick={() => { void connectDevice(); }}>{deviceBusy ? <><Loader2 className="settings-spinner" size={14} /> Connecting…</> : deviceState === "blocked" || deviceState === "error" ? "Retry setup" : accountPushOff ? "Turn on & connect" : deviceState === "connected" ? "Reconnect device" : "Connect device"}</button>
                {deviceMessage ? <p className="settings-device-message" role="status">{deviceMessage}</p> : null}
              </div>
            </section>
            <section className="settings-section" aria-labelledby="settings-privacy">
              <div className="settings-section-heading"><h2 id="settings-privacy">Privacy</h2><p>Your notes, purchases, email and phone number are never part of your public profile.</p></div>
              {renderSwitch("profileVisible", "Show your name and profile photo on your public learner profile and community leaderboard.", !settings.preferences.profileVisible ? "Hidden profiles are removed from the public leaderboard. Your learning activity is hidden too." : undefined)}
              {renderSwitch("shareActivity", "Show only the number of courses started and completed learning items on your public profile. Course names and private content stay hidden.", !settings.preferences.profileVisible ? "This choice is saved, but nothing is shared while your public profile is off." : "Off by default. Sharing starts only when you explicitly turn this on.")}
              <a className="settings-public-link" href={`#/learner/${encodeURIComponent(user.id)}`}>View your public profile <ArrowUpRight size={15} /></a>
            </section>
            <p className="settings-footnote">Changes save automatically. You can turn any setting back on. Browser or phone permission can only be changed on that device.</p>
          </div>
        </main>
        <BottomNav active="profile" onChange={navigateFooter} purchasesBadge={purchasedIds.size} />
      </div>
    </div>
  );
}
