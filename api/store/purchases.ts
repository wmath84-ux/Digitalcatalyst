import { eq } from 'drizzle-orm';
import { purchases } from '../../src/db/schema';
import { db, getCurrentUser, type VercelRequest, type VercelResponse } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await getCurrentUser(req);
  if (!user) return res.status(200).json({ purchases: [] });
  const rows = await db.select().from(purchases).where(eq(purchases.userId, user.id));
  return res.status(200).json({ purchases: rows });
}
