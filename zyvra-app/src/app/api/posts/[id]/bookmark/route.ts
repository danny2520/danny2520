import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { assertVisiblePost } from "@/lib/safety";
import { asRoute, assertSameOrigin, uuid } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, context: Context) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const user = await requiredUser();
    const postId = uuid((await context.params).id);
    await assertVisiblePost(postId,user.id);
    await sql("INSERT INTO zyvra_bookmarks(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [user.id,postId]);
    return NextResponse.json({ bookmarked: true });
  });
}
export async function DELETE(request: NextRequest, context: Context) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const user = await requiredUser();
    const postId = uuid((await context.params).id);
    await sql("DELETE FROM zyvra_bookmarks WHERE user_id=$1 AND post_id=$2", [user.id,postId]);
    return NextResponse.json({ bookmarked: false });
  });
}
