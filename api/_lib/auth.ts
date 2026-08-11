import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { users, type User } from '../../src/db/schema';

export type VercelRequest = {
  method?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
};

export type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

export const SESSION_COOKIE = 'eduvora_session';
const JWT_SECRET = process.env.JWT_SECRET || 'eduvora-dev-secret-change-me';

const globalForDb = globalThis as typeof globalThis & { __eduvoraAuthPool?: Pool };
const databaseUrl = process.env.DATABASE_URL;

export const pool = globalForDb.__eduvoraAuthPool ?? new Pool({ connectionString: databaseUrl });
if (process.env.NODE_ENV !== 'production') globalForDb.__eduvoraAuthPool = pool;
export const db = drizzle(pool);

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

const readCookie = (request: VercelRequest, name: string) => {
  const raw = request.headers?.cookie;
  const header = Array.isArray(raw) ? raw.join(';') : String(raw || '');
  return header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
};

export const setSessionCookie = (response: VercelResponse, userId: number) => {
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`);
};

export const clearSessionCookie = (response: VercelResponse) => {
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
};

export async function getCurrentUser(request: VercelRequest): Promise<User | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    return user ?? null;
  } catch {
    return null;
  }
}

export const publicUser = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  coins: user.coins,
});
