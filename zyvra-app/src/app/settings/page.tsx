"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, LockKeyhole, MailCheck, ShieldCheck, ShieldOff, Trash2, UserRound, X } from "lucide-react";
type Current = {id:string;handle:string;email:string|null;verified:boolean;account_state:string};
type Blocked={id:string;handle:string;display_name:string};
export default function Settings(){
 const [me,setMe]=useState<Current|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [blocked,setBlocked]=useState<Blocked[]>([]);
 const [password,setPassword]=useState(""),[confirmation,setConfirmation]=useState("");
 const [deleteOpen,setDeleteOpen]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{
  void fetch("/api/me",{cache:"no-store"}).then(r=>r.json())
   .then(d=>{setMe(d.user);if(d.user?.verified)return fetch("/api/blocks").then(r=>r.json()).then(data=>setBlocked(data.users??[]));})
   .catch(()=>setMessage("Unable to load account settings"))
   .finally(()=>setLoading(false));
 },[]);
 async function resend(){
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/auth/resend",{method:"POST"});
   const data=await r.json();
   if(!r.ok)throw new Error(data.error??"Unable to send email");
   setMessage("Verification email sent. Check your inbox and spam folder.");
  }catch(e){setMessage(e instanceof Error?e.message:"Unable to send email");}
  finally{setBusy(false);}
 }
 async function unblock(id:string){
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/users/"+id+"/block",{method:"DELETE"});
   if(!r.ok)throw new Error("Could not unblock this user");
   setBlocked(old=>old.filter(x=>x.id!==id));setMessage("User unblocked");
  }catch(e){setMessage(e instanceof Error?e.message:"Unable to unblock");}
  finally{setBusy(false);}
 }
 async function deleteAccount(e:FormEvent){
  e.preventDefault();if(busy||confirmation!=="DELETE")return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/account/delete",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({password,confirm:confirmation})
   });
   const data=await r.json();
   if(!r.ok)throw new Error(data.error??"Unable to delete account");
   window.location.assign("/");
  }catch(e){setMessage(e instanceof Error?e.message:"Unable to delete account");setBusy(false);}
 }
 return <main className="trust-shell"><header className="trust-top"><a href="/" aria-label="Back to ZYVRA"><ArrowLeft size={20}/> Back to ZYVRA</a><strong>zyvra<span>.</span></strong></header>
  <div className="trust-title"><span>YOUR SPACE · YOUR CONTROL</span><h1>Account & privacy</h1><p>Control who can contact you, verify your email, or permanently delete your ZYVRA account.</p></div>
  {loading?<p className="trust-muted">Loading account settings...</p>:!me?<div className="trust-card">You need to <a href="/">sign in</a> first.</div>:<>
   <section className="trust-card"><div className="trust-card-title"><UserRound size={21}/><h2>Your account</h2></div><p><strong>@{me.handle}</strong> · {me.email??"No email address"}</p>
    {me.verified?<p className="trust-ok"><ShieldCheck size={18}/> Email verified</p>:<div className="trust-warning"><MailCheck size={20}/><div><strong>Email not verified</strong><p>Verification is required to post, message or follow people.</p><button onClick={()=>void resend()} disabled={busy}>Resend verification link</button></div></div>}
    {me.account_state==="suspended"&&<p className="trust-error">This account is suspended.</p>}
   </section>
   <section className="trust-card"><div className="trust-card-title"><ShieldOff size={21}/><h2>Blocked accounts</h2></div><p>Blocked people cannot find you in search, view your posts, or send you messages.</p>{!me.verified?<p className="trust-muted">Verify your email to manage blocks.</p>:blocked.length===0?<p className="trust-muted">You haven't blocked anyone.</p>:blocked.map(p=><div key={p.id} className="trust-block-row"><div><strong>{p.display_name}</strong><small>@{p.handle}</small></div><button disabled={busy} onClick={()=>void unblock(p.id)}>Unblock</button></div>)}</section>
   <section className="trust-card trust-danger"><div className="trust-card-title"><Trash2 size={22}/><h2>Delete your account</h2></div><p>This permanently deletes your profile, posts, stories and direct-message conversations. Attached public media is queued for removal from storage and may remain accessible until cleanup succeeds. Other users' reports may be retained for safety/audit obligations.</p>
    {!deleteOpen?<button className="trust-danger-button" onClick={()=>setDeleteOpen(true)}>Start account deletion</button>:<form onSubmit={deleteAccount} className="trust-delete-form">
      <div className="trust-warning"><LockKeyhole size={19}/><span>This action cannot be undone. Your conversations will also disappear for other participants.</span></div>
      <label>Current password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required maxLength={72}/></label>
      <label>Type DELETE to confirm<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" required/></label>
      <div className="trust-row"><button type="button" className="trust-quiet" onClick={()=>{setDeleteOpen(false);setPassword("");setConfirmation("");}}><X size={16}/> Cancel</button>
       <button type="submit" className="trust-danger-button" disabled={busy||confirmation!=="DELETE"||!password}>{busy?"Deleting...":"Permanently delete my account"}</button></div>
     </form>}
   </section>
  </>}
  {message&&<p className="trust-feedback" role="status">{message}</p>}
 </main>;
}
