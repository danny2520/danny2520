import { ApiError } from "./http";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const IMAGE_MAX = 5 * 1024 * 1024;
export const VIDEO_MAX = 25 * 1024 * 1024;
export type MediaKind = "image" | "video";

export function kindFromContentType(type: string): MediaKind {
  if ((IMAGE_TYPES as readonly string[]).includes(type)) return "image";
  if ((VIDEO_TYPES as readonly string[]).includes(type)) return "video";
  throw new ApiError(400, "Unsupported file format");
}
export function mediaLimit(kind: MediaKind): number {
  return kind === "image" ? IMAGE_MAX : VIDEO_MAX;
}
export function validatePath(pathname: string, userId: string) {
  const prefix = "zyvra/" + userId + "/";
  if (!pathname.startsWith(prefix)) throw new ApiError(403, "Upload does not belong to your account");
  const rest = pathname.slice(prefix.length);
  const match = /^(posts|stories)\/[a-zA-Z0-9_-]{5,90}\.(jpg|jpeg|png|webp|mp4|webm)$/.exec(rest);
  if (!match) throw new ApiError(400, "Invalid upload path");
  return { destination: match[1] as "posts" | "stories", extension: match[2] };
}
export function verifyMediaMetadata(pathname: string, userId: string, type: string, size: number) {
  const path = validatePath(pathname, userId);
  const kind = kindFromContentType(type);
  if (path.destination === "stories" && kind === "video") throw new ApiError(400, "Story uploads support images only");
  const compatible = kind === "image"
    ? ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, string>)[path.extension]
    : ({ mp4: "video/mp4", webm: "video/webm" } as Record<string, string>)[path.extension];
  if (type !== compatible || !Number.isFinite(size) || size <= 0 || size > mediaLimit(kind)) {
    throw new ApiError(400, "File type, extension or size is not allowed");
  }
  return { kind, destination: path.destination };
}
