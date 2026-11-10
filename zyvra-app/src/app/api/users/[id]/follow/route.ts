import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, uuid } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const me = await requiredUser();
    const targetId = uuid((await context.params).id);
    if (targetId === me.id) throw new ApiError(400, "You cannot follow yourself");
    const users = await sql("SELECT id FROM zyvra_users WHERE id=$1 LIMIT 1", [targetId]);
    if (!users.length) throw new ApiError(404, "User not found");
    await sql("INSERT INTO zyvra_follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [me.id, targetId]);
    return NextResponse.json({ following: true });
  });
}
export async function DELETE(request: NextRequest, context: Context) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const me = await requiredUser();
    const targetId = uuid((await context.params).id);
    await sql("DELETE FROM zyvra_follows WHERE follower_id=$1 AND following_id=$2", [me.id, targetId]);
    return NextResponse.json({ following: false });
  });
}
