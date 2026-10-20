import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@workspace/db";
import { bingoMissionsTable } from "@workspace/db";
import {
  AdminLoginBody,
  AdminLoginResponse,
  AdminLogoutResponse,
  GetAdminOverviewResponse,
  GetAdminSessionResponse,
  UpdateBingoMissionBody,
  UpdateBingoMissionParams,
  UpdateBingoMissionResponse,
} from "@workspace/api-zod";
import { getBingoMissions, getBingoTeams } from "../lib/bingo";
import {
  clearAdminSession,
  hasAdminSession,
  setAdminSession,
} from "../lib/admin-session";

const router: IRouter = Router();
const loginAttemptsByIp = new Map<string, { count: number; resetsAt: number }>();
const LOGIN_ATTEMPT_LIMIT = 8;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function passwordMatches(candidate: string, expected: string): boolean {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

router.post("/admin/login", async (req, res): Promise<void> => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password || !process.env.SESSION_SECRET) {
    res.status(503).json({ error: "관리자 비밀번호 설정을 확인해 주세요." });
    return;
  }

  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const attempt = loginAttemptsByIp.get(ip);
  if (attempt && now < attempt.resetsAt && attempt.count >= LOGIN_ATTEMPT_LIMIT) {
    res.status(429).json({
      error: "로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.",
    });
    return;
  }
  const nextAttempt =
    !attempt || now >= attempt.resetsAt
      ? { count: 1, resetsAt: now + LOGIN_ATTEMPT_WINDOW_MS }
      : { ...attempt, count: attempt.count + 1 };
  loginAttemptsByIp.set(ip, nextAttempt);

  if (!passwordMatches(parsed.data.password, password)) {
    res.status(401).json({ error: "비밀번호를 확인해 주세요." });
    return;
  }

  loginAttemptsByIp.delete(ip);
  setAdminSession(res, req);
  res.json(AdminLoginResponse.parse({ authenticated: true }));
});

router.post("/admin/logout", (_req, res): void => {
  clearAdminSession(res, _req);
  res.json(AdminLogoutResponse.parse({ authenticated: false }));
});

router.get("/admin/session", (req, res): void => {
  res.json(
    GetAdminSessionResponse.parse({
      authenticated: hasAdminSession(req),
    }),
  );
});

router.get("/admin/overview", async (req, res): Promise<void> => {
  if (!hasAdminSession(req)) {
    res.status(401).json({ error: "관리자 로그인이 필요합니다." });
    return;
  }

  const [teams, missions] = await Promise.all([
    getBingoTeams(),
    getBingoMissions(),
  ]);
  res.json(GetAdminOverviewResponse.parse({ teams, missions }));
});

router.patch(
  "/admin/missions/:missionNumber",
  async (req, res): Promise<void> => {
    if (!hasAdminSession(req)) {
      res.status(401).json({ error: "관리자 로그인이 필요합니다." });
      return;
    }
    const params = UpdateBingoMissionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateBingoMissionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [mission] = await db
      .update(bingoMissionsTable)
      .set({ description: parsed.data.description.trim() })
      .where(eq(bingoMissionsTable.missionNumber, params.data.missionNumber))
      .returning();
    if (!mission) {
      res.status(404).json({ error: "미션을 찾을 수 없습니다." });
      return;
    }
    res.json(UpdateBingoMissionResponse.parse(mission));
  },
);

export default router;
