import React from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ActiveCoinDiscount, CoinTransaction, Coupon, ProductWithRating, ProfileMilestoneConfig, ProfileStreakConfig, ProfileStreakMetric, ProfileMilestoneMetric, ThemeName, themes, User, WebsiteSettings } from '../App';
import { EconomySettings, resolveCoinPrice, resolveMaxDiscountPercentage } from '../utils/economy';
import { db } from '../firebase';

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
  onBack: () => void;
  onExplore: () => void;
  activeTheme: ThemeName;
  onThemeChange: (themeName: ThemeName) => void;
  onSyncCurrentUser: (updater: (user: User) => User, transaction?: Omit<CoinTransaction, 'id' | 'createdAt'>) => User | null;
  onClaimMilestoneReward: (reward: { id: string; title: string; requirement: number; unlockProductIds?: number[]; coinReward?: number; currentValue?: number }) => boolean;
  onOpenVerifiedCourse?: (course: ProductWithRating) => void;
}

interface LearningProgress {
  id: number | string;
  title: string;
  category: string;
  completion: number;
  product: ProductWithRating;
  totalLessons: number;
}

interface QuizScore {
  title: string;
  score: number;
  accent: string;
}

interface Badge {
  id: string;
  label: string;
  icon: string;
  unlocked: boolean;
  description: string;
}

interface MilestoneReward extends ProfileMilestoneConfig {
  currentValue: number;
  progress: number;
  reached: boolean;
}

interface DailyActivityState {
  lastActiveDate: string;
  streakDays: number;
}

const defaultCoverImage =
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1800&q=80';

const glassCard =
  'profile-glass-card border border-[#D2E3FC] backdrop-blur-2xl shadow-[0_18px_55px_rgba(26,115,232,0.12)] transition-all duration-300 hover:-translate-y-1 hover:border-[#C2E7FF] hover:shadow-[0_22px_65px_rgba(26,115,232,0.16)]';


const fallbackProfileStyle = { backgroundColor: '#F8FAFD', backgroundTint: '#E8F0FE', cardOpacity: 95, heroOverlayOpacity: 76, accentColor: '#1A73E8' };

const fallbackStreakConfigs: ProfileStreakConfig[] = [
  { id: 'daily-login', title: 'Daily Login Spark', icon: '🔥', metric: 'dailyLogin', goal: 1, unit: 'day', coinReward: 10, accent: 'from-[#1A73E8] via-[#D3E3FD] to-[#C2E7FF]', note: 'Open your hub every day and claim today’s flame.', active: true },
  { id: 'study-15', title: '15 Minute Focus', icon: '⏱️', metric: 'studyMinutes', goal: 15, unit: 'mins', coinReward: 15, accent: 'from-[#1A73E8] via-[#1967D2] to-[#174EA6]', note: 'Watch lessons or read learning content for 15 minutes.', active: true },
  { id: 'study-45', title: 'Deep Work Sprint', icon: '⚡', metric: 'studyMinutes', goal: 45, unit: 'mins', coinReward: 25, accent: 'from-[#D3E3FD] via-[#1A73E8] to-[#174EA6]', note: 'Build a longer study session and earn a bigger boost.', active: true },
  { id: 'watch-60', title: 'Video Warrior', icon: '🎬', metric: 'watchMinutes', goal: 60, unit: 'mins', coinReward: 30, accent: 'from-[#1A73E8] via-[#1967D2] to-[#C2E7FF]', note: 'Complete one hour of course video watch time.', active: true },
  { id: 'pdf-3', title: 'PDF Reader', icon: '📄', metric: 'pdfsRead', goal: 3, unit: 'PDFs', coinReward: 20, accent: 'from-[#E6F4EA] via-[#D3E3FD] to-[#1A73E8]', note: 'Read premium notes and document resources.', active: true },
  { id: 'article-3', title: 'Knowledge Hunter', icon: '🧠', metric: 'articlesRead', goal: 3, unit: 'reads', coinReward: 20, accent: 'from-[#E6F4EA] via-[#E8F0FE] to-[#1A73E8]', note: 'Read news or blog lessons to keep learning daily.', active: true },
  { id: 'quiz-1', title: 'Quiz Ignition', icon: '🎯', metric: 'quizWins', goal: 1, unit: 'win', coinReward: 25, accent: 'from-[#D3E3FD] via-[#1A73E8] to-[#C2E7FF]', note: 'Finish a quiz and claim your first quiz streak.', active: true },
  { id: 'quiz-3', title: 'Quiz Momentum', icon: '🏹', metric: 'quizWins', goal: 3, unit: 'wins', coinReward: 40, accent: 'from-[#D3E3FD] via-[#1A73E8] to-[#174EA6]', note: 'Stack multiple quiz rewards to keep momentum alive.', active: true },
  { id: 'course-1', title: 'Course Starter', icon: '📚', metric: 'coursesOwned', goal: 1, unit: 'course', coinReward: 25, accent: 'from-[#1A73E8] via-[#1967D2] to-[#C2E7FF]', note: 'Own your first course and start your premium path.', active: true },
  { id: 'complete-1', title: 'Completion Charge', icon: '✅', metric: 'completedCourses', goal: 1, unit: 'done', coinReward: 50, accent: 'from-[#E6F4EA] via-[#D3E3FD] to-[#1A73E8]', note: 'Complete one tracked course.', active: true },
  { id: 'wallet-500', title: 'Coin Collector', icon: '🪙', metric: 'lifetimeCoins', goal: 500, unit: 'coins', coinReward: 35, accent: 'from-[#FEF7E0] via-[#D3E3FD] to-[#1A73E8]', note: 'Earn lifetime coins from real activity.', active: true },
  { id: 'badge-3', title: 'Badge Builder', icon: '🏅', metric: 'badgesUnlocked', goal: 3, unit: 'badges', coinReward: 30, accent: 'from-[#5F6368] via-[#1A73E8] to-[#174EA6]', note: 'Unlock badges by learning and completing.', active: true },
];

const fallbackMilestoneConfigs: ProfileMilestoneConfig[] = [
  { id: 'first-login-flame', title: 'First Login Flame', icon: '🔥', metric: 'studyMinutes', requirement: 1, description: 'Start learning with your first active minute.', actionLabel: 'Claim Coins', coinReward: 25, active: true },
  { id: 'article-reader', title: 'Article Reader', icon: '📰', metric: 'articlesRead', requirement: 3, description: 'Read three learning articles or blog lessons.', actionLabel: 'Claim Reading Bonus', coinReward: 40, active: true },
  { id: 'video-hour', title: 'One Hour Video Charge', icon: '🎬', metric: 'watchMinutes', requirement: 60, description: 'Complete 60 minutes of course video watch time.', actionLabel: 'Claim Watch Bonus', coinReward: 60, active: true },
  { id: 'quiz-master-real', title: 'Quiz Master', icon: '🎯', metric: 'quizWins', requirement: 3, description: 'Claim rewards from three unique quizzes.', actionLabel: 'Claim Quiz Bonus', coinReward: 75, active: true },
  { id: 'pdf-scholar', title: 'PDF Scholar', icon: '📄', metric: 'pdfsRead', requirement: 5, description: 'Read or own five PDF/document resources.', actionLabel: 'Download Scholar Pack', coinReward: 50, downloadContent: 'Digital Catalyst PDF Scholar Pack\n\n- Reading checklist\n- Revision tracker\n- Daily active planner', active: true },
  { id: 'course-finisher', title: 'Course Finisher', icon: '✅', metric: 'completedCourses', requirement: 1, description: 'Reach 100% completion on a course tracker.', actionLabel: 'Claim Completion Bonus', coinReward: 100, active: true },
  { id: 'wallet-elite', title: 'Wallet Elite', icon: '💎', metric: 'lifetimeCoins', requirement: 1000, description: 'Earn 1000 lifetime EduCoins.', actionLabel: 'Claim Elite Badge', coinReward: 125, active: true },
  { id: 'premium-unlocker', title: 'Premium Unlocker', icon: '🎓', metric: 'coursesOwned', requirement: 2, description: 'Own two premium learning products.', actionLabel: 'Unlock Bonus Access', coinReward: 80, unlockProductIds: [], active: true },
];

const getStorageKey = (userId?: number) => `studentAchievementHubCover-${userId ?? 'guest'}`;

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
}) => {
  const navigate = useNavigate();
  const coverInputRef = React.useRef<HTMLInputElement | null>(null);
  const [coverImage, setCoverImage] = React.useState(defaultCoverImage);
  const [redeeming, setRedeeming] = React.useState<string | null>(null);
  const [redeemedCouponCode, setRedeemedCouponCode] = React.useState<string | null>(null);
  const [coinTransactions, setCoinTransactions] = React.useState<CoinTransaction[]>([]);
  const [locallyRedeemedRewardIds, setLocallyRedeemedRewardIds] = React.useState<string[]>([]);
  const [dailyActivity, setDailyActivity] = React.useState<DailyActivityState>({ lastActiveDate: '', streakDays: 0 });
  const [courseAccessError, setCourseAccessError] = React.useState('');

  React.useEffect(() => {
    const storedCover = localStorage.getItem(getStorageKey(currentUser?.id));
    setCoverImage(storedCover || defaultCoverImage);
  }, [currentUser?.id]);

  React.useEffect(() => {
    if (!currentUser?.id) {
      setCoinTransactions([]);
      return;
    }

    const storageKey = `coinTransactions-${currentUser.id}`;
    const localLedger = JSON.parse(localStorage.getItem(storageKey) || '[]') as CoinTransaction[];
    setCoinTransactions([...(currentUser.coinTransactions || []), ...localLedger].slice(0, 12));

    const ledgerQuery = query(collection(db, 'users', String(currentUser.id), 'coinTransactions'), orderBy('createdAt', 'desc'));
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
  }, [currentUser?.id, currentUser?.coinTransactions]);


  React.useEffect(() => {
    if (!currentUser?.id) {
      setDailyActivity({ lastActiveDate: '', streakDays: 0 });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const key = `profileDailyActivity-${currentUser.id}`;
    const stored = JSON.parse(localStorage.getItem(key) || 'null') as DailyActivityState | null;
    const next = !stored
      ? { lastActiveDate: today, streakDays: 1 }
      : stored.lastActiveDate === today
        ? stored
        : { lastActiveDate: today, streakDays: stored.lastActiveDate === yesterday ? stored.streakDays + 1 : 1 };
    setDailyActivity(next);
    localStorage.setItem(key, JSON.stringify(next));
  }, [currentUser?.id]);

  const profileCoupons = React.useMemo(() => coupons, [coupons]);
  const coinRedeemRate = Math.max(1, Number(economySettings.coinToFiatRatio));
  const studyMinutes = currentUser?.studyMinutes ?? 0;
  const watchTimeMinutes = currentUser?.totalWatchTimeMinutes ?? studyMinutes;
  const eduPoints = currentUser?.eduCoins ?? 0;
  const totalLifetimeCoins = currentUser?.totalLifetimeCoins ?? eduPoints;
  const profileStyle = { ...fallbackProfileStyle, ...((settings.content as any).profileStyle || {}) };
  const profileStreakConfigs = (((settings.content as any).profileStreaks || fallbackStreakConfigs) as ProfileStreakConfig[]).filter(streak => streak.active !== false).slice(0, 12);
  const profileMilestoneConfigs = (((settings.content as any).profileMilestones || fallbackMilestoneConfigs) as ProfileMilestoneConfig[]).filter(milestone => milestone.active !== false).slice(0, 12);
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
    if (!currentUser?.id) return 0;
    const stored = Number(localStorage.getItem(`courseProgress-${currentUser.id}-${productId}`) || localStorage.getItem(`courseCompletion-${currentUser.id}-${productId}`) || 0);
    return Number.isFinite(stored) ? clamp(stored) : 0;
  };

  const learningProgress: LearningProgress[] = purchasedProducts.length
    ? purchasedProducts.slice(0, 5).map((product, index) => {
        const explicitCompletion = getStoredCompletion(product.id);
        const requiredMinutes = Math.max(30, getCourseFileCount(product.courseContent || []) * 15 || 60);
        const allocatedWatchMinutes = Math.max(0, watchTimeMinutes - index * requiredMinutes);
        const watchCompletion = clamp((allocatedWatchMinutes / requiredMinutes) * 100);
        const completion = explicitCompletion > 0 ? explicitCompletion : watchCompletion;
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
    navigate(`/course/${course.id}`);
    onOpenVerifiedCourse?.(course.product);
  };

  const completedCourses = learningProgress.filter(course => course.completion >= 100).length;
  const level = Math.max(1, Math.floor(eduPoints / 500) + 1);
  const currentLevelStart = (level - 1) * 500;
  const pointsIntoLevel = eduPoints - currentLevelStart;
  const pointsForNextLevel = 500;
  const nextLevelProgress = clamp((pointsIntoLevel / pointsForNextLevel) * 100);
  const pointsRemaining = Math.max(0, pointsForNextLevel - pointsIntoLevel);
  const streakDays = dailyActivity.streakDays || (currentUser?.lastLoginAt ? 1 : 0);
  const continuousLearningDays = Math.max(streakDays, Math.min(90, Math.floor(watchTimeMinutes / 35) + completedCourses));
  const badgesUnlockedCount = [quizWinCount >= 1, Boolean(currentUser?.createdAt), completedCourses >= 1, streakDays >= 5, purchasedProducts.length >= 3, level >= 5].filter(Boolean).length;

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

  const quizScores: QuizScore[] = (currentUser?.rewardedQuizIds || []).slice(0, 6).map((quizId, index) => ({
    title: String(quizId).replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase()),
    score: 100,
    accent: ['from-[#1A73E8] to-[#174EA6]', 'from-[#D3E3FD] to-[#1A73E8]', 'from-[#FEF7E0] to-[#1A73E8]', 'from-[#E6F4EA] to-[#1A73E8]'][index % 4],
  }));

  const streakCards = profileStreakConfigs.map(streak => {
    const value = getMetricValue(streak.metric);
    const claimKey = `${streak.id}:${dailyActivity.lastActiveDate || new Date().toISOString().slice(0, 10)}`;
    const claimedToday = currentUser?.profileStreakClaims?.[streak.id] === claimKey;
    return {
      ...streak,
      value,
      progress: clamp((value / Math.max(1, Number(streak.goal))) * 100),
      claimKey,
      claimedToday,
      claimable: value >= Number(streak.goal) && !claimedToday && Number(streak.coinReward || 0) > 0,
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
    {
      id: 'quiz-master',
      label: 'Quiz Master',
      icon: '🎯',
      unlocked: quizWinCount >= 1,
      description: 'Claim one quiz reward',
    },
    {
      id: 'early-adopter',
      label: 'Early Adopter',
      icon: '🚀',
      unlocked: Boolean(currentUser?.createdAt),
      description: 'Joined the learning hub',
    },
    {
      id: 'first-course',
      label: 'First Course Completed',
      icon: '🏆',
      unlocked: completedCourses >= 1,
      description: 'Reach 100% course progress',
    },
    {
      id: 'streak-flame',
      label: 'Streak Flame',
      icon: '🔥',
      unlocked: streakDays >= 5,
      description: 'Stay active for 5 days',
    },
    {
      id: 'collector',
      label: 'Course Collector',
      icon: '💎',
      unlocked: purchasedProducts.length >= 3,
      description: 'Own 3 premium courses',
    },
    {
      id: 'scholar',
      label: 'Level 5 Scholar',
      icon: '🧠',
      unlocked: level >= 5,
      description: 'Reach learner level 5',
    },
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

  const handleStreakClaim = (streak: typeof streakCards[number]) => {
    if (!currentUser || !streak.claimable) return;
    const coinReward = Math.max(0, Number(streak.coinReward || 0));
    const entry: CoinTransaction = {
      id: `streak-${streak.id}-${Date.now()}`,
      amount: coinReward,
      type: 'credit',
      source: `Streak: ${streak.title}`,
      title: `🔥 ${streak.title}`,
      description: `Claimed ${coinReward} EduCoins for ${streak.title}`,
      createdAt: new Date().toISOString(),
    };
    const updated: User = {
      ...currentUser,
      eduCoins: (currentUser.eduCoins || 0) + coinReward,
      totalLifetimeCoins: (currentUser.totalLifetimeCoins || 0) + coinReward,
      profileStreakClaims: { ...(currentUser.profileStreakClaims || {}), [streak.id]: streak.claimKey },
    };
    syncProfileUser(updated, entry);
  };

  const redeem = (reward: any) => {
    if (!currentUser || redeeming || (currentUser.eduCoins || 0) < reward.cost) return;

    setRedeeming(reward.id);
    const updated = { ...currentUser, eduCoins: (currentUser.eduCoins || 0) - reward.cost };
    syncProfileUser(updated);
    setTimeout(() => setRedeeming(null), 500);
  };

  const handleCoverUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result || defaultCoverImage);
      setCoverImage(image);
      localStorage.setItem(getStorageKey(currentUser?.id), image);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };


  const handleMilestoneClaim = (reward: MilestoneReward) => {
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
    const { isActive, isRedeemed } = getRewardButtonState(reward);
    if (isRedeemed || !reward.claimable) return;
    if (isActive) {
      onClearCoinClaim();
      return;
    }
    onApplyCoinClaim({ type: 'coin', targetType: reward.targetType, amount: reward.discount, coins: reward.requiredCoins, productId: reward.targetType === 'product' ? Number(reward.targetId) : undefined, subscriptionId: reward.targetType === 'subscription' ? String(reward.targetId) : undefined });
  };

  const statCards = [
    { label: 'Courses Owned', value: purchasedProducts.length, icon: '📚' },
    { label: 'Video Watch Time', value: `${Math.floor(watchTimeMinutes / 60)}h ${watchTimeMinutes % 60}m`, icon: '⏱️' },
    { label: 'Badges Unlocked', value: `${badges.filter(badge => badge.unlocked).length}/${badges.length}`, icon: '🏅' },
  ];

  return (
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-clip text-[#202124]" style={{ background: `linear-gradient(135deg, ${profileStyle.backgroundColor}, ${profileStyle.backgroundTint}, #C2E7FF)`, '--profile-card-opacity': String(Number(profileStyle.cardOpacity) / 100) } as React.CSSProperties}>
      <style>{`
        @keyframes hubFadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hub-animate { opacity: 0; animation: hubFadeUp 680ms ease-out forwards; }
        .profile-glass-card { background-color: rgba(255,255,255,var(--profile-card-opacity,0.95)); }
      `}</style>

      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-80">
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${profileStyle.backgroundColor}d9, ${profileStyle.backgroundTint}b8, rgba(194,231,255,0.42))` }} />
        <div className="absolute left-[-10%] top-10 h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: `${profileStyle.accentColor}26` }} />
        <div className="absolute right-[-5%] top-1/3 h-96 w-96 rounded-full bg-[#C2E7FF]/45 blur-3xl" />
        <div className="absolute bottom-[-10%] left-1/3 h-80 w-80 rounded-full bg-[#1A73E8]/12 blur-3xl" />
      </div>

      <main className="relative mx-auto min-w-0 w-full max-w-[1600px] px-3 py-4 pb-32 sm:px-6 sm:py-5 sm:pb-36 lg:px-8 xl:px-10">
        <button
          onClick={onBack}
          className="hub-animate mb-4 rounded-2xl border border-[#D2E3FC] bg-white/95 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-[#202124] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-[#E8F0FE] hover:shadow-sm hover:shadow-sm hover:shadow-black/5 sm:mb-5 sm:px-5 sm:py-3 sm:text-sm sm:tracking-[0.2em]"
        >
          ← Back
        </button>

        <section className={`hub-animate w-full max-w-full overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] ${glassCard}`} style={{ animationDelay: '80ms' }}>
          <div className="relative min-h-[min(430px,calc(100dvh-9rem))] w-full max-w-full sm:aspect-video sm:min-h-[420px]">
            <img src={coverImage} alt="Student achievement cover" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#202124] via-[#202124]/35 to-[#174EA6]/18" style={{ opacity: Number(profileStyle.heroOverlayOpacity) / 100 }} />
            <div className="absolute inset-x-0 top-0 flex min-w-0 flex-wrap items-start justify-between gap-2 p-3 sm:items-center sm:p-6">
              <div className="max-w-[min(100%,9.5rem)] shrink rounded-full border border-[#D2E3FC] bg-white/95 px-3 py-1.5 text-[9px] font-black uppercase leading-4 tracking-[0.18em] text-[#1967D2] backdrop-blur-xl sm:max-w-none sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.28em]">
                Student Achievement Hub
              </div>
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
              <button
                onClick={() => coverInputRef.current?.click()}
                className="shrink-0 rounded-full border border-[#D2E3FC] bg-white/95 px-3 py-1.5 text-xs font-bold text-[#202124] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-[#E8F0FE] hover:shadow-sm hover:shadow-sm sm:px-4 sm:py-2 sm:text-sm"
              >
                📷 Upload Cover
              </button>
            </div>
            <div className="absolute -bottom-1 left-0 right-0 p-4 sm:p-8 lg:p-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-5">
                  <div className="flex h-20 w-20 items-center justify-center rounded-[1.5rem] border-4 border-[#D2E3FC] bg-gradient-to-br from-[#E8F0FE] via-[#D3E3FD] to-[#C2E7FF] text-3xl font-black shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 sm:h-36 sm:w-36 sm:rounded-[2rem] sm:text-5xl">
                    {(currentUser?.name || 'S').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="pb-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C2E7FF] sm:text-sm sm:tracking-[0.35em]">Level {level} Scholar</p>
                    <h1 className="mt-1 text-3xl font-black tracking-tight text-white drop-shadow sm:mt-2 sm:text-6xl">{currentUser?.name || 'Student'}</h1>
                    <p className="mt-1 max-w-2xl break-words text-xs font-semibold text-[#F8FAFD] sm:mt-2 sm:text-base">
                      {currentUser?.email || 'student@learninghub.dev'} {currentUser?.mobile ? `• +91 ${currentUser.mobile}` : ''}
                    </p>
                  </div>
                </div>
                <div className="w-fit rounded-2xl border border-[#D2E3FC]/70 bg-[#202124]/55 px-4 py-3 text-left text-white backdrop-blur-xl shadow-[0_18px_45px_rgba(15,23,42,0.22)] sm:rounded-3xl sm:px-5 sm:py-4 sm:text-right">
                  <p className="text-sm font-bold text-[#E8F0FE]">Activity Streak</p>
                  <p className="mt-1 text-2xl font-black sm:text-3xl">🔥 {streakDays} Days</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#C2E7FF]/90">Active streak</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:mt-6 sm:gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className={`hub-animate rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6 ${glassCard}`} style={{ animationDelay: '160ms' }}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">EduCoin Engine</p>
                <h2 className="mt-2 text-3xl font-black sm:text-5xl">{eduPoints.toLocaleString()} EduCoins</h2>
                <p className="mt-2 text-sm leading-5 text-[#5F6368] sm:text-base">Earned from purchases, module momentum, study time, and quiz performance.</p>
              </div>
              <div className="rounded-2xl border border-[#D2E3FC] bg-[#E8F0FE] p-4 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 sm:rounded-3xl sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#1967D2]">Next Rank</p>
                <p className="mt-1 text-2xl font-black">Level {level + 1}</p>
              </div>
            </div>
            <div className="mt-6">
              <div className="mb-2 flex flex-col gap-1 text-xs font-bold text-[#5F6368] sm:flex-row sm:justify-between sm:text-sm">
                <span>Level {level} Scholar progress</span>
                <span>{pointsRemaining} pts to next level</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full border border-[#D2E3FC] bg-white/95 sm:h-4">
                <div className="h-full rounded-full bg-gradient-to-r from-[#1A73E8] via-[#1967D2] to-[#174EA6] shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5" style={{ width: `${nextLevelProgress}%` }} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-1">
            {statCards.map((stat, index) => (
              <div key={stat.label} className={`hub-animate rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-5 ${glassCard}`} style={{ animationDelay: `${220 + index * 80}ms` }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-[#5F6368]">{stat.label}</p>
                    <p className="mt-1 text-2xl font-black sm:text-3xl">{stat.value}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#D2E3FC] bg-white/95 text-xl sm:h-14 sm:w-14 sm:text-2xl">{stat.icon}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`hub-animate mt-4 rounded-[1.5rem] p-4 sm:mt-6 sm:rounded-[2rem] sm:p-6 ${glassCard}`} style={{ animationDelay: '320ms' }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">Gamification / Streaks</p>
              <h2 className="mt-2 text-2xl font-black sm:text-4xl">12 Daily Coin Strips</h2>
              <p className="mt-2 text-xs font-bold leading-5 text-[#5F6368] sm:text-sm">Every strip uses real profile activity. Complete the target, claim coins, and come back tomorrow for the next claim.</p>
            </div>
            <div className="w-fit rounded-full border border-[#D2E3FC] bg-[#E8F0FE] px-3 py-2 text-xs font-black text-[#1967D2] shadow-sm sm:px-4 sm:text-sm">🔥 {streakCards.filter(streak => streak.claimable).length} ready now</div>
          </div>
          <div className="mt-4 grid gap-3 sm:mt-6 xl:grid-cols-2">
            {streakCards.map((streak, index) => (
              <article key={streak.id} className="group relative overflow-hidden rounded-[1.25rem] border border-[#E0E3EB] bg-white/95 p-3.5 shadow-[0_18px_45px_rgba(26,115,232,0.10)] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(26,115,232,0.14)] sm:rounded-[1.5rem] sm:p-4" style={{ animationDelay: `${360 + index * 45}ms` }}>
                <div className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${streak.accent}`} />
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${streak.accent} text-2xl shadow-[0_12px_30px_rgba(26,115,232,0.18)] transition group-hover:scale-110 sm:h-14 sm:w-14 sm:text-3xl`}>{streak.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-[#202124] sm:text-lg">{streak.title}</h3>
                      <span className="rounded-full bg-[#FEF7E0] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#1967D2]">+{streak.coinReward} coins</span>
                    </div>
                    <p className="mt-1 text-xs font-bold leading-5 text-[#5F6368]">{streak.note}</p>
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
                    className={`w-full rounded-2xl px-4 py-2.5 text-xs font-black transition active:scale-95 sm:w-40 sm:py-3 sm:text-sm ${streak.claimedToday ? 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]' : streak.claimable ? 'bg-gradient-to-r from-[#1A73E8] to-[#174EA6] text-white shadow-[0_12px_30px_rgba(26,115,232,0.22)] hover:-translate-y-0.5' : 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]'}`}
                  >
                    {streak.claimedToday ? 'Claimed Today' : streak.claimable ? 'Claim Coins' : 'Complete Target'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className={`hub-animate overflow-hidden rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6 ${glassCard}`} style={{ animationDelay: '360ms' }}>
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-[#E8F0FE] via-[#C2E7FF] to-[#D3E3FD] blur-2xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">Learning Analytics</p>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">Course Completion</h2>
                <p className="mt-2 text-xs font-bold leading-5 text-[#5F6368] sm:text-sm">Every purchased course gets its own live progress card.</p>
              </div>
              {!purchasedProducts.length && (
                <button onClick={onExplore} className="w-full rounded-full bg-white/95 px-4 py-2 text-xs font-black text-[#202124] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md sm:w-auto sm:text-sm">
                  Explore Courses
                </button>
              )}
            </div>
            {courseAccessError && (
              <div className="relative mt-5 rounded-2xl border border-[#FAD2CF] bg-[#FCE8E6] px-4 py-3 text-sm font-black text-[#C5221F] shadow-sm" role="alert">
                {courseAccessError}
              </div>
            )}
            <div className="relative mt-4 grid gap-3 sm:mt-6 sm:gap-4">
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
                  <article key={course.id} className="group relative overflow-hidden rounded-[1.35rem] border border-[#E0E3EB] bg-white/95 p-4 shadow-[0_18px_45px_rgba(26,115,232,0.10)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-[#F8FAFD] hover:shadow-[0_24px_60px_rgba(26,115,232,0.12)] sm:rounded-[1.75rem] sm:p-5">
                    <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${accent}`} />
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                      <div className="relative mx-auto h-24 w-24 shrink-0 sm:mx-0 sm:h-28 sm:w-28">
                        <div className={`absolute inset-2 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-xl transition group-hover:opacity-35`} />
                        <svg viewBox="0 0 100 100" className="relative h-full w-full -rotate-90 drop-shadow-sm">
                          <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-[#202124]/10" />
                          <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="10" fill="transparent" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} className={index % 2 === 0 ? 'text-[#1A73E8]' : 'text-[#1967D2]'} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full">
                          <span className="text-2xl font-black text-[#202124]">{course.completion}%</span>
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#5F6368]">Done</span>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[#D2E3FC] bg-white/95 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#1967D2] shadow-sm">{course.category}</span>
                          <span className="rounded-full bg-[#F8FAFD] px-3 py-1 text-xs font-black text-[#5F6368]">{course.totalLessons || 1} lessons</span>
                        </div>
                        <h3 className="mt-3 line-clamp-2 text-xl font-black text-[#202124] sm:truncate sm:text-2xl">{course.title}</h3>
                        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#E8F0FE] ring-1 ring-white/70">
                          <div className={`h-full rounded-full bg-gradient-to-r ${accent} shadow-[0_0_20px_rgba(59,130,246,0.35)]`} style={{ width: `${course.completion}%` }} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs font-black uppercase tracking-[0.18em] text-[#5F6368]">
                          <span>{course.completion >= 100 ? 'Completed' : 'In Progress'}</span>
                          <span>{Math.max(0, 100 - course.completion)}% left</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => handleContinueLearning(course)} className={`w-full rounded-2xl bg-gradient-to-r ${accent} px-4 py-2.5 text-xs font-black text-white shadow-[0_14px_35px_rgba(26,115,232,0.24)] transition active:scale-95 hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(26,115,232,0.30)] sm:w-auto sm:px-5 sm:py-3 sm:text-sm`}>
                        {course.completion >= 100 ? 'Continue Learning' : 'Complete Your Course'}
                      </button>
                    </div>
                  </article>
                );
              }) : <div className="rounded-2xl border border-dashed border-[#D2E3FC] bg-white/95 p-4 text-center text-sm font-bold text-[#5F6368] sm:rounded-3xl sm:p-6 sm:text-base">No purchased course progress yet. Buy or open a course to start real completion tracking.</div>}
            </div>
          </div>

          <div className={`hub-animate overflow-hidden rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6 ${glassCard}`} style={{ animationDelay: '440ms' }}>
            <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#C2E7FF]/35 blur-3xl" />
            <div className="relative">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">Recent Quiz Scores</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">Performance Pulse</h2>
              <div className="mt-4 rounded-[1.5rem] border border-[#E0E3EB] bg-white/95 p-3 shadow-inner backdrop-blur-xl sm:mt-6 sm:rounded-[1.75rem] sm:p-4">
                <div className="flex h-32 items-end gap-2 sm:h-40 sm:gap-3">
                  {quizScores.length ? quizScores.map(score => (
                    <div key={score.title} className="flex flex-1 flex-col items-center gap-2">
                      <div className="flex h-full w-full items-end rounded-2xl bg-[#F8FAFD] p-1">
                        <div className={`w-full rounded-2xl bg-gradient-to-t ${score.accent} shadow-[0_14px_32px_rgba(15,23,42,0.16)] transition-all duration-500 hover:scale-[1.03]`} style={{ height: `${score.score}%` }} />
                      </div>
                      <span className="text-xs font-black text-[#5F6368]">{score.score}%</span>
                    </div>
                  )) : <div className="flex h-full w-full items-center justify-center text-center text-sm font-bold text-[#5F6368]">Complete quizzes to generate real performance pulse bars.</div>}
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {quizScores.length ? quizScores.map(score => (
                  <div key={score.title} className="rounded-2xl border border-[#E0E3EB] bg-white/95 p-3 shadow-sm backdrop-blur-xl">
                    <div className="flex items-center justify-between gap-3 text-sm font-bold">
                      <span className="truncate">{score.title}</span>
                      <span className="rounded-full bg-[#E8F0FE] px-3 py-1 text-[#1967D2]">{score.score}%</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8F0FE]">
                      <div className={`h-full rounded-full bg-gradient-to-r ${score.accent}`} style={{ width: `${score.score}%` }} />
                    </div>
                  </div>
                )) : <div className="rounded-2xl border border-dashed border-[#D2E3FC] bg-white/95 p-3 text-xs font-bold text-[#5F6368] sm:p-4 sm:text-sm">No quiz rewards claimed yet.</div>}
              </div>
            </div>
          </div>
        </section>

        <section className={`hub-animate mt-4 rounded-[1.5rem] p-4 sm:mt-6 sm:rounded-[2rem] sm:p-6 ${glassCard}`} style={{ animationDelay: '520ms' }}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">Actionable Milestones</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">Glowing Milestones</h2>
            </div>
            <p className="text-xs leading-5 text-[#5F6368] sm:text-sm">Lifetime earned: 🪙 {totalLifetimeCoins}. Reached milestones unlock real downloads or access.</p>
          </div>
          <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4 lg:grid-cols-3">
            {milestoneRewards.map(reward => {
              const claimed = (currentUser?.claimedRewardIds || []).includes(reward.id);
              return (
                <article key={reward.id} className={`relative overflow-hidden rounded-[1.35rem] border p-4 transition-all duration-300 hover:-translate-y-1 sm:rounded-[1.75rem] sm:p-5 ${claimed ? 'border-[#CEEAD6] bg-[#E6F4EA] shadow-[0_0_22px_rgba(52,168,83,0.18)]' : reward.reached ? 'border-[#1A73E8] bg-white/95 shadow-[0_0_24px_rgba(26,115,232,0.30)]' : 'border-[#D2E3FC] bg-white/72 opacity-90'}`}>
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#D3E3FD] via-[#1A73E8] to-[#C2E7FF]" />
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/95 text-2xl shadow-sm sm:h-16 sm:w-16 sm:text-3xl">{reward.icon}</div>
                    <div>
                      <h3 className="text-base font-black text-[#202124] sm:text-lg">{reward.title}</h3>
                      <p className="mt-1 text-xs font-bold leading-5 text-[#5F6368] sm:text-sm sm:leading-6">{reward.description}</p>
                      <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-[#1967D2]">{reward.currentValue} / {reward.requirement} {reward.metric}</p>
                    </div>
                  </div>
                  <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-[#DADCE0]/80">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#D3E3FD] via-[#1A73E8] to-[#C2E7FF]" style={{ width: `${reward.progress}%` }} />
                  </div>
                  <button type="button" disabled={!reward.reached || claimed} onClick={() => handleMilestoneClaim(reward)} className={`mt-4 w-full rounded-2xl px-4 py-2.5 text-xs font-black shadow-sm transition active:scale-95 sm:mt-5 sm:py-3 sm:text-sm ${claimed ? 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]' : reward.reached ? 'bg-gradient-to-r from-[#1A73E8] to-[#174EA6] text-white hover:-translate-y-0.5' : 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]'}`}>
                    {claimed ? 'Claimed / Unlocked' : reward.reached ? `${reward.actionLabel}${reward.coinReward ? ` (+${reward.coinReward})` : ''}` : `${Math.max(0, reward.requirement - reward.currentValue)} more to unlock`}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-2">
          <div className={`hub-animate rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6 ${glassCard}`} style={{ animationDelay: '600ms' }}>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#137333] sm:text-sm sm:tracking-[0.3em]">Rewards Vault</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">What You Can Claim</h2>
            <p className="mt-2 text-xs leading-5 text-[#5F6368] sm:text-sm">Live wallet: 🪙 {eduPoints} • {coinRedeemRate} EduCoins = ₹1 discount.</p>
            <div className="mt-5 grid gap-3">
              {dynamicClaimCards.length ? dynamicClaimCards.map((reward) => {
                const { isActive, isRedeemed } = getRewardButtonState(reward);
                const isDisabled = isRedeemed || !reward.claimable;
                const buttonLabel = isRedeemed ? 'Redeemed / Disabled' : isActive ? 'Applied - Click to Remove' : reward.claimable ? 'Apply & Checkout' : 'Keep Earning';
                return (
                  <article
                    key={reward.id}
                    className={`rounded-2xl border p-3.5 text-left transition-all duration-300 sm:p-4 ${isRedeemed ? 'border-[#DADCE0] bg-[#F8FAFD] opacity-75' : isActive ? 'border-[#CEEAD6] bg-[#E6F4EA] shadow-[0_0_20px_rgba(52,168,83,0.18)]' : reward.claimable ? 'border-[#1A73E8] bg-white/95 shadow-[0_0_15px_rgba(26,115,232,0.28)] hover:-translate-y-1 hover:bg-[#F8FAFD]' : 'border-[#D2E3FC] bg-white/95 shadow-sm'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${isRedeemed ? 'border-[#DADCE0] bg-[#DADCE0] text-[#5F6368]' : isActive ? 'border-[#CEEAD6] bg-[#E6F4EA] text-[#137333]' : 'border-[#D2E3FC] bg-[#FEF7E0] text-[#B06000]'}`}>{reward.type}</span>
                        <h3 className="mt-3 text-base font-black text-[#202124] sm:text-lg">{reward.mode === 'unlock' ? `Unlock ${reward.name} for ${reward.requiredCoins} Coins` : `Claim ₹${reward.discount} Discount on ${reward.name}`}</h3>
                        <p className="mt-1 text-xs font-bold text-[#5F6368]">{isRedeemed ? 'This reward is already used and cannot be selected again.' : reward.mode === 'unlock' ? 'Full access via EduCoin wallet.' : `Uses 🪙 ${reward.requiredCoins} at checkout.`} {!isRedeemed && (reward.claimable ? 'Ready to apply now.' : `Earn ${Math.max(0, reward.requiredCoins - eduPoints)} more coins.`)}</p>
                      </div>
                      <span className="text-2xl">{isRedeemed ? '✅' : isActive ? '🔥' : reward.claimable ? '✨' : '🔒'}</span>
                    </div>
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleRewardToggle(reward)}
                      className={`mt-3 w-full rounded-2xl px-4 py-2.5 text-xs font-black shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition active:scale-95 sm:mt-4 sm:py-3 sm:text-sm ${isRedeemed ? 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]' : isActive ? 'bg-gradient-to-r from-[#1A73E8] to-[#174EA6] text-white hover:-translate-y-0.5' : reward.claimable ? 'bg-gradient-to-r from-[#1A73E8] to-[#174EA6] text-white hover:-translate-y-0.5' : 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]'}`}
                    >
                      {buttonLabel}
                    </button>
                  </article>
                );
              }) : <p className="rounded-2xl border border-[#D2E3FC] bg-white/95 p-3 text-sm text-[#5F6368] sm:p-4">Reward claims will appear here once products or subscriptions are available.</p>}
            </div>
          </div>

          <div className={`hub-animate rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6 ${glassCard}`} style={{ animationDelay: '680ms' }}>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">Personalization</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">Theme & Coupons</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3">
              {Object.values(themes).filter(theme => theme.name !== 'Midnight').map(theme => {
                const key = theme.name.toLowerCase() as ThemeName;
                return (
                  <button
                    key={theme.name}
                    onClick={() => onThemeChange(key)}
                    className={`rounded-2xl border p-2.5 text-left transition-all duration-300 hover:-translate-y-1 sm:p-3 ${activeTheme === key ? 'border-[#C2E7FF] bg-[#E8F0FE]' : 'border-[#D2E3FC] bg-white/95'}`}
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
            <div className="mt-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-xl font-black text-[#202124]">Available Coupons</h3>
                  <p className="text-xs font-bold text-[#5F6368] sm:text-sm">Admin panel mein listed sabhi coupons yahan live status ke saath dikhte hain.</p>
                </div>
                <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-black text-[#1967D2] shadow-sm">{profileCoupons.length} total</span>
              </div>
              <div className="mt-3 grid gap-3">
                {profileCoupons.length ? profileCoupons.map(coupon => {
                  const isCouponActive = coupon.isActive;
                  const buttonLabel = isCouponActive ? (redeemedCouponCode === coupon.code ? 'Code copied' : 'Redeem') : 'Not available';
                  return (
                    <div key={coupon.id} className={`rounded-2xl border p-3 transition-all duration-300 sm:p-4 ${isCouponActive ? 'border-dashed border-[#CEEAD6] bg-[#E6F4EA] shadow-[0_10px_30px_rgba(16,185,129,0.10)]' : 'border-[#E0E3EB] bg-[#F8FAFD] opacity-80'}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`font-black ${isCouponActive ? 'text-[#137333]' : 'text-[#5F6368]'}`}>{coupon.code}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${isCouponActive ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#DADCE0] text-[#5F6368]'}`}>{isCouponActive ? 'Active' : 'Inactive'}</span>
                          </div>
                          <p className="mt-1 text-sm font-bold text-[#5F6368]">{coupon.type === 'percentage' ? `${coupon.value}% off` : `₹${coupon.value} off`} • expires {coupon.expiryDate}</p>
                        </div>
                        <button
                          type="button"
                          disabled={!isCouponActive}
                          onClick={() => handleCouponRedeem(coupon)}
                          className={`w-full rounded-2xl px-4 py-2.5 text-sm font-black transition active:scale-95 sm:w-auto ${isCouponActive ? 'bg-gradient-to-r from-[#1A73E8] to-[#174EA6] text-white shadow-[0_10px_25px_rgba(26,115,232,0.22)] hover:-translate-y-0.5' : 'cursor-not-allowed bg-[#DADCE0] text-[#5F6368]'}`}
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
        </section>

        <section className={`hub-animate mt-4 rounded-[1.5rem] p-4 sm:mt-6 sm:rounded-[2rem] sm:p-6 ${glassCard}`} style={{ animationDelay: '760ms' }}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1967D2] sm:text-sm sm:tracking-[0.3em]">Coin History</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">Live Earning Ledger</h2>
            </div>
            <p className="text-xs leading-5 text-[#5F6368] sm:text-sm">Synced from your coinTransactions wallet ledger.</p>
          </div>
          <div className="mt-5 grid gap-3">
            {coinTransactions.length ? coinTransactions.slice(0, 8).map((entry) => (
              <div key={entry.id || `${entry.createdAt}-${entry.description}`} className="flex flex-col items-start gap-3 rounded-2xl border border-[#D2E3FC] bg-white/95 p-3 shadow-sm backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
                <div>
                  <p className="font-black text-[#202124]">{entry.amount >= 0 ? '🟢' : '🔴'} {entry.amount >= 0 ? '+' : ''}{entry.amount} Coins</p>
                  <p className="mt-1 text-xs leading-5 text-[#5F6368] sm:text-sm">{entry.amount >= 0 ? '📝' : '🛒'} <span className="font-bold">{entry.title || entry.source}</span> — {entry.description}</p>
                </div>
                <div className="text-left sm:text-right"><div className={`text-lg font-black ${entry.amount >= 0 ? 'text-[#137333]' : 'text-[#C5221F]'}`}>{entry.amount >= 0 ? '+' : ''}{entry.amount} Coins</div><div className="mt-1 text-xs font-bold text-[#5F6368]">{formatLedgerTime(entry.timestamp || entry.createdAt)}</div></div>
              </div>
            )) : (
              <div className="rounded-2xl border border-[#D2E3FC] bg-white/95 p-4 text-sm text-[#5F6368] sm:p-5 sm:text-base">No coin movements yet. Read an article or complete a purchase to start your live ledger.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ProfilePage;
