import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';

export const EDUCOIN_SECONDS_PER_COIN = 120;

export type CoinTransactionType = 'earned' | 'spent' | 'adjustment' | 'refund';
export type CoinTransactionSource =
  | 'youtube_watch'
  | 'product_redeem'
  | 'admin_adjustment'
  | 'migration';

export type WatchSessionStatus =
  | 'active'
  | 'paused'
  | 'closed'
  | 'credited'
  | 'failed'
  | 'expired';

export interface WatchSessionInput {
  sessionId: string;
  userId: string;
  courseId: string;
  videoId: string;
  youtubeVideoId?: string;
}

export interface CreditWatchSessionInput extends WatchSessionInput {
  validWatchedSeconds: number;
  lastPlaybackPosition?: number;
}

export interface RedeemProductInput {
  userId: string;
  productId: string;
  requiredCoins?: number;
  productTitle?: string;
}

export interface CoinWalletSnapshot {
  coinBalance: number;
  totalCoinsEarned: number;
  totalCoinsSpent: number;
}

const safeNumber = (value: unknown, fallback = 0): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const completedCoinsFromSeconds = (seconds: number): number => {
  return Math.max(0, Math.floor(seconds / EDUCOIN_SECONDS_PER_COIN));
};

export const normalizeCoinPrice = (value: unknown): number => {
  const price = safeNumber(value, 0);
  return Math.max(0, Math.floor(price));
};

export const ensureUserCoinWallet = async (userId: string): Promise<void> => {
  if (!userId) return;

  const userRef = doc(db, 'users', userId);

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists()) {
      transaction.set(userRef, {
        coinBalance: 0,
        totalCoinsEarned: 0,
        totalCoinsSpent: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const userData = userSnap.data();

    transaction.set(
      userRef,
      {
        coinBalance: safeNumber(userData.coinBalance, 0),
        totalCoinsEarned: safeNumber(userData.totalCoinsEarned, 0),
        totalCoinsSpent: safeNumber(userData.totalCoinsSpent, 0),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
};

export const watchUserCoinWallet = (
  userId: string,
  onChange: (wallet: CoinWalletSnapshot) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  if (!userId) {
    onChange({
      coinBalance: 0,
      totalCoinsEarned: 0,
      totalCoinsSpent: 0,
    });
    return () => {};
  }

  return onSnapshot(
    doc(db, 'users', userId),
    (snapshot) => {
      const data = snapshot.data();

      onChange({
        coinBalance: safeNumber(data?.coinBalance, 0),
        totalCoinsEarned: safeNumber(data?.totalCoinsEarned, 0),
        totalCoinsSpent: safeNumber(data?.totalCoinsSpent, 0),
      });
    },
    (error) => {
      onError?.(error);
    }
  );
};

export const startWatchSession = async ({
  sessionId,
  userId,
  courseId,
  videoId,
  youtubeVideoId,
}: WatchSessionInput): Promise<void> => {
  if (!sessionId || !userId || !courseId || !videoId) return;

  await ensureUserCoinWallet(userId);

  await setDoc(
    doc(db, 'watchSessions', sessionId),
    {
      sessionId,
      userId,
      courseId,
      videoId,
      youtubeVideoId: youtubeVideoId || '',
      validWatchedSeconds: 0,
      earnedCoins: 0,
      creditedCoins: 0,
      lastPlaybackPosition: 0,
      status: 'active' satisfies WatchSessionStatus,
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const markWatchSessionPaused = async (sessionId: string): Promise<void> => {
  if (!sessionId) return;

  await updateDoc(doc(db, 'watchSessions', sessionId), {
    status: 'paused' satisfies WatchSessionStatus,
    updatedAt: serverTimestamp(),
  });
};

export const creditWatchSessionCoins = async ({
  sessionId,
  userId,
  courseId,
  videoId,
  youtubeVideoId,
  validWatchedSeconds,
  lastPlaybackPosition = 0,
}: CreditWatchSessionInput): Promise<number> => {
  if (!sessionId || !userId) return 0;

  const completedCoins = completedCoinsFromSeconds(validWatchedSeconds);
  const sessionRef = doc(db, 'watchSessions', sessionId);
  const userRef = doc(db, 'users', userId);
  const transactionRef = doc(collection(db, 'coinTransactions'));

  return runTransaction(db, async (transaction) => {
    const [sessionSnap, userSnap] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(userRef),
    ]);

    if (!userSnap.exists()) {
      transaction.set(userRef, {
        coinBalance: 0,
        totalCoinsEarned: 0,
        totalCoinsSpent: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const sessionData = sessionSnap.exists() ? sessionSnap.data() : {};
    const creditedCoins = safeNumber(sessionData.creditedCoins, 0);
    const coinsToCredit = Math.max(0, completedCoins - creditedCoins);

    if (coinsToCredit <= 0) {
      transaction.set(
        sessionRef,
        {
          sessionId,
          userId,
          courseId,
          videoId,
          youtubeVideoId: youtubeVideoId || '',
          validWatchedSeconds,
          earnedCoins: completedCoins,
          creditedCoins,
          lastPlaybackPosition,
          status: 'credited' satisfies WatchSessionStatus,
          endedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return 0;
    }

    const userData = userSnap.exists() ? userSnap.data() : {};
    const balanceBefore = safeNumber(userData.coinBalance, 0);
    const balanceAfter = balanceBefore + coinsToCredit;

    transaction.set(
      sessionRef,
      {
        sessionId,
        userId,
        courseId,
        videoId,
        youtubeVideoId: youtubeVideoId || '',
        validWatchedSeconds,
        earnedCoins: completedCoins,
        creditedCoins: creditedCoins + coinsToCredit,
        lastPlaybackPosition,
        status: 'credited' satisfies WatchSessionStatus,
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(transactionRef, {
      userId,
      type: 'earned' satisfies CoinTransactionType,
      source: 'youtube_watch' satisfies CoinTransactionSource,
      amount: coinsToCredit,
      balanceBefore,
      balanceAfter,
      courseId,
      videoId,
      youtubeVideoId: youtubeVideoId || '',
      sessionId,
      status: 'success',
      createdAt: serverTimestamp(),
    });

    transaction.set(
      userRef,
      {
        coinBalance: balanceAfter,
        totalCoinsEarned: safeNumber(userData.totalCoinsEarned, 0) + coinsToCredit,
        totalCoinsSpent: safeNumber(userData.totalCoinsSpent, 0),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return coinsToCredit;
  });
};

export const getProductCoinPrice = async (productId: string): Promise<{
  coinPrice: number;
  isCoinRedeemEnabled: boolean;
  status: string;
}> => {
  if (!productId) {
    return {
      coinPrice: 0,
      isCoinRedeemEnabled: false,
      status: 'inactive',
    };
  }

  const productSnap = await getDoc(doc(db, 'products', productId));
  const product = productSnap.data();

  return {
    coinPrice: normalizeCoinPrice(product?.coinPrice),
    isCoinRedeemEnabled: product?.isCoinRedeemEnabled !== false,
    status: String(product?.status || 'active'),
  };
};

export const redeemProductWithEduCoins = async ({
  userId,
  productId,
  requiredCoins,
  productTitle,
}: RedeemProductInput): Promise<{
  success: boolean;
  reason?: 'login_required' | 'product_not_found' | 'redeem_disabled' | 'already_unlocked' | 'not_enough_coins';
  requiredCoins?: number;
  currentBalance?: number;
}> => {
  if (!userId) {
    return {
      success: false,
      reason: 'login_required',
    };
  }

  const userRef = doc(db, 'users', userId);
  const productRef = doc(db, 'products', productId);
  const unlockRef = doc(db, 'users', userId, 'unlockedProducts', productId);
  const transactionRef = doc(collection(db, 'coinTransactions'));

  return runTransaction(db, async (transaction) => {
    const [userSnap, productSnap, unlockSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(productRef),
      transaction.get(unlockRef),
    ]);

    const product = productSnap.exists() ? productSnap.data() : null;
    const explicitCoinPrice = normalizeCoinPrice(requiredCoins);
    const coinPrice = explicitCoinPrice > 0 ? explicitCoinPrice : normalizeCoinPrice(product?.coinPrice);
    const isCoinRedeemEnabled = product ? product.isCoinRedeemEnabled !== false : coinPrice > 0;
    const productStatus = String(product?.status || 'active');

    if (!productSnap.exists() && coinPrice <= 0) {
      return {
        success: false,
        reason: 'product_not_found' as const,
      };
    }

    if (!isCoinRedeemEnabled || productStatus === 'inactive' || productStatus === 'draft') {
      return {
        success: false,
        reason: 'redeem_disabled' as const,
        requiredCoins: coinPrice,
      };
    }

    if (unlockSnap.exists()) {
      return {
        success: false,
        reason: 'already_unlocked' as const,
        requiredCoins: coinPrice,
      };
    }

    const userData = userSnap.exists() ? userSnap.data() : {};
    const balanceBefore = safeNumber(userData.coinBalance, 0);

    if (balanceBefore < coinPrice) {
      return {
        success: false,
        reason: 'not_enough_coins' as const,
        requiredCoins: coinPrice,
        currentBalance: balanceBefore,
      };
    }

    const balanceAfter = balanceBefore - coinPrice;

    transaction.set(unlockRef, {
      productId,
      title: productTitle || product?.title || '',
      unlockMethod: 'educoin',
      coinSpent: coinPrice,
      status: 'active',
      unlockedAt: serverTimestamp(),
    });

    transaction.set(transactionRef, {
      userId,
      productId,
      type: 'spent' satisfies CoinTransactionType,
      source: 'product_redeem' satisfies CoinTransactionSource,
      amount: coinPrice,
      balanceBefore,
      balanceAfter,
      status: 'success',
      createdAt: serverTimestamp(),
    });

    transaction.set(
      userRef,
      {
        coinBalance: balanceAfter,
        totalCoinsEarned: safeNumber(userData.totalCoinsEarned, 0),
        totalCoinsSpent: safeNumber(userData.totalCoinsSpent, 0) + coinPrice,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return {
      success: true,
      requiredCoins: coinPrice,
      currentBalance: balanceAfter,
    };
  });
};
