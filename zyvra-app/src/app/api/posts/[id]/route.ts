import { NextRequest,NextResponse } from "next/server";
import { requiredUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { processCleanup } from "@/lib/cleanup";
import { ApiError,asRoute,assertSameOrigin,uuid } from "@/lib/http";

type Context={params:Promise<{id:string}>};
export async function DELETE(request:NextRequest,context:Context){
 return asRoute(async()=>{
  assertSameOrigin(request);
  const me=await requiredUser(),id=uuid((await context.params).id);
  await transaction(async client=>{
   const row=await client.query<{media_id:string|null}>(
    "DELETE FROM zyvra_posts WHERE id=$1 AND author_id=$2 RETURNING media_id",[id,me.id]
   );
   if(!row.rowCount)throw new ApiError(404,"Post not found");
   if(row.rows[0].media_id)await client.query("DELETE FROM zyvra_media WHERE id=$1",[row.rows[0].media_id]);
  });
  try{await processCleanup(5);}catch{console.error("ZYVRA media removal queued");}
  return NextResponse.json({deleted:true,mediaCleanupQueued:true});
 });
}
