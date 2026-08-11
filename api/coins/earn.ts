import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema';
import { db, getCurrentUser, type VercelRequest, type VercelResponse } from '../_lib/auth';

const CLAIM_AMOUNT = 50;
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const lastClaim = user.lastCoinClaimAt ? new Date(user.lastCoinClaimAt).getTime() : 0;
  const remaining = CLAIM_COOLDOWN_MS - (Date.now() - lastClaim);
  if (remaining > 0) {
    return res.status(429).json({
      error: 'You already claimed your daily EduCoins. Come back later!',
      nextClaimInMs: remaining,
    });
  }

  const [updated] = await db.update(users)
    .set({ coins: user.coins + CLAIM_AMOUNT, lastCoinClaimAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();
  return res.status(200).json({ coins: updated.coins, claimed: CLAIM_AMOUNT });
}
