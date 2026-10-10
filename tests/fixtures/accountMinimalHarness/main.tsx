import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/glass-theme.css";
import "../../../src/glass.css";
import "../../../src/store-glass.css";
import "../../../src/profile-glass.css";
import Header from "../../../src/components/Header";
import BottomNav from "../../../src/components/BottomNav";
import ProfileLayout, { EditModal, BaseModal, PreferenceRow, type ProfileLayoutMembership } from "../../../src/profile/ProfileLayout";
import { PurchasesTab } from "../../../src/components/OtherTabs";
import UsageLimitsPage from "../../../src/usage/UsageLimitsPage";
import { products } from "./products";
const params = new URLSearchParams(location.search);
const record = (value: string) => { document.querySelector("output")!.textContent = value; };

function ProfileFixture() {
  const [name, setName] = useState("Ananya Sharma");
  const [modal, setModal] = useState<"edit" | "settings" | null>(null);
  const [reminders, setReminders] = useState(false);
  const [preference, setPreference] = useState(true);
  const free = params.has("free");
  const expired = params.has("expired");
  const subscription = { planId: "premium", cycle: "monthly", status: expired ? "expired" : "active", expiresAt: Date.now() + (expired ? -86400000 : 86400000 * 7), reminderOptOut: reminders };
  const membership: ProfileLayoutMembership = {
    tier: free ? "normal" : "premium", subscriber: !free, active: !free && !expired, expired: !free && expired,
    tierLabel: free ? "Free" : "Premium", planLabel: free ? "Free Plan" : "Premium Plan", planDescription: "More capacity for focused study.", revisionTestBankLimit: free ? null : -1,
    features: free ? [] : [{ id: "myday", name: "My Day", description: "Tasks and notes" }, { id: "school-ai", name: "School AI", description: "Guided study tools" }],
    includedCourses: free ? [] : [{ id: "plan", title: "Physics through your plan", image: products[2].image }], subscription: free ? null : subscription,
  };
  return <>
    <div data-profile-page data-app-frame className="fixture-account-frame"><Header cartCount={1} notifCount={0} /><main data-profile-content><ProfileLayout name={name} email="a.very.long.email.address.for.mobile.layout@example.test" initials="AS" memberSince="July 2025" bio="Learning mathematics and science." photoURL={params.has("brokenPhoto") ? "/fixture-missing-profile-photo.png" : undefined} onChoosePhoto={() => record("photo")} onEdit={() => setModal("edit")} membership={membership} onOpenPlans={() => record("plans")} onOpenFeature={(id) => record(`feature:${id}`)} stats={{ ownedCount: 4, favoriteCount: 2, cartCount: 1, onOpenPurchases: () => record("purchases"), onOpenFavorites: () => record("saved"), onOpenCart: () => record("cart") }} referral={{ code: "REF529106", used: params.has("usedReferral"), onCopy: () => record("referral-copy") }} renewal={free ? null : { tier: "premium", subscription, now: Date.now(), onRenew: () => record("renew"), onToggleReminders: (value) => { setReminders(value); record(`reminders:${value}`); } }} onOpenUsageLimits={() => record("limits")} onOpenStudyLibrary={() => record("study-library")} library={{ items: products.map(item=>({id:item.id,title:item.title,image:item.image})), ownedCount:4, onOpenCourse:(id)=>record(`course:${id}`), onOpenPurchases:()=>record("purchases") }} onOpenSettings={()=>setModal("settings")} saving={false} onLogout={()=>record("logout")} isAdmin={params.has("admin")} onOpenDashboard={()=>record("admin")} /></main><BottomNav active="profile" onChange={(tab)=>record(tab)} /></div>
    {modal === "edit" ? <EditModal user={{ name, email: "account@example.test", mobile: "9876543210", bio: "Studying mathematics" }} onClose={()=>setModal(null)} onSave={async(details)=>{ if(params.has("saveError")) throw new Error("offline"); setName(details.name);record("profile-saved");setModal(null);return true; }} /> : null}
    {modal === "settings" ? <BaseModal title="Preferences" onClose={()=>setModal(null)}><PreferenceRow icon={null} label="Public profile" checked={preference} onChange={(value)=>{setPreference(value);record(`preference:${value}`);}} /></BaseModal> : null}
  </>;
}
function Fixture() {
  const page = params.get("page") || "profile";
  return <><output style={{position:"fixed",bottom:0,pointerEvents:"none",zIndex:1000}} />{page === "profile" ? <ProfileFixture /> : page === "usage" ? <UsageLimitsPage /> : <div data-app-frame className="fixture-account-frame"><Header cartCount={0} notifCount={0} /><main><PurchasesTab purchased={new Set(params.has("empty") || params.has("loading") ? [] : ["full", "book"])} onOpenCourse={(course)=>record(`course:${course.id}`)} /></main><BottomNav active="purchases" onChange={(tab)=>record(tab)} /></div>}</>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
