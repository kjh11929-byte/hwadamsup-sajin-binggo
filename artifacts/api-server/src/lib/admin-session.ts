import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const COOKIE_NAME = "forest_bingo_admin";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function getSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function getCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) {
      return item.slice(separator + 1).trim();
    }
  }
  return null;
}

export function hasAdminSession(request: Request): boolean {
  const secret = getSecret();
  const token = getCookieValue(request, COOKIE_NAME);
  if (!secret || !token) return false;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const providedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    providedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    return false;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { role?: string; expiresAt?: number };
    return (
      session.role === "admin" &&
      typeof session.expiresAt === "number" &&
      session.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
}

export function setAdminSession(response: Response, request: Request): void {
  const secret = getSecret();
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  const payload = Buffer.from(
    JSON.stringify({
      role: "admin",
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  const secure = request.secure ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${payload}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  );
}

export function clearAdminSession(
  response: Response,
  request: Request,
): void {
  const secure = request.secure ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`,
  );
}

