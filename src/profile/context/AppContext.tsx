import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  initialBadges,
  initialCoinHistory,
  initialCoupons,
  initialDownloads,
  initialFavorites,
  initialLeaderboard,
  initialMembership,
  initialNotificationSettings,
  initialPrivacySettings,
  initialPurchases,
  initialStreak,
  initialUser,
  membershipPlans,
} from "../data";
import type {
  Badge,
  CoinTransaction,
  Coupon,
  DownloadItem,
  EduUser,
  LeaderboardUser,
  LibraryItem,
  Membership,
  NotificationSettings,
  PlanId,
  PrivacySettings,
  TabId,
} from "../types";
import { loadPurchasedCourses } from "../../utils/purchasedCourses";

interface ToastState {
  id: number;
  message: string;
  tone: "success" | "info" | "error";
}

interface AppContextValue {
  isLoggedIn: boolean;
  login: () => void;
  logout: () => void;

  user: EduUser;
  updateUser: (partial: Partial<EduUser>) => void;

  coins: number;
  coinHistory: CoinTransaction[];
  addCoins: (amount: number, reason: string) => void;

  membership: Membership;
  upgradeMembership: (planId: PlanId) => void;

  purchases: LibraryItem[];
  favorites: LibraryItem[];
  toggleFavorite: (item: LibraryItem) => void;

  downloads: DownloadItem[];
  removeDownload: (id: string) => void;

  badges: Badge[];
  streak: typeof initialStreak;
  claimDailyReward: () => void;

  leaderboard: LeaderboardUser[];

  coupons: Coupon[];
  redeemCoupon: (id: string) => void;

  notifSettings: NotificationSettings;
  toggleNotif: (key: keyof NotificationSettings) => void;
  privacySettings: PrivacySettings;
  togglePrivacy: (key: keyof PrivacySettings) => void;

  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  toast: ToastState | null;
  showToast: (message: string, tone?: ToastState["tone"]) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [user, setUser] = useState<EduUser>(initialUser);
  const [coins, setCoins] = useState(415);
  const [coinHistory, setCoinHistory] = useState<CoinTransaction[]>(initialCoinHistory);
  const [membership, setMembership] = useState<Membership>(initialMembership);
  const [purchases] = useState<LibraryItem[]>(() => {
    const persisted = loadPurchasedCourses();
    const persistedIds = new Set(persisted.map((item) => item.id));
    return [...persisted, ...initialPurchases.filter((item) => !persistedIds.has(item.id))];
  });
  const [favorites, setFavorites] = useState<LibraryItem[]>(initialFavorites);
  const [downloads, setDownloads] = useState<DownloadItem[]>(initialDownloads);
  const [badges, setBadges] = useState<Badge[]>(initialBadges);
  const [streak, setStreak] = useState(initialStreak);
  const [leaderboard] = useState<LeaderboardUser[]>(initialLeaderboard);
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(initialNotificationSettings);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(initialPrivacySettings);
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, tone: ToastState["tone"] = "success") => {
    const id = Date.now();
    setToast({ id, message, tone });
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 2600);
  }, []);

  const login = useCallback(() => {
    setIsLoggedIn(true);
    showToast(`Welcome back, ${user.name.split(" ")[0]}!`);
  }, [showToast, user.name]);

  const logout = useCallback(() => {
    setIsLoggedIn(false);
  }, []);

  const updateUser = useCallback(
    (partial: Partial<EduUser>) => {
      setUser((prev) => ({ ...prev, ...partial }));
      showToast("Profile updated successfully");
    },
    [showToast]
  );

  const addCoins = useCallback((amount: number, reason: string) => {
    setCoins((prev) => prev + amount);
    setCoinHistory((prev) => [
      { id: `t${Date.now()}`, type: "earn", amount, reason, date: "Just now" },
      ...prev,
    ]);
  }, []);

  const upgradeMembership = useCallback(
    (planId: PlanId) => {
      setMembership({ planId, renewalDate: "Renews on 30th next month" });
      const plan = membershipPlans.find((p) => p.id === planId);
      showToast(`You're now on ${plan?.name}! 🎉`);
    },
    [showToast]
  );

  const toggleFavorite = useCallback(
    (item: LibraryItem) => {
      setFavorites((prev) => {
        const exists = prev.some((f) => f.id === item.id);
        if (exists) {
          showToast("Removed from favorites", "info");
          return prev.filter((f) => f.id !== item.id);
        }
        showToast("Added to favorites");
        return [...prev, item];
      });
    },
    [showToast]
  );

  const removeDownload = useCallback(
    (id: string) => {
      setDownloads((prev) => prev.filter((d) => d.id !== id));
      showToast("Download removed", "info");
    },
    [showToast]
  );

  const claimDailyReward = useCallback(() => {
    if (streak.claimedToday) {
      showToast("You already claimed today's reward", "info");
      return;
    }
    const newCurrent = streak.current + 1;
    setStreak((prev) => ({
      ...prev,
      current: newCurrent,
      longest: Math.max(prev.longest, newCurrent),
      last7: [...prev.last7.slice(1), true],
      claimedToday: true,
    }));
    addCoins(15, "Daily streak reward claimed");
    setBadges((prev) =>
      prev.map((b) =>
        b.id === "b2"
          ? { ...b, progress: Math.min(newCurrent, b.goal), earned: newCurrent >= b.goal }
          : b.id === "b6"
          ? { ...b, progress: Math.min(newCurrent, b.goal), earned: newCurrent >= b.goal }
          : b
      )
    );
    showToast("Daily reward claimed: +15 EduCoins 🔥");
  }, [addCoins, showToast, streak.claimedToday, streak.current]);

  const redeemCoupon = useCallback(
    (id: string) => {
      const coupon = coupons.find((c) => c.id === id);
      if (!coupon || coupon.redeemed) return;
      if (coins < coupon.cost) {
        showToast("Not enough EduCoins for this coupon", "error");
        return;
      }
      setCoins((prev) => prev - coupon.cost);
      setCoinHistory((prev) => [
        {
          id: `t${Date.now()}`,
          type: "spend",
          amount: coupon.cost,
          reason: `Redeemed coupon: ${coupon.title}`,
          date: "Just now",
        },
        ...prev,
      ]);
      setCoupons((prev) => prev.map((c) => (c.id === id ? { ...c, redeemed: true } : c)));
      showToast(`Coupon "${coupon.code}" redeemed! 🎁`);
    },
    [coins, coupons, showToast]
  );

  const toggleNotif = useCallback((key: keyof NotificationSettings) => {
    setNotifSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const togglePrivacy = useCallback((key: keyof PrivacySettings) => {
    setPrivacySettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      isLoggedIn,
      login,
      logout,
      user,
      updateUser,
      coins,
      coinHistory,
      addCoins,
      membership,
      upgradeMembership,
      purchases,
      favorites,
      toggleFavorite,
      downloads,
      removeDownload,
      badges,
      streak,
      claimDailyReward,
      leaderboard,
      coupons,
      redeemCoupon,
      notifSettings,
      toggleNotif,
      privacySettings,
      togglePrivacy,
      activeTab,
      setActiveTab,
      toast,
      showToast,
    }),
    [
      isLoggedIn,
      login,
      logout,
      user,
      updateUser,
      coins,
      coinHistory,
      addCoins,
      membership,
      upgradeMembership,
      purchases,
      favorites,
      toggleFavorite,
      downloads,
      removeDownload,
      badges,
      streak,
      claimDailyReward,
      leaderboard,
      coupons,
      redeemCoupon,
      notifSettings,
      toggleNotif,
      privacySettings,
      togglePrivacy,
      activeTab,
      toast,
      showToast,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
