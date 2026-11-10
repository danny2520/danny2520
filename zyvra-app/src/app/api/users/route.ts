import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { asRoute } from "@/lib/http";
export async function GET(request: NextRequest) {
  return asRoute(async () => {
    const me = await requiredUser();
    const search = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 50);
    if (search.length < 2) return NextResponse.json({ users: [] });
    const users = await sql(
      "SELECT u.id, u.handle, u.display_name, u.bio, " +
      "EXISTS(SELECT 1 FROM zyvra_follows f WHERE f.follower_id=$1 AND f.following_id=u.id) AS following " +
      "FROM zyvra_users u WHERE u.id <> $1 AND (u.handle ILIKE $2 OR u.display_name ILIKE $2) " +
      "ORDER BY u.handle ASC LIMIT 15",
      [me.id, "%" + search.replace(/[%_\\]/g, "\\$&") + "%"]
    );
    return NextResponse.json({ users });
  });
}
