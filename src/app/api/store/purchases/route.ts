import { NextResponse } from "next/server";
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ purchases: [] });
  }

  const rows = await db
    .select()
    .from(purchases)
    .where(eq(purchases.userId, user.id));

  return NextResponse.json({ purchases: rows });
}
