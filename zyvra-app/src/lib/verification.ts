import { createHash, randomBytes } from "node:crypto";
import { sql, transaction } from "./db";
import { ApiError } from "./http";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
function emailProvider() {
  const key = process.env.RESEND_API_KEY;
  const sender = process.env.ZYVRA_FROM_EMAIL;
  const site = process.env.ZYVRA_SITE_URL;
  if (!key || !sender || !site) throw new ApiError(503, "Email verification is not configured yet");
  let origin: URL;
  try { origin = new URL(site); } catch { throw new ApiError(503, "Email verification is unavailable"); }
  if (origin.protocol !== "https:" &&
    !(process.env.CI === "true" && origin.origin === "http://127.0.0.1:3317")) {
    throw new ApiError(503, "Email verification requires a secure site URL");
  }
  return {key,sender,origin};
}
export function requireEmailProvider(): void { emailProvider(); }
export function normalizeEmail(raw: unknown): string {
  if(typeof raw !== "string") throw new ApiError(400,"Email is required");
  const email=raw.trim().toLowerCase();
  if(email.length<5||email.length>254||! /^[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email)){
    throw new ApiError(400,"Enter a valid email address");
  }
  return email;
}
export async function sendVerificationEmail(userId:string,email:string):Promise<void>{
  const provider=emailProvider();
  const counts=await sql<{total:number}>(
    "SELECT count(*)::int AS total FROM zyvra_email_tokens WHERE user_id=$1 AND created_at>now()-interval '1 hour'",
    [userId]
  );
  if((counts[0]?.total??0)>=3)throw new ApiError(429,"Verification email limit reached. Try again later.");
  const token=randomBytes(32).toString("base64url");
  const hashed=tokenHash(token);
  await sql("INSERT INTO zyvra_email_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[hashed,userId]);
  const link=new URL("/verify",provider.origin);
  link.searchParams.set("token",token);
  // CI can use a local capture endpoint; production ALWAYS uses the real provider.
  const endpoint=(process.env.CI==="true"&&process.env.ZYVRA_CI_MAIL_URL) ||
    "https://api.resend.com/emails";
  let response:Response;
  try{
    response=await fetch(endpoint,{
      method:"POST",
      headers:{"Authorization":"Bearer "+provider.key,"Content-Type":"application/json"},
      body:JSON.stringify({
        from:provider.sender,to:[email],subject:"Verify your ZYVRA account",
        html:'<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">' +
          '<h2>Welcome to ZYVRA ✦</h2>' +
          '<p>Confirm your email to start posting, following and messaging.</p>' +
          '<p><a href="'+link.toString()+'">Verify my email</a></p>' +
          '<p>This link expires in 30 minutes. If you did not sign up, you can ignore this email.</p></div>'
      }),signal:AbortSignal.timeout(10000)
    });
  }catch{
    await sql("DELETE FROM zyvra_email_tokens WHERE token_hash=$1",[hashed]);
    throw new ApiError(503,"Verification email couldn't be sent. Please try again.");
  }
  if(!response.ok){
    await sql("DELETE FROM zyvra_email_tokens WHERE token_hash=$1",[hashed]);
    throw new ApiError(503,"Verification email couldn't be sent. Please try again.");
  }
}
export async function redeemVerificationToken(token:string):Promise<void>{
  if(!/^[A-Za-z0-9_-]{40,90}$/.test(token))throw new ApiError(400,"Invalid verification link");
  await transaction(async client=>{
    const tokens=await client.query<{user_id:string}>(
      "DELETE FROM zyvra_email_tokens WHERE token_hash=$1 AND expires_at>now() RETURNING user_id",
      [tokenHash(token)]
    );
    if(!tokens.rowCount)throw new ApiError(400,"Verification link expired or already used");
    await client.query(
      "UPDATE zyvra_users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1",
      [tokens.rows[0].user_id]
    );
    await client.query("DELETE FROM zyvra_email_tokens WHERE user_id=$1",[tokens.rows[0].user_id]);
  });
}
