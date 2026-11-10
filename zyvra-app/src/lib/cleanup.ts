import { del, list } from "@vercel/blob";
import { sql, transaction } from "./db";

type CleanupResult={queued:number;deleted:number;failed:number;expiredStories:number;prunedMedia:number};
const hasBlob=()=>!!process.env.BLOB_READ_WRITE_TOKEN;

export async function processCleanup(batchSize=10):Promise<{deleted:number;failed:number}>{
 if(!hasBlob())return {deleted:0,failed:0};
 const jobs=await sql<{url:string}>(
  "WITH due AS (SELECT url FROM zyvra_media_cleanup " +
  "WHERE completed_at IS NULL AND next_attempt_at<=now() " +
  "ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED) " +
  "UPDATE zyvra_media_cleanup q SET attempts=q.attempts+1, " +
  "next_attempt_at=now()+interval '10 minutes' FROM due " +
  "WHERE q.url=due.url RETURNING q.url",
  [Math.min(Math.max(batchSize,1),20)]
 );
 let deleted=0,failed=0;
 for(const job of jobs){
  try{
   await del(job.url);
   await sql("UPDATE zyvra_media_cleanup SET completed_at=now(),last_error=NULL WHERE url=$1",[job.url]);
   deleted++;
  }catch(error){
   failed++;
   const message=error instanceof Error?error.name:"StorageError";
   // Only the error class is retained; never persist tokens or the Blob URL's credentials.
   await sql("UPDATE zyvra_media_cleanup SET last_error=$2,next_attempt_at=now()+interval '1 hour' WHERE url=$1",
    [job.url,message.slice(0,160)]);
  }
 }
 return {deleted,failed};
}
async function scanUntracked():Promise<number>{
 if(!hasBlob())return 0;
 // One page per run (100 objects); persist cursor so a large store is
 // progressively scanned, rather than rescanning page 1 indefinitely.
 return transaction(async client=>{
  await client.query("SELECT pg_advisory_xact_lock(10104455)");
  const state=await client.query<{cursor:string|null}>("SELECT cursor FROM zyvra_media_scan_state WHERE singleton=TRUE FOR UPDATE");
  const cursor=state.rows[0]?.cursor??undefined;
  const result=await list({prefix:"zyvra/",limit:100,...(cursor?{cursor}:{})});
  let queued=0;
  for(const blob of result.blobs){
   if(!blob.pathname.startsWith("zyvra/"))continue;
   const when=new Date(blob.uploadedAt).getTime();
   if(!Number.isFinite(when)||Date.now()-when<48*3600*1000)continue;
   const known=await client.query(
    "SELECT 1 FROM zyvra_media WHERE url=$1 UNION ALL " +
    "SELECT 1 FROM zyvra_media_cleanup WHERE url=$1 LIMIT 1",[blob.url]
   );
   if(known.rowCount)continue;
   await client.query("INSERT INTO zyvra_media_cleanup(url) VALUES($1) ON CONFLICT DO NOTHING",[blob.url]);
   queued++;
  }
  await client.query(
   "UPDATE zyvra_media_scan_state SET cursor=$1,updated_at=now() WHERE singleton=TRUE",
   [result.hasMore?result.cursor:null]
  );
  return queued;
 });
}
export async function runMediaMaintenance():Promise<CleanupResult>{
 const expired=await sql<{id:string}>(
  "DELETE FROM zyvra_stories WHERE expires_at<=now() RETURNING id"
 );
 const unused=await sql<{id:string}>(
  "DELETE FROM zyvra_media m WHERE m.created_at<now()-interval '24 hours' " +
  "AND NOT EXISTS(SELECT 1 FROM zyvra_posts p WHERE p.media_id=m.id) " +
  "AND NOT EXISTS(SELECT 1 FROM zyvra_stories s WHERE s.media_id=m.id) RETURNING id"
 );
 const queued=await scanUntracked();
 const result=await processCleanup(20);
 // Keep the queue small without keeping completed public object URLs forever.
 await sql("DELETE FROM zyvra_media_cleanup WHERE completed_at<now()-interval '30 days'");
 return {queued,deleted:result.deleted,failed:result.failed,
  expiredStories:expired.length,prunedMedia:unused.length};
}
