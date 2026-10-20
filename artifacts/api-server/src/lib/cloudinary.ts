import { createHash, randomUUID } from "node:crypto";

export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

export function getCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(cloudName)) return null;
  return { cloudName, apiKey, apiSecret };
}

function signCloudinaryParams(
  params: Record<string, string>,
  apiSecret: string,
): string {
  const canonical = Object.entries(params)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha1")
    .update(`${canonical}${apiSecret}`)
    .digest("hex");
}

export function createPhotoUploadSignature(
  config: CloudinaryConfig,
  teamNumber: number,
  missionNumber: number,
): {
  uploadUrl: string;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
} {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `forest-bingo/teams/${teamNumber}/missions/${missionNumber}`;
  const publicId = `photo-${randomUUID()}`;
  const signature = signCloudinaryParams(
    {
      folder,
      overwrite: "false",
      public_id: publicId,
      timestamp: String(timestamp),
    },
    config.apiSecret,
  );

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    signature,
    folder,
    publicId,
  };
}

export function isValidCloudinaryPhotoUrl(
  imageUrl: string,
  cloudName: string,
  folder: string,
  publicId: string,
): boolean {
  try {
    const url = new URL(imageUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "res.cloudinary.com" ||
      url.search ||
      url.hash
    ) {
      return false;
    }

    const decodedPath = decodeURIComponent(url.pathname);
    const prefix = `/${cloudName}/image/upload/`;
    const expectedSuffix = `/${folder}/${publicId}`;
    if (
      !decodedPath.startsWith(prefix) ||
      ![".jpg", ".jpeg", ".png", ".webp"].some((extension) =>
        decodedPath.endsWith(`${expectedSuffix}${extension}`),
      )
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
