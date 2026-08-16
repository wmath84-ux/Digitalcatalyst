import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export interface LegacyIdentityCleanupResult {
  backupFileName: string;
  canonicalUsers: number;
  mergedLegacyUsers: number;
  deletedBlankLegacyUsers: number;
  deletedOrphanProfiles: number;
  deletedOrphanFollows: number;
  copiedPurchases: number;
  manualReviewIds: string[];
}

type RawRecord = { id: string; data: Record<string, any> };
type LegacySubcollections = Record<string, { purchases: RawRecord[] }>;

const NUMERIC_LEGACY_ID = /^\d{10,}$/;
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const uniqueValues = (values: unknown[]) => Array.from(new Set(values.filter((value) => value !== undefined && value !== null && value !== '')));
const isStableUid = (value: string) => !NUMERIC_LEGACY_ID.test(value) && value.length >= 20;

const serializable = (value: any): any => {
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializable(item)]));
  }
  return value;
};

const downloadBackup = (payload: unknown) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `legacy-identity-backup-${stamp}.json`;
  const blob = new Blob([JSON.stringify(serializable(payload), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return fileName;
};

const loadCollection = async (name: string): Promise<RawRecord[]> => {
  const snapshot = await getDocs(collection(db, name));
  return snapshot.docs.map((item) => ({ id: item.id, data: item.data() as Record<string, any> }));
};

const loadUserSubcollection = async (userId: string, name: 'purchases'): Promise<RawRecord[]> => {
  const snapshot = await getDocs(collection(db, 'users', userId, name));
  return snapshot.docs.map((item) => ({ id: item.id, data: item.data() as Record<string, any> }));
};

const hasMeaningfulLegacyData = (record: RawRecord) => {
  const data = record.data;
  return Boolean(
    normalizeEmail(data.email) ||
    String(data.name || data.displayName || '').trim() ||
    String(data.mobile || '').trim() ||
    (Array.isArray(data.purchasedProductIds) && data.purchasedProductIds.length)
  );
};

export const cleanupLegacyIdentityRecords = async (): Promise<LegacyIdentityCleanupResult> => {
  const admin = auth.currentUser;
  if (!admin) throw new Error('Admin login is required.');
  const adminSnapshot = await getDoc(doc(db, 'users', admin.uid));
  const adminRole = String(adminSnapshot.data()?.role || '');
  if (!['admin', 'super_admin'].includes(adminRole)) throw new Error('Only an admin or super admin can run identity cleanup.');

  const [users, publicProfiles, communityProfiles, follows] = await Promise.all([
    loadCollection('users'),
    loadCollection('publicProfiles'),
    loadCollection('community_profiles'),
    loadCollection('community_follows'),
  ]);

  const legacyCandidates = users.filter((record) => NUMERIC_LEGACY_ID.test(record.id) || !record.data.uid || record.data.uid !== record.id);
  const legacySubcollections: LegacySubcollections = {};
  for (const legacy of legacyCandidates) {
    const [purchases] = await Promise.all([
      loadUserSubcollection(legacy.id, 'purchases'),
    ]);
    legacySubcollections[legacy.id] = { purchases };
  }

  const backupFileName = downloadBackup({
    createdAt: new Date().toISOString(),
    project: 'Digitalcatalyst',
    users,
    publicProfiles,
    communityProfiles,
    follows,
    legacySubcollections,
  });

  const canonicalUsers = users.filter(({ id, data }) => {
    const explicitUid = String(data.uid || data.authUid || data.firebaseUid || id);
    return isStableUid(id) && explicitUid === id;
  });
  const canonicalIds = new Set(canonicalUsers.map((record) => record.id));
  const canonicalByEmail = new Map<string, RawRecord[]>();
  canonicalUsers.forEach((record) => {
    const email = normalizeEmail(record.data.email);
    if (!email) return;
    canonicalByEmail.set(email, [...(canonicalByEmail.get(email) || []), record]);
  });

  let mergedLegacyUsers = 0;
  let deletedBlankLegacyUsers = 0;
  let deletedOrphanProfiles = 0;
  let deletedOrphanFollows = 0;
  let copiedPurchases = 0;
  const manualReviewIds: string[] = [];

  for (const legacy of legacyCandidates) {
    const nested = legacySubcollections[legacy.id] || { purchases: [] };
    const email = normalizeEmail(legacy.data.email);
    const matches = email ? (canonicalByEmail.get(email) || []) : [];

    if (matches.length === 1) {
      if (nested.purchases.length > 0) {
        manualReviewIds.push(`users/${legacy.id} (purchase records preserved)`);
        continue;
      }

      const canonical = matches[0];
      const canonicalData = canonical.data;
      const canonicalName = String(canonicalData.name || '').trim();
      const legacyName = String(legacy.data.name || legacy.data.displayName || '').trim();
      const nextName = (!canonicalName || /^User\s+[A-Z0-9]+$/i.test(canonicalName)) && legacyName ? legacyName : canonicalName;
      const purchasedProductIds = uniqueValues([...(canonicalData.purchasedProductIds || []), ...(legacy.data.purchasedProductIds || [])]);
      const rewardedArticleIds = uniqueValues([...(canonicalData.rewardedArticleIds || []), ...(legacy.data.rewardedArticleIds || [])]);
      const readArticles = uniqueValues([...(canonicalData.readArticles || []), ...(legacy.data.readArticles || [])]);
      const rewardedQuizIds = uniqueValues([...(canonicalData.rewardedQuizIds || []), ...(legacy.data.rewardedQuizIds || [])]);
      const claimedRewardIds = uniqueValues([...(canonicalData.claimedRewardIds || []), ...(legacy.data.claimedRewardIds || [])]);

      await setDoc(doc(db, 'users', canonical.id), {
        name: nextName || canonicalData.name,
        mobile: canonicalData.mobile || legacy.data.mobile || '',
        purchasedProductIds,
        rewardedArticleIds,
        readArticles,
        rewardedQuizIds,
        claimedRewardIds,
        canonicalUid: canonical.id,
        identityVersion: 2,
        legacyMergedFrom: uniqueValues([...(canonicalData.legacyMergedFrom || []), legacy.id]),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await deleteDoc(doc(db, 'users', legacy.id));
      mergedLegacyUsers += 1;
      continue;
    }

    if (!hasMeaningfulLegacyData(legacy) && nested.purchases.length === 0) {
      await deleteDoc(doc(db, 'users', legacy.id));
      deletedBlankLegacyUsers += 1;
    } else {
      manualReviewIds.push(`users/${legacy.id}`);
    }
  }

  for (const profile of publicProfiles) {
    if (canonicalIds.has(profile.id)) continue;
    await deleteDoc(doc(db, 'publicProfiles', profile.id));
    deletedOrphanProfiles += 1;
  }

  for (const profile of communityProfiles) {
    if (canonicalIds.has(profile.id)) continue;
    await deleteDoc(doc(db, 'community_profiles', profile.id));
    deletedOrphanProfiles += 1;
  }

  for (const follow of follows) {
    const followerId = String(follow.data.followerId || follow.data.fromUserId || follow.data.userId || '');
    const followingId = String(follow.data.followingId || follow.data.toUserId || follow.data.targetUserId || '');
    if (canonicalIds.has(followerId) && canonicalIds.has(followingId)) continue;
    await deleteDoc(doc(db, 'community_follows', follow.id));
    deletedOrphanFollows += 1;
  }

  try {
    const stored = JSON.parse(localStorage.getItem('siteUsers') || '[]');
    if (Array.isArray(stored)) localStorage.setItem('siteUsers', JSON.stringify(stored.filter((user) => canonicalIds.has(String(user?.id || user?.uid || '')))));
  } catch {
    // Browser cache cleanup is optional; Firestore remains the source of truth.
  }

  return {
    backupFileName,
    canonicalUsers: canonicalUsers.length,
    mergedLegacyUsers,
    deletedBlankLegacyUsers,
    deletedOrphanProfiles,
    deletedOrphanFollows,
    copiedPurchases,
    manualReviewIds,
  };
};
