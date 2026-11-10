import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { asRoute, assertSameOrigin, uuid } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, context: Context) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const user = await requiredUser();
    const postId = uuid((await context.params).id);
    const found = await sql("SELECT id FROM zyvra_posts WHERE id = $1 LIMIT 1", [postId]);
    if (!found.length) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    await sql("INSERT INTO zyvra_likes(user_id, post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [user.id, postId]);
    return NextResponse.json({ liked: true });
  });
}
export async function DELETE(request: NextRequest, context: Context) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const user = await requiredUser();
    const postId = uuid((await context.params).id);
    await sql("DELETE FROM zyvra_likes WHERE user_id = $1 AND post_id = $2", [user.id, postId]);
    return NextResponse.json({ liked: false });
  });
}
