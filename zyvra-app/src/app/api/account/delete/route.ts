import { compare } from "bcryptjs";
import { NextRequest,NextResponse } from "next/server";
import { requiredSignedInUser,endSession,checkAuthRateLimit } from "@/lib/auth";
import { sql,transaction } from "@/lib/db";
import { processCleanup } from "@/lib/cleanup";
import { ApiError,asRoute,assertSameOrigin,inputText,payload } from "@/lib/http";

export async function POST(request:NextRequest){
 return asRoute(async()=>{
  assertSameOrigin(request);
  const me=await requiredSignedInUser(),data=await payload(request);
  const confirm=inputText(data.confirm,"Confirmation",6,6);
  if(confirm!=="DELETE")throw new ApiError(400,"Type DELETE to confirm");
  const password=inputText(data.password,"Current password",1,72);
  await checkAuthRateLimit(request,"delete");
  const rows=await sql<{password_hash:string}>(
   "SELECT password_hash FROM zyvra_users WHERE id=$1",[me.id]
  );
  if(!rows.length||!(await compare(password,rows[0].password_hash)))
   throw new ApiError(401,"Incorrect password");
  await transaction(async client=>{
   // Erase direct-message conversations involving this account. The other
   // participant will no longer have access to those messages either.
   await client.query("DELETE FROM zyvra_conversations WHERE id IN " +
    "(SELECT conversation_id FROM zyvra_conversation_members WHERE user_id=$1)",[me.id]);
   // Delete media via cascading FK; database trigger adds Blob cleanup jobs.
   await client.query("DELETE FROM zyvra_users WHERE id=$1",[me.id]);
  });
  const response=NextResponse.json({deleted:true,mediaCleanupQueued:true});
  await endSession(response);
  // Best-effort immediate Blob deletion; pending jobs are retried by maintenance.
  try{await processCleanup(8);}catch{console.error("ZYVRA cleanup queued for retry");}
  return response;
 });
}
