import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, payload } from "@/lib/http";
import { IMAGE_TYPES, VIDEO_TYPES, IMAGE_MAX, VIDEO_MAX, validatePath } from "@/lib/media";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return asRoute(async () => {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new ApiError(503, "Media uploads are not configured");
    // Blob sends signed upload-complete callbacks; these are authenticated
    // internally by handleUpload, not by the user's browser session.
    const body = await payload(request) as unknown as HandleUploadBody;
    if (body.type === "blob.generate-client-token") {
      assertSameOrigin(request);
      await requiredUser();
    }
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async pathname => {
        const user = await requiredUser();
        const parsed = validatePath(pathname, user.id);
        const kind = /[.]mp4$|[.]webm$/i.test(pathname) ? "video" : "image";
        if (parsed.destination === "stories" && kind === "video") throw new ApiError(400, "Stories support photos only");
        await transaction(async client => {
          // Serialize grants per account so concurrent requests cannot bypass limits.
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [user.id]);
          const existing = await client.query<{ total: string; videos: string }>(
            "SELECT count(*)::text AS total, count(*) FILTER (WHERE kind='video')::text AS videos " +
            "FROM zyvra_media_grants WHERE owner_id=$1 AND created_at>now()-interval '24 hours'",
            [user.id]
          );
          if (Number(existing.rows[0]?.total ?? 0) >= 12) throw new ApiError(429, "Daily upload limit reached");
          if (kind === "video" && Number(existing.rows[0]?.videos ?? 0) >= 3)
            throw new ApiError(429, "Daily video limit reached");
          await client.query("INSERT INTO zyvra_media_grants(owner_id,kind) VALUES($1,$2)", [user.id,kind]);
        });
        return {
          allowedContentTypes: kind === "video" ? [...VIDEO_TYPES] : [...IMAGE_TYPES],
          maximumSizeInBytes: kind === "video" ? VIDEO_MAX : IMAGE_MAX,
          addRandomSuffix: true
        };
      },
      // The client explicitly finalizes via /api/media/finalize after Blob upload.
      // No account or post data is changed from this optional callback.
      onUploadCompleted: async () => {}
    });
    return NextResponse.json(response);
  });
}
