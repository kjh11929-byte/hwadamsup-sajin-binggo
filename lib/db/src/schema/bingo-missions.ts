import { pgTable, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bingoMissionsTable = pgTable("bingo_missions", {
  missionNumber: integer("mission_number").primaryKey(),
  description: text("description").notNull(),
});

export const insertBingoMissionSchema = createInsertSchema(bingoMissionsTable);
export type InsertBingoMission = z.infer<typeof insertBingoMissionSchema>;
export type BingoMissionRecord = typeof bingoMissionsTable.$inferSelect;
