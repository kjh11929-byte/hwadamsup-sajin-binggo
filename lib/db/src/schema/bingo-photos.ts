import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { bingoTeamsTable } from "./bingo-teams";
import { bingoMissionsTable } from "./bingo-missions";

export const bingoPhotosTable = pgTable(
  "bingo_photos",
  {
    id: serial("id").primaryKey(),
    teamNumber: integer("team_number")
      .notNull()
      .references(() => bingoTeamsTable.teamNumber),
    missionNumber: integer("mission_number")
      .notNull()
      .references(() => bingoMissionsTable.missionNumber),
    publicId: text("public_id").notNull(),
    imageUrl: text("image_url").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("bingo_photos_team_mission_unique").on(
      table.teamNumber,
      table.missionNumber,
    ),
  ],
);

export const insertBingoPhotoSchema = createInsertSchema(bingoPhotosTable).omit({
  id: true,
  uploadedAt: true,
});
export type InsertBingoPhoto = z.infer<typeof insertBingoPhotoSchema>;
export type BingoPhotoRecord = typeof bingoPhotosTable.$inferSelect;
