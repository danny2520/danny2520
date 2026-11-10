import { NextRequest, NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { processCleanup } from "@/lib/cleanup";
import { asRoute, assertSameOrigin, uuid } from "@/lib/http";
type Context={params:Promise<{id:string}>};
export async function DELETE(request:NextRequest,context:Context){
  return asRoute(async()=>{
    assertSameOrigin(request);
    const me=await requiredUser();
    const storyId=uuid((await context.params).id);
    const removed=await transaction(async client=>{
      const found=await client.query<{media_id:string|null}>(
        "DELETE FROM zyvra_stories WHERE id=$1 AND author_id=$2 RETURNING media_id",[storyId,me.id]
      );
      if(!found.rowCount)return false;
      if(found.rows[0].media_id)await client.query("DELETE FROM zyvra_media WHERE id=$1",[found.rows[0].media_id]);
      return true;
    });
    if(!removed)return NextResponse.json({error:"Story not found"},{status:404});
    try{await processCleanup(5);}catch{console.error("ZYVRA media deletion queued");}
    return NextResponse.json({deleted:true,mediaCleanupQueued:true});
  });
}
