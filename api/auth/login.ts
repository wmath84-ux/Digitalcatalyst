import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../../src/db/schema';
import { db, publicUser, setSessionCookie, verifyPassword, type VercelRequest, type VercelResponse } from '../_lib/auth';

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });

  try {
    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    setSessionCookie(res, user.id);
    return res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    console.error('Login error', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
