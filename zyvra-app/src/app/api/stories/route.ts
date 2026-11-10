import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, inputText, payload } from "@/lib/http";

export async function GET() {
  return asRoute(async () => {
    await requiredUser();
    const stories = await sql(
      "SELECT s.id, s.author_id, s.body, s.created_at, s.expires_at, u.handle, u.display_name " +
      "FROM zyvra_stories s JOIN zyvra_users u ON u.id=s.author_id " +
      "WHERE s.expires_at>now() ORDER BY s.created_at DESC, s.id DESC LIMIT 60"
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
    const result = await sql("INSERT INTO zyvra_stories(author_id,body) VALUES($1,$2) RETURNING id", [me.id, body]);
    return NextResponse.json({ id: result[0]?.id }, { status: 201 });
  });
}
