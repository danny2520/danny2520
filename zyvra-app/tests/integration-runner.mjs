import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import pg from "pg";

const here=dirname(fileURLToPath(import.meta.url));
const root=join(here,"..");
const base="http://127.0.0.1:3317";

async function send(path,{method="GET",body,cookie,origin=base}={}){
  const headers={Origin:origin,...(body?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{})};
  const response=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined,redirect:"manual",cache:"no-store"});
  const content=await response.json().catch(()=>({}));
  return {status:response.status,body:content,cookie:(response.headers.get("set-cookie")??"").split(";")[0]};
}

test("three isolated accounts: authentication, posts, following, private saved posts, expiring stories and two-way DMs", {timeout:90000}, async () => {
  assert.ok(process.env.DATABASE_URL?.includes("127.0.0.1"),"Tests MUST use the disposable localhost CI database, never Neon");
  assert.ok(process.env.DATABASE_URL?.endsWith("/zyvra_ci"),"Unsafe database name");
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
  let server=null;
  let output="";
  try{
    for(const file of ["001_initial.sql","002_social_graph_and_stories.sql"]){
      await pool.query(readFileSync(join(root,"db",file),"utf8"));
    }
    // Run the Next.js server directly: launching through npm can orphan a child
    // process and leave the CI runner alive after tests finish.
    server=spawn(process.execPath,[join(root,"node_modules","next","dist","bin","next"),"start","-p","3317"],{
      cwd:root,
      env:{...process.env,PORT:"3317"},
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
      const r=await send("/api/auth/register",{method:"POST",body:{displayName:name,handle,password:"StrongCiPassword01234!"}});
      assert.equal(r.status,201,JSON.stringify(r.body));
      assert.match(r.cookie,/^zyvra_session=/);
      return {user:r.body.user,cookie:r.cookie};
    };
    const alice=await register("Alice Studio","alice_ci");
    const bob=await register("Bob Maker","bob_ci");
    const eve=await register("Eve Viewer","eve_ci");

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
    // Server-side logout invalidates existing bearer cookies immediately.
    assert.equal((await send("/api/auth/logout",{method:"POST",cookie:alice.cookie})).status,200);
    assert.equal((await send("/api/posts",{cookie:alice.cookie})).status,401);
    console.log("PASS: accounts, posting, comments, likes, follows, private bookmarks, 24h stories, 2-way chat and access control");
  } finally {
    if(server?.pid)server.kill("SIGTERM");
    server?.stdout?.destroy();
    server?.stderr?.destroy();
    await pool.end();
  }
});
