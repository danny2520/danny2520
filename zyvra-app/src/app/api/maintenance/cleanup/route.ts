import { timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { runMediaMaintenance } from "@/lib/cleanup";
import { asRoute } from "@/lib/http";

export const runtime="nodejs";
export const maxDuration=60;
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 return asRoute(async()=>{
  const expected=process.env.CRON_SECRET;
  const provided=request.headers.get("authorization")??"";
  if(!expected||expected.length<32)return NextResponse.json({error:"Maintenance not configured"},{status:503});
  const a=Buffer.from(provided),b=Buffer.from("Bearer "+expected);
  if(a.length!==b.length||!timingSafeEqual(a,b))
    return NextResponse.json({error:"Forbidden"},{status:403});
  return NextResponse.json(await runMediaMaintenance(),{headers:{"Cache-Control":"no-store"}});
 });
}
