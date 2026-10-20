import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  bingoMissionsTable,
  bingoPhotosTable,
  bingoTeamsTable,
} from "@workspace/db";
import {
  GetBingoTeamParams,
  GetBingoTeamResponse,
  ListBingoTeamsResponse,
  RequestBingoPhotoUploadBody,
  RequestBingoPhotoUploadResponse,
  SaveBingoPhotoBody,
  SaveBingoPhotoParams,
  SaveBingoPhotoResponse,
} from "@workspace/api-zod";
import { getBingoTeam, getBingoTeams } from "../lib/bingo";
import {
  ALLOWED_IMAGE_TYPES,
  createPhotoUploadSignature,
  getCloudinaryConfig,
  isValidCloudinaryPhotoUrl,
  MAX_PHOTO_SIZE_BYTES,
} from "../lib/cloudinary";

const router: IRouter = Router();
const uploadRequestsByIp = new Map<string, number[]>();
const UPLOAD_RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_UPLOAD_REQUESTS_PER_WINDOW = 24;

function allowUploadRequest(ip: string, now: number): boolean {
  const recent = (uploadRequestsByIp.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < UPLOAD_RATE_WINDOW_MS,
  );
  if (recent.length >= MAX_UPLOAD_REQUESTS_PER_WINDOW) {
    uploadRequestsByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  uploadRequestsByIp.set(ip, recent);
  return true;
}

router.get("/bingo/teams", async (_req, res): Promise<void> => {
  res.json(ListBingoTeamsResponse.parse(await getBingoTeams()));
});

router.get("/bingo/teams/:teamNumber", async (req, res): Promise<void> => {
  const params = GetBingoTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const team = await getBingoTeam(params.data.teamNumber);
  if (!team) {
    res.status(404).json({ error: "조를 찾을 수 없습니다." });
    return;
  }
  res.json(GetBingoTeamResponse.parse(team));
});

router.post(
  "/bingo/uploads/request-url",
  async (req, res): Promise<void> => {
    const parsed = RequestBingoPhotoUploadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!allowUploadRequest(ip, now)) {
      res.status(429).json({
        error: "잠시 후 다시 사진을 올려 주세요.",
      });
      return;
    }

    const { teamNumber, missionNumber, originalName, contentType, size } =
      parsed.data;
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      res.status(400).json({
        error: "JPEG, PNG 또는 WebP 사진만 올릴 수 있습니다.",
      });
      return;
    }
    if (size > MAX_PHOTO_SIZE_BYTES) {
      res.status(400).json({ error: "사진은 10MB 이하로 올려 주세요." });
      return;
    }
    if (originalName.trim().length === 0) {
      res.status(400).json({ error: "사진 파일 이름을 확인해 주세요." });
      return;
    }

    const [team] = await db
      .select({ teamNumber: bingoTeamsTable.teamNumber })
      .from(bingoTeamsTable)
      .where(eq(bingoTeamsTable.teamNumber, teamNumber));
    const [mission] = await db
      .select({ missionNumber: bingoMissionsTable.missionNumber })
      .from(bingoMissionsTable)
      .where(eq(bingoMissionsTable.missionNumber, missionNumber));
    if (!team || !mission) {
      res.status(404).json({ error: "조 또는 미션을 찾을 수 없습니다." });
      return;
    }

    const [existingPhoto] = await db
      .select({ id: bingoPhotosTable.id })
      .from(bingoPhotosTable)
      .where(
        and(
          eq(bingoPhotosTable.teamNumber, teamNumber),
          eq(bingoPhotosTable.missionNumber, missionNumber),
        ),
      );
    if (existingPhoto) {
      res.status(409).json({ error: "이미 사진이 등록된 미션입니다." });
      return;
    }

    const config = getCloudinaryConfig();
    if (!config) {
      res.status(503).json({
        error: "사진 저장 설정이 아직 완료되지 않았습니다.",
      });
      return;
    }

    const upload = createPhotoUploadSignature(config, teamNumber, missionNumber);
    res.json(RequestBingoPhotoUploadResponse.parse(upload));
  },
);

router.post(
  "/bingo/teams/:teamNumber/missions/:missionNumber/photo",
  async (req, res): Promise<void> => {
    const params = SaveBingoPhotoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = SaveBingoPhotoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { teamNumber, missionNumber } = params.data;
    const { imageUrl, publicId, originalName, contentType, size } = parsed.data;
    const config = getCloudinaryConfig();
    if (!config) {
      res.status(503).json({
        error: "사진 저장 설정이 아직 완료되지 않았습니다.",
      });
      return;
    }
    if (
      !ALLOWED_IMAGE_TYPES.has(contentType) ||
      size < 1 ||
      size > MAX_PHOTO_SIZE_BYTES ||
      originalName.trim().length === 0
    ) {
      res.status(400).json({ error: "사진 정보를 확인해 주세요." });
      return;
    }

    const folder = `forest-bingo/teams/${teamNumber}/missions/${missionNumber}`;
    const normalizedPublicId = publicId.startsWith(`${folder}/`)
      ? publicId.slice(folder.length + 1)
      : publicId;
    if (
      !/^photo-[0-9a-f-]{36}$/i.test(normalizedPublicId) ||
      !isValidCloudinaryPhotoUrl(
        imageUrl,
        config.cloudName,
        folder,
        normalizedPublicId,
      )
    ) {
      res.status(400).json({ error: "업로드된 사진 정보를 확인할 수 없습니다." });
      return;
    }

    const [team] = await db
      .select({ teamNumber: bingoTeamsTable.teamNumber })
      .from(bingoTeamsTable)
      .where(eq(bingoTeamsTable.teamNumber, teamNumber));
    const [mission] = await db
      .select({ missionNumber: bingoMissionsTable.missionNumber })
      .from(bingoMissionsTable)
      .where(eq(bingoMissionsTable.missionNumber, missionNumber));
    if (!team || !mission) {
      res.status(404).json({ error: "조 또는 미션을 찾을 수 없습니다." });
      return;
    }

    const [photo] = await db
      .insert(bingoPhotosTable)
      .values({
        teamNumber,
        missionNumber,
        publicId: `${folder}/${normalizedPublicId}`,
        imageUrl,
        originalName: originalName.slice(0, 255),
        contentType,
        size,
      })
      .onConflictDoNothing()
      .returning();

    if (!photo) {
      res.status(409).json({ error: "이미 사진이 등록된 미션입니다." });
      return;
    }

    const [allTeamPhotos, teamRecord] = await Promise.all([
      db
        .select({ id: bingoPhotosTable.id })
        .from(bingoPhotosTable)
        .where(eq(bingoPhotosTable.teamNumber, teamNumber)),
      db
        .select()
        .from(bingoTeamsTable)
        .where(eq(bingoTeamsTable.teamNumber, teamNumber)),
    ]);
    if (allTeamPhotos.length === 9 && teamRecord[0]?.completedAt === null) {
      await db
        .update(bingoTeamsTable)
        .set({ completedAt: new Date() })
        .where(eq(bingoTeamsTable.teamNumber, teamNumber));
    }

    res
      .status(201)
      .json(
        SaveBingoPhotoResponse.parse({
          imageUrl: photo.imageUrl,
          publicId: photo.publicId,
          originalName: photo.originalName,
          uploadedAt: photo.uploadedAt,
        }),
      );
  },
);

export default router;
