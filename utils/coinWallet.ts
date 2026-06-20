import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

export type CoinDirection = 'credit' | 'debit';

export type CoinTransactionType =
  | 'youtube_watch_reward'
  | 'pdf_download_reward'
  | 'product_unlock_spend'
  | 'admin_adjustment'
  | 'refund'
  | 'bonus';

export interface WalletSnapshot {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

export interface CoinLedgerInput {
  userId: string;
  amount: number;
  direction: CoinDirection;
  type: CoinTransactionType;
  sourceType: string;
  sourceId: string;
  productId?: string | number;
  courseId?: string | number;
  lessonId?: string | number;
  pdfId?: string | number;
  title?: string;
  description?: string;
  idempotencyKey: string;
}

export interface ProductUnlockInput {
  userId: string;
  productId: string | number;
  productTitle: string;
  requiredCoins: number;
}

export interface YouTubeRewardInput {
  userId: string;
  courseId: string | number;
  lessonId: string | number;
  youtubeVideoId: string;
  validWatchedSeconds: number;
  totalDurationSeconds: number;
  rewardCoins: number;
  rewardThresholdPercent?: number;
}

export interface PdfRewardInput {
  userId: string;
  courseId: string | number;
  pdfId: string | number;
  pdfName: string;
  rewardCoins: number;
}

const safeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const cleanDocId = (value: string | number): string => {
  return String(value).replace(/[\/#?[\]]/g, '_');
};

export const getWallet = async (userId: string): Promise<WalletSnapshot> => {
  if (!userId) {
    return { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 };
  }

  const walletRef = doc(db, 'wallets', userId);
  const walletSnap = await getDoc(walletRef);

  if (!walletSnap.exists()) {
    return { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 };
  }

  const data = walletSnap.data();

  return {
    balance: safeNumber(data.balance),
    lifetimeEarned: safeNumber(data.lifetimeEarned),
    lifetimeSpent: safeNumber(data.lifetimeSpent),
  };
};

export const ensureWallet = async (userId: string): Promise<void> => {
  if (!userId) return;

  const walletRef = doc(db, 'wallets', userId);
  const walletSnap = await getDoc(walletRef);

  if (!walletSnap.exists()) {
    await setDoc(walletRef, {
      balance: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
};

export const writeCoinLedgerTransaction = async (input: CoinLedgerInput): Promise<WalletSnapshot> => {
  if (!input.userId) {
    throw new Error('Login required.');
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Invalid coin amount.');
  }

  const walletRef = doc(db, 'wallets', input.userId);
  const transactionRef = doc(db, 'coinTransactions', cleanDocId(input.idempotencyKey));

  return runTransaction(db, async (transaction) => {
    const existingTransaction = await transaction.get(transactionRef);
    if (existingTransaction.exists()) {
      const walletSnap = await transaction.get(walletRef);
      const wallet = walletSnap.exists() ? walletSnap.data() : {};
      return {
        balance: safeNumber(wallet.balance),
        lifetimeEarned: safeNumber(wallet.lifetimeEarned),
        lifetimeSpent: safeNumber(wallet.lifetimeSpent),
      };
    }

    const walletSnap = await transaction.get(walletRef);
    const walletData = walletSnap.exists() ? walletSnap.data() : {};
    const balanceBefore = safeNumber(walletData.balance);
    const lifetimeEarnedBefore = safeNumber(walletData.lifetimeEarned);
    const lifetimeSpentBefore = safeNumber(walletData.lifetimeSpent);

    const balanceAfter =
      input.direction === 'credit'
        ? balanceBefore + input.amount
        : balanceBefore - input.amount;

    if (balanceAfter < 0) {
      throw new Error('Insufficient coins.');
    }

    const lifetimeEarned =
      input.direction === 'credit'
        ? lifetimeEarnedBefore + input.amount
        : lifetimeEarnedBefore;

    const lifetimeSpent =
      input.direction === 'debit'
        ? lifetimeSpentBefore + input.amount
        : lifetimeSpentBefore;

    transaction.set(
      walletRef,
      {
        balance: balanceAfter,
        lifetimeEarned,
        lifetimeSpent,
        updatedAt: serverTimestamp(),
        createdAt: walletData.createdAt || serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(transactionRef, {
      userId: input.userId,
      amount: input.amount,
      direction: input.direction,
      type: input.type,
      sourceType: input.sourceType,
      sourceId: String(input.sourceId),
      productId: input.productId ?? null,
      courseId: input.courseId ?? null,
      lessonId: input.lessonId ?? null,
      pdfId: input.pdfId ?? null,
      title: input.title || '',
      description: input.description || '',
      idempotencyKey: input.idempotencyKey,
      balanceBefore,
      balanceAfter,
      status: 'success',
      createdAt: serverTimestamp(),
    });

    return {
      balance: balanceAfter,
      lifetimeEarned,
      lifetimeSpent,
    };
  });
};

export const unlockProductWithCoins = async (input: ProductUnlockInput): Promise<{
  alreadyUnlocked: boolean;
  balance: number;
}> => {
  if (!input.userId) {
    throw new Error('Login required.');
  }

  const requiredCoins = Math.max(0, Math.floor(Number(input.requiredCoins) || 0));
  if (requiredCoins <= 0) {
    throw new Error('Coin price is not enabled for this product.');
  }

  const productId = cleanDocId(input.productId);
  const unlockId = `${input.userId}_${productId}`;
  const transactionId = `product_unlock_spend:${unlockId}:${requiredCoins}`;

  const walletRef = doc(db, 'wallets', input.userId);
  const unlockRef = doc(db, 'productUnlocks', unlockId);
  const ledgerRef = doc(db, 'coinTransactions', cleanDocId(transactionId));

  const result = await runTransaction(db, async (transaction) => {
    const [walletSnap, unlockSnap, ledgerSnap] = await Promise.all([
      transaction.get(walletRef),
      transaction.get(unlockRef),
      transaction.get(ledgerRef),
    ]);

    const walletData = walletSnap.exists() ? walletSnap.data() : {};
    const balanceBefore = safeNumber(walletData.balance);

    if (unlockSnap.exists() || ledgerSnap.exists()) {
      return {
        alreadyUnlocked: true,
        balance: balanceBefore,
      };
    }

    if (balanceBefore < requiredCoins) {
      throw new Error('Insufficient coins.');
    }

    const balanceAfter = balanceBefore - requiredCoins;
    const lifetimeSpent = safeNumber(walletData.lifetimeSpent) + requiredCoins;

    transaction.set(
      walletRef,
      {
        balance: balanceAfter,
        lifetimeEarned: safeNumber(walletData.lifetimeEarned),
        lifetimeSpent,
        createdAt: walletData.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(unlockRef, {
      userId: input.userId,
      productId: String(input.productId),
      productTitle: input.productTitle,
      unlockMethod: 'coins',
      coinPricePaid: requiredCoins,
      transactionId,
      status: 'active',
      createdAt: serverTimestamp(),
    });

    transaction.set(ledgerRef, {
      userId: input.userId,
      amount: requiredCoins,
      direction: 'debit',
      type: 'product_unlock_spend',
      sourceType: 'product',
      sourceId: String(input.productId),
      productId: String(input.productId),
      title: input.productTitle,
      description: `Unlocked ${input.productTitle} with ${requiredCoins} coins.`,
      idempotencyKey: transactionId,
      balanceBefore,
      balanceAfter,
      status: 'success',
      createdAt: serverTimestamp(),
    });

    return {
      alreadyUnlocked: false,
      balance: balanceAfter,
    };
  });

  return result;
};

export const claimYouTubeWatchReward = async (input: YouTubeRewardInput): Promise<{
  claimed: boolean;
  balance: number;
  watchedPercent: number;
}> => {
  if (!input.userId) {
    throw new Error('Login required.');
  }

  const rewardCoins = Math.max(0, Math.floor(Number(input.rewardCoins) || 0));
  if (rewardCoins <= 0) {
    throw new Error('Reward is not enabled for this lesson.');
  }

  const duration = Math.max(1, Math.floor(Number(input.totalDurationSeconds) || 1));
  const validWatched = Math.max(0, Math.floor(Number(input.validWatchedSeconds) || 0));
  const threshold = Math.max(1, Math.min(100, Number(input.rewardThresholdPercent ?? 70)));
  const watchedPercent = Math.min(100, Math.floor((validWatched / duration) * 100));

  if (watchedPercent < threshold) {
    throw new Error(`Watch at least ${threshold}% valid time to earn coins.`);
  }

  const lessonId = cleanDocId(input.lessonId);
  const rewardId = `${input.userId}_${lessonId}`;
  const transactionId = `youtube_watch_reward:${rewardId}`;

  const walletRef = doc(db, 'wallets', input.userId);
  const rewardRef = doc(db, 'youtubeWatchRewards', rewardId);
  const progressRef = doc(db, 'watchProgress', rewardId);
  const ledgerRef = doc(db, 'coinTransactions', cleanDocId(transactionId));

  return runTransaction(db, async (transaction) => {
    const [walletSnap, rewardSnap, ledgerSnap] = await Promise.all([
      transaction.get(walletRef),
      transaction.get(rewardRef),
      transaction.get(ledgerRef),
    ]);

    const walletData = walletSnap.exists() ? walletSnap.data() : {};
    const balanceBefore = safeNumber(walletData.balance);

    transaction.set(
      progressRef,
      {
        userId: input.userId,
        courseId: String(input.courseId),
        lessonId: String(input.lessonId),
        youtubeVideoId: input.youtubeVideoId,
        validWatchedSeconds: validWatched,
        totalDurationSeconds: duration,
        watchedPercent,
        rewardEligible: true,
        rewardClaimed: rewardSnap.exists() || ledgerSnap.exists(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (rewardSnap.exists() || ledgerSnap.exists()) {
      return {
        claimed: false,
        balance: balanceBefore,
        watchedPercent,
      };
    }

    const balanceAfter = balanceBefore + rewardCoins;
    const lifetimeEarned = safeNumber(walletData.lifetimeEarned) + rewardCoins;

    transaction.set(
      walletRef,
      {
        balance: balanceAfter,
        lifetimeEarned,
        lifetimeSpent: safeNumber(walletData.lifetimeSpent),
        createdAt: walletData.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(rewardRef, {
      userId: input.userId,
      courseId: String(input.courseId),
      lessonId: String(input.lessonId),
      youtubeVideoId: input.youtubeVideoId,
      rewardCoins,
      validWatchedSeconds: validWatched,
      totalDurationSeconds: duration,
      watchedPercent,
      rewardClaimed: true,
      rewardClaimedAt: serverTimestamp(),
    });

    transaction.set(ledgerRef, {
      userId: input.userId,
      amount: rewardCoins,
      direction: 'credit',
      type: 'youtube_watch_reward',
      sourceType: 'youtube_lesson',
      sourceId: String(input.lessonId),
      courseId: String(input.courseId),
      lessonId: String(input.lessonId),
      title: 'YouTube lesson reward',
      description: `Earned ${rewardCoins} coins for watching a YouTube lesson.`,
      idempotencyKey: transactionId,
      balanceBefore,
      balanceAfter,
      status: 'success',
      createdAt: serverTimestamp(),
    });

    return {
      claimed: true,
      balance: balanceAfter,
      watchedPercent,
    };
  });
};

export const claimPdfDownloadReward = async (input: PdfRewardInput): Promise<{
  claimed: boolean;
  balance: number;
}> => {
  if (!input.userId) {
    throw new Error('Login required.');
  }

  const rewardCoins = Math.max(0, Math.floor(Number(input.rewardCoins) || 0));
  if (rewardCoins <= 0) {
    throw new Error('PDF reward is not enabled.');
  }

  const pdfId = cleanDocId(input.pdfId);
  const rewardId = `${input.userId}_${pdfId}`;
  const transactionId = `pdf_download_reward:${rewardId}`;

  const walletRef = doc(db, 'wallets', input.userId);
  const rewardRef = doc(db, 'pdfDownloadRewards', rewardId);
  const ledgerRef = doc(db, 'coinTransactions', cleanDocId(transactionId));

  return runTransaction(db, async (transaction) => {
    const [walletSnap, rewardSnap, ledgerSnap] = await Promise.all([
      transaction.get(walletRef),
      transaction.get(rewardRef),
      transaction.get(ledgerRef),
    ]);

    const walletData = walletSnap.exists() ? walletSnap.data() : {};
    const balanceBefore = safeNumber(walletData.balance);

    if (rewardSnap.exists() || ledgerSnap.exists()) {
      return {
        claimed: false,
        balance: balanceBefore,
      };
    }

    const balanceAfter = balanceBefore + rewardCoins;
    const lifetimeEarned = safeNumber(walletData.lifetimeEarned) + rewardCoins;

    transaction.set(
      walletRef,
      {
        balance: balanceAfter,
        lifetimeEarned,
        lifetimeSpent: safeNumber(walletData.lifetimeSpent),
        createdAt: walletData.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(rewardRef, {
      userId: input.userId,
      courseId: String(input.courseId),
      pdfId: String(input.pdfId),
      pdfName: input.pdfName,
      rewardCoins,
      rewardClaimed: true,
      downloadedAt: serverTimestamp(),
    });

    transaction.set(ledgerRef, {
      userId: input.userId,
      amount: rewardCoins,
      direction: 'credit',
      type: 'pdf_download_reward',
      sourceType: 'pdf',
      sourceId: String(input.pdfId),
      courseId: String(input.courseId),
      pdfId: String(input.pdfId),
      title: input.pdfName,
      description: `Earned ${rewardCoins} coins for downloading PDF.`,
      idempotencyKey: transactionId,
      balanceBefore,
      balanceAfter,
      status: 'success',
      createdAt: serverTimestamp(),
    });

    return {
      claimed: true,
      balance: balanceAfter,
    };
  });
};
