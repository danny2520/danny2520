"use client";
import { upload } from "@vercel/blob/client";

export type UploadedMedia = { id: string; kind: "image" | "video" };
export async function sendMedia(file: File, userId: string, destination: "posts" | "stories"): Promise<UploadedMedia> {
  const typeToExtension: Record<string,string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "video/mp4": "mp4", "video/webm": "webm"
  };
  const ext = typeToExtension[file.type];
  if (!ext) throw new Error("Use JPEG, PNG, WebP, MP4 or WebM files");
  if (destination === "stories" && file.type.startsWith("video/"))
    throw new Error("Stories currently support photos, not videos");
  const maxSize = file.type.startsWith("video/") ? 25 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size <= 0 || file.size > maxSize) throw new Error("Your file exceeds the upload limit");
  const pathname = "zyvra/" + userId + "/" + destination + "/media-" + crypto.randomUUID() + "." + ext;
  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: "/api/media/upload",
    contentType: file.type
  });
  const res = await fetch("/api/media/finalize", {
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({url:blob.url})
  });
  const json = await res.json() as UploadedMedia & {error?:string};
  if (!res.ok) throw new Error(json.error ?? "Couldn't finish media upload");
  return json;
}
