import React from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ActiveCoinDiscount, CoinTransaction, Coupon, ProductWithRating, ThemeName, themes, User, WebsiteSettings } from '../App';
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
  users: User[];
  setUsers: (users: User[]) => void;
  setCurrentUser: (user: User | null) => void;
  onClaimMilestoneReward: (reward: { id: string; title: string; requirement: number; unlockProductIds?: number[] }) => boolean;
}

interface LearningProgress {
  id: number | string;
  title: string;
  category: string;
  completion: number;
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

interface MilestoneReward {
  id: string;
  title: string;
  requirement: number;
  icon: string;
  description: string;
  actionLabel: string;
  unlockProductIds?: number[];
  downloadContent?: string;
}

const defaultCoverImage =
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1800&q=80';

const glassCard =
  'border border-white/55 bg-white/78 backdrop-blur-2xl shadow-[0_18px_55px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-white/70 hover:shadow-[0_22px_65px_rgba(15,23,42,0.12)]';

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
  users,
  setUsers,
  setCurrentUser,
  onClaimMilestoneReward,
}) => {
  const coverInputRef = React.useRef<HTMLInputElement | null>(null);
  const [coverImage, setCoverImage] = React.useState(defaultCoverImage);
  const [redeeming, setRedeeming] = React.useState<string | null>(null);
  const [coinTransactions, setCoinTransactions] = React.useState<CoinTransaction[]>([]);
  const [locallyRedeemedRewardIds, setLocallyRedeemedRewardIds] = React.useState<string[]>([]);

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

  const activeCoupons = React.useMemo(() => coupons.filter(coupon => coupon.isActive), [coupons]);
  const coinRedeemRate = Math.max(1, Number(economySettings.coinToFiatRatio));
  const studyMinutes = currentUser?.studyMinutes ?? 0;
  const watchTimeMinutes = currentUser?.totalWatchTimeMinutes ?? studyMinutes;
  const eduPoints = currentUser?.eduCoins ?? 0;
  const totalLifetimeCoins = currentUser?.totalLifetimeCoins ?? eduPoints;
  const milestoneRewards = React.useMemo<MilestoneReward[]>(() => {
    const premiumProduct = products.find(product => !product.isFree && product.isVisible !== false);
    return [
      { id: 'premium-pdf-pack', title: 'Premium PDF Pack', requirement: 500, icon: '📦', description: 'Download a curated premium revision pack once you cross 500 lifetime coins.', actionLabel: 'Download Pack', downloadContent: 'Digital Catalyst Premium PDF Pack\n\n- Exam sprint checklist\n- Revision planner\n- AI study prompts\n- Career-readiness worksheet' },
      { id: 'course-access-pass', title: 'Course Access Pass', requirement: 1000, icon: '🎓', description: premiumProduct ? `Unlock access to ${premiumProduct.title}.` : 'Unlock access to a featured premium course.', actionLabel: 'Unlock Course', unlockProductIds: premiumProduct ? [premiumProduct.id] : [] },
      { id: 'elite-wallet-badge', title: 'Elite Wallet Badge', requirement: 2000, icon: '💎', description: 'Permanent profile recognition for serious learners.', actionLabel: 'Claim Badge' },
    ];
  }, [products]);

  const dynamicClaimCards = React.useMemo(() => {
    const productCards = products
      .filter(product => product.isVisible !== false && !product.isFree)
      .map(product => {
        const price = Number((product.salePrice || product.price).replace(/[^\d.]/g, '')) || 0;
        const coinPrice = resolveCoinPrice(product.coinPrice, economySettings, 'product', product.id);
        const maxDiscount = Math.floor(price * (resolveMaxDiscountPercentage(economySettings, 'product', product.id) / 100));
        const outright = coinPrice > 0 && eduPoints >= coinPrice;
        const affordableDiscount = Math.min(price, maxDiscount, Math.floor(eduPoints / coinRedeemRate));
        return {
          id: `product-${product.id}`,
          targetType: 'product' as const,
          targetId: product.id,
          name: product.title,
          type: 'Product',
          price,
          coinPrice,
          discount: outright ? price : affordableDiscount,
          requiredCoins: outright ? coinPrice : affordableDiscount * coinRedeemRate,
          mode: outright ? 'unlock' as const : 'discount' as const,
          claimable: outright || affordableDiscount > 0,
        };
      });

    const planCards = ((settings.content as any).subscriptionPlans || []).map((plan: any) => {
      const price = Number(plan.price || 0);
      const coinPrice = resolveCoinPrice(plan.coinPrice, economySettings, 'subscription', plan.id);
      const maxDiscount = Math.floor(price * (resolveMaxDiscountPercentage(economySettings, 'subscription', plan.id) / 100));
      const outright = coinPrice > 0 && eduPoints >= coinPrice;
      const affordableDiscount = Math.min(price, maxDiscount, Math.floor(eduPoints / coinRedeemRate));
      return {
        id: `plan-${plan.id}`,
        targetType: 'subscription' as const,
        targetId: String(plan.id),
        name: `${plan.name} Plan`,
        type: 'Subscription',
        price,
        coinPrice,
        discount: outright ? price : affordableDiscount,
        requiredCoins: outright ? coinPrice : affordableDiscount * coinRedeemRate,
        mode: outright ? 'unlock' as const : 'discount' as const,
        claimable: outright || affordableDiscount > 0,
      };
    });

    return [...productCards, ...planCards]
      .filter(item => item.price > 0)
      .sort((a, b) => Number(b.claimable) - Number(a.claimable) || b.discount - a.discount)
      .slice(0, 6);
  }, [coinRedeemRate, economySettings, eduPoints, products, settings.content]);
  const level = Math.max(1, Math.floor(eduPoints / 500) + 1);
  const currentLevelStart = (level - 1) * 500;
  const pointsIntoLevel = eduPoints - currentLevelStart;
  const pointsForNextLevel = 500;
  const nextLevelProgress = clamp((pointsIntoLevel / pointsForNextLevel) * 100);
  const pointsRemaining = Math.max(0, pointsForNextLevel - pointsIntoLevel);
  const streakDays = Math.max(0, Math.min(60, Math.floor(studyMinutes / 55) + purchasedProducts.length));
  const purchasedProductIdSet = React.useMemo(() => new Set(purchasedProducts.map(product => product.id)), [purchasedProducts]);
  const pdfsRead = Math.max(0, ((currentUser as any)?.pdfsRead || 0) + coinTransactions.filter(entry => /pdf|read|document/i.test(`${entry.title || ''} ${entry.description || ''}`)).length + purchasedProducts.filter(product => product.category?.toLowerCase().includes('pdf') || product.title.toLowerCase().includes('pdf')).length);

  const learningProgress: LearningProgress[] = purchasedProducts.length
    ? purchasedProducts.slice(0, 5).map((product, index) => ({
        id: product.id,
        title: product.title,
        category: product.category || 'Premium course',
        completion: clamp(42 + index * 13 + Math.round((product.rating || 4) * 4)),
      }))
    : [
        { id: 'starter-path', title: 'Starter Learning Path', category: 'Recommended', completion: 18 },
        { id: 'skill-lab', title: 'Skill Practice Lab', category: 'Practice', completion: 9 },
      ];

  const quizScores: QuizScore[] = learningProgress.slice(0, 4).map((item, index) => ({
    title: item.title,
    score: clamp(72 + index * 6 + (item.completion % 12)),
    accent: ['from-cyan-400 to-blue-500', 'from-fuchsia-400 to-purple-500', 'from-amber-300 to-orange-500', 'from-emerald-300 to-teal-500'][index % 4],
  }));

  const continuousLearningDays = Math.max(streakDays, Math.min(90, Math.floor(watchTimeMinutes / 35) + learningProgress.filter(course => course.completion >= 50).length));
  const streakCards = [
    { id: 'daily-login', title: 'Daily Login Streak', icon: '🔥', value: streakDays, goal: 30, unit: 'days', accent: 'from-orange-400 via-amber-400 to-yellow-300', note: streakDays >= 30 ? 'Legendary daily rhythm unlocked.' : `${Math.max(0, 30 - streakDays)} days to a 30-day flame.` },
    { id: 'learning-days', title: 'Continuous Learning Days', icon: '⚡', value: continuousLearningDays, goal: 45, unit: 'days', accent: 'from-cyan-400 via-blue-500 to-indigo-500', note: continuousLearningDays >= 45 ? 'Elite consistency streak active.' : `${Math.max(0, 45 - continuousLearningDays)} days to elite consistency.` },
    { id: 'pdfs-read', title: 'PDFs Read', icon: '📄', value: pdfsRead, goal: 20, unit: 'PDFs', accent: 'from-emerald-400 via-teal-400 to-cyan-400', note: pdfsRead >= 20 ? 'Reading vault mastered.' : `${Math.max(0, 20 - pdfsRead)} PDFs to master the vault.` },
    { id: 'quiz-pulse', title: 'Quiz Momentum', icon: '🎯', value: quizScores.filter(score => score.score >= 80).length, goal: Math.max(4, quizScores.length || 4), unit: 'wins', accent: 'from-fuchsia-400 via-purple-500 to-indigo-500', note: 'Score 80%+ to stack quiz wins.' },
  ];

  const badges: Badge[] = [
    {
      id: 'quiz-master',
      label: 'Quiz Master',
      icon: '🎯',
      unlocked: quizScores.some(score => score.score >= 90),
      description: 'Score 90%+ on a quiz',
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
      unlocked: learningProgress.some(course => course.completion >= 80),
      description: 'Reach 80% course progress',
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

  const redeem = (reward: any) => {
    if (!currentUser || redeeming || (currentUser.eduCoins || 0) < reward.cost) return;

    setRedeeming(reward.id);
    const updated = { ...currentUser, eduCoins: (currentUser.eduCoins || 0) - reward.cost };
    const updatedUsers = users.map(user => (user.id === updated.id ? updated : user));
    setUsers(updatedUsers);
    localStorage.setItem('siteUsers', JSON.stringify(updatedUsers));
    setCurrentUser(updated);
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
    <div className="min-h-screen overflow-hidden bg-slate-100 bg-gradient-to-br from-slate-100 via-indigo-100/45 to-slate-200 text-slate-900">
      <style>{`
        @keyframes hubFadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hub-animate { opacity: 0; animation: hubFadeUp 680ms ease-out forwards; }
      `}</style>

      <div className="pointer-events-none fixed inset-0 opacity-80">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(226,232,240,0.82),rgba(224,231,255,0.62),rgba(241,245,249,0.9))]" />
        <div className="absolute left-[-10%] top-10 h-72 w-72 rounded-full bg-indigo-500/18 blur-3xl" />
        <div className="absolute right-[-5%] top-1/3 h-96 w-96 rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute bottom-[-10%] left-1/3 h-80 w-80 rounded-full bg-fuchsia-500/12 blur-3xl" />
      </div>

      <main className="relative mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <button
          onClick={onBack}
          className="hub-animate mb-5 rounded-2xl border border-white/50 bg-white/70 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-slate-900 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-white/80 hover:shadow-sm hover:shadow-sm hover:shadow-black/5"
        >
          ← Back
        </button>

        <section className={`hub-animate overflow-hidden rounded-[2rem] ${glassCard}`} style={{ animationDelay: '80ms' }}>
          <div className="relative aspect-video min-h-[300px] w-full sm:min-h-[420px]">
            <img src={coverImage} alt="Student achievement cover" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/78 via-slate-900/30 to-indigo-950/15" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 sm:p-6">
              <div className="rounded-full border border-white/50 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-cyan-700 backdrop-blur-xl">
                Student Achievement Hub
              </div>
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
              <button
                onClick={() => coverInputRef.current?.click()}
                className="rounded-full border border-white/50 bg-white/70 px-4 py-2 text-sm font-bold text-slate-900 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-white/80 hover:shadow-sm hover:shadow-sm"
              >
                📷 Upload Cover
              </button>
            </div>
            <div className="absolute -bottom-1 left-0 right-0 p-5 sm:p-8 lg:p-10">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
                  <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] border-4 border-white/50 bg-gradient-to-br from-cyan-300 via-indigo-400 to-fuchsia-500 text-5xl font-black shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 sm:h-36 sm:w-36">
                    {(currentUser?.name || 'S').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="pb-2">
                    <p className="text-sm font-black uppercase tracking-[0.35em] text-cyan-100">Level {level} Scholar</p>
                    <h1 className="mt-2 text-4xl font-black tracking-tight text-white drop-shadow sm:text-6xl">{currentUser?.name || 'Student'}</h1>
                    <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-100 sm:text-base">
                      {currentUser?.email || 'student@learninghub.dev'} {currentUser?.mobile ? `• +91 ${currentUser.mobile}` : ''}
                    </p>
                  </div>
                </div>
                <div className="rounded-3xl border border-orange-200/40 bg-slate-950/35 px-5 py-4 text-right text-white backdrop-blur-xl shadow-[0_18px_45px_rgba(15,23,42,0.22)]">
                  <p className="text-sm font-bold text-orange-100">Activity Streak</p>
                  <p className="mt-1 text-3xl font-black">🔥 {streakDays} Days</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-orange-200/80">Active streak</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className={`hub-animate rounded-[2rem] p-6 ${glassCard}`} style={{ animationDelay: '160ms' }}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-cyan-700">EduCoin Engine</p>
                <h2 className="mt-2 text-4xl font-black sm:text-5xl">{eduPoints.toLocaleString()} EduCoins</h2>
                <p className="mt-2 text-slate-600">Earned from purchases, module momentum, study time, and quiz performance.</p>
              </div>
              <div className="rounded-3xl border border-cyan-300/20 bg-cyan-400/10 p-5 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-700">Next Rank</p>
                <p className="mt-1 text-2xl font-black">Level {level + 1}</p>
              </div>
            </div>
            <div className="mt-6">
              <div className="mb-2 flex justify-between text-sm font-bold text-slate-600">
                <span>Level {level} Scholar progress</span>
                <span>{pointsRemaining} pts to next level</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full border border-white/50 bg-white/70">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-600 via-indigo-600 to-violet-600 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5" style={{ width: `${nextLevelProgress}%` }} />
              </div>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
            {statCards.map((stat, index) => (
              <div key={stat.label} className={`hub-animate rounded-[2rem] p-5 ${glassCard}`} style={{ animationDelay: `${220 + index * 80}ms` }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-600">{stat.label}</p>
                    <p className="mt-1 text-3xl font-black">{stat.value}</p>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/50 bg-white/70 text-2xl">{stat.icon}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`hub-animate mt-6 rounded-[2rem] p-6 ${glassCard}`} style={{ animationDelay: '320ms' }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-orange-600">Gamification / Streaks</p>
              <h2 className="mt-2 text-3xl font-black sm:text-4xl">Retention Flame Board</h2>
            </div>
            <div className="rounded-full border border-orange-200/70 bg-orange-50/90 px-4 py-2 text-sm font-black text-orange-700 shadow-sm">🔥 {streakCards.reduce((total, streak) => total + streak.value, 0)} total streak points</div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {streakCards.map((streak, index) => {
              const progress = clamp((streak.value / streak.goal) * 100);
              return (
                <article key={streak.id} className="group relative overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/82 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(15,23,42,0.13)]" style={{ animationDelay: `${360 + index * 70}ms` }}>
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${streak.accent}`} />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">{streak.title}</p>
                      <p className="mt-3 text-4xl font-black text-slate-950">{streak.value}<span className="ml-1 text-sm font-black text-slate-500">{streak.unit}</span></p>
                    </div>
                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${streak.accent} text-3xl shadow-[0_12px_30px_rgba(251,146,60,0.24)] transition group-hover:scale-110`}>{streak.icon}</div>
                  </div>
                  <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200/80">
                    <div className={`h-full rounded-full bg-gradient-to-r ${streak.accent} shadow-[0_0_18px_rgba(59,130,246,0.25)]`} style={{ width: `${progress}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs font-black text-slate-500">
                    <span>{Math.round(progress)}% complete</span>
                    <span>Goal {streak.goal}</span>
                  </div>
                  <p className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/90 px-3 py-2 text-xs font-bold leading-5 text-slate-600">{streak.note}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <div className={`hub-animate rounded-[2rem] p-6 ${glassCard}`} style={{ animationDelay: '360ms' }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-indigo-700">Learning Analytics</p>
                <h2 className="mt-2 text-3xl font-black">Course Completion</h2>
              </div>
              {!purchasedProducts.length && (
                <button onClick={onExplore} className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-900 transition-all duration-300 hover:-translate-y-1 hover:shadow-sm">
                  Explore Courses
                </button>
              )}
            </div>
            <div className="mt-6 grid gap-4">
              {learningProgress.map((course, index) => {
                const circumference = 2 * Math.PI * 38;
                const dashOffset = circumference - (course.completion / 100) * circumference;
                return (
                  <div key={course.id} className="rounded-3xl border border-white/50 bg-white/70 p-4 transition-all duration-300 hover:-translate-y-1 hover:bg-white/80 hover:shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="relative h-24 w-24 shrink-0">
                        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                          <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-slate-900/10" />
                          <circle
                            cx="50"
                            cy="50"
                            r="38"
                            stroke="currentColor"
                            strokeWidth="10"
                            fill="transparent"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={dashOffset}
                            className={index % 2 === 0 ? 'text-cyan-300' : 'text-fuchsia-300'}
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-lg font-black">{course.completion}%</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xl font-black">{course.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{course.category}</p>
                        <div className="mt-4 h-2 rounded-full bg-white/70">
                          <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-indigo-400" style={{ width: `${course.completion}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`hub-animate rounded-[2rem] p-6 ${glassCard}`} style={{ animationDelay: '440ms' }}>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-fuchsia-700">Recent Quiz Scores</p>
            <h2 className="mt-2 text-3xl font-black">Performance Pulse</h2>
            <div className="mt-6 flex h-36 items-end gap-3 rounded-3xl border border-white/50 bg-white/70 p-4">
              {quizScores.map(score => (
                <div key={score.title} className="flex flex-1 flex-col items-center gap-2">
                  <div className={`w-full rounded-t-2xl bg-gradient-to-t ${score.accent} shadow-[0_8px_30px_rgb(0,0,0,0.04)]`} style={{ height: `${score.score}%` }} />
                  <span className="text-xs font-black text-slate-600">{score.score}%</span>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-3">
              {quizScores.map(score => (
                <div key={score.title} className="rounded-2xl border border-white/50 bg-white/70 p-3">
                  <div className="flex items-center justify-between gap-3 text-sm font-bold">
                    <span className="truncate">{score.title}</span>
                    <span className="text-cyan-700">{score.score}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`hub-animate mt-6 rounded-[2rem] p-6 ${glassCard}`} style={{ animationDelay: '520ms' }}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-700">Actionable Milestones</p>
              <h2 className="mt-2 text-3xl font-black">Glowing Milestones</h2>
            </div>
            <p className="text-sm text-slate-600">Lifetime earned: 🪙 {totalLifetimeCoins}. Reached milestones unlock real downloads or access.</p>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {milestoneRewards.map(reward => {
              const reached = totalLifetimeCoins >= reward.requirement;
              const claimed = (currentUser?.claimedRewardIds || []).includes(reward.id);
              return (
                <article key={reward.id} className={`rounded-[1.75rem] border p-5 transition-all duration-300 hover:-translate-y-1 ${claimed ? 'border-emerald-300/60 bg-emerald-50/80 shadow-[0_0_18px_rgba(16,185,129,0.35)]' : reached ? 'border-indigo-400 bg-white/80 shadow-[0_0_15px_rgba(79,70,229,0.5)] animate-pulse' : 'border-white/50 bg-white/70 opacity-75'}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/80 text-3xl shadow-sm">{reward.icon}</div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{reward.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{reward.description}</p>
                      <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-amber-700">Requires 🪙 {reward.requirement}</p>
                    </div>
                  </div>
                  <button type="button" disabled={!reached || claimed} onClick={() => handleMilestoneClaim(reward)} className="mt-5 w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm font-black text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60">
                    {claimed ? 'Claimed / Unlocked' : reached ? reward.actionLabel : `Earn ${reward.requirement - totalLifetimeCoins} more coins`}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className={`hub-animate rounded-[2rem] p-6 ${glassCard}`} style={{ animationDelay: '600ms' }}>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-emerald-700">Rewards Vault</p>
            <h2 className="mt-2 text-3xl font-black">What You Can Claim</h2>
            <p className="mt-2 text-sm text-slate-600">Live wallet: 🪙 {eduPoints} • {coinRedeemRate} EduCoins = ₹1 discount.</p>
            <div className="mt-5 grid gap-3">
              {dynamicClaimCards.length ? dynamicClaimCards.map((reward) => {
                const { isActive, isRedeemed } = getRewardButtonState(reward);
                const isDisabled = isRedeemed || !reward.claimable;
                const buttonLabel = isRedeemed ? 'Redeemed / Disabled' : isActive ? 'Applied - Click to Remove' : reward.claimable ? 'Apply & Checkout' : 'Keep Earning';
                return (
                  <article
                    key={reward.id}
                    className={`rounded-2xl border p-4 text-left transition-all duration-300 ${isRedeemed ? 'border-slate-300 bg-slate-100/90 opacity-75' : isActive ? 'border-emerald-400 bg-emerald-50/90 shadow-[0_0_20px_rgba(16,185,129,0.35)]' : reward.claimable ? 'border-indigo-400 bg-white/80 shadow-[0_0_15px_rgba(79,70,229,0.42)] hover:-translate-y-1 hover:bg-white/90' : 'border-white/50 bg-white/70 shadow-sm'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${isRedeemed ? 'border-slate-300 bg-slate-200 text-slate-500' : isActive ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-amber-200/70 bg-amber-50/80 text-amber-700'}`}>{reward.type}</span>
                        <h3 className="mt-3 text-lg font-black text-slate-900">{reward.mode === 'unlock' ? `Unlock ${reward.name} for ${reward.requiredCoins} Coins` : `Claim ₹${reward.discount} Discount on ${reward.name}`}</h3>
                        <p className="mt-1 text-xs font-bold text-slate-600">{isRedeemed ? 'This reward is already used and cannot be selected again.' : reward.mode === 'unlock' ? 'Full access via EduCoin wallet.' : `Uses 🪙 ${reward.requiredCoins} at checkout.`} {!isRedeemed && (reward.claimable ? 'Ready to apply now.' : `Earn ${Math.max(0, reward.requiredCoins - eduPoints)} more coins.`)}</p>
                      </div>
                      <span className="text-2xl">{isRedeemed ? '✅' : isActive ? '🔥' : reward.claimable ? '✨' : '🔒'}</span>
                    </div>
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleRewardToggle(reward)}
                      className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition active:scale-95 ${isRedeemed ? 'cursor-not-allowed bg-slate-300 text-slate-500' : isActive ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:-translate-y-0.5' : reward.claimable ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:-translate-y-0.5' : 'cursor-not-allowed bg-slate-200 text-slate-500'}`}
                    >
                      {buttonLabel}
                    </button>
                  </article>
                );
              }) : <p className="rounded-2xl border border-white/50 bg-white/70 p-4 text-slate-600">Reward claims will appear here once products or subscriptions are available.</p>}
            </div>
          </div>

          <div className={`hub-animate rounded-[2rem] p-6 ${glassCard}`} style={{ animationDelay: '680ms' }}>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-700">Personalization</p>
            <h2 className="mt-2 text-3xl font-black">Theme & Coupons</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {Object.values(themes).filter(theme => theme.name !== 'Midnight').map(theme => {
                const key = theme.name.toLowerCase() as ThemeName;
                return (
                  <button
                    key={theme.name}
                    onClick={() => onThemeChange(key)}
                    className={`rounded-2xl border p-3 text-left transition-all duration-300 hover:-translate-y-1 ${activeTheme === key ? 'border-cyan-300/50 bg-cyan-600/10' : 'border-white/50 bg-white/70'}`}
                  >
                    <div className="flex -space-x-1">
                      <span className="h-4 w-4 rounded-full border border-white" style={{ background: theme.palette.primaryColor }} />
                      <span className="h-4 w-4 rounded-full border border-white" style={{ background: theme.palette.backgroundColor }} />
                    </div>
                    <div className="mt-2 text-sm font-bold">{theme.name}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 grid gap-3">
              {activeCoupons.slice(0, 3).map(coupon => (
                <div key={coupon.id} className="flex items-center justify-between rounded-2xl border border-dashed border-cyan-300/30 bg-cyan-600/10 p-4">
                  <span className="font-black text-cyan-700">{coupon.code}</span>
                  <span className="text-sm font-bold text-slate-600">{coupon.type === 'percentage' ? `${coupon.value}% off` : `₹${coupon.value} off`}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`hub-animate mt-6 rounded-[2rem] p-6 ${glassCard}`} style={{ animationDelay: '760ms' }}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-indigo-300">Coin History</p>
              <h2 className="mt-2 text-3xl font-black">Live Earning Ledger</h2>
            </div>
            <p className="text-sm text-slate-600">Synced from your coinTransactions wallet ledger.</p>
          </div>
          <div className="mt-5 grid gap-3">
            {coinTransactions.length ? coinTransactions.slice(0, 8).map((entry) => (
              <div key={entry.id || `${entry.createdAt}-${entry.description}`} className="flex items-center justify-between gap-4 rounded-2xl border border-white/50 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
                <div>
                  <p className="font-black text-slate-900">{entry.amount >= 0 ? '🟢' : '🔴'} {entry.amount >= 0 ? '+' : ''}{entry.amount} Coins</p>
                  <p className="mt-1 text-sm text-slate-600">{entry.amount >= 0 ? '📝' : '🛒'} <span className="font-bold">{entry.title || entry.source}</span> — {entry.description}</p>
                </div>
                <div className="text-right"><div className={`text-lg font-black ${entry.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{entry.amount >= 0 ? '+' : ''}{entry.amount} Coins</div><div className="mt-1 text-xs font-bold text-slate-500">{formatLedgerTime(entry.timestamp || entry.createdAt)}</div></div>
              </div>
            )) : (
              <div className="rounded-2xl border border-white/50 bg-white/70 p-5 text-slate-600">No coin movements yet. Read an article or complete a purchase to start your live ledger.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ProfilePage;
