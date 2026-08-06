import React from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ActiveCoinDiscount, CoinTransaction, Coupon, Order, ProductWithRating, ProfileMilestoneConfig, ProfileStreakConfig, ProfileStreakMetric, ProfileMilestoneMetric, ThemeName, themes, User, WebsiteSettings } from '../App';
import { EconomySettings, resolveCoinPrice, resolveMaxDiscountPercentage } from '../utils/economy';
import { db } from '../firebase';
import UserAvatar from './common/UserAvatar';
import { creditUserCoinWallet, ensureUserCoinWallet, watchUserCoinWallet } from '../utils/coinWallet';
import MembershipUpgradeCard from './MembershipUpgradeCard';
import { canEarnEduCoins, canSpendEduCoins, getUserEduCoinMultiplier, getUserSubscriptionTier, hasSubscriptionFeature, normalizeSubscriptionPageContent } from '../utils/subscriptionAccess';

interface ProfilePageProps {
  settings: WebsiteSettings;
  economySettings: EconomySettings;
  onApplyCoinClaim: (claim: ActiveCoinDiscount) => void;
  activeCoinDiscount?: ActiveCoinDiscount | null;
  onClearCoinClaim: () => void;
  currentUser: User | null;
  purchasedProducts: ProductWithRating[];
  products: ProductWithRating[];
  coupons: Coupon[];
  orders: Order[];
  onBack: () => void;
  onExplore: () => void;
  activeTheme: ThemeName;
  onThemeChange: (themeName: ThemeName) => void;
  onSyncCurrentUser: (updater: (user: User) => User, transaction?: Omit<CoinTransaction, 'id' | 'createdAt'>) => User | null;
  onClaimMilestoneReward: (reward: { id: string; title: string; requirement: number; unlockProductIds?: number[]; coinReward?: number; currentValue?: number }) => boolean;
  onOpenVerifiedCourse?: (course: ProductWithRating) => void;
  onUpgrade: () => void;
}

interface LearningProgress {
  id: number | string;
  title: string;
  category: string;
  completion: number;
  product: ProductWithRating;
  totalLessons: number;
}

interface Badge {
  id: string;
  label: string;
  icon: string;
  unlocked: boolean;
  description: string;
  currentValue: number;
  goal: number;
}

interface MilestoneReward extends ProfileMilestoneConfig {
  currentValue: number;
  progress: number;
  reached: boolean;
}

const glassCard =
  'profile-glass-card profile-performance-card border border-[#D2E3FC] shadow-[0_8px_24px_rgba(26,115,232,0.10)] transition-[border-color,box-shadow] duration-200 lg:hover:border-[#C2E7FF] lg:hover:shadow-[0_12px_30px_rgba(26,115,232,0.13)]';

const fallbackProfileStyle = { backgroundColor: '#F8FAFD', backgroundTint: '#E8F0FE', cardOpacity: 95, heroOverlayOpacity: 76, accentColor: '#1A73E8' };

const fallbackStreakConfigs: ProfileStreakConfig[] = [
  { id: 'daily-login', title: 'Daily Login Spark', icon: '\u{1F525}', metric: 'dailyLogin', goal: 1, unit: 'day', coinReward: 10, accent: 'from-[#1A73E8] via-[#D3E3FD] to-[#C2E7FF]', note: 'Open your hub every day and claim today\u2019s flame.', active: true },
  { id: 'study-15', title: '15 Minute Focus', icon: '\u23F1\uFE0F', metric: 'studyMinutes', goal: 15, unit: 'mins', coinReward: 15, accent: 'from-[#1A73E8] via-[#1967D2] to-[#174EA6]', note: 'Watch lessons or read learning content for 15 minutes.', active: true },
  { id: 'study-45', title: 'Deep Work Sprint', icon: '\u26A1', metric: 'studyMinutes', goal: 45, unit: 'mins', coinReward: 25, accent: 'from-[#D3E3FD] via-[#1A73E8] to-[#174EA6]', note: 'Build a longer study session and earn a bigger boost.', active: true },
  { id: 'watch-60', title: 'Video Warrior', icon: '\u{1F3AC}', metric: 'watchMinutes', goal: 60, unit: 'mins', coinReward: 30, accent: 'from-[#1A73E8] via-[#1967D2] to-[#C2E7FF]', note: 'Complete one hour of course video watch time.', active: true },
  { id: 'pdf-3', title: 'PDF Reader', icon: '\u{1F4C4}', metric: 'pdfsRead', goal: 3, unit: 'PDFs', coinReward: 20, accent: 'from-[#E6F4EA] via-[#D3E3FD] to-[#1A73E8]', note: 'Read premium notes and document resources.', active: true },
  { id: 'article-3', title: 'Knowledge Hunter', icon: '\u{1F9E0}', metric: 'articlesRead', goal: 3, unit: 'reads', coinReward: 20, accent: 'from-[#E6F4EA] via-[#E8F0FE] to-[#1A73E8]', note: 'Read news or blog lessons to keep learning daily.', active: true },
  { id: 'quiz-1', title: 'Quiz Ignition', icon: '\u{1F3AF}', metric: 'quizWins', goal: 1, unit: 'win', coinReward: 25, accent: 'from-[#D3E3FD] via-[#1A73E8] to-[#C2E7FF]', note: 'Finish a quiz and claim your first quiz streak.', active: true },
  { id: 'quiz-3', title: 'Quiz Momentum', icon: '\u{1F3F9}', metric: 'quizWins', goal: 3, unit: 'wins', coinReward: 40, accent: 'from-[#D3E3FD] via-[#1A73E8] to-[#174EA6]', note: 'Stack multiple quiz rewards to keep momentum alive.', active: true },
  { id: 'course-1', title: 'Course Starter', icon: '\u{1F4DA}', metric: 'coursesOwned', goal: 1, unit: 'course', coinReward: 25, accent: 'from-[#1A73E8] via-[#1967D2] to-[#C2E7FF]', note: 'Own your first course and start your premium path.', active: true },
  { id: 'complete-1', title: 'Completion Charge', icon: '\u2705', metric: 'completedCourses', goal: 1, unit: 'done', coinReward: 50, accent: 'from-[#E6F4EA] via-[#D3E3FD] to-[#1A73E8]', note: 'Complete one tracked course.', active: true },
  { id: 'wallet-500', title: 'Coin Collector', icon: '\u{1FA99}', metric: 'lifetimeCoins', goal: 500, unit: 'coins', coinReward: 35, accent: 'from-[#FEF7E0] via-[#D3E3FD] to-[#1A73E8]', note: 'Earn lifetime coins from real activity.', active: true },
  { id: 'badge-3', title: 'Badge Builder', icon: '\u{1F3C5}', metric: 'badgesUnlocked', goal: 3, unit: 'badges', coinReward: 30, accent: 'from-[#5F6368] via-[#1A73E8] to-[#174EA6]', note: 'Unlock badges by learning and completing.', active: true },
];

const fallbackMilestoneConfigs: ProfileMilestoneConfig[] = [
  { id: 'first-login-flame', title: 'First Login Flame', icon: '\u{1F525}', metric: 'studyMinutes', requirement: 1, description: 'Start learning with your first active minute.', actionLabel: 'Claim Coins', coinReward: 25, active: true },
  { id: 'article-reader', title: 'Article Reader', icon: '\u{1F4F0}', metric: 'articlesRead', requirement: 3, description: 'Read three learning articles or blog lessons.', actionLabel: 'Claim Reading Bonus', coinReward: 40, active: true },
  { id: 'video-hour', title: 'One Hour Video Charge', icon: '\u{1F3AC}', metric: 'watchMinutes', requirement: 60, description: 'Complete 60 minutes of course video watch time.', actionLabel: 'Claim Watch Bonus', coinReward: 60, active: true },
  { id: 'quiz-master-real', title: 'Quiz Master', icon: '\u{1F3AF}', metric: 'quizWins', requirement: 3, description: 'Claim rewards from three unique quizzes.', actionLabel: 'Claim Quiz Bonus', coinReward: 75, active: true },
  { id: 'pdf-scholar', title: 'PDF Scholar', icon: '\u{1F4C4}', metric: 'pdfsRead', requirement: 5, description: 'Read or own five PDF/document resources.', actionLabel: 'Download Scholar Pack', coinReward: 50, downloadContent: 'Digital Catalyst PDF Scholar Pack\n\n- Reading checklist\n- Revision tracker\n- Daily active planner', active: true },
  { id: 'course-finisher', title: 'Course Finisher', icon: '\u2705', metric: 'completedCourses', requirement: 1, description: 'Reach 100% completion on a course tracker.', actionLabel: 'Claim Completion Bonus', coinReward: 100, active: true },
  { id: 'wallet-elite', title: 'Wallet Elite', icon: '\u{1F48E}', metric: 'lifetimeCoins', requirement: 1000, description: 'Earn 1000 lifetime EduCoins.', actionLabel: 'Claim Elite Badge', coinReward: 125, active: true },
  { id: 'premium-unlocker', title: 'Premium Unlocker', icon: '\u{1F393}', metric: 'coursesOwned', requirement: 2, description: 'Own two premium learning products.', actionLabel: 'Unlock Bonus Access', coinReward: 80, unlockProductIds: [], active: true },
];

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const formatLedgerTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 24 * 60 * 60 * 1000;
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (date.getTime() >= startToday) return `Today, ${time}`;
  if (date.getTime() >= startYesterday) return `Yesterday, ${time}`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const TAB_ICONS: Record<string, string> = {
  overview: '\u{1F3E0}',
  learning: '\u{1F4DA}',
  rewards: '\u{1F3C6}',
  wallet: '\u{1F4B0}',
};

const ProfilePage: React.FC<ProfilePageProps> = ({
  settings,
  economySettings,
  onApplyCoinClaim,
  activeCoinDiscount = null,
  onClearCoinClaim,
  currentUser,
  purchasedProducts,
  products,
  coupons,
  onBack,
  onExplore,
  activeTheme,
  onThemeChange,
  onSyncCurrentUser,
  onClaimMilestoneReward,
  onOpenVerifiedCourse,
  onUpgrade,
}) => {
  const [redeeming, setRedeeming] = React.useState<string | null>(null);
  const [redeemedCouponCode, setRedeemedCouponCode] = React.useState<string | null>(null);
  const [coinTransactions, setCoinTransactions] = React.useState<CoinTransaction[]>([]);
  const [locallyRedeemedRewardIds, setLocallyRedeemedRewardIds] = React.useState<string[]>([]);
  const [courseAccessError, setCourseAccessError] = React.useState('');
  const [activeProfileFilter, setActiveProfileFilter] = React.useState<'overview' | 'learning' | 'rewards' | 'wallet'>('overview');
  const [profileCoinWallet, setProfileCoinWallet] = React.useState({
    coinBalance: 0,
    totalCoinsEarned: 0,
    totalCoinsSpent: 0,
  });
  const [profileCoinError, setProfileCoinError] = React.useState('');
  const profileUid = currentUser?.uid || (currentUser?.id ? String(currentUser.id) : '');

  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({
    streaks: true,
    milestones: false,
    rewardsVault: false,
    coupons: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  React.useEffect(() => {
    if (!profileUid) {
      setProfileCoinWallet({ coinBalance: 0, totalCoinsEarned: 0, totalCoinsSpent: 0 });
      return;
    }

    ensureUserCoinWallet(profileUid).catch((error) => {
      console.error('Profile coin wallet setup failed:', error);
      setProfileCoinError('Unable to load profile coins. Please refresh.');
    });

    const unsubscribe = watchUserCoinWallet(
      profileUid,
      (wallet) => {
        setProfileCoinWallet(wallet);
        setProfileCoinError('');
      },
      (error) => {
        console.error('Profile coin wallet watch failed:', error);
        setProfileCoinError('Unable to load profile coins. Please refresh.');
      }
    );

    return () => unsubscribe();
  }, [profileUid]);

  React.useEffect(() => {
    if (!profileUid) {
      setCoinTransactions([]);
      return;
    }

    const storageKey = `coinTransactions-${profileUid}`;
    const localLedger = JSON.parse(localStorage.getItem(storageKey) || '[]') as CoinTransaction[];
    setCoinTransactions([...(currentUser.coinTransactions || []), ...localLedger].slice(0, 12));

    const ledgerQuery = query(collection(db, 'users', profileUid, 'coinTransactions'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(ledgerQuery, (snapshot) => {
      const remoteLedger = snapshot.docs.map((entry) => {
        const data = entry.data() as Omit<CoinTransaction, 'id' | 'createdAt'> & { createdAt?: any };
        return {
          ...data,
          id: entry.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString()),
        } as CoinTransaction;
      });
      setCoinTransactions(remoteLedger.slice(0, 12));
    }, () => {
      setCoinTransactions([...(currentUser.coinTransactions || []), ...localLedger].slice(0, 12));
    });

    return unsubscribe;
  }, [profileUid, currentUser?.coinTransactions]);


  const profileCoupons = React.useMemo(() => coupons, [coupons]);
  const coinRedeemRate = Math.max(1, Number(economySettings.coinToFiatRatio));
  const studyMinutes = currentUser?.studyMinutes ?? 0;
  const watchTimeMinutes = currentUser?.totalWatchTimeMinutes ?? studyMinutes;
  const eduPoints = profileCoinWallet.coinBalance;
  const totalLifetimeCoins = profileCoinWallet.totalCoinsEarned || eduPoints;
  const profileStyle = { ...fallbackProfileStyle, ...((settings.content as any).profileStyle || {}) };
  const subscriptionTier = getUserSubscriptionTier(currentUser);
  const hasPremiumAccess = hasSubscriptionFeature(currentUser, 'educoins');
  const earningMultiplier = Math.max(1, getUserEduCoinMultiplier(currentUser));
  const subscriptionPage = normalizeSubscriptionPageContent(settings.content.subscriptionPage);
  const profileStreakConfigs = (((settings.content as any).profileStreaks || fallbackStreakConfigs) as ProfileStreakConfig[])
    .filter(streak => streak.active !== false && !streak.draft && !streak.archived && Number(streak.goal) > 0)
    .slice(0, 4);
  const profileMilestoneConfigs = (((settings.content as any).profileMilestones || fallbackMilestoneConfigs) as ProfileMilestoneConfig[])
    .filter(milestone => milestone.active !== false && !milestone.draft && !milestone.archived && Number(milestone.requirement) > 0)
    .slice(0, 12);
  const purchasedProductIdSet = React.useMemo(() => new Set(purchasedProducts.map(product => String(product.id))), [purchasedProducts]);
  const readArticleCount = new Set([...(currentUser?.rewardedArticleIds || []), ...(currentUser?.readArticles || [])]).size;
  const quizWinCount = new Set(currentUser?.rewardedQuizIds || []).size;
  const coinTransactionCount = coinTransactions.length || (currentUser?.coinTransactions || []).length;
  const pdfsRead = Math.max(0, ((currentUser as any)?.pdfsRead || 0) + coinTransactions.filter(entry => /pdf|read|document/i.test(`${entry.title || ''} ${entry.description || ''}`)).length + purchasedProducts.filter(product => product.category?.toLowerCase().includes('pdf') || product.title.toLowerCase().includes('pdf') || (product.courseContent || []).some(module => (module.files || []).some(file => ['pdf', 'sheet'].includes(file.type)))).length);

  const handleCouponRedeem = React.useCallback((coupon: Coupon) => {
    if (!coupon.isActive) return;
    const markRedeemed = () => {
      setRedeemedCouponCode(coupon.code);
      window.setTimeout(() => setRedeemedCouponCode(current => current === coupon.code ? null : current), 2200);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(coupon.code).then(markRedeemed).catch(markRedeemed);
      return;
    }

    markRedeemed();
  }, []);

  const dynamicClaimCards = React.useMemo(() => {
    const productCards = products
      .filter(product => product.isVisible !== false && !product.isFree)
      .map(product => {
        const price = Number((product.salePrice || product.price).replace(/[^\d.]/g, '')) || 0;
        const coinPrice = resolveCoinPrice(product.coinPrice, economySettings, 'product', product.id);
        const maxDiscount = Math.floor(price * (resolveMaxDiscountPercentage(economySettings, 'product', product.id) / 100));
        const outright = coinPrice > 0 && eduPoints >= coinPrice;
        const affordableDiscount = Math.min(price, maxDiscount, Math.floor(eduPoints / coinRedeemRate));
        return { id: `product-${product.id}`, targetType: 'product' as const, targetId: product.id, name: product.title, type: 'Product', price, coinPrice, discount: outright ? price : affordableDiscount, requiredCoins: outright ? coinPrice : affordableDiscount * coinRedeemRate, mode: outright ? 'unlock' as const : 'discount' as const, claimable: outright || affordableDiscount > 0 };
      });
    const planCards = ((settings.content as any).subscriptionPlans || []).map((plan: any) => {
      const price = Number(plan.price || 0);
      const coinPrice = resolveCoinPrice(plan.coinPrice, economySettings, 'subscription', plan.id);
      const maxDiscount = Math.floor(price * (resolveMaxDiscountPercentage(economySettings, 'subscription', plan.id) / 100));
      const outright = coinPrice > 0 && eduPoints >= coinPrice;
      const affordableDiscount = Math.min(price, maxDiscount, Math.floor(eduPoints / coinRedeemRate));
      return { id: `plan-${plan.id}`, targetType: 'subscription' as const, targetId: String(plan.id), name: `${plan.name} Plan`, type: 'Subscription', price, coinPrice, discount: outright ? price : affordableDiscount, requiredCoins: outright ? coinPrice : affordableDiscount * coinRedeemRate, mode: outright ? 'unlock' as const : 'discount' as const, claimable: outright || affordableDiscount > 0 };
    });
    return [...productCards, ...planCards].filter(item => item.price > 0).sort((a, b) => Number(b.claimable) - Number(a.claimable) || b.discount - a.discount).slice(0, 6);
  }, [coinRedeemRate, economySettings, eduPoints, products, settings.content]);

  const getCourseFileCount = (modules: any[] = []): number => modules.reduce((total, module) => total + (module.files || []).length + getCourseFileCount(module.modules || []), 0);
  const getStoredCompletion = (productId: number | string) => {
    const progressRecord = (currentUser as any)?.courseProgress?.[String(productId)] || (currentUser as any)?.courseProgress?.[productId];
    const backendCompletion = Number(progressRecord?.completionPercentage ?? progressRecord?.completion ?? 0);
    if (Number.isFinite(backendCompletion) && backendCompletion > 0) return clamp(backendCompletion);

    if (!currentUser?.id) return 0;
    const stored = Number(localStorage.getItem(`courseProgress-${currentUser.id}-${productId}`) || localStorage.getItem(`courseCompletion-${currentUser.id}-${productId}`) || 0);
    return Number.isFinite(stored) ? clamp(stored) : 0;
  };

  const learningProgress: LearningProgress[] = purchasedProducts.length
    ? purchasedProducts.slice(0, 5).map((product, index) => {
        const completion = getStoredCompletion(product.id);
        return {
          id: product.id,
          title: product.title,
          category: product.category || 'Premium course',
          completion: Math.round(completion),
          product,
          totalLessons: getCourseFileCount(product.courseContent || []),
        };
      })
    : [];

  const verifyCoursePurchase = (courseId: number | string) => {
    if (!currentUser?.id) return false;
    const courseIdKey = String(courseId);
    return purchasedProductIdSet.has(courseIdKey);
  };

  const handleContinueLearning = (course: LearningProgress) => {
    setCourseAccessError('');
    if (!verifyCoursePurchase(course.id)) {
      setCourseAccessError(`Purchase verification failed for ${course.title}. Please buy this course or refresh your account access.`);
      return;
    }
    onOpenVerifiedCourse?.(course.product);
  };

  const completedCourses = learningProgress.filter(course => course.completion >= 100).length;
  const level = Math.max(1, Math.floor(eduPoints / 500) + 1);
  const currentLevelStart = (level - 1) * 500;
  const pointsIntoLevel = eduPoints - currentLevelStart;
  const pointsForNextLevel = 500;
  const nextLevelProgress = clamp((pointsIntoLevel / pointsForNextLevel) * 100);
  const pointsRemaining = Math.max(0, pointsForNextLevel - pointsIntoLevel);
  const lastActiveDate = String((currentUser as any)?.lastActiveDate || currentUser?.lastLoginAt || '').slice(0, 10);
  const streakDays = Math.max(0, Number((currentUser as any)?.currentStreakDays || 0));
  const badgesUnlockedCount = [quizWinCount >= 1, completedCourses >= 1, streakDays >= 5, purchasedProducts.length >= 3, totalLifetimeCoins >= 500, watchTimeMinutes >= 60].filter(Boolean).length;

  const getMetricValue = (metric: ProfileStreakMetric | ProfileMilestoneMetric) => {
    switch (metric) {
      case 'dailyLogin': return streakDays;
      case 'studyMinutes': return studyMinutes;
      case 'watchMinutes': return watchTimeMinutes;
      case 'pdfsRead': return pdfsRead;
      case 'coursesOwned': return purchasedProducts.length;
      case 'completedCourses': return completedCourses;
      case 'quizWins': return quizWinCount;
      case 'articlesRead': return readArticleCount;
      case 'lifetimeCoins': return totalLifetimeCoins;
      case 'coinTransactions': return coinTransactionCount;
      case 'milestonesClaimed': return (currentUser?.claimedRewardIds || []).length;
      case 'streakClaims': return Object.keys(currentUser?.profileStreakClaims || {}).length;
      case 'badgesUnlocked': return badgesUnlockedCount;
      default: return 0;
    }
  };

  const streakCards = profileStreakConfigs.map(streak => {
    const value = getMetricValue(streak.metric);
    const claimKey = `${streak.id}:${lastActiveDate || 'server-active-date'}`;
    const claimedToday = currentUser?.profileStreakClaims?.[streak.id] === claimKey;
    return {
      ...streak,
      value,
      progress: clamp((value / Math.max(1, Number(streak.goal))) * 100),
      claimKey,
      claimedToday,
      claimable: Boolean(lastActiveDate) && value >= Number(streak.goal) && !claimedToday && Number(streak.coinReward || 0) > 0,
    };
  });

  const milestoneRewards: MilestoneReward[] = profileMilestoneConfigs.map(milestone => {
    const currentValue = getMetricValue(milestone.metric);
    return {
      ...milestone,
      currentValue,
      progress: clamp((currentValue / Math.max(1, Number(milestone.requirement))) * 100),
      reached: currentValue >= Number(milestone.requirement),
    };
  });


  const badges: Badge[] = [
    { id: 'quiz-master', label: 'Quiz Starter', icon: '\u{1F3AF}', unlocked: quizWinCount >= 1, description: 'Complete 1 verified quiz', currentValue: quizWinCount, goal: 1 },
    { id: 'watch-hour', label: 'Video Learner', icon: '\u{1F3AC}', unlocked: watchTimeMinutes >= 60, description: 'Watch 60 verified minutes', currentValue: watchTimeMinutes, goal: 60 },
    { id: 'first-course', label: 'Course Finisher', icon: '\u{1F3C6}', unlocked: completedCourses >= 1, description: 'Reach 100% course progress', currentValue: completedCourses, goal: 1 },
    { id: 'streak-flame', label: 'Streak Flame', icon: '\u{1F525}', unlocked: streakDays >= 5, description: 'Keep a 5-day backend streak', currentValue: streakDays, goal: 5 },
    { id: 'collector', label: 'Course Collector', icon: '\u{1F48E}', unlocked: purchasedProducts.length >= 3, description: 'Own 3 premium courses', currentValue: purchasedProducts.length, goal: 3 },
    { id: 'coin-builder', label: 'Coin Builder', icon: '\u{1FA99}', unlocked: totalLifetimeCoins >= 500, description: 'Earn 500 lifetime EduCoins', currentValue: totalLifetimeCoins, goal: 500 },
  ];

  const syncProfileUser = (updated: User, entry?: CoinTransaction) => {
    onSyncCurrentUser(() => updated, entry ? {
      amount: entry.amount,
      type: entry.type,
      source: entry.source,
      title: entry.title,
      description: entry.description,
    } : undefined);
  };

  const handleStreakClaim = async (streak: typeof streakCards[number]) => {
    if (!currentUser || !canEarnEduCoins(currentUser) || !profileUid || !streak.claimable) return;
    const coinReward = Math.max(0, Number(streak.coinReward || 0));
    const userId = currentUser.uid || (currentUser.id ? String(currentUser.id) : '');
    if (!userId || coinReward <= 0) return;

    try {
      const result = await creditUserCoinWallet({
        userId,
        amount: coinReward,
        source: 'profile_streak',
        title: `\u{1F525} ${streak.title}`,
        description: `Claimed ${coinReward} EduCoins for ${streak.title}`,
        profileStreakClaim: {
          streakId: streak.id,
          claimKey: streak.claimKey,
        },
      });

      if (!result.success) return;
      const creditedReward = Math.max(0, result.balanceAfter - result.balanceBefore);

      const entry: CoinTransaction = {
        id: `streak-${streak.id}-${Date.now()}`,
        amount: creditedReward,
        type: 'credit',
        source: 'profile_streak',
        title: `\u{1F525} ${streak.title}`,
        description: `Claimed ${creditedReward} EduCoins for ${streak.title}`,
        createdAt: new Date().toISOString(),
      };
      const updated: User = {
        ...currentUser,
        coinBalance: result.balanceAfter,
        eduCoins: result.balanceAfter,
        totalCoinsEarned: result.totalCoinsEarned,
        totalLifetimeCoins: result.totalLifetimeCoins,
        profileStreakClaims: { ...(currentUser.profileStreakClaims || {}), [streak.id]: streak.claimKey },
      };
      syncProfileUser(updated, entry);
    } catch (error) {
      console.error('Profile streak claim failed:', error);
      setProfileCoinError('Unable to claim streak coins. Please try again.');
    }
  };

  const redeem = (reward: any) => {
    if (!currentUser || !profileUid || redeeming || (currentUser.eduCoins || 0) < reward.cost) return;

    setRedeeming(reward.id);
    const updated = { ...currentUser, eduCoins: (currentUser.eduCoins || 0) - reward.cost };
    syncProfileUser(updated);
    setTimeout(() => setRedeeming(null), 500);
  };


  const handleMilestoneClaim = (reward: MilestoneReward) => {
    if (!canEarnEduCoins(currentUser)) return;
    const claimed = onClaimMilestoneReward(reward);
    if (!claimed) return;
    if (reward.downloadContent) {
      const blob = new Blob([reward.downloadContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reward.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const getRewardButtonState = (reward: typeof dynamicClaimCards[number]) => {
    const linkedPlan = ((settings.content as any).subscriptionPlans || []).find((plan: any) => String(plan.id) === String(reward.targetId));
    const linkedPlanProductIds = linkedPlan?.unlockProductIds || [];
    const isRedeemed = locallyRedeemedRewardIds.includes(reward.id) || (reward.targetType === 'product'
      ? purchasedProductIdSet.has(Number(reward.targetId))
      : linkedPlanProductIds.length > 0 && linkedPlanProductIds.every((id: number) => purchasedProductIdSet.has(id)));
    const isActive = activeCoinDiscount?.targetType === reward.targetType
      && (reward.targetType === 'product' ? activeCoinDiscount.productId === Number(reward.targetId) : activeCoinDiscount.subscriptionId === String(reward.targetId));
    return { isRedeemed, isActive };
  };

  const handleRewardToggle = (reward: typeof dynamicClaimCards[number]) => {
    if (!canSpendEduCoins(currentUser)) return;
    const { isActive, isRedeemed } = getRewardButtonState(reward);
    if (isRedeemed || !reward.claimable) return;
    if (isActive) {
      onClearCoinClaim();
      return;
    }
    onApplyCoinClaim({ type: 'coin', targetType: reward.targetType, amount: reward.discount, coins: reward.requiredCoins, productId: reward.targetType === 'product' ? Number(reward.targetId) : undefined, subscriptionId: reward.targetType === 'subscription' ? String(reward.targetId) : undefined });
  };

  const statCards = [
    { label: 'Courses', value: purchasedProducts.length, icon: '\u{1F4DA}' },
    { label: 'Watch Time', value: `${Math.floor(watchTimeMinutes / 60)}h ${watchTimeMinutes % 60}m`, icon: '\u23F1\uFE0F' },
    { label: 'Badges', value: `${badges.filter(badge => badge.unlocked).length}/${badges.length}`, icon: '\u{1F3C5}' },
    { label: 'Streak', value: `${streakDays}d`, icon: '\u{1F525}' },
  ];

  const profileTabs = [
    { id: 'overview' as const, label: 'Overview', helper: 'Summary' },
    { id: 'learning' as const, label: 'Learning', helper: `${learningProgress.length} courses` },
    { id: 'rewards' as const, label: 'Rewards', helper: `${streakCards.filter(streak => streak.claimable).length} ready` },
    { id: 'wallet' as const, label: 'Wallet', helper: `${profileCoinWallet.coinBalance} coins` },
  ];

  const showSection = (filter: string) => activeProfileFilter === 'overview' || activeProfileFilter === filter;

  if (!hasPremiumAccess) {
    return (
      <div className="min-h-[100dvh] w-full overflow-x-hidden text-[#202124]" style={{ background: `linear-gradient(135deg, ${profileStyle.backgroundColor}, ${profileStyle.backgroundTint}, #C2E7FF)` }}>
        <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-36 sm:px-6 sm:py-8">
          <button onClick={onBack} className="mb-5 flex min-h-[44px] items-center gap-2 rounded-2xl border border-[#D2E3FC] bg-white/95 px-4 py-2.5 text-sm font-black text-[#202124] shadow-sm transition active:scale-95">\u2190 Back</button>

          <section className="overflow-hidden rounded-[2rem] border border-[#D2E3FC] bg-white/95 shadow-[0_22px_70px_rgba(26,115,232,0.14)]">
            <div className="bg-gradient-to-br from-[#174EA6] via-[#1A73E8] to-[#7B61FF] p-5 text-white sm:p-8">
              <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                <UserAvatar name={currentUser?.name} email={currentUser?.email} photoURL={currentUser?.profilePhotoSet ? currentUser.photoURL : ''} size={112} className="!h-24 !w-24 rounded-[1.5rem] border-4 border-white/80 text-3xl shadow-xl" imageClassName="rounded-[1.25rem]" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-[#C2E7FF]">Learning Profile</p>
                  <h1 className="mt-2 text-3xl font-black sm:text-5xl">{currentUser?.name || 'Student'}</h1>
                  <p className="mt-2 text-sm font-semibold text-white/85">{currentUser?.email || 'student@learninghub.dev'}</p>
                </div>
              </div>
            </div>
          </section>

          <MembershipUpgradeCard message={subscriptionPage.profileUpgrade} onUpgrade={onUpgrade} compact className="mt-5" />

          <section className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-[#D2E3FC] bg-white/95 p-5 shadow-sm"><p className="text-sm font-bold text-[#5F6368]">Courses Owned</p><p className="mt-2 text-3xl font-black">{purchasedProducts.length}</p></div>
            <div className="rounded-3xl border border-[#D2E3FC] bg-white/95 p-5 shadow-sm"><p className="text-sm font-bold text-[#5F6368]">Video Watch Time</p><p className="mt-2 text-3xl font-black">{Math.floor(watchTimeMinutes / 60)}h {watchTimeMinutes % 60}m</p></div>
          </section>

          <section className="mt-5 rounded-[2rem] border border-[#D2E3FC] bg-white/95 p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#1967D2]">Purchased Learning</p><h2 className="mt-2 text-2xl font-black">Continue Your Courses</h2></div><button type="button" onClick={onExplore} className="min-h-[44px] rounded-2xl bg-[#1769FF] px-4 py-2.5 text-sm font-black text-white active:scale-95 transition">Explore Store</button></div>
            {courseAccessError && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{courseAccessError}</p>}
            <div className="mt-5 grid gap-3">
              {learningProgress.length ? learningProgress.map(course => <article key={course.id} className="rounded-2xl border border-[#D2E3FC] bg-[#F8FAFD] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black">{course.title}</h3><p className="mt-1 text-sm font-semibold text-[#5F6368]">{course.category} \u2022 {course.completion}% complete</p></div><button type="button" onClick={() => handleContinueLearning(course)} className="min-h-[44px] rounded-xl border border-[#1769FF] bg-white px-4 py-2 text-sm font-black text-[#1769FF] active:scale-95 transition">Continue</button></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#DADCE0]"><div className="h-full rounded-full bg-gradient-to-r from-[#1769FF] to-[#7B61FF]" style={{ width: `${course.completion}%` }} /></div></article>) : <p className="rounded-2xl border border-dashed border-[#D2E3FC] p-4 text-sm font-semibold text-[#5F6368]">No purchased courses yet. You can browse the store and buy learning content without a subscription.</p>}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="mobile-profile-root relative isolate min-h-[100dvh] w-full max-w-full overflow-x-clip text-[#202124]" style={{ background: `linear-gradient(135deg, ${profileStyle.backgroundColor}, ${profileStyle.backgroundTint}, #C2E7FF)`, '--profile-card-opacity': String(Number(profileStyle.cardOpacity) / 100), '--profile-accent': profileStyle.accentColor } as React.CSSProperties}>
      <style>{`
        /* ---------- animations ---------- */
        @keyframes mobileProfileFadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes mobileProfileSlideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes mobileProfilePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(26,115,232,0.35); }
          50% { box-shadow: 0 0 0 8px rgba(26,115,232,0); }
        }
        @keyframes mobileProfileShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes mobileProfileCoinBounce {
          0%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
          60% { transform: translateY(-2px); }
        }

        .mobile-profile-root .mp-animate {
          animation: mobileProfileFadeUp 500ms ease-out both;
        }

        .mobile-profile-root .mp-slide-up {
          animation: mobileProfileSlideUp 550ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .mobile-profile-root .profile-glass-card {
          background-color: rgba(255,255,255,var(--profile-card-opacity,0.95));
        }

        .mobile-profile-root .mp-stats-scroll {
          -webkit-overflow-scrolling: touch;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
        }
        .mobile-profile-root .mp-stats-scroll::-webkit-scrollbar { display: none; }
        .mobile-profile-root .mp-stats-scroll > * { scroll-snap-align: start; }

        .mobile-profile-root .mp-section-collapse {
          display: grid;
          grid-template-rows: 1fr;
          transition: grid-template-rows 350ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .mobile-profile-root .mp-section-collapse.mp-collapsed {
          grid-template-rows: 0fr;
        }
        .mobile-profile-root .mp-section-collapse > div { overflow: hidden; }

        .mobile-profile-root .mp-claimable-pulse {
          animation: mobileProfilePulse 2s ease-in-out infinite;
        }

        .mobile-profile-root .mp-coin-icon {
          animation: mobileProfileCoinBounce 2.5s ease-in-out infinite;
        }

        /* bottom tab bar */
        .mobile-profile-root .mp-bottom-tabs {
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          box-shadow: 0 -4px 24px rgba(15,23,42,0.08), 0 -1px 0 rgba(15,23,42,0.04);
        }

        @media (min-width: 768px) {
          .mobile-profile-root .mp-bottom-tabs {
            display: none;
          }
          .mobile-profile-root .mp-desktop-tabs {
            display: flex;
          }
        }

        @media (max-width: 767px) {
          .mobile-profile-root .mp-bottom-tabs {
            display: flex;
          }
          .mobile-profile-root .mp-desktop-tabs {
            display: none;
          }
        }

        /* reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .mobile-profile-root .mp-animate,
          .mobile-profile-root .mp-slide-up {
            animation: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* background ambient blobs */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full opacity-20" style={{ background: `radial-gradient(circle, ${profileStyle.accentColor}44, transparent 70%)` }} />
        <div className="absolute top-[40%] -right-16 h-80 w-80 rounded-full opacity-15" style={{ background: `radial-gradient(circle, #C2E7FF, transparent 70%)` }} />
        <div className="absolute -bottom-24 left-[20%] h-72 w-72 rounded-full opacity-10" style={{ background: `radial-gradient(circle, ${profileStyle.accentColor}33, transparent 70%)` }} />
      </div>

      <main className="relative z-10 mx-auto min-w-0 w-full max-w-[1600px] px-4 py-4 pb-24 sm:px-6 sm:py-5 sm:pb-28 lg:px-8 xl:px-10">

        {/* ---- header ---- */}
        <div className="mp-animate flex items-center justify-between mb-4 sm:mb-5" style={{ animationDelay: '0ms' }}>
          <button
            onClick={onBack}
            className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-[#D2E3FC] bg-white/95 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-[#202124] transition active:scale-95 sm:px-5 sm:py-3 sm:text-sm sm:tracking-[0.2em]"
          >
            \u2190 Back
          </button>
          <div className="flex items-center gap-2 rounded-full border border-[#D2E3FC] bg-white/95 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#1967D2] shadow-sm sm:px-4 sm:text-xs">
            <span className="text-lg leading-none">{'\u{1F525}'}</span> {streakDays}d
          </div>
        </div>

        {/* ---- hero card ---- */}
        <section className={`mp-slide-up w-full max-w-full overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] ${glassCard}`} style={{ animationDelay: '60ms' }}>
          <div className="relative w-full max-w-full overflow-hidden bg-gradient-to-br from-[#174EA6] via-[#1A73E8] to-[#7B61FF]">
            <div className="absolute inset-0 bg-gradient-to-t from-[#202124] via-[#202124]/30 to-transparent" style={{ opacity: Number(profileStyle.heroOverlayOpacity) / 100 }} />
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/8" />
              <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />
            </div>

            <div className="relative flex flex-col items-center px-4 pb-5 pt-5 text-center sm:flex-row sm:items-end sm:px-8 sm:pb-8 sm:pt-0 sm:text-left">
              <div className="relative mb-3 sm:mb-0 sm:mr-6 sm:mt-24">
                <div className="absolute -inset-1 rounded-[2rem] bg-white/15 blur-sm" />
                <UserAvatar name={currentUser?.name} email={currentUser?.email} photoURL={currentUser?.profilePhotoSet ? currentUser.photoURL : ''} size={96} className="!h-[88px] !w-[88px] rounded-[1.5rem] border-[3px] border-white/80 text-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] relative sm:!h-[120px] sm:!w-[120px] sm:rounded-[2rem] sm:text-4xl" imageClassName="rounded-[1.5rem] sm:rounded-[2rem]" />
              </div>
              <div className="flex-1 pb-0 sm:pb-2">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span className="rounded-full border border-white/50 bg-white/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-white sm:px-3 sm:text-xs">Level {level}</span>
                  <span className="rounded-full border border-white/40 bg-white/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#C2E7FF] sm:text-xs">{subscriptionTier === 'elite' ? 'Elite Member' : 'Pro Member'} \u2022 {earningMultiplier}x</span>
                </div>
                <h1 className="mt-1.5 text-2xl font-black tracking-tight text-white drop-shadow sm:mt-2 sm:text-5xl">{currentUser?.name || 'Student'}</h1>
                <p className="mt-1 text-xs font-semibold text-[#E8F0FE]/90 sm:text-sm">
                  {currentUser?.email || 'student@learninghub.dev'}
                  {currentUser?.mobile ? ` \u2022 +91 ${currentUser.mobile}` : ''}
                </p>
                {/* level progress bar */}
                <div className="mx-auto mt-3 max-w-[280px] sm:mx-0">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.16em] text-[#C2E7FF]/90">
                    <span>Level {level}</span>
                    <span>{pointsRemaining} to Level {level + 1}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#C2E7FF] via-white to-[#C2E7FF] shadow-[0_0_10px_rgba(255,255,255,0.4)]" style={{ width: `${nextLevelProgress}%` }} />
                  </div>
                </div>
              </div>

              {/* coin balance chip */}
              <div className="mt-3 sm:mt-0 sm:ml-4 sm:self-end sm:pb-2">
                <div className="flex items-center gap-2 rounded-2xl border border-white/25 bg-[#202124]/50 px-4 py-2.5 text-white shadow-lg sm:rounded-3xl sm:px-5 sm:py-3">
                  <span className="mp-coin-icon text-xl sm:text-2xl">{'\u{1FA99}'}</span>
                  <div className="text-left sm:text-right">
                    <p className="text-xl font-black leading-none sm:text-2xl">{profileCoinWallet.coinBalance}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#C2E7FF]/90">EduCoins</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- quick stats: horizontal scroll on mobile ---- */}
        <div className="mp-animate mp-stats-scroll mt-4 flex gap-3 overflow-x-auto sm:mt-5 sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible" style={{ animationDelay: '120ms' }}>
          {statCards.map((stat, i) => (
            <div key={stat.label} className={`flex min-w-[130px] shrink-0 items-center gap-3 rounded-[1.25rem] border border-[#D2E3FC] bg-white/95 p-3.5 shadow-sm sm:min-w-0 sm:rounded-[1.5rem] sm:p-4 ${glassCard}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#E8F0FE] to-[#C2E7FF]/60 text-lg sm:h-11 sm:w-11 sm:text-xl">{stat.icon}</div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-[#5F6368]">{stat.label}</p>
                <p className="mt-0.5 text-lg font-black leading-tight sm:text-xl">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ---- desktop tab bar ---- */}
        <div className="mp-desktop-tabs mp-animate sticky top-3 z-30 mt-4 hidden rounded-[1.4rem] border border-[#D2E3FC] bg-white/95 p-2 shadow-[0_18px_45px_rgba(15,23,42,0.10)] sm:mt-5 sm:rounded-[1.75rem] sm:p-3" style={{ animationDelay: '160ms' }}>
          <div className="grid grid-cols-4 gap-2">
            {profileTabs.map(tab => {
              const isActive = activeProfileFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveProfileFilter(tab.id)}
                  className={`rounded-2xl px-3 py-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-200 sm:px-4 ${isActive ? 'border border-[#1A73E8] bg-[#E8F0FE] text-[#174EA6] shadow-sm' : 'border border-transparent bg-transparent text-[#5F6368] hover:bg-[#F8FAFD]'}`}
                  aria-pressed={isActive}
                >
                  <span className="block text-sm font-black sm:text-base">{TAB_ICONS[tab.id]} {tab.label}</span>
                  <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-[0.14em] opacity-75 sm:text-xs">{tab.helper}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ============================================= */}
        {/* OVERVIEW + GENERAL SECTIONS                    */}
        {/* ============================================= */}

        {showSection('overview') && (
          <>
            {/* snapshot + coin balance */}
            <div className="mp-animate mt-4 grid gap-4 sm:mt-5 lg:grid-cols-[1.3fr_0.7fr]" style={{ animationDelay: '200ms' }}>
              <div className={`rounded-[1.5rem] p-5 sm:rounded-[2rem] sm:p-6 ${glassCard}`}>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#1967D2]">Account Snapshot</p>
                <h2 className="mt-2 text-xl font-black text-[#202124] sm:text-2xl">Your learning, your pace.</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#5F6368]">Use the tabs to jump between courses, rewards, and wallet activity.</p>
              </div>
              <div className={`rounded-[1.5rem] p-5 sm:rounded-[2rem] sm:p-6 ${glassCard}`}>
                <p className="text-sm font-semibold text-slate-500">EduCoin Balance</p>
                <h2 className="mt-1 text-3xl font-black text-slate-900">{profileCoinWallet.coinBalance} EduCoins</h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center"><p className="text-xs font-semibold text-slate-500">Earned</p><p className="text-lg font-black text-emerald-700">{profileCoinWallet.totalCoinsEarned}</p></div>
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-center"><p className="text-xs font-semibold text-slate-500">Spent</p><p className="text-lg font-black text-rose-700">{profileCoinWallet.totalCoinsSpent}</p></div>
                </div>
                {profileCoinError && <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{profileCoinError}</p>}
              </div>
            </div>
          </>
        )}

        {/* ============================================= */}
        {/* STREAK REWARDS (collapsible)                   */}
        {/* ============================================= */}
        {showSection('rewards') && (
          <section className={`mp-animate mt-4 sm:mt-5 ${glassCard} rounded-[1.5rem] sm:rounded-[2rem]`} style={{ animationDelay: '260ms' }}>
            <button
              type="button"
              onClick={() => toggleSection('streaks')}
              className="flex w-full items-center justify-between p-4 text-left sm:p-5"
            >
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">Streak Goals</p>
                <div className="flex items-center gap-2 mt-1">
                  <h2 className="text-xl font-black sm:text-2xl">Backend-Verified Rewards</h2>
                  {streakCards.filter(streak => streak.claimable).length > 0 && (
                    <span className="mp-claimable-pulse rounded-full bg-[#1A73E8] px-2.5 py-0.5 text-[10px] font-black text-white">{streakCards.filter(streak => streak.claimable).length} ready</span>
                  )}
                </div>
              </div>
              <span className={`text-xl text-[#5F6368] transition-transform duration-300 ${expandedSections.streaks ? 'rotate-180' : ''}`}>&#9660;</span>
            </button>

            <div className={`mp-section-collapse ${expandedSections.streaks ? '' : 'mp-collapsed'}`}>
              <div>
                <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                  <p className="text-xs font-bold leading-5 text-[#5F6368] sm:text-sm">Goals are tracked from wallet, course, quiz, watch, and backend streak data only.</p>
                  <div className="mt-4 grid gap-3 sm:gap-4 xl:grid-cols-2">
                    {streakCards.map((streak) => (
                      <article key={streak.id} className="group relative overflow-hidden rounded-[1.25rem] border border-[#E0E3EB] bg-white/95 p-3.5 shadow-[0_6px_18px_rgba(26,115,232,0.08)] sm:rounded-[1.5rem] sm:p-4">
                        <div className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${streak.accent}`} />
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${streak.accent} text-2xl shadow-[0_12px_30px_rgba(26,115,232,0.18)] sm:h-14 sm:w-14 sm:text-3xl`}>{streak.icon}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-black text-[#202124] sm:text-lg">{streak.title}</h3>
                              <span className="rounded-full bg-[#FEF7E0] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#1967D2]">+{streak.coinReward}</span>
                            </div>
                            <p className="mt-1 text-xs font-bold leading-5 text-[#5F6368] line-clamp-2">{streak.note}</p>
                            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#DADCE0]/80">
                              <div className={`h-full rounded-full bg-gradient-to-r ${streak.accent} shadow-[0_0_18px_rgba(26,115,232,0.25)]`} style={{ width: `${streak.progress}%` }} />
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs font-black text-[#5F6368]">
                              <span>{streak.value} / {streak.goal} {streak.unit}</span>
                              <span>{Math.round(streak.progress)}%</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={!streak.claimable}
                            onClick={() => handleStreakClaim(streak)}
                            className={`min-h-[44px] w-full rounded-2xl px-4 py-2.5 text-xs font-black transition active:scale-95 sm:w-40 sm:py-3 sm:text-sm ${streak.claimedToday ? 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]' : streak.claimable ? 'bg-gradient-to-r from-[#1A73E8] to-[#174EA6] text-white shadow-[0_12px_30px_rgba(26,115,232,0.22)]' : 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]'}`}
                          >
                            {streak.claimedToday ? 'Claimed Today' : streak.claimable ? 'Claim Coins' : 'Complete Target'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ============================================= */}
        {/* LEARNING                                     */}
        {/* ============================================= */}
        {showSection('learning') && (
          <section className="mp-animate mt-4 grid gap-4 sm:mt-5 sm:gap-6 lg:grid-cols-[1.15fr_0.85fr]" style={{ animationDelay: '320ms' }}>
            {/* courses */}
            <div className={`overflow-hidden rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6 ${glassCard}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">Learning Analytics</p>
                  <h2 className="mt-1 text-xl font-black sm:text-2xl">Course Completion</h2>
                </div>
                {!purchasedProducts.length && (
                  <button onClick={onExplore} className="min-h-[44px] w-full rounded-full bg-[#1A73E8] px-4 py-2 text-xs font-black text-white shadow-sm transition active:scale-95 sm:w-auto sm:text-sm">
                    Explore Courses
                  </button>
                )}
              </div>
              {courseAccessError && (
                <div className="mt-4 rounded-2xl border border-[#FAD2CF] bg-[#FCE8E6] px-4 py-3 text-sm font-black text-[#C5221F] shadow-sm" role="alert">{courseAccessError}</div>
              )}
              <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4">
                {learningProgress.length ? learningProgress.map((course, index) => {
                  const circumference = 2 * Math.PI * 38;
                  const dashOffset = circumference - (course.completion / 100) * circumference;
                  const accent = [
                    'from-[#1A73E8] via-[#1967D2] to-[#174EA6]',
                    'from-[#D3E3FD] via-[#1A73E8] to-[#174EA6]',
                    'from-[#FEF7E0] via-[#D3E3FD] to-[#1A73E8]',
                    'from-[#E6F4EA] via-[#E8F0FE] to-[#1A73E8]',
                  ][index % 4];
                  return (
                    <article key={course.id} className="group relative overflow-hidden rounded-[1.25rem] border border-[#E0E3EB] bg-white/95 p-4 shadow-[0_6px_18px_rgba(26,115,232,0.08)] sm:rounded-[1.75rem] sm:p-5">
                      <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${accent}`} />
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="relative mx-auto h-20 w-20 shrink-0 sm:mx-0 sm:h-24 sm:w-24">
                          <svg viewBox="0 0 100 100" className="relative h-full w-full -rotate-90 drop-shadow-sm">
                            <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-[#202124]/10" />
                            <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="10" fill="transparent" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} className={index % 2 === 0 ? 'text-[#1A73E8]' : 'text-[#1967D2]'} />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full">
                            <span className="text-xl font-black text-[#202124]">{course.completion}%</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#5F6368]">Done</span>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-[#D2E3FC] bg-white/95 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-[#1967D2]">{course.category}</span>
                            <span className="rounded-full bg-[#F8FAFD] px-2.5 py-0.5 text-xs font-black text-[#5F6368]">{course.totalLessons || 1} lessons</span>
                          </div>
                          <h3 className="mt-2 line-clamp-2 text-lg font-black text-[#202124] sm:text-xl">{course.title}</h3>
                          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#E8F0FE]">
                            <div className={`h-full rounded-full bg-gradient-to-r ${accent}`} style={{ width: `${course.completion}%` }} />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.16em] text-[#5F6368]">
                            <span>{course.completion >= 100 ? 'Completed' : 'In Progress'}</span>
                            <span>{Math.max(0, 100 - course.completion)}% left</span>
                          </div>
                        </div>
                        <button type="button" onClick={() => handleContinueLearning(course)} className={`min-h-[44px] w-full rounded-2xl bg-gradient-to-r ${accent} px-4 py-2.5 text-xs font-black text-white shadow-[0_10px_25px_rgba(26,115,232,0.22)] transition active:scale-95 sm:w-auto sm:px-5 sm:py-3 sm:text-sm`}>
                          {course.completion >= 100 ? 'Continue' : 'Resume'}
                        </button>
                      </div>
                    </article>
                  );
                }) : <div className="rounded-2xl border border-dashed border-[#D2E3FC] bg-white/95 p-5 text-center text-sm font-bold text-[#5F6368] sm:rounded-3xl sm:p-6 sm:text-base">No purchased course progress yet. Buy or open a course to start real completion tracking.</div>}
              </div>
            </div>

            {/* badges */}
            <div className={`overflow-hidden rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6 ${glassCard}`}>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">Verified Badges</p>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">Achievement Progress</h2>
              <div className="mt-4 grid gap-3">
                {badges.map((badge) => {
                  const progress = clamp((badge.currentValue / Math.max(1, badge.goal)) * 100);
                  return (
                    <article key={badge.id} className={`rounded-2xl border p-3.5 transition sm:p-4 ${badge.unlocked ? 'border-[#CEEAD6] bg-[#E6F4EA] shadow-[0_8px_20px_rgba(52,168,83,0.12)]' : 'border-[#D2E3FC] bg-white/80 opacity-80'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl sm:h-12 sm:w-12 sm:text-2xl ${badge.unlocked ? 'bg-white shadow-sm' : 'bg-[#F8FAFD] grayscale'}`}>{badge.icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate text-sm font-black text-[#202124] sm:text-base">{badge.label}</h3>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${badge.unlocked ? 'bg-[#CEEAD6] text-[#137333]' : 'bg-[#DADCE0] text-[#5F6368]'}`}>{badge.unlocked ? 'Unlocked' : 'Locked'}</span>
                          </div>
                          <p className="mt-0.5 text-xs font-bold leading-5 text-[#5F6368]">{badge.description}</p>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E8F0FE]">
                            <div className="h-full rounded-full bg-gradient-to-r from-[#1A73E8] to-[#174EA6]" style={{ width: `${progress}%` }} />
                          </div>
                          <div className="mt-1.5 flex justify-between text-[10px] font-black uppercase tracking-[0.14em] text-[#5F6368]">
                            <span>{badge.currentValue}/{badge.goal}</span>
                            <span>{Math.round(progress)}%</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!badges.some(badge => badge.unlocked) && <div className="mt-4 rounded-2xl border border-dashed border-[#D2E3FC] bg-white/95 p-3 text-xs font-bold text-[#5F6368] sm:p-4 sm:text-sm">No verified badges unlocked yet. Start watching eligible course videos or complete a quiz to begin.</div>}
            </div>
          </section>
        )}

        {/* ============================================= */}
        {/* MILESTONES (collapsible)                       */}
        {/* ============================================= */}
        {showSection('rewards') && (
          <section className={`mp-animate mt-4 sm:mt-5 ${glassCard} rounded-[1.5rem] sm:rounded-[2rem]`} style={{ animationDelay: '380ms' }}>
            <button
              type="button"
              onClick={() => toggleSection('milestones')}
              className="flex w-full items-center justify-between p-4 text-left sm:p-5"
            >
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">Milestones</p>
                <h2 className="mt-1 text-xl font-black sm:text-2xl">Glowing Milestones</h2>
              </div>
              <span className={`text-xl text-[#5F6368] transition-transform duration-300 ${expandedSections.milestones ? 'rotate-180' : ''}`}>&#9660;</span>
            </button>

            <div className={`mp-section-collapse ${expandedSections.milestones ? '' : 'mp-collapsed'}`}>
              <div>
                <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                  <p className="text-xs leading-5 text-[#5F6368] sm:text-sm">Lifetime earned: {'\u{1FA99}'} {totalLifetimeCoins}. Reached milestones unlock downloads or access.</p>
                  <div className="mt-4 grid gap-3 sm:gap-4 lg:grid-cols-3">
                    {milestoneRewards.map(reward => {
                      const claimed = (currentUser?.claimedRewardIds || []).includes(reward.id);
                      return (
                        <article key={reward.id} className={`relative overflow-hidden rounded-[1.25rem] border p-4 sm:rounded-[1.75rem] sm:p-5 ${claimed ? 'border-[#CEEAD6] bg-[#E6F4EA] shadow-[0_0_18px_rgba(52,168,83,0.14)]' : reward.reached ? 'border-[#1A73E8] bg-white/95 shadow-[0_0_20px_rgba(26,115,232,0.22)]' : 'border-[#D2E3FC] bg-white/72 opacity-85'}`}>
                          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#D3E3FD] via-[#1A73E8] to-[#C2E7FF]" />
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/95 text-xl shadow-sm sm:h-12 sm:w-12 sm:text-2xl">{reward.icon}</div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-black text-[#202124] sm:text-base">{reward.title}</h3>
                              <p className="mt-0.5 text-xs font-bold leading-5 text-[#5F6368] sm:text-sm sm:leading-6">{reward.description}</p>
                              <p className="mt-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#1967D2]">{reward.currentValue} / {reward.requirement} {reward.metric}</p>
                            </div>
                          </div>
                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#DADCE0]/80">
                            <div className="h-full rounded-full bg-gradient-to-r from-[#D3E3FD] via-[#1A73E8] to-[#C2E7FF]" style={{ width: `${reward.progress}%` }} />
                          </div>
                          <button type="button" disabled={!reward.reached || claimed} onClick={() => handleMilestoneClaim(reward)} className={`mt-4 min-h-[44px] w-full rounded-2xl px-4 py-2.5 text-xs font-black shadow-sm transition active:scale-95 sm:py-3 sm:text-sm ${claimed ? 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]' : reward.reached ? 'bg-gradient-to-r from-[#1A73E8] to-[#174EA6] text-white' : 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]'}`}>
                            {claimed ? 'Claimed / Unlocked' : reward.reached ? `${reward.actionLabel}${reward.coinReward ? ` (+${reward.coinReward})` : ''}` : `${Math.max(0, reward.requirement - reward.currentValue)} more to unlock`}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ============================================= */}
        {/* REWARDS VAULT + THEME/COUPONS                 */}
        {/* ============================================= */}
        {showSection('rewards') && (
          <div className="mt-4 grid gap-4 sm:mt-5 sm:gap-6 lg:grid-cols-2">
            {/* rewards vault - collapsible */}
            <div className={`mp-animate ${glassCard} rounded-[1.5rem] sm:rounded-[2rem]`} style={{ animationDelay: '440ms' }}>
              <button
                type="button"
                onClick={() => toggleSection('rewardsVault')}
                className="flex w-full items-center justify-between p-4 text-left sm:p-5"
              >
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#137333] sm:text-sm sm:tracking-[0.3em]">Rewards Vault</p>
                  <h2 className="mt-1 text-xl font-black sm:text-2xl">What You Can Claim</h2>
                </div>
                <span className={`text-xl text-[#5F6368] transition-transform duration-300 ${expandedSections.rewardsVault ? 'rotate-180' : ''}`}>&#9660;</span>
              </button>
              <div className={`mp-section-collapse ${expandedSections.rewardsVault ? '' : 'mp-collapsed'}`}>
                <div>
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                    <p className="text-xs leading-5 text-[#5F6368] sm:text-sm">Live wallet: {'\u{1FA99}'} {eduPoints} {'\u2022'} {coinRedeemRate} EduCoins = {'\u20B9'}1 discount.</p>
                    <div className="mt-4 grid gap-3">
                      {dynamicClaimCards.length ? dynamicClaimCards.map((reward) => {
                        const { isActive, isRedeemed } = getRewardButtonState(reward);
                        const isDisabled = isRedeemed || !reward.claimable;
                        const buttonLabel = isRedeemed ? 'Redeemed / Disabled' : isActive ? 'Applied - Tap to Remove' : reward.claimable ? 'Apply & Checkout' : 'Keep Earning';
                        return (
                          <article
                            key={reward.id}
                            className={`rounded-2xl border p-3.5 text-left transition sm:p-4 ${isRedeemed ? 'border-[#DADCE0] bg-[#F8FAFD] opacity-70' : isActive ? 'border-[#CEEAD6] bg-[#E6F4EA] shadow-[0_0_16px_rgba(52,168,83,0.14)]' : reward.claimable ? 'border-[#1A73E8] bg-white/95 shadow-[0_0_12px_rgba(26,115,232,0.22)]' : 'border-[#D2E3FC] bg-white/95 shadow-sm'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] ${isRedeemed ? 'border-[#DADCE0] bg-[#DADCE0] text-[#5F6368]' : isActive ? 'border-[#CEEAD6] bg-[#E6F4EA] text-[#137333]' : 'border-[#D2E3FC] bg-[#FEF7E0] text-[#B06000]'}`}>{reward.type}</span>
                                <h3 className="mt-2 text-sm font-black text-[#202124] sm:text-base">{reward.mode === 'unlock' ? `Unlock ${reward.name} for ${reward.requiredCoins} Coins` : `Claim \u20B9${reward.discount} Discount on ${reward.name}`}</h3>
                                <p className="mt-1 text-xs font-bold text-[#5F6368]">{isRedeemed ? 'Already used.' : reward.mode === 'unlock' ? 'Full access via EduCoin wallet.' : `Uses \u{1FA99} ${reward.requiredCoins} at checkout.`} {!isRedeemed && (reward.claimable ? 'Ready to apply.' : `Earn ${Math.max(0, reward.requiredCoins - eduPoints)} more coins.`)}</p>
                              </div>
                              <span className="text-xl shrink-0">{isRedeemed ? '\u2705' : isActive ? '\u{1F525}' : reward.claimable ? '\u2728' : '\u{1F512}'}</span>
                            </div>
                            <button
                              type="button"
                              disabled={isDisabled}
                              onClick={() => handleRewardToggle(reward)}
                              className={`mt-3 min-h-[44px] w-full rounded-2xl px-4 py-2.5 text-xs font-black shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition active:scale-95 sm:py-3 sm:text-sm ${isRedeemed ? 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]' : isActive ? 'bg-gradient-to-r from-[#1A73E8] to-[#174EA6] text-white' : reward.claimable ? 'bg-gradient-to-r from-[#1A73E8] to-[#174EA6] text-white' : 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]'}`}
                            >
                              {buttonLabel}
                            </button>
                          </article>
                        );
                      }) : <p className="rounded-2xl border border-[#D2E3FC] bg-white/95 p-3 text-sm text-[#5F6368] sm:p-4">Reward claims will appear here once products or subscriptions are available.</p>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* theme + coupons - collapsible */}
            <div className={`mp-animate ${glassCard} rounded-[1.5rem] sm:rounded-[2rem]`} style={{ animationDelay: '500ms' }}>
              <button
                type="button"
                onClick={() => toggleSection('coupons')}
                className="flex w-full items-center justify-between p-4 text-left sm:p-5"
              >
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">Personalization</p>
                  <h2 className="mt-1 text-xl font-black sm:text-2xl">Theme & Coupons</h2>
                </div>
                <span className={`text-xl text-[#5F6368] transition-transform duration-300 ${expandedSections.coupons ? 'rotate-180' : ''}`}>&#9660;</span>
              </button>
              <div className={`mp-section-collapse ${expandedSections.coupons ? '' : 'mp-collapsed'}`}>
                <div>
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                      {Object.values(themes).filter(theme => theme.name !== 'Midnight').map(theme => {
                        const key = theme.name.toLowerCase() as ThemeName;
                        return (
                          <button
                            key={theme.name}
                            onClick={() => onThemeChange(key)}
                            className={`rounded-2xl border p-3 text-left transition active:scale-95 ${activeTheme === key ? 'border-[#C2E7FF] bg-[#E8F0FE]' : 'border-[#D2E3FC] bg-white/95'}`}
                          >
                            <div className="flex -space-x-1">
                              <span className="h-4 w-4 rounded-full border border-white" style={{ background: '#1A73E8' }} />
                              <span className="h-4 w-4 rounded-full border border-white" style={{ background: '#E8F0FE' }} />
                            </div>
                            <div className="mt-2 text-sm font-bold">{theme.name}</div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-5">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <h3 className="text-lg font-black text-[#202124]">Available Coupons</h3>
                        <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-black text-[#1967D2] shadow-sm">{profileCoupons.length} total</span>
                      </div>
                      <div className="mt-3 grid gap-3">
                        {profileCoupons.length ? profileCoupons.map(coupon => {
                          const isCouponActive = coupon.isActive;
                          const buttonLabel = isCouponActive ? (redeemedCouponCode === coupon.code ? 'Code copied' : 'Redeem') : 'Not available';
                          return (
                            <div key={coupon.id} className={`rounded-2xl border p-3 transition sm:p-4 ${isCouponActive ? 'border-dashed border-[#CEEAD6] bg-[#E6F4EA] shadow-[0_6px_20px_rgba(16,185,129,0.08)]' : 'border-[#E0E3EB] bg-[#F8FAFD] opacity-75'}`}>
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`font-black ${isCouponActive ? 'text-[#137333]' : 'text-[#5F6368]'}`}>{coupon.code}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${isCouponActive ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#DADCE0] text-[#5F6368]'}`}>{isCouponActive ? 'Active' : 'Inactive'}</span>
                                  </div>
                                  <p className="mt-1 text-sm font-bold text-[#5F6368]">{coupon.type === 'percentage' ? `${coupon.value}% off` : `\u20B9${coupon.value} off`} \u2022 expires {coupon.expiryDate}</p>
                                </div>
                                <button
                                  type="button"
                                  disabled={!isCouponActive}
                                  onClick={() => handleCouponRedeem(coupon)}
                                  className={`min-h-[44px] w-full rounded-2xl px-4 py-2.5 text-sm font-black transition active:scale-95 sm:w-auto ${isCouponActive ? 'bg-gradient-to-r from-[#1A73E8] to-[#174EA6] text-white shadow-[0_8px_20px_rgba(26,115,232,0.18)]' : 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]'}`}
                                >
                                  {buttonLabel}
                                </button>
                              </div>
                            </div>
                          );
                        }) : (
                          <p className="rounded-2xl border border-[#D2E3FC] bg-white/95 p-3 text-sm text-[#5F6368] sm:p-4">No coupons are listed from admin panel yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================= */}
        {/* WALLET LEDGER                                */}
        {/* ============================================= */}
        {showSection('wallet') && (
          <section className={`mp-animate mt-4 sm:mt-5 ${glassCard} rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6`} style={{ animationDelay: '540ms' }}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">Coin History</p>
                <h2 className="mt-1 text-xl font-black sm:text-2xl">Live Earning Ledger</h2>
              </div>
              <p className="text-xs leading-5 text-[#5F6368] sm:text-sm">Synced from your wallet ledger.</p>
            </div>
            <div className="mt-4 grid gap-2.5 sm:mt-5">
              {coinTransactions.length ? coinTransactions.slice(0, 8).map((entry) => (
                <div key={entry.id || `${entry.createdAt}-${entry.description}`} className="flex flex-col items-start gap-3 rounded-2xl border border-[#D2E3FC] bg-white/95 p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
                  <div>
                    <p className="font-black text-[#202124]">{entry.amount >= 0 ? '\u{1F7E2}' : '\u{1F534}'} {entry.amount >= 0 ? '+' : ''}{entry.amount} Coins</p>
                    <p className="mt-1 text-xs leading-5 text-[#5F6368] sm:text-sm"><span className="font-bold">{entry.title || entry.source}</span> \u2014 {entry.description}</p>
                  </div>
                  <div className="text-left sm:text-right"><div className={`text-lg font-black ${entry.amount >= 0 ? 'text-[#137333]' : 'text-[#C5221F]'}`}>{entry.amount >= 0 ? '+' : ''}{entry.amount} Coins</div><div className="mt-1 text-xs font-bold text-[#5F6368]">{formatLedgerTime(entry.timestamp || entry.createdAt)}</div></div>
                </div>
              )) : (
                <div className="rounded-2xl border border-[#D2E3FC] bg-white/95 p-4 text-sm text-[#5F6368] sm:p-5 sm:text-base">No coin movements yet. Start learning to earn!</div>
              )}
            </div>
          </section>
        )}

      </main>

      {/* ============================================= */}
      {/* MOBILE BOTTOM TAB BAR                         */}
      {/* ============================================= */}
      <nav className="mp-bottom-tabs fixed bottom-0 left-0 right-0 z-40 border-t border-[#D2E3FC]/60 bg-white/92 sm:hidden" aria-label="Profile navigation">
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1.5">
          {profileTabs.map(tab => {
            const isActive = activeProfileFilter === tab.id;
            const claimableCount = tab.id === 'rewards' ? streakCards.filter(s => s.claimable).length : 0;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveProfileFilter(tab.id)}
                className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 transition active:scale-90 ${isActive ? 'text-[#174EA6]' : 'text-[#5F6368]'}`}
              >
                {claimableCount > 0 && (
                  <span className="absolute -top-0.5 right-1/4 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#C5221F] px-1 text-[10px] font-black text-white shadow-sm">{claimableCount}</span>
                )}
                <span className="text-xl leading-none">{TAB_ICONS[tab.id]}</span>
                <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${isActive ? 'opacity-100' : 'opacity-60'}`}>{tab.label}</span>
                {isActive && <span className="absolute -bottom-0.5 left-1/4 right-1/4 h-0.5 rounded-full bg-[#1A73E8]" />}
              </button>
            );
          })}
        </div>
      </nav>

    </div>
  );
};

export default ProfilePage;
