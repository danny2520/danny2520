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
    const deleted=await sql("DELETE FROM zyvra_stories WHERE id=$1 AND author_id=$2 RETURNING id",[storyId,me.id]);
    if (!deleted.length) return NextResponse.json({error:"Story not found"},{status:404});
    return NextResponse.json({deleted:true});
  });
}
