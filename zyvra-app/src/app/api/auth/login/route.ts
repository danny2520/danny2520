import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { beginSession, checkAuthRateLimit, type User, isModeratorEmail } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, inputText, payload } from "@/lib/http";

type LoginRow=Omit<User,"moderator">&{password_hash:string};
export async function POST(request:NextRequest){
 return asRoute(async()=>{
  assertSameOrigin(request);
  const data=await payload(request);
  const handle=inputText(data.handle,"Username",3,24).toLowerCase();
  const password=inputText(data.password,"Password",1,72);
  await checkAuthRateLimit(request,"login");
  const users=await sql<LoginRow>(
   "SELECT id,handle,display_name,bio,email,created_at,account_state, " +
   "(email_verified_at IS NOT NULL) AS verified,password_hash " +
   "FROM zyvra_users WHERE handle=$1 LIMIT 1",[handle]
  );
  const fallback="$2a$12$C6UzMDM.H6dfI/f/IKcEeOABY3N9snVb2oLaAVJpYM5GLiTddPu2G";
  const valid=await compare(password,users[0]?.password_hash??fallback);
  if(!users[0]||!valid)throw new ApiError(401,"Incorrect username or password");
  if(users[0].account_state!=="active")throw new ApiError(403,"This account is suspended");
  const {password_hash:_ignored,...raw}=users[0];
  const user:User={...raw,moderator:isModeratorEmail(raw.email,raw.verified)};
  const response=NextResponse.json({user});
  await beginSession(response,user.id);
  return response;
 });
}
