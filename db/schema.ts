import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const matches = sqliteTable(
  "matches",
  {
    code: text("code").primaryKey(),
    hostHash: text("host_hash").notNull(),
    guestHash: text("guest_hash"),
    state: text("state").notNull(),
    revision: integer("revision").notNull().default(0),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("idx_matches_expires_at").on(table.expiresAt)],
);
