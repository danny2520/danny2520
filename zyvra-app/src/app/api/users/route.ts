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
      "SELECT id, handle, display_name, bio FROM zyvra_users " +
      "WHERE id <> $1 AND (handle ILIKE $2 OR display_name ILIKE $2) " +
      "ORDER BY handle ASC LIMIT 15",
      [me.id, "%" + search.replace(/[%_\\]/g, "\\$&") + "%"]
    );
    return NextResponse.json({ users });
  });
}
