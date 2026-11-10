import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql, transaction } from "@/lib/db";
import { ApiError, asRoute, assertSameOrigin, uuid } from "@/lib/http";

type Context={params:Promise<{id:string}>};
export async function POST(request:NextRequest,context:Context){
 return asRoute(async()=>{
  assertSameOrigin(request);
  const me=await requiredUser(),targetId=uuid((await context.params).id);
  if(targetId===me.id)throw new ApiError(400,"You cannot block yourself");
  await transaction(async client=>{
   const target=await client.query("SELECT 1 FROM zyvra_users WHERE id=$1",[targetId]);
   if(!target.rowCount)throw new ApiError(404,"User not found");
   await client.query("INSERT INTO zyvra_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[me.id,targetId]);
   await client.query("DELETE FROM zyvra_follows WHERE (follower_id=$1 AND following_id=$2) OR (follower_id=$2 AND following_id=$1)",[me.id,targetId]);
  });
  return NextResponse.json({blocked:true});
 });
}
export async function DELETE(request:NextRequest,context:Context){
 return asRoute(async()=>{
  assertSameOrigin(request);
  const me=await requiredUser(),targetId=uuid((await context.params).id);
  await sql("DELETE FROM zyvra_blocks WHERE blocker_id=$1 AND blocked_id=$2",[me.id,targetId]);
  return NextResponse.json({blocked:false});
 });
}
