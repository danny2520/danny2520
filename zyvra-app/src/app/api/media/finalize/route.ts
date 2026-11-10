import { head } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, inputText, payload } from "@/lib/http";
import { verifyMediaMetadata } from "@/lib/media";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const user = await requiredUser();
    const data = await payload(request);
    const url = inputText(data.url, "Media URL", 20, 2000);
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new ApiError(400, "Invalid media URL"); }
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".blob.vercel-storage.com") ||
        parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
      throw new ApiError(400, "Not a valid Vercel Blob URL");
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new ApiError(503, "Media storage is unavailable");
    const blob = await head(url);
    if (blob.url !== url) throw new ApiError(400, "Media URL mismatch");
    const {kind,destination} = verifyMediaMetadata(blob.pathname,user.id,blob.contentType,blob.size);
    const rows = await sql<{id:string}>(
      "INSERT INTO zyvra_media(owner_id,url,pathname,kind,content_type,size_bytes) " +
      "VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (url) DO UPDATE SET url=EXCLUDED.url " +
      "RETURNING id",
      [user.id, blob.url, blob.pathname, kind, blob.contentType, blob.size]
    );
    return NextResponse.json({id:rows[0].id,kind,destination});
  });
}
