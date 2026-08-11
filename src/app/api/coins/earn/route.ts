import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

const CLAIM_AMOUNT = 50;
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const now = Date.now();
  const lastClaim = user.lastCoinClaimAt
    ? new Date(user.lastCoinClaimAt).getTime()
    : 0;
  const remaining = CLAIM_COOLDOWN_MS - (now - lastClaim);

  if (remaining > 0) {
    return NextResponse.json(
      {
        error: "You already claimed your daily EduCoins. Come back later!",
        nextClaimInMs: remaining,
      },
      { status: 429 },
    );
  }

  const [updated] = await db
    .update(users)
    .set({ coins: user.coins + CLAIM_AMOUNT, lastCoinClaimAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();

  return NextResponse.json({
    coins: updated.coins,
    claimed: CLAIM_AMOUNT,
  });
}
