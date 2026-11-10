import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, inputText, payload, uuid } from "@/lib/http";

const reasons=["spam","harassment","hate","nudity","violence","other"] as const;
export async function POST(request:NextRequest){
 return asRoute(async()=>{
  assertSameOrigin(request);
  const me=await requiredUser(),data=await payload(request);
  const kind=data.targetKind;
  if(kind!=="post"&&kind!=="user")throw new ApiError(400,"Unsupported report target");
  const targetId=uuid(String(data.targetId??""));
  if(!reasons.includes(data.reason as typeof reasons[number]))throw new ApiError(400,"Choose a reason");
  const reason=String(data.reason);
  const details=data.details===undefined?"":inputText(data.details,"Report details",0,500);
  if(kind==="user"&&me.id===targetId)throw new ApiError(400,"You cannot report yourself");
  const found=kind==="post"
   ?await sql<{author_id:string}>(
    "SELECT p.author_id FROM zyvra_posts p JOIN zyvra_users u ON u.id=p.author_id " +
    "WHERE p.id=$1 AND p.moderation_state='visible' AND u.account_state='active' LIMIT 1",[targetId])
   :await sql<{author_id:string}>(
    "SELECT id AS author_id FROM zyvra_users WHERE id=$1 AND account_state='active' LIMIT 1",[targetId]);
  if(!found.length)throw new ApiError(404,"Reported content unavailable");
  if(found[0].author_id===me.id)throw new ApiError(400,"You cannot report your own content");
  const throttle=await sql<{total:number}>(
    "SELECT count(*)::int AS total FROM zyvra_reports WHERE reporter_id=$1 AND created_at>now()-interval '1 hour'",
    [me.id]
  );
  if((throttle[0]?.total??0)>=10)throw new ApiError(429,"Too many reports. Try again later.");
  const inserted=await sql<{id:string}>(
    "INSERT INTO zyvra_reports(reporter_id,target_kind,target_id,reason,details) " +
    "VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id",
    [me.id,kind,targetId,reason,details]
  );
  return NextResponse.json({submitted:true,alreadyReported:!inserted.length},{status:inserted.length?201:200});
 });
}
