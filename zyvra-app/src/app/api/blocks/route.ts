import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { asRoute } from "@/lib/http";
export async function GET(_request:NextRequest){
 return asRoute(async()=>{
  const me=await requiredUser();
  const users=await sql(
   "SELECT u.id,u.handle,u.display_name,b.created_at FROM zyvra_blocks b " +
   "JOIN zyvra_users u ON u.id=b.blocked_id WHERE b.blocker_id=$1 " +
   "ORDER BY b.created_at DESC LIMIT 100",[me.id]
  );
  return NextResponse.json({users});
 });
}
