import { NextRequest, NextResponse } from "next/server";
import { requiredSignedInUser } from "@/lib/auth";
import { asRoute, assertSameOrigin } from "@/lib/http";
import { sendVerificationEmail } from "@/lib/verification";
export async function POST(request:NextRequest){
  return asRoute(async()=>{
    assertSameOrigin(request);
    const user=await requiredSignedInUser();
    if(user.verified)return NextResponse.json({alreadyVerified:true});
    if(!user.email)return NextResponse.json({error:"Email missing. Contact support."},{status:409});
    await sendVerificationEmail(user.id,user.email);
    return NextResponse.json({sent:true});
  });
}
