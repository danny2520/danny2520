import { NextRequest,NextResponse } from "next/server";
import { requiredModerator } from "@/lib/auth";
import { runMediaMaintenance } from "@/lib/cleanup";
import { asRoute,assertSameOrigin } from "@/lib/http";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:NextRequest){
 return asRoute(async()=>{
  assertSameOrigin(request);
  await requiredModerator();
  return NextResponse.json(await runMediaMaintenance());
 });
}
