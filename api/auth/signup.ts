import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../../src/db/schema';
import { db, hashPassword, publicUser, setSessionCookie, type VercelRequest, type VercelResponse } from '../_lib/auth';

const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });

  try {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await hashPassword(parsed.data.password);
    const [user] = await db.insert(users).values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      coins: 300,
    }).returning();
    setSessionCookie(res, user.id);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    console.error('Signup error', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
