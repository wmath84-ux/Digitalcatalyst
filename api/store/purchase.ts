import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { purchases, users } from '../../src/db/schema';
import { db, getCurrentUser, type VercelRequest, type VercelResponse } from '../_lib/auth';

const schema = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  itemType: z.string().min(1).default('resource'),
  price: z.number().int().min(0),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
  const { itemId, itemName, itemType, price } = parsed.data;

  const [existing] = await db.select().from(purchases)
    .where(and(eq(purchases.userId, user.id), eq(purchases.itemId, itemId)));
  if (existing) return res.status(409).json({ error: 'You already own this item' });
  if (user.coins < price) return res.status(402).json({ error: 'Not enough EduCoins. Earn more coins to unlock this item.' });

  const [updatedUser] = await db.update(users).set({ coins: user.coins - price }).where(eq(users.id, user.id)).returning();
  const [purchase] = await db.insert(purchases).values({ userId: user.id, itemId, itemName, itemType, price }).returning();
  return res.status(200).json({ coins: updatedUser.coins, purchase });
}
