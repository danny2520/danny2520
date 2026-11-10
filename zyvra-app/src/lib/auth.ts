import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "./db";
import { ApiError } from "./http";

export const COOKIE = "zyvra_session";
const SESSION_DAYS = 30;
export type User = {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  created_at: string;
  email: string | null;
  verified: boolean;
  account_state: "active" | "suspended";
  moderator: boolean;
};
type UserRow = Omit<User,"moderator">;
export function isModeratorEmail(email: string | null, verified: boolean): boolean {
  if (!email || !verified) return false;
  return (process.env.ZYVRA_MODERATOR_EMAILS ?? "").split(",")
    .map(value => value.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function authSecret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32 || value.startsWith("replace-with")) {
    throw new Error("AUTH_SECRET must be set to a unique random string of at least 32 characters");
  }
  return value;
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{40,80}$/.test(token)) return null;
  const rows = await sql<UserRow>(
    "SELECT u.id, u.handle, u.display_name, u.bio, u.created_at, u.email, " +
    "(u.email_verified_at IS NOT NULL) AS verified, u.account_state " +
    "FROM zyvra_sessions s JOIN zyvra_users u ON u.id = s.user_id " +
    "WHERE s.token_hash = $1 AND s.expires_at > now() LIMIT 1",
    [digest(token)]
  );
  const user = rows[0];
  return user ? { ...user, moderator: isModeratorEmail(user.email,user.verified) } : null;
}
export async function requiredSignedInUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Please sign in");
  if (user.account_state !== "active") throw new ApiError(403, "This account is suspended");
  return user;
}
export async function requiredUser(): Promise<User> {
  const user = await requiredSignedInUser();
  if (!user.verified) throw new ApiError(403, "Verify your email address to continue");
  return user;
}
export async function requiredModerator(): Promise<User> {
  const user = await requiredUser();
  if (!user.moderator) throw new ApiError(403, "Moderator access required");
  return user;
}
export async function beginSession(response: NextResponse, userId: string): Promise<void> {
  authSecret();
  const token = randomBytes(32).toString("base64url");
  await sql(
    "INSERT INTO zyvra_sessions(token_hash, user_id, expires_at) " +
    "VALUES ($1, $2, now() + interval '30 days')",
    [digest(token), userId]
  );
  response.cookies.set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: SESSION_DAYS * 86400
  });
}
export async function endSession(response: NextResponse): Promise<void> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) await sql("DELETE FROM zyvra_sessions WHERE token_hash = $1", [digest(token)]);
  response.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}
export async function checkAuthRateLimit(request: NextRequest, action: "register" | "login" | "delete"): Promise<void> {
  const salt = authSecret();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const hashedIp = digest(salt + ":" + ip);
  // Persistent database-backed throttle: functions can scale to multiple instances.
  const limit = action === "register" || action === "delete" ? 5 : 12;
  const rows = await sql<{ total: string }>(
    "SELECT count(*)::text AS total FROM zyvra_auth_attempts " +
    "WHERE ip_hash = $1 AND action = $2 AND created_at > now() - interval '15 minutes'",
    [hashedIp, action]
  );
  if (Number(rows[0]?.total ?? 0) >= limit) throw new ApiError(429, "Too many attempts. Try again later.");
  await sql("INSERT INTO zyvra_auth_attempts(ip_hash, action) VALUES ($1, $2)", [hashedIp, action]);
}
