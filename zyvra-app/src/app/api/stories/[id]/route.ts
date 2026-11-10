import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { asRoute, assertSameOrigin, uuid } from "@/lib/http";
type Context={params:Promise<{id:string}>};
export async function DELETE(request:NextRequest,context:Context){
  return asRoute(async()=>{
    assertSameOrigin(request);
    const me=await requiredUser();
    const storyId=uuid((await context.params).id);
    await sql("DELETE FROM zyvra_stories WHERE id=$1 AND author_id=$2",[storyId,me.id]);
    return NextResponse.json({deleted:true});
  });
}
