"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function VerifyContent(){
  const params=useSearchParams();
  const [status,setStatus]=useState("Checking your verification link...");
  const [ok,setOk]=useState(false);
  const [token]=useState(()=>params.get("token"));
  useEffect(()=>{
    window.history.replaceState(null,"","/verify");
    if(!token){setStatus("Missing verification token.");return;}
    const controller=new AbortController();
    fetch("/api/auth/verify",{
      method:"POST",headers:{"Content-Type":"application/json"},
      credentials:"same-origin",body:JSON.stringify({token}),signal:controller.signal
    }).then(async res=>{const data=await res.json();if(!res.ok)throw new Error(data.error??"Verification failed");return data;})
      .then(()=>{setOk(true);setStatus("Your email has been verified. You're ready for ZYVRA.");})
      .catch(error=>{if(!controller.signal.aborted)setStatus(error instanceof Error?error.message:"Verification failed");});
    return()=>controller.abort();
  },[token]);
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#0c100e",color:"#e8f7e8"}}>
    <section style={{padding:36,border:"1px solid #3c5634",borderRadius:20,maxWidth:430,width:"100%",background:"#182017",textAlign:"center"}}>
      <h1 style={{color:"#c9fb61",fontSize:36}}>ZYVRA ✦</h1>
      <h2>{ok?"Email verified":"Email verification"}</h2>
      <p aria-live="polite" style={{lineHeight:1.8,color:"#c1d3bd"}}>{status}</p>
      <a href="/" style={{display:"inline-block",background:"#c9fb61",padding:"13px 22px",borderRadius:12,color:"#17220d",fontWeight:800}}>Back to ZYVRA</a>
    </section></main>;
}
export default function VerifyPage(){return <Suspense fallback={<div>Loading verification…</div>}><VerifyContent/></Suspense>;}
