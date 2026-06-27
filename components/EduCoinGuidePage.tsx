import React, { useEffect, useMemo, useState } from 'react';
import { User, WebsiteSettings } from '../App';
import { EconomySettings } from '../utils/economy';
import { ensureUserCoinWallet, watchUserCoinWallet } from '../utils/coinWallet';

interface EduCoinGuidePageProps {
  settings: WebsiteSettings;
  economySettings: EconomySettings;
  currentUser: User | null;
  requiredCoins?: number;
  productTitle?: string;
  onBack: () => void;
  onExplorePurchases: () => void;
  onOpenProfile: () => void;
  onOpenReadingHub: () => void;
}

const EduCoinGuidePage: React.FC<EduCoinGuidePageProps> = ({
  economySettings,
  currentUser,
  requiredCoins = 0,
  productTitle,
  onBack,
  onExplorePurchases,
  onOpenProfile,
  onOpenReadingHub,
}) => {
  const [liveWallet, setLiveWallet] = useState<{ coinBalance: number; totalCoinsEarned: number } | null>(null);
  const walletUserId = currentUser?.uid || (currentUser?.id ? String(currentUser.id) : '');

  useEffect(() => {
    if (!walletUserId) {
      setLiveWallet(null);
      return undefined;
    }

    ensureUserCoinWallet(walletUserId).catch((error) => {
      console.error('EduCoin guide wallet setup failed:', error);
    });

    const unsubscribe = watchUserCoinWallet(
      walletUserId,
      (wallet) => setLiveWallet({ coinBalance: wallet.coinBalance, totalCoinsEarned: wallet.totalCoinsEarned }),
      (error) => {
        console.error('EduCoin guide wallet watch failed:', error);
        setLiveWallet(null);
      }
    );

    return () => unsubscribe();
  }, [walletUserId]);

  const balance = liveWallet?.coinBalance ?? (currentUser as (User & { coinBalance?: number }) | null)?.coinBalance ?? currentUser?.eduCoins ?? 0;
  const totalLifetimeCoins = liveWallet?.totalCoinsEarned ?? currentUser?.totalLifetimeCoins ?? balance;
  const missingCoins = Math.max(0, requiredCoins - balance);
  const articleMinutes = Math.max(1, Math.ceil(economySettings.articleReadTimeRequiredSec / 60));
  const coinPerVideoMinute = Math.max(0, Number(economySettings.coinPerVideoMinute));
  const coinPerArticleRead = Math.max(0, Number(economySettings.coinPerArticleRead));
  const coinPerQuizCorrect = Math.max(0, Number(economySettings.coinPerQuizCorrect));
  const coinPerPurchase = Math.max(0, Number(economySettings.coinPerPurchase));
  const coinToFiatRatio = Math.max(1, Number(economySettings.coinToFiatRatio));

  const earningMethods = useMemo(() => [
    {
      icon: '🎬',
      title: 'Watch unlocked video lessons',
      reward: `${coinPerVideoMinute} EduCoin${coinPerVideoMinute === 1 ? '' : 's'} / focused video minute`,
      exactLogic: 'Course videos call the internal watch-time reward after each focused minute, so only real watched minutes add coins.',
      estimate: coinPerVideoMinute > 0 && missingCoins > 0 ? `About ${Math.ceil(missingCoins / coinPerVideoMinute)} focused video minute${Math.ceil(missingCoins / coinPerVideoMinute) === 1 ? '' : 's'} to cover this gap.` : 'Video rewards are currently set to 0 coins per minute.',
      action: onExplorePurchases,
      actionLabel: 'Open My Purchases',
    },
    {
      icon: '📖',
      title: 'Read Study Blog / News articles',
      reward: `${coinPerArticleRead} EduCoins after ${articleMinutes} minute${articleMinutes === 1 ? '' : 's'} of reading`,
      exactLogic: 'The reading drawer uses the configured article timer and rewards each article only once after the read requirement is met.',
      estimate: coinPerArticleRead > 0 && missingCoins > 0 ? `About ${Math.ceil(missingCoins / coinPerArticleRead)} article reward${Math.ceil(missingCoins / coinPerArticleRead) === 1 ? '' : 's'} needed.` : 'Article rewards are currently set to 0 coins.',
      action: onOpenReadingHub,
      actionLabel: 'Open Reading Hub',
    },
    {
      icon: '🎯',
      title: 'Complete course quizzes',
      reward: `${coinPerQuizCorrect} EduCoins / correct answer`,
      exactLogic: 'Quiz rewards are calculated from correct answers and protected by rewarded quiz IDs, so repeated quiz submissions cannot farm duplicate rewards.',
      estimate: coinPerQuizCorrect > 0 && missingCoins > 0 ? `About ${Math.ceil(missingCoins / coinPerQuizCorrect)} correct answer${Math.ceil(missingCoins / coinPerQuizCorrect) === 1 ? '' : 's'} needed.` : 'Quiz rewards are currently set to 0 coins per correct answer.',
      action: onExplorePurchases,
      actionLabel: 'Open Courses',
    },
    {
      icon: '🛒',
      title: 'Razorpay purchase reward',
      reward: `${coinPerPurchase} EduCoins after a successful product purchase`,
      exactLogic: 'The product purchase completion handler credits this configured reward after Razorpay/demo verification unlocks the order.',
      estimate: coinPerPurchase > 0 && missingCoins > 0 ? `About ${Math.ceil(missingCoins / coinPerPurchase)} purchase reward${Math.ceil(missingCoins / coinPerPurchase) === 1 ? '' : 's'} would cover this gap.` : 'Purchase rewards are currently set to 0 coins.',
      action: onBack,
      actionLabel: 'Return to Checkout',
    },
    {
      icon: '🏆',
      title: 'Profile milestones',
      reward: '500 / 1000 / 2000 lifetime coin milestone unlocks',
      exactLogic: 'Milestones compare your total lifetime coins with the milestone requirement, then unlock one-time rewards from the profile hub.',
      estimate: `Your lifetime total is ${totalLifetimeCoins} EduCoins. Claim ready milestones from Profile if available.`,
      action: onOpenProfile,
      actionLabel: 'Open Profile',
    },
    {
      icon: '💎',
      title: 'Rewards Vault discounts',
      reward: `${coinToFiatRatio} EduCoins = ₹1 discount`,
      exactLogic: 'Profile vault claim cards are generated from live product/subscription coin prices and admin economy overrides.',
      estimate: 'Use vault claims when you want a partial discount instead of a full EduCoin purchase.',
      action: onOpenProfile,
      actionLabel: 'Open Vault',
    },
  ], [articleMinutes, balance, coinPerArticleRead, coinPerPurchase, coinPerQuizCorrect, coinPerVideoMinute, coinToFiatRatio, missingCoins, totalLifetimeCoins, onBack, onExplorePurchases, onOpenProfile, onOpenReadingHub]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-indigo-50 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <button onClick={onBack} className="mb-6 rounded-full border border-white/70 bg-white/80 px-5 py-3 text-sm font-black text-slate-700 shadow-sm backdrop-blur-xl transition hover:-translate-x-1 hover:bg-white">
          ← Back to checkout
        </button>

        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/70 bg-white/80 p-8 shadow-[0_28px_100px_rgba(245,158,11,0.16)] backdrop-blur-2xl sm:p-10">
          <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-amber-300/30 blur-3xl" />
          <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-indigo-300/25 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.32em] text-amber-600">EduCoin balance low</p>
              <h1 className="mt-4 text-4xl font-black leading-tight text-slate-950 sm:text-6xl">Earn more EduCoins before checkout</h1>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-slate-600">
                {productTitle ? `Your wallet does not have enough EduCoins for ${productTitle}. ` : 'Your wallet does not have enough EduCoins for this checkout. '}
                The earning methods below are pulled from the same internal economy settings used by videos, articles, quizzes, purchases, and profile rewards.
              </p>
            </div>
            <div className="rounded-[2rem] border border-amber-200/70 bg-amber-50/90 p-6 shadow-inner">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-black uppercase tracking-widest text-amber-700">Your balance</span>
                <span className="text-3xl font-black text-slate-950">🪙 {balance}</span>
              </div>
              <div className="mt-5 flex items-center justify-between gap-4">
                <span className="text-sm font-black uppercase tracking-widest text-amber-700">Required</span>
                <span className="text-3xl font-black text-slate-950">🪙 {requiredCoins}</span>
              </div>
              <div className="mt-5 rounded-2xl bg-white/80 px-5 py-4 text-center text-lg font-black text-red-600">
                Need {missingCoins} more EduCoins
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {earningMethods.map(method => (
            <article key={method.title} className="flex flex-col rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_16px_50px_rgba(15,23,42,0.07)] backdrop-blur-xl transition hover:-translate-y-1 hover:bg-white">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-indigo-100 text-3xl shadow-inner">{method.icon}</div>
                <div>
                  <h2 className="text-lg font-black text-slate-950">{method.title}</h2>
                  <p className="mt-1 text-sm font-black text-indigo-600">{method.reward}</p>
                </div>
              </div>
              <p className="mt-5 text-sm font-semibold leading-6 text-slate-600">{method.exactLogic}</p>
              <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-black text-slate-700">{method.estimate}</p>
              <button onClick={method.action} className="mt-auto rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-700">
                {method.actionLabel}
              </button>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
};

export default EduCoinGuidePage;
