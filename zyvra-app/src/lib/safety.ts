import { sql } from "./db";
import { ApiError } from "./http";

export async function isBlocked(userA:string,userB:string):Promise<boolean>{
 const rows=await sql<{blocked:boolean}>(
  "SELECT EXISTS(SELECT 1 FROM zyvra_blocks WHERE " +
  "(blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)) AS blocked",
  [userA,userB]
 );
 return !!rows[0]?.blocked;
}
export async function assertCanContact(fromId:string,toId:string){
 if(fromId===toId)throw new ApiError(400,"You cannot contact yourself");
 const rows=await sql<{id:string}>(
  "SELECT id FROM zyvra_users WHERE id=$1 AND account_state='active' " +
  "AND email_verified_at IS NOT NULL LIMIT 1",[toId]
 );
 if(!rows.length)throw new ApiError(404,"User unavailable");
 if(await isBlocked(fromId,toId))throw new ApiError(403,"You cannot contact this user");
}
export async function assertVisiblePost(postId:string,viewerId:string){
 const rows=await sql<{id:string}>(
  "SELECT p.id FROM zyvra_posts p JOIN zyvra_users author ON author.id=p.author_id " +
  "WHERE p.id=$1 AND p.moderation_state='visible' AND author.account_state='active' " +
  "AND NOT EXISTS(SELECT 1 FROM zyvra_blocks b WHERE " +
  "(b.blocker_id=$2 AND b.blocked_id=p.author_id) OR " +
  "(b.blocker_id=p.author_id AND b.blocked_id=$2)) LIMIT 1",
  [postId,viewerId]
 );
 if(!rows.length)throw new ApiError(404,"Post not found");
}
