import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { beginSession, checkAuthRateLimit, type User } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, inputText, payload } from "@/lib/http";
import { normalizeEmail, requireEmailProvider, sendVerificationEmail } from "@/lib/verification";

export async function POST(request: NextRequest) {
  return asRoute(async () => {
    assertSameOrigin(request);
    requireEmailProvider(); // Fail closed if real email delivery is not configured.
    const data=await payload(request);
    const displayName=inputText(data.displayName,"Display name",2,80);
    const handle=inputText(data.handle,"Username",3,24).toLowerCase();
    const email=normalizeEmail(data.email);
    const password=inputText(data.password,"Password",12,72);
    if(!/^[a-z0-9_]{3,24}$/.test(handle))throw new ApiError(400,"Username may contain lowercase letters, numbers and underscores");
    await checkAuthRateLimit(request,"register");
    const passwordHash=await hash(password,12);
    const users=await sql<Omit<User,"moderator">>(
      "INSERT INTO zyvra_users(handle,display_name,email,password_hash) VALUES($1,$2,$3,$4) " +
      "RETURNING id,handle,display_name,bio,email,created_at,account_state,(email_verified_at IS NOT NULL) AS verified",
      [handle,displayName,email,passwordHash]
    );
    const user={...users[0],moderator:false};
    // If delivery fails, the user can sign in with their password and resend.
    // The account stays unverified and cannot access social APIs.
    let mailed=true;
    try{ await sendVerificationEmail(user.id,email); }catch{mailed=false;}
    const response=NextResponse.json({user,verificationEmailSent:mailed},{status:201});
    await beginSession(response,user.id);
    return response;
  });
}
