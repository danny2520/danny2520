import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql, transaction } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, payload, uuid } from "@/lib/http";

export async function GET() {
  return asRoute(async () => {
    const me = await requiredUser();
    const conversations = await sql(
      "SELECT c.id, peer.id AS peer_id, peer.handle, peer.display_name, " +
      "(SELECT m.body FROM zyvra_messages m WHERE m.conversation_id = c.id " +
      "ORDER BY m.created_at DESC LIMIT 1) AS last_message, " +
      "(SELECT max(m.created_at) FROM zyvra_messages m WHERE m.conversation_id = c.id) AS last_at " +
      "FROM zyvra_conversation_members mine " +
      "JOIN zyvra_conversations c ON c.id = mine.conversation_id " +
      "JOIN zyvra_conversation_members them ON them.conversation_id = c.id AND them.user_id <> $1 " +
      "JOIN zyvra_users peer ON peer.id = them.user_id " +
      "WHERE mine.user_id = $1 ORDER BY last_at DESC NULLS LAST, c.created_at DESC LIMIT 100",
      [me.id]
    );
    return NextResponse.json({ conversations });
  });
}
export async function POST(request: NextRequest) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const me = await requiredUser();
    const data = await payload(request);
    const recipientId = uuid(String(data.recipientId ?? ""));
    if (recipientId === me.id) throw new ApiError(400, "You cannot message yourself");
    const key = [me.id, recipientId].sort().join(":");
    const id = await transaction(async client => {
      const target = await client.query("SELECT id FROM zyvra_users WHERE id = $1", [recipientId]);
      if (!target.rowCount) throw new ApiError(404, "User not found");
      const inserted = await client.query<{ id: string }>(
        "INSERT INTO zyvra_conversations (direct_key) VALUES ($1) " +
        "ON CONFLICT (direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key RETURNING id",
        [key]
      );
      const conversationId = inserted.rows[0].id;
      await client.query(
        "INSERT INTO zyvra_conversation_members (conversation_id, user_id) " +
        "VALUES ($1,$2), ($1,$3) ON CONFLICT DO NOTHING",
        [conversationId, me.id, recipientId]
      );
      return conversationId;
    });
    return NextResponse.json({ id }, { status: 201 });
  });
}
