import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  bingoMissionsTable,
  bingoPhotosTable,
  bingoTeamsTable,
} from "@workspace/db";
import {
  GetBingoTeamResponse,
  ListBingoTeamsResponse,
} from "@workspace/api-zod";

export async function seedBingoGame(): Promise<void> {
  await db
    .insert(bingoTeamsTable)
    .values(
      Array.from({ length: 8 }, (_, index) => ({
        teamNumber: index + 1,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(bingoMissionsTable)
    .values(
      Array.from({ length: 9 }, (_, index) => ({
        missionNumber: index + 1,
        description: `미션 ${index + 1}`,
      })),
    )
    .onConflictDoNothing();
}

export function countBingoLines(filled: boolean[]): number {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  return lines.filter((line) => line.every((index) => filled[index])).length;
}

export async function getBingoTeams() {
  const [teamRows, missionRows, photoRows] = await Promise.all([
    db.select().from(bingoTeamsTable).orderBy(bingoTeamsTable.teamNumber),
    db.select().from(bingoMissionsTable).orderBy(bingoMissionsTable.missionNumber),
    db.select().from(bingoPhotosTable).orderBy(bingoPhotosTable.missionNumber),
  ]);

  const completedTeams = teamRows
    .filter((team) => team.completedAt !== null)
    .sort((left, right) => {
      const timeDifference =
        left.completedAt!.getTime() - right.completedAt!.getTime();
      return timeDifference || left.teamNumber - right.teamNumber;
    });
  const rankByTeam = new Map(
    completedTeams.map((team, index) => [team.teamNumber, index + 1]),
  );

  const teams = teamRows.map((team) => {
    const cells = missionRows.map((mission) => {
      const photo = photoRows.find(
        (item) =>
          item.teamNumber === team.teamNumber &&
          item.missionNumber === mission.missionNumber,
      );
      return {
        missionNumber: mission.missionNumber,
        description: mission.description,
        photo: photo
          ? {
              imageUrl: photo.imageUrl,
              publicId: photo.publicId,
              originalName: photo.originalName,
              uploadedAt: photo.uploadedAt,
            }
          : null,
      };
    });
    const filled = cells.map((cell) => cell.photo !== null);

    return {
      teamNumber: team.teamNumber,
      cells,
      filledCount: filled.filter(Boolean).length,
      bingoLineCount: countBingoLines(filled),
      completedAt: team.completedAt,
      completionRank: rankByTeam.get(team.teamNumber) ?? null,
    };
  });

  return ListBingoTeamsResponse.parse(teams);
}

export async function getBingoTeam(teamNumber: number) {
  const teams = await getBingoTeams();
  const team = teams.find((item) => item.teamNumber === teamNumber);
  return team ? GetBingoTeamResponse.parse(team) : null;
}

export async function getBingoMissions() {
  return db
    .select()
    .from(bingoMissionsTable)
    .orderBy(bingoMissionsTable.missionNumber);
}

export async function countPhotosForTeam(teamNumber: number): Promise<number> {
  const photos = await db
    .select({ id: bingoPhotosTable.id })
    .from(bingoPhotosTable)
    .where(eq(bingoPhotosTable.teamNumber, teamNumber));
  return photos.length;
}
