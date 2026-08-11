import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    coins: integer("coins").notNull().default(300),
    lastCoinClaimAt: timestamp("last_coin_claim_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull(),
  itemName: text("item_name").notNull(),
  itemType: text("item_type").notNull().default("resource"),
  price: integer("price").notNull(),
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
});

export const mentorMessages = pgTable("mentor_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type MentorMessage = typeof mentorMessages.$inferSelect;
