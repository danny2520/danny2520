import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { asRoute, assertSameOrigin, inputText, payload } from "@/lib/http";

export async function GET(request: NextRequest) {
  return asRoute(async () => {
    const user = await requiredUser();
    const requested = new URL(request.url).searchParams.get("scope");
    const scope = requested === "following" || requested === "saved" ? requested : "all";
    const posts = await sql(
      "SELECT p.id, p.author_id, p.body, p.created_at, u.handle, u.display_name, " +
      "(SELECT count(*)::int FROM zyvra_likes l WHERE l.post_id = p.id) AS like_count, " +
      "(SELECT count(*)::int FROM zyvra_comments c WHERE c.post_id = p.id) AS comment_count, " +
      "EXISTS(SELECT 1 FROM zyvra_likes my WHERE my.post_id = p.id AND my.user_id = $1) AS liked, " +
      "EXISTS(SELECT 1 FROM zyvra_bookmarks b WHERE b.post_id = p.id AND b.user_id = $1) AS bookmarked " +
      "FROM zyvra_posts p JOIN zyvra_users u ON u.id = p.author_id " +
      "WHERE ($2 = 'all' OR ($2 = 'following' AND (p.author_id=$1 OR EXISTS " +
      "(SELECT 1 FROM zyvra_follows f WHERE f.follower_id=$1 AND f.following_id=p.author_id))) " +
      "OR ($2 = 'saved' AND EXISTS (SELECT 1 FROM zyvra_bookmarks b WHERE b.user_id=$1 AND b.post_id=p.id))) " +
      "ORDER BY p.created_at DESC, p.id DESC LIMIT 50",
      [user.id, scope]
    );
    return NextResponse.json({ posts });
  });
}
export async function POST(request: NextRequest) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const user = await requiredUser();
    const data = await payload(request);
    const body = inputText(data.body, "Post", 1, 500);
    const result = await sql(
      "INSERT INTO zyvra_posts (author_id, body) VALUES ($1, $2) RETURNING id",
      [user.id, body]
    );
    return NextResponse.json({ id: result[0]?.id }, { status: 201 });
  });
}
