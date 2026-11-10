import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { beginSession, checkAuthRateLimit, type User } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, inputText, payload } from "@/lib/http";

type LoginRow = User & { password_hash: string };
export async function POST(request: NextRequest) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const data = await payload(request);
    const handle = inputText(data.handle, "Username", 3, 24).toLowerCase();
    const password = inputText(data.password, "Password", 1, 72);
    await checkAuthRateLimit(request, "login");
    const users = await sql<LoginRow>(
      "SELECT id, handle, display_name, bio, created_at, password_hash FROM zyvra_users WHERE handle = $1 LIMIT 1",
      [handle]
    );
    // A dummy bcrypt hash prevents an immediate timing difference for unknown users.
    const fallback = "$2a$12$C6UzMDM.H6dfI/f/IKcEeOABY3N9snVb2oLaAVJpYM5GLiTddPu2G";
    const valid = await compare(password, users[0]?.password_hash ?? fallback);
    if (!users[0] || !valid) throw new ApiError(401, "Incorrect username or password");
    const { password_hash: _ignored, ...user } = users[0];
    const response = NextResponse.json({ user });
    await beginSession(response, user.id);
    return response;
  });
}
