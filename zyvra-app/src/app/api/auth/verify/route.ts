import { NextRequest, NextResponse } from "next/server";
import { asRoute, assertSameOrigin, inputText, payload } from "@/lib/http";
import { redeemVerificationToken } from "@/lib/verification";
export async function POST(request:NextRequest) {
  return asRoute(async()=>{
    assertSameOrigin(request);
    const data=await payload(request);
    const token=inputText(data.token,"Verification token",40,90);
    await redeemVerificationToken(token);
    return NextResponse.json({verified:true});
  });
}
