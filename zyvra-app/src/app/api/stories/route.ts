import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, inputText, payload, uuid } from "@/lib/http";

export async function GET() {
  return asRoute(async () => {
    const me=await requiredUser();
    const stories = await sql(
      "SELECT s.id, s.author_id, s.body, s.created_at, s.expires_at, u.handle, u.display_name, " +
      "m.url AS media_url, m.kind AS media_kind " +
      "FROM zyvra_stories s JOIN zyvra_users u ON u.id=s.author_id " +
      "LEFT JOIN zyvra_media m ON m.id=s.media_id " +
      "WHERE s.expires_at>now() AND u.account_state='active' " +
      "AND NOT EXISTS(SELECT 1 FROM zyvra_blocks b WHERE " +
      "(b.blocker_id=$1 AND b.blocked_id=s.author_id) OR (b.blocker_id=s.author_id AND b.blocked_id=$1)) " +
      "ORDER BY s.created_at DESC, s.id DESC LIMIT 60"
      ,[me.id]
    );
    return NextResponse.json({ stories }, { headers: { "Cache-Control": "no-store" } });
  });
}
export async function POST(request: NextRequest) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const me = await requiredUser();
    const data = await payload(request);
    const body = inputText(data.body, "Story", 1, 280);
    const count = await sql<{ total: number }>(
      "SELECT count(*)::int AS total FROM zyvra_stories WHERE author_id=$1 AND created_at > now()-interval '24 hours'",
      [me.id]
    );
    if ((count[0]?.total ?? 0) >= 5) throw new ApiError(429, "You can share up to five stories each day");
    const mediaId = data.mediaId === undefined || data.mediaId === null ? null : uuid(String(data.mediaId));
    const result = mediaId
      ? await sql(
          "INSERT INTO zyvra_stories(author_id,body,media_id) " +
          "SELECT $1,$2,m.id FROM zyvra_media m WHERE m.id=$3 AND m.owner_id=$1 " +
          "AND m.kind='image' AND m.pathname LIKE $4 RETURNING id",
          [me.id,body,mediaId,"zyvra/"+me.id+"/stories/%"]
        )
      : await sql("INSERT INTO zyvra_stories(author_id,body) VALUES($1,$2) RETURNING id", [me.id,body]);
    if (!result.length) throw new ApiError(403, "Story photo must belong to you");
    return NextResponse.json({ id: result[0]?.id }, { status: 201 });
  });
}
