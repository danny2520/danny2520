import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import pg from "pg";
import { createServer } from "node:http";

const here=dirname(fileURLToPath(import.meta.url));
const root=join(here,"..");
const base="http://127.0.0.1:3317";

async function send(path,{method="GET",body,cookie,origin=base}={}){
  const headers={Origin:origin,...(body?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{})};
  const response=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined,redirect:"manual",cache:"no-store"});
  const content=await response.json().catch(()=>({}));
  return {status:response.status,body:content,cookie:(response.headers.get("set-cookie")??"").split(";")[0]};
}

test("four isolated accounts: verification, moderation, blocking, privacy, deletion and media cleanup", {timeout:90000}, async () => {
  assert.ok(process.env.DATABASE_URL?.includes("127.0.0.1"),"Tests MUST use the disposable localhost CI database, never Neon");
  assert.ok(process.env.DATABASE_URL?.endsWith("/zyvra_ci"),"Unsafe database name");
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
  let server=null;
  let mailServer=null;
  const delivered=[];
  let output="";
  try{
    for(const file of ["001_initial.sql","002_social_graph_and_stories.sql","003_media.sql","004_trust_safety_cleanup.sql","005_media_orphan_scan.sql"]){
      await pool.query(readFileSync(join(root,"db",file),"utf8"));
    }
    mailServer=createServer((req,res)=>{
      const parts=[];
      req.on("data",chunk=>parts.push(chunk));
      req.on("end",()=>{
        try{delivered.push(JSON.parse(Buffer.concat(parts).toString("utf8")));res.writeHead(200,{"Content-Type":"application/json"});res.end('{"id":"mock-mail"}');}
        catch{res.writeHead(400);res.end();}
      });
    });
    await new Promise(resolve=>mailServer.listen(3318,"127.0.0.1",resolve));
    // Run the Next.js server directly: launching through npm can orphan a child
    // process and leave the CI runner alive after tests finish.
    server=spawn(process.execPath,[join(root,"node_modules","next","dist","bin","next"),"start","-p","3317"],{
      cwd:root,
      env:{...process.env,PORT:"3317",CI:"true",RESEND_API_KEY:"ci-mock-only",
        ZYVRA_FROM_EMAIL:"no-reply@zyvra.test",ZYVRA_SITE_URL:base,
        ZYVRA_CI_MAIL_URL:"http://127.0.0.1:3318/mail",
        ZYVRA_MODERATOR_EMAILS:"mod_ci@zyvra.test"},
      stdio:["ignore","pipe","pipe"]
    });
    server.stdout.on("data",d=>output=(output+String(d)).slice(-6000));
    server.stderr.on("data",d=>output=(output+String(d)).slice(-6000));
    let ready=false;
    for(let attempt=0;attempt<90;attempt++){
      if(server.exitCode!==null)throw new Error("Next server exited prematurely: "+output.slice(-3000));
      try{
        const check=await send("/api/health");
        if(check.status===200 && check.body?.database==="connected"){ready=true;break;}
      }catch{}
      await new Promise(resolve=>setTimeout(resolve,350));
    }
    assert.ok(ready,"Next server not ready; "+output.slice(-3000));

    // Signing up is state-changing and requires the correct origin.
    const foreign=await send("/api/auth/register",{method:"POST",origin:"https://malicious.test",body:{displayName:"Fake",handle:"ci_fake",password:"ci_password_good_12345"}});
    assert.equal(foreign.status,403);
    const unauth=await send("/api/posts");
    assert.equal(unauth.status,401);

    const register=async(name,handle)=>{
      const email=handle+"@zyvra.test";
      const r=await send("/api/auth/register",{method:"POST",body:{
        displayName:name,handle,email,password:"StrongCiPassword01234!"
      }});
      assert.equal(r.status,201,JSON.stringify(r.body));
      assert.equal(r.body.user.verified,false);
      assert.match(r.cookie,/^zyvra_session=/);
      assert.equal((await send("/api/posts",{cookie:r.cookie})).status,403,"Unverified accounts must be gated");
      const html=delivered.at(-1)?.html;
      const token=html?.match(/\/verify\?token=([A-Za-z0-9_-]+)/)?.[1];
      assert.ok(token,"Verification message did not contain a token");
      const verify=await send("/api/auth/verify",{method:"POST",body:{token}});
      assert.equal(verify.status,200,JSON.stringify(verify.body));
      assert.equal((await send("/api/me",{cookie:r.cookie})).body.user.verified,true);
      assert.equal((await send("/api/auth/verify",{method:"POST",body:{token}})).status,400,"Tokens are single use");
      return {user:r.body.user,cookie:r.cookie,email};
    };
    const alice=await register("Alice Studio","alice_ci");
    const bob=await register("Bob Maker","bob_ci");
    const eve=await register("Eve Viewer","eve_ci");
    const mod=await register("Safety Moderator","mod_ci");

    // Post by Alice; Bob can see it but cannot impersonate Alice.
    const posted=await send("/api/posts",{method:"POST",cookie:alice.cookie,body:{body:"Hello from Alice!"}});
    assert.equal(posted.status,201,JSON.stringify(posted.body));
    const postId=posted.body.id;
    const feedBob=await send("/api/posts",{cookie:bob.cookie});
    assert.equal(feedBob.status,200);
    assert.equal(feedBob.body.posts[0].author_id,alice.user.id);
    assert.equal(feedBob.body.posts[0].bookmarked,false);
    const heart=await send("/api/posts/"+postId+"/like",{method:"POST",cookie:bob.cookie});
    assert.equal(heart.status,200);
    const comment=await send("/api/posts/"+postId+"/comments",{method:"POST",cookie:bob.cookie,body:{body:"Nice work!"}});
    assert.equal(comment.status,201);
    const replies=await send("/api/posts/"+postId+"/comments",{cookie:alice.cookie});
    assert.equal(replies.body.comments[0].handle,"bob_ci");

    // Follow controls what appears on the Following feed.
    const before=await send("/api/posts?scope=following",{cookie:bob.cookie});
    assert.equal(before.body.posts.length,0);
    const followed=await send("/api/users/"+alice.user.id+"/follow",{method:"POST",cookie:bob.cookie});
    assert.equal(followed.status,200);
    const following=await send("/api/posts?scope=following",{cookie:bob.cookie});
    assert.equal(following.body.posts[0].id,postId);
    const userSearch=await send("/api/users?q=alice",{cookie:bob.cookie});
    assert.equal(userSearch.body.users[0].following,true);
    assert.equal((await send("/api/users/"+bob.user.id+"/follow",{method:"POST",cookie:bob.cookie})).status,400);

    // Bookmarks must remain personal.
    assert.equal((await send("/api/posts/"+postId+"/bookmark",{method:"POST",cookie:bob.cookie})).status,200);
    assert.equal((await send("/api/posts?scope=saved",{cookie:bob.cookie})).body.posts[0].id,postId);
    assert.equal((await send("/api/posts?scope=saved",{cookie:alice.cookie})).body.posts.length,0);
    assert.equal((await send("/api/posts/"+postId+"/bookmark",{method:"DELETE",cookie:bob.cookie})).status,200);
    assert.equal((await send("/api/posts?scope=saved",{cookie:bob.cookie})).body.posts.length,0);

    // An expiring text story is public to authenticated members, deletion owner-only.
    const created=await send("/api/stories",{method:"POST",cookie:alice.cookie,body:{body:"Coffee and creative ideas today ☕"}});
    assert.equal(created.status,201,JSON.stringify(created.body));
    const storyId=created.body.id;
    assert.equal((await send("/api/stories",{cookie:bob.cookie})).body.stories[0].id,storyId);
    assert.equal((await send("/api/stories/"+storyId,{method:"DELETE",cookie:bob.cookie})).status,404);
    assert.equal((await send("/api/stories",{cookie:bob.cookie})).body.stories[0].id,storyId);
    await pool.query("UPDATE zyvra_stories SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1",[storyId]);
    assert.equal((await send("/api/stories",{cookie:bob.cookie})).body.stories.length,0);

    // Media attachment tests use metadata fixtures in disposable PostgreSQL.
    // The actual Vercel Blob binary upload will be tested manually on preview.
    const photo=await pool.query(
      "INSERT INTO zyvra_media(owner_id,url,pathname,kind,content_type,size_bytes) VALUES($1,$2,$3,'image','image/jpeg',10240) RETURNING id",
      [alice.user.id,"https://example.invalid/alice-photo.jpg","zyvra/"+alice.user.id+"/posts/photo-001.jpg"]
    );
    const photoId=photo.rows[0].id;
    assert.equal((await send("/api/posts",{method:"POST",cookie:bob.cookie,body:{body:"stolen photo",mediaId:photoId}})).status,403);
    const photoPost=await send("/api/posts",{method:"POST",cookie:alice.cookie,body:{body:"Here's my picture",mediaId:photoId}});
    assert.equal(photoPost.status,201,JSON.stringify(photoPost.body));
    const gallery=await send("/api/posts",{cookie:bob.cookie});
    assert.equal(gallery.body.posts.find(p=>p.id===photoPost.body.id).media_kind,"image");
    assert.equal(gallery.body.posts.find(p=>p.id===photoPost.body.id).media_url,"https://example.invalid/alice-photo.jpg");
    // Even direct database writes cannot attach Alice's media to Bob's post.
    const unused=await pool.query(
      "INSERT INTO zyvra_media(owner_id,url,pathname,kind,content_type,size_bytes) VALUES($1,$2,$3,'image','image/jpeg',12000) RETURNING id",
      [alice.user.id,"https://example.invalid/second-photo.jpg","zyvra/"+alice.user.id+"/posts/second-001.jpg"]
    );
    await assert.rejects(
      pool.query("INSERT INTO zyvra_posts(author_id,body,media_id) VALUES($1,'cross-owner',$2)",[bob.user.id,unused.rows[0].id]),
      error=>error.code==="23503"
    );
    const video=await pool.query(
      "INSERT INTO zyvra_media(owner_id,url,pathname,kind,content_type,size_bytes) VALUES($1,$2,$3,'video','video/mp4',20480) RETURNING id",
      [alice.user.id,"https://example.invalid/alice-video.mp4","zyvra/"+alice.user.id+"/posts/video-001.mp4"]
    );
    const clipPost=await send("/api/posts",{method:"POST",cookie:alice.cookie,body:{body:"Making something new",mediaId:video.rows[0].id}});
    assert.equal(clipPost.status,201,JSON.stringify(clipPost.body));
    const clips=await send("/api/posts?scope=clips",{cookie:bob.cookie});
    assert.equal(clips.status,200);
    assert.equal(clips.body.posts.length,1);
    assert.equal(clips.body.posts[0].media_kind,"video");
    assert.equal(clips.body.posts[0].id,clipPost.body.id);
    const storyPhoto=await pool.query(
      "INSERT INTO zyvra_media(owner_id,url,pathname,kind,content_type,size_bytes) VALUES($1,$2,$3,'image','image/png',12500) RETURNING id",
      [alice.user.id,"https://example.invalid/alice-story.png","zyvra/"+alice.user.id+"/stories/story-001.png"]
    );
    assert.equal((await send("/api/stories",{method:"POST",cookie:bob.cookie,body:{body:"wrong owner",mediaId:storyPhoto.rows[0].id}})).status,403);
    const storyWithPhoto=await send("/api/stories",{method:"POST",cookie:alice.cookie,body:{body:"My weekend!",mediaId:storyPhoto.rows[0].id}});
    assert.equal(storyWithPhoto.status,201,JSON.stringify(storyWithPhoto.body));
    const storyFeed=await send("/api/stories",{cookie:bob.cookie});
    assert.equal(storyFeed.body.stories[0].media_url,"https://example.invalid/alice-story.png");
    assert.equal(storyFeed.body.stories[0].media_kind,"image");

    // Bob opens a private thread, Alice replies, Eve cannot read or send.
    const opened=await send("/api/conversations",{method:"POST",cookie:bob.cookie,body:{recipientId:alice.user.id}});
    assert.equal(opened.status,201,JSON.stringify(opened.body));
    const threadId=opened.body.id;
    const said=await send("/api/conversations/"+threadId+"/messages",{method:"POST",cookie:bob.cookie,body:{body:"Hey Alice, how's ZYVRA?"}});
    assert.equal(said.status,201,JSON.stringify(said.body));
    const aliceRead=await send("/api/conversations/"+threadId+"/messages",{cookie:alice.cookie});
    assert.equal(aliceRead.body.messages.length,1);
    assert.equal(aliceRead.body.messages[0].sender_id,bob.user.id);
    assert.equal((await send("/api/conversations/"+threadId+"/messages",{method:"POST",cookie:alice.cookie,body:{body:"It's going great!"}})).status,201);
    const bobRead=await send("/api/conversations/"+threadId+"/messages",{cookie:bob.cookie});
    assert.equal(bobRead.body.messages.length,2);
    assert.equal(bobRead.body.messages[1].sender_id,alice.user.id);
    assert.equal((await send("/api/conversations/"+threadId+"/messages",{cookie:eve.cookie})).status,404);
    assert.equal((await send("/api/conversations/"+threadId+"/messages",{method:"POST",cookie:eve.cookie,body:{body:"I should not get in!"}})).status,404);
    assert.equal((await send("/api/conversations/"+threadId+"/messages")).status,401);
    // Blocking is enforced for search, feed and existing conversations.
    assert.equal((await send("/api/users/"+alice.user.id+"/block",{method:"POST",cookie:bob.cookie})).status,200);
    assert.equal((await send("/api/users?q=alice",{cookie:bob.cookie})).body.users.length,0);
    assert.equal((await send("/api/conversations/"+threadId+"/messages",{cookie:bob.cookie})).status,404);
    assert.equal((await send("/api/conversations/"+threadId+"/messages",{method:"POST",cookie:bob.cookie,body:{body:"should be blocked"}})).status,404);
    assert.equal((await send("/api/users/"+alice.user.id+"/block",{method:"DELETE",cookie:bob.cookie})).status,200);
    assert.equal((await send("/api/conversations/"+threadId+"/messages",{cookie:bob.cookie})).status,200);

    // Reports must be visible only to verified moderators; reviews are audited.
    const flagged=await send("/api/posts",{method:"POST",cookie:bob.cookie,body:{body:"Post for moderation test"}});
    assert.equal(flagged.status,201,JSON.stringify(flagged.body));
    const reported=await send("/api/reports",{method:"POST",cookie:alice.cookie,
      body:{targetKind:"post",targetId:flagged.body.id,reason:"spam",details:"Example spam"}});
    assert.equal(reported.status,201,JSON.stringify(reported.body));
    assert.equal((await send("/api/moderation/reports",{cookie:bob.cookie})).status,403);
    const queue=await send("/api/moderation/reports",{cookie:mod.cookie});
    assert.equal(queue.status,200,JSON.stringify(queue.body));
    const item=queue.body.reports.find(r=>r.target_id===flagged.body.id);
    assert.ok(item,"Missing reported post");
    const hide=await send("/api/moderation/reports/"+item.id,{
      method:"POST",cookie:mod.cookie,body:{action:"hide_post",reason:"Spam confirmed"}});
    assert.equal(hide.status,200,JSON.stringify(hide.body));
    assert.ok(!(await send("/api/posts",{cookie:alice.cookie})).body.posts.some(p=>p.id===flagged.body.id));
    assert.equal((await send("/api/posts/"+flagged.body.id+"/comments",{cookie:alice.cookie})).status,404);
    const audits=await pool.query("SELECT action FROM zyvra_moderation_log WHERE target_id=$1",[flagged.body.id]);
    assert.equal(audits.rows[0].action,"hide_post");

    // Moderator can suspend a reported user; their existing session is revoked.
    const userReport=await send("/api/reports",{method:"POST",cookie:bob.cookie,
      body:{targetKind:"user",targetId:eve.user.id,reason:"harassment"}});
    assert.equal(userReport.status,201);
    const open=await send("/api/moderation/reports",{cookie:mod.cookie});
    const userItem=open.body.reports.find(r=>r.target_id===eve.user.id);
    assert.ok(userItem);
    assert.equal((await send("/api/moderation/reports/"+userItem.id,{
      method:"POST",cookie:mod.cookie,body:{action:"suspend_user",reason:"Confirmed abuse"}
    })).status,200);
    assert.equal((await send("/api/posts",{cookie:eve.cookie})).status,401);
    const limited=await send("/api/auth/login",{method:"POST",body:{handle:"eve_ci",password:"StrongCiPassword01234!"}});
    assert.equal(limited.status,200,"Suspended members may access account settings only");
    assert.equal((await send("/api/posts",{cookie:limited.cookie})).status,403);
    assert.equal((await send("/api/account/delete",{method:"POST",cookie:limited.cookie,
      body:{password:"StrongCiPassword01234!",confirm:"DELETE"}})).status,200);

    // Account deletion erases profile & attached media metadata, and retains
    // only the Blob cleanup outbox. The actual Blob deletion is a separate step.
    const deletion=await send("/api/account/delete",{method:"POST",cookie:alice.cookie,
      body:{password:"StrongCiPassword01234!",confirm:"DELETE"}});
    assert.equal(deletion.status,200,JSON.stringify(deletion.body));
    assert.equal((await send("/api/posts",{cookie:alice.cookie})).status,401);
    const aliceExists=await pool.query("SELECT id FROM zyvra_users WHERE id=$1",[alice.user.id]);
    assert.equal(aliceExists.rows.length,0);
    const mediaJob=await pool.query("SELECT url FROM zyvra_media_cleanup WHERE url=$1",["https://example.invalid/alice-photo.jpg"]);
    assert.equal(mediaJob.rows.length,1,"Cascaded account deletion must queue media cleanup");
    assert.equal((await send("/api/maintenance/cleanup")).status,503,"Cron must fail closed when unconfigured");
    console.log("PASS: email verification, account flows, media ownership, reports, moderator actions, blocking, account erasure and Blob outbox");
  } finally {
    if(server?.pid)server.kill("SIGTERM");
    server?.stdout?.destroy();
    server?.stderr?.destroy();
    if(mailServer) await new Promise(resolve=>mailServer.close(resolve));
    await pool.end();
  }
});
