import React from 'react';
import { Coupon, ProductWithRating, ThemeName, themes, User, WebsiteSettings } from '../App';

interface ProfilePageProps {
  settings: WebsiteSettings;
  currentUser: User | null;
  purchasedProducts: ProductWithRating[];
  coupons: Coupon[];
  onBack: () => void;
  onExplore: () => void;
  activeTheme: ThemeName;
  onThemeChange: (themeName: ThemeName) => void;
  users: User[];
  setUsers: (users: User[]) => void;
  setCurrentUser: (user: User | null) => void;
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

const defaultCoverImage =
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1800&q=80';

const glassCard =
  'border border-white/50 bg-white/70 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 transition-all duration-300 hover:-translate-y-1 hover:border-white/50 hover:shadow-sm hover:shadow-black/5';

const getStorageKey = (userId?: number) => `studentAchievementHubCover-${userId ?? 'guest'}`;

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const ProfilePage: React.FC<ProfilePageProps> = ({
  settings,
  currentUser,
  purchasedProducts,
  coupons,
  onBack,
  onExplore,
  activeTheme,
  onThemeChange,
  users,
  setUsers,
  setCurrentUser,
}) => {
  const coverInputRef = React.useRef<HTMLInputElement | null>(null);
  const [coverImage, setCoverImage] = React.useState(defaultCoverImage);
  const [redeeming, setRedeeming] = React.useState<string | null>(null);

  React.useEffect(() => {
    const storedCover = localStorage.getItem(getStorageKey(currentUser?.id));
    setCoverImage(storedCover || defaultCoverImage);
  }, [currentUser?.id]);

  const activeCoupons = React.useMemo(() => coupons.filter(coupon => coupon.isActive), [coupons]);
  const rewards = React.useMemo(() => (settings.content as any).redeemRewards || [], [settings.content]);
  const studyMinutes = currentUser?.studyMinutes ?? purchasedProducts.length * 48 + 35;
  const purchasePoints = purchasedProducts.length * 180;
  const modulePoints = Math.floor(studyMinutes / 15) * 12;
  const quizBonus = purchasedProducts.reduce((total, product, index) => total + Math.round((product.rating || 4) * 18) + index * 10, 0);
  const eduPoints = (currentUser?.eduCoins ?? 120) + purchasePoints + modulePoints + quizBonus;
  const level = Math.max(1, Math.floor(eduPoints / 500) + 1);
  const currentLevelStart = (level - 1) * 500;
  const pointsIntoLevel = eduPoints - currentLevelStart;
  const pointsForNextLevel = 500;
  const nextLevelProgress = clamp((pointsIntoLevel / pointsForNextLevel) * 100);
  const pointsRemaining = Math.max(0, pointsForNextLevel - pointsIntoLevel);
  const streakDays = Math.max(1, Math.min(21, Math.floor(studyMinutes / 55) + purchasedProducts.length + 2));

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

  const statCards = [
    { label: 'Courses Owned', value: purchasedProducts.length, icon: '📚' },
    { label: 'Study Time', value: `${Math.floor(studyMinutes / 60)}h ${studyMinutes % 60}m`, icon: '⏱️' },
    { label: 'Badges Unlocked', value: `${badges.filter(badge => badge.unlocked).length}/${badges.length}`, icon: '🏅' },
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 text-slate-900">
      <style>{`
        @keyframes hubFadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hub-animate { opacity: 0; animation: hubFadeUp 680ms ease-out forwards; }
      `}</style>

      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute left-[-10%] top-10 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute right-[-5%] top-1/3 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute bottom-[-10%] left-1/3 h-80 w-80 rounded-full bg-fuchsia-500/10 blur-3xl" />
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
            <div className="absolute inset-0 bg-gradient-to-t from-slate-50 via-indigo-50/30/55 to-indigo-950/15" />
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
                    <p className="text-sm font-black uppercase tracking-[0.35em] text-cyan-200">Level {level} Scholar</p>
                    <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-6xl">{currentUser?.name || 'Student'}</h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                      {currentUser?.email || 'student@learninghub.dev'} {currentUser?.mobile ? `• +91 ${currentUser.mobile}` : ''}
                    </p>
                  </div>
                </div>
                <div className="rounded-3xl border border-orange-300/20 bg-orange-400/10 px-5 py-4 text-right backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5">
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
                <p className="text-sm font-black uppercase tracking-[0.3em] text-cyan-200">EduPoints Engine</p>
                <h2 className="mt-2 text-4xl font-black sm:text-5xl">{eduPoints.toLocaleString()} EduPoints</h2>
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
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-indigo-400 to-fuchsia-400 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5" style={{ width: `${nextLevelProgress}%` }} />
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

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <div className={`hub-animate rounded-[2rem] p-6 ${glassCard}`} style={{ animationDelay: '360ms' }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-indigo-200">Learning Analytics</p>
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
            <p className="text-sm font-black uppercase tracking-[0.3em] text-fuchsia-200">Recent Quiz Scores</p>
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
                    <span className="text-cyan-200">{score.score}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`hub-animate mt-6 rounded-[2rem] p-6 ${glassCard}`} style={{ animationDelay: '520ms' }}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-200">Achievement Badges</p>
              <h2 className="mt-2 text-3xl font-black">Glowing Milestones</h2>
            </div>
            <p className="text-sm text-slate-600">Unlocked badges glow. Locked goals stay dim until earned.</p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {badges.map(badge => (
              <div
                key={badge.id}
                className={`rounded-[1.75rem] border p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-sm ${
                  badge.unlocked
                    ? 'border-cyan-300/30 bg-cyan-300/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5'
                    : 'border-white/50 bg-white/70 opacity-55 grayscale'
                }`}
              >
                <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full border text-4xl ${badge.unlocked ? 'border-cyan-200/40 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5' : 'border-white/50 bg-white/70'}`}>
                  {badge.icon}
                </div>
                <h3 className="mt-4 text-lg font-black">{badge.label}</h3>
                <p className="mt-2 text-xs text-slate-600">{badge.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className={`hub-animate rounded-[2rem] p-6 ${glassCard}`} style={{ animationDelay: '600ms' }}>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-emerald-200">Rewards Vault</p>
            <h2 className="mt-2 text-3xl font-black">What You Can Claim</h2>
            <div className="mt-5 grid gap-3">
              {rewards.length ? rewards.map((reward: any) => (
                <button
                  key={reward.id}
                  disabled={!!redeeming || (currentUser?.eduCoins || 0) < reward.cost}
                  onClick={() => redeem(reward)}
                  className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/70 p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:bg-white/80 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="font-bold">{reward.title}</span>
                  <span className="font-black text-amber-200">🪙 {reward.cost}</span>
                </button>
              )) : <p className="rounded-2xl border border-white/50 bg-white/70 p-4 text-slate-600">Reward claims will appear here as new perks are released.</p>}
            </div>
          </div>

          <div className={`hub-animate rounded-[2rem] p-6 ${glassCard}`} style={{ animationDelay: '680ms' }}>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-200">Personalization</p>
            <h2 className="mt-2 text-3xl font-black">Theme & Coupons</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {Object.values(themes).map(theme => {
                const key = theme.name.toLowerCase() as ThemeName;
                return (
                  <button
                    key={theme.name}
                    onClick={() => onThemeChange(key)}
                    className={`rounded-2xl border p-3 text-left transition-all duration-300 hover:-translate-y-1 ${activeTheme === key ? 'border-cyan-300/50 bg-cyan-300/10' : 'border-white/50 bg-white/70'}`}
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
                <div key={coupon.id} className="flex items-center justify-between rounded-2xl border border-dashed border-cyan-300/30 bg-cyan-300/10 p-4">
                  <span className="font-black text-cyan-700">{coupon.code}</span>
                  <span className="text-sm font-bold text-slate-600">{coupon.type === 'percentage' ? `${coupon.value}% off` : `₹${coupon.value} off`}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default ProfilePage;
