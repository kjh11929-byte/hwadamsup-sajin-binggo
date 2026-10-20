import { pgTable, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bingoTeamsTable = pgTable("bingo_teams", {
  teamNumber: integer("team_number").primaryKey(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertBingoTeamSchema = createInsertSchema(bingoTeamsTable);
export type InsertBingoTeam = z.infer<typeof insertBingoTeamSchema>;
export type BingoTeamRecord = typeof bingoTeamsTable.$inferSelect;
