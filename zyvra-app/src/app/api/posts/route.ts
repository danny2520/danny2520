import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, inputText, payload, uuid } from "@/lib/http";

export async function GET(request: NextRequest) {
  return asRoute(async () => {
    const user = await requiredUser();
    const requested = new URL(request.url).searchParams.get("scope");
    const scope = requested === "following" || requested === "saved" || requested === "clips" ? requested : "all";
    const posts = await sql(
      "SELECT p.id, p.author_id, p.body, p.created_at, u.handle, u.display_name, " +
      "(SELECT count(*)::int FROM zyvra_likes l WHERE l.post_id = p.id) AS like_count, " +
      "(SELECT count(*)::int FROM zyvra_comments c WHERE c.post_id = p.id) AS comment_count, " +
      "EXISTS(SELECT 1 FROM zyvra_likes my WHERE my.post_id = p.id AND my.user_id = $1) AS liked, " +
      "EXISTS(SELECT 1 FROM zyvra_bookmarks b WHERE b.post_id = p.id AND b.user_id = $1) AS bookmarked, " +
      "m.url AS media_url, m.kind AS media_kind, m.content_type AS media_type " +
      "FROM zyvra_posts p JOIN zyvra_users u ON u.id = p.author_id " +
      "LEFT JOIN zyvra_media m ON m.id=p.media_id " +
      "WHERE p.moderation_state='visible' AND u.account_state='active' " +
      "AND NOT EXISTS(SELECT 1 FROM zyvra_blocks b WHERE " +
      "(b.blocker_id=$1 AND b.blocked_id=p.author_id) OR (b.blocker_id=p.author_id AND b.blocked_id=$1)) " +
      "AND ($2 = 'all' OR ($2 = 'following' AND (p.author_id=$1 OR EXISTS " +
      "(SELECT 1 FROM zyvra_follows f WHERE f.follower_id=$1 AND f.following_id=p.author_id))) " +
      "OR ($2 = 'saved' AND EXISTS (SELECT 1 FROM zyvra_bookmarks b WHERE b.user_id=$1 AND b.post_id=p.id)) " +
      "OR ($2 = 'clips' AND m.kind='video')) " +
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
    const mediaId = data.mediaId === undefined || data.mediaId === null ? null : uuid(String(data.mediaId));
    const result = mediaId
      ? await sql(
          "INSERT INTO zyvra_posts(author_id,body,media_id) " +
          "SELECT $1,$2,m.id FROM zyvra_media m " +
          "WHERE m.id=$3 AND m.owner_id=$1 AND m.pathname LIKE $4 RETURNING id",
          [user.id,body,mediaId,"zyvra/"+user.id+"/posts/%"]
        )
      : await sql(
          "INSERT INTO zyvra_posts(author_id,body) VALUES($1,$2) RETURNING id",
          [user.id,body]
        );
    if (!result.length) throw new ApiError(403, "Media must be uploaded by you for a post");
    return NextResponse.json({ id: result[0]?.id }, { status: 201 });
  });
}
