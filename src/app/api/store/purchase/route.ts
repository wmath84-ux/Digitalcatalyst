import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, purchases } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

const purchaseSchema = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  itemType: z.string().min(1).default("resource"),
  price: z.number().int().min(0),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = purchaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { itemId, itemName, itemType, price } = parsed.data;

  const [existing] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, user.id), eq(purchases.itemId, itemId)));

  if (existing) {
    return NextResponse.json({ error: "You already own this item" }, { status: 409 });
  }

  if (user.coins < price) {
    return NextResponse.json(
      { error: "Not enough EduCoins. Earn more coins to unlock this item." },
      { status: 402 },
    );
  }

  const [updatedUser] = await db
    .update(users)
    .set({ coins: user.coins - price })
    .where(eq(users.id, user.id))
    .returning();

  const [purchase] = await db
    .insert(purchases)
    .values({ userId: user.id, itemId, itemName, itemType, price })
    .returning();

  return NextResponse.json({ coins: updatedUser.coins, purchase });
}
