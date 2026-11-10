import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { asRoute, assertSameOrigin, inputText, payload, uuid } from "@/lib/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, context: Context) {
  return asRoute(async () => {
    await requiredUser();
    const postId = uuid((await context.params).id);
    const comments = await sql(
      "SELECT c.id, c.body, c.created_at, u.handle, u.display_name FROM zyvra_comments c " +
      "JOIN zyvra_users u ON u.id = c.author_id WHERE c.post_id = $1 ORDER BY c.created_at ASC LIMIT 100",
      [postId]
    );
    return NextResponse.json({ comments });
  });
}
export async function POST(request: NextRequest, context: Context) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const user = await requiredUser();
    const postId = uuid((await context.params).id);
    const data = await payload(request);
    const body = inputText(data.body, "Comment", 1, 300);
    const found = await sql("SELECT id FROM zyvra_posts WHERE id = $1 LIMIT 1", [postId]);
    if (!found.length) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const result = await sql(
      "INSERT INTO zyvra_comments (post_id, author_id, body) VALUES ($1, $2, $3) RETURNING id",
      [postId, user.id, body]
    );
    return NextResponse.json({ id: result[0]?.id }, { status: 201 });
  });
}
