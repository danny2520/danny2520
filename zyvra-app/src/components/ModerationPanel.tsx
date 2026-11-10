"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Flag, Shield, ShieldAlert, Trash2, UserX, RefreshCw } from "lucide-react";
type Report={id:string;target_kind:"post"|"user";target_id:string;reason:string;details:string;status:string;created_at:string;reporter_handle:string;target_preview:string|null};
type Filter="open"|"resolved"|"dismissed";
export default function ModerationPanel(){
 const [reports,setReports]=useState<Report[]>([]),[filter,setFilter]=useState<Filter>("open");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[reason,setReason]=useState("Policy review completed");
 const refresh=useCallback(async()=>{
  const r=await fetch("/api/moderation/reports?status="+filter,{cache:"no-store"});
  const data=await r.json();
  if(!r.ok)throw new Error(data.error??"Unable to load queue");
  setReports(data.reports);
 },[filter]);
 useEffect(()=>{void refresh().catch(e=>setError(String(e.message)));},[refresh]);
 async function act(id:string,action:"dismiss"|"hide_post"|"suspend_user"){
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/moderation/reports/"+id,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,reason})
   });
   const data=await r.json();
   if(!r.ok)throw new Error(data.error??"Moderation action failed");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Action failed");}
  finally{setBusy(false);}
 }
 async function maintenance(){
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/moderation/cleanup",{method:"POST"});
   const data=await r.json();
   if(!r.ok)throw new Error(data.error??"Cleanup failed");
   setError("Cleanup completed: "+data.deleted+" Blob objects removed; "+data.failed+" queued for retry.");
  }catch(e){setError(e instanceof Error?e.message:"Cleanup failed");}
  finally{setBusy(false);}
 }
 return <main className="trust-shell"><header className="trust-top"><a href="/"><ArrowLeft size={19}/> Back to ZYVRA</a><strong>zyvra<span>.</span></strong></header>
  <div className="trust-title"><span>TRUST & SAFETY · MODERATORS</span><h1>Review centre</h1><p>Review community reports and take documented actions. Only approved, email-verified moderators can access this page.</p></div>
  <section className="trust-card"><div className="trust-card-title"><Shield size={22}/><h2>Moderation queue</h2></div>
   <div className="trust-row">{(["open","resolved","dismissed"] as const).map(v=><button key={v} onClick={()=>setFilter(v)} className={v===filter?"trust-selected":"trust-quiet"}>{v}</button>)}<button onClick={()=>void refresh()} className="trust-quiet"><RefreshCw size={15}/> Refresh</button></div>
   <label>Review notes<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} minLength={3} placeholder="Reason for action"/></label>
   {reports.length===0?<p className="trust-muted">No {filter} reports.</p>:reports.map(r=><article className="trust-report" key={r.id}><div className="trust-row"><span className="trust-badge"><Flag size={14}/> {r.reason}</span><time>{new Date(r.created_at).toLocaleString()}</time></div>
    <h3>{r.target_kind==="post"?"Reported post":"Reported account"}: {r.target_preview??"Removed content"}</h3>
    <p>Reported by @{r.reporter_handle}{r.details?" · "+r.details:""}</p>
    {filter==="open"&&<div className="trust-row"><button disabled={busy||reason.trim().length<3} onClick={()=>void act(r.id,"dismiss")} className="trust-quiet">Dismiss report</button>
     {r.target_kind==="post"?<button disabled={busy||reason.trim().length<3} onClick={()=>void act(r.id,"hide_post")} className="trust-danger-button"><Trash2 size={16}/> Hide post & remove media</button>:
      <button disabled={busy||reason.trim().length<3} onClick={()=>void act(r.id,"suspend_user")} className="trust-danger-button"><UserX size={16}/> Suspend account</button>}</div>}
   </article>)}
  </section>
  <section className="trust-card"><div className="trust-card-title"><ShieldAlert size={21}/><h2>Media cleanup</h2></div><p>Run the same cleanup queue used by scheduled maintenance. Deleted accounts and expired photo stories are removed from storage when cleanup succeeds.</p>
   <button className="trust-selected" disabled={busy} onClick={()=>void maintenance()}>{busy?"Processing...":"Run media cleanup"}</button>
  </section>
  {error&&<p className="trust-feedback" role="status">{error}</p>}
 </main>;
}
