import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, inputText, payload, uuid } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };
async function authorizedConversation(conversationId: string, userId: string) {
  const rows = await sql(
    "SELECT 1 FROM zyvra_conversation_members mine " +
    "JOIN zyvra_conversation_members peer ON peer.conversation_id=mine.conversation_id AND peer.user_id<>$2 " +
    "JOIN zyvra_users u ON u.id=peer.user_id AND u.account_state='active' " +
    "WHERE mine.conversation_id=$1 AND mine.user_id=$2 " +
    "AND NOT EXISTS(SELECT 1 FROM zyvra_blocks b WHERE " +
    "(b.blocker_id=$2 AND b.blocked_id=peer.user_id) OR " +
    "(b.blocker_id=peer.user_id AND b.blocked_id=$2)) LIMIT 1",
    [conversationId, userId]
  );
  if (!rows.length) throw new ApiError(404, "Conversation not found");
}
export async function GET(_request: NextRequest, context: Context) {
  return asRoute(async () => {
    const user = await requiredUser();
    const id = uuid((await context.params).id);
    await authorizedConversation(id, user.id);
    const messages = await sql(
      "SELECT id, sender_id, body, created_at FROM (" +
      " SELECT id, sender_id, body, created_at FROM zyvra_messages " +
      " WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50" +
      ") recent ORDER BY created_at ASC, id ASC",
      [id]
    );
    return NextResponse.json({ messages });
  });
}
export async function POST(request: NextRequest, context: Context) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const user = await requiredUser();
    const id = uuid((await context.params).id);
    await authorizedConversation(id, user.id);
    const data = await payload(request);
    const body = inputText(data.body, "Message", 1, 2000);
    const messages = await sql(
      "INSERT INTO zyvra_messages (conversation_id, sender_id, body) VALUES ($1, $2, $3) " +
      "RETURNING id, sender_id, body, created_at",
      [id, user.id, body]
    );
    return NextResponse.json({ message: messages[0] }, { status: 201 });
  });
}
