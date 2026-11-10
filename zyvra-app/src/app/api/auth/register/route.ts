import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { beginSession, checkAuthRateLimit, type User } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, inputText, payload } from "@/lib/http";

export async function POST(request: NextRequest) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const data = await payload(request);
    const displayName = inputText(data.displayName, "Display name", 2, 80);
    const handle = inputText(data.handle, "Username", 3, 24).toLowerCase();
    const password = inputText(data.password, "Password", 12, 72);
    if (!/^[a-z0-9_]{3,24}$/.test(handle)) throw new ApiError(400, "Username may contain lowercase letters, numbers and underscores");
    await checkAuthRateLimit(request, "register");
    const passwordHash = await hash(password, 12);
    const users = await sql<User>(
      "INSERT INTO zyvra_users(handle, display_name, password_hash) VALUES ($1, $2, $3) " +
      "RETURNING id, handle, display_name, bio, created_at",
      [handle, displayName, passwordHash]
    );
    const response = NextResponse.json({ user: users[0] }, { status: 201 });
    await beginSession(response, users[0].id);
    return response;
  });
}
