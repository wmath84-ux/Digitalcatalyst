import { AppProvider, useApp } from "./context/AppContext";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { Toast } from "./components/Toast";
import { ProfilePage } from "./pages/ProfilePage";
import { CouponStorePage } from "./pages/CouponStorePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { RewardsPage } from "./pages/RewardsPage";
import { LoggedOutPage } from "./pages/LoggedOutPage";

function AppShell() {
  const { isLoggedIn, activeTab } = useApp();

  if (!isLoggedIn) {
    return (
      <>
        <LoggedOutPage />
        <Toast />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <Header />
      <main className="pb-24">
        {activeTab === "profile" && <ProfilePage />}
        {activeTab === "coupons" && <CouponStorePage />}
        {activeTab === "leaderboard" && <LeaderboardPage />}
        {activeTab === "rewards" && <RewardsPage />}
      </main>
      <BottomNav />
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
