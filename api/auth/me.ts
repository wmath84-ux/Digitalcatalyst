import { getCurrentUser, publicUser, type VercelRequest, type VercelResponse } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await getCurrentUser(req);
  return res.status(200).json({ user: user ? publicUser(user) : null });
}
