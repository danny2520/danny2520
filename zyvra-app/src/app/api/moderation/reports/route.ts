import { NextRequest,NextResponse } from "next/server";
import { requiredModerator } from "@/lib/auth";
import { sql } from "@/lib/db";
import { asRoute } from "@/lib/http";
export async function GET(request:NextRequest){
 return asRoute(async()=>{
  await requiredModerator();
  const requested=new URL(request.url).searchParams.get("status");
  const status=requested==="resolved"||requested==="dismissed"?requested:"open";
  const reports=await sql(
   "SELECT r.id,r.target_kind,r.target_id,r.reason,r.details,r.status,r.created_at, " +
   "COALESCE(reporter.handle,'deleted') AS reporter_handle, " +
   "CASE WHEN r.target_kind='post' THEN " +
   "(SELECT left(p.body,240) FROM zyvra_posts p WHERE p.id=r.target_id) " +
   "ELSE (SELECT u.handle FROM zyvra_users u WHERE u.id=r.target_id) END AS target_preview " +
   "FROM zyvra_reports r LEFT JOIN zyvra_users reporter ON reporter.id=r.reporter_id " +
   "WHERE r.status=$1 ORDER BY r.created_at ASC LIMIT 100",
   [status]
  );
  return NextResponse.json({reports},{headers:{"Cache-Control":"no-store"}});
 });
}
