import { NextRequest,NextResponse } from "next/server";
import { requiredModerator,isModeratorEmail } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { ApiError,asRoute,assertSameOrigin,inputText,payload,uuid } from "@/lib/http";

type Context={params:Promise<{id:string}>};
export async function POST(request:NextRequest,context:Context){
 return asRoute(async()=>{
  assertSameOrigin(request);
  const moderator=await requiredModerator(),id=uuid((await context.params).id);
  const data=await payload(request);
  const action=inputText(data.action,"Action",3,20);
  if(!["dismiss","hide_post","suspend_user"].includes(action))throw new ApiError(400,"Invalid moderation action");
  const reason=inputText(data.reason??"Moderation review","Reason",3,500);
  await transaction(async client=>{
   const found=await client.query<{id:string;target_kind:string;target_id:string}>(
    "SELECT id,target_kind,target_id FROM zyvra_reports WHERE id=$1 AND status='open' FOR UPDATE",[id]
   );
   const report=found.rows[0];
   if(!report)throw new ApiError(404,"Open report not found");
   if(action==="hide_post"){
    if(report.target_kind!=="post")throw new ApiError(400,"A post report is required");
    const p=await client.query<{author_id:string;media_id:string|null}>(
     "SELECT author_id,media_id FROM zyvra_posts WHERE id=$1 FOR UPDATE",[report.target_id]
    );
    if(!p.rowCount)throw new ApiError(404,"Post no longer exists");
    await client.query("UPDATE zyvra_posts SET moderation_state='hidden',media_id=NULL WHERE id=$1",[report.target_id]);
    if(p.rows[0].media_id)await client.query("DELETE FROM zyvra_media WHERE id=$1",[p.rows[0].media_id]);
   }
   if(action==="suspend_user"){
    if(report.target_kind!=="user")throw new ApiError(400,"A user report is required");
    if(report.target_id===moderator.id)throw new ApiError(403,"You cannot suspend yourself");
    const u=await client.query<{email:string|null;verified:boolean}>(
     "SELECT email,(email_verified_at IS NOT NULL) AS verified FROM zyvra_users WHERE id=$1 FOR UPDATE",[report.target_id]
    );
    if(!u.rowCount)throw new ApiError(404,"User no longer exists");
    if(isModeratorEmail(u.rows[0].email,u.rows[0].verified))throw new ApiError(403,"Another moderator cannot be suspended here");
    await client.query("UPDATE zyvra_users SET account_state='suspended' WHERE id=$1",[report.target_id]);
    await client.query("DELETE FROM zyvra_sessions WHERE user_id=$1",[report.target_id]);
   }
   await client.query("UPDATE zyvra_reports SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1",
    [id,action==="dismiss"?"dismissed":"resolved",moderator.id]);
   await client.query(
    "INSERT INTO zyvra_moderation_log(moderator_id,action,target_kind,target_id,reason) VALUES($1,$2,$3,$4,$5)",
    [moderator.id,action,report.target_kind,report.target_id,reason]
   );
  });
  return NextResponse.json({reviewed:true,action});
 });
}
