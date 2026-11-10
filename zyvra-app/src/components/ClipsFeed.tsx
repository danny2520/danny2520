"use client";
import { useEffect, useRef, useState } from "react";
import { Clapperboard, Heart, Play, Pause, Volume2, VolumeX, Sparkles } from "lucide-react";

type Clip = {
  id:string; author_id:string; handle:string; display_name:string;
  body:string; media_url:string; media_kind:"video"; like_count:number; liked:boolean;
};
function VideoCard({clip,onLike}:{clip:Clip;onLike:(id:string,liked:boolean)=>Promise<void>}) {
  const ref=useRef<HTMLVideoElement>(null);
  const wrap=useRef<HTMLElement>(null);
  const [muted,setMuted]=useState(true);
  const [playing,setPlaying]=useState(false);
  useEffect(()=>{
    const video=ref.current,section=wrap.current;
    if(!video||!section)return;
    const pause=()=>{video.pause();setPlaying(false);};
    const observer=new IntersectionObserver(entries=>{
      if(entries[0]?.isIntersecting && document.visibilityState==="visible"){
        void video.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false));
      } else pause();
    },{threshold:.72});
    observer.observe(section);
    const onHidden=()=>{if(document.visibilityState!=="visible")pause();};
    document.addEventListener("visibilitychange",onHidden);
    return()=>{observer.disconnect();document.removeEventListener("visibilitychange",onHidden);pause();};
  },[clip.id]);
  function toggle(){
    const video=ref.current;if(!video)return;
    if(video.paused)void video.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false));
    else{video.pause();setPlaying(false);}
  }
  return <article ref={wrap} className="clip-card" aria-label={"Clip from "+clip.display_name}>
    <div className="clip-video-shell">
      <video ref={ref} className="clip-video" src={clip.media_url} playsInline muted={muted}
        loop preload="metadata" onClick={toggle} aria-label={clip.body}/>
      <button type="button" className="clip-toggle" onClick={toggle} aria-label={playing?"Pause video":"Play video"}>{playing?<Pause size={21}/>:<Play size={21}/>}</button>
      <button type="button" className="clip-volume" onClick={()=>setMuted(!muted)} aria-label={muted?"Unmute video":"Mute video"}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button>
      <div className="clip-overlay"><div className="clip-author"><span className="clip-avatar">{clip.display_name.slice(0,1).toUpperCase()}</span><strong>{clip.display_name}</strong><span>@{clip.handle}</span></div><p>{clip.body}</p></div>
    </div>
    <div className="clip-actions"><button type="button" onClick={()=>void onLike(clip.id,clip.liked)}
      className={clip.liked?"clip-liked":""} aria-pressed={clip.liked}>
      <Heart size={19} fill={clip.liked?"currentColor":"none"} /> {clip.like_count} {clip.like_count===1?"like":"likes"}
    </button><span><Clapperboard size={16}/> ZYVRA CLIPS</span></div>
  </article>;
}
export default function ClipsFeed() {
  const [clips,setClips]=useState<Clip[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/posts?scope=clips",{cache:"no-store",signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error("Clips are unavailable");return r.json() as Promise<{posts:Clip[]}>;})
      .then(data=>setClips(data.posts)).catch(e=>{if(!controller.signal.aborted)setError(String(e.message));})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[]);
  async function like(id:string,liked:boolean){
    setClips(old=>old.map(c=>c.id===id?{...c,liked:!liked,like_count:c.like_count+(liked?-1:1)}:c));
    try{
      const response=await fetch("/api/posts/"+id+"/like",{method:liked?"DELETE":"POST"});
      if(!response.ok)throw new Error();
    }catch{
      setClips(old=>old.map(c=>c.id===id?{...c,liked,like_count:c.like_count+(liked?1:-1)}:c));
      setError("Couldn't update reaction");
    }
  }
  return <section className="clips-page"><header className="clips-head"><div><span className="section-eyebrow">CREATOR SPOTLIGHT</span><h3>Moments in motion<span className="heading-dot">.</span></h3></div><div className="clips-label"><Clapperboard size={18}/> CLIPS</div></header>
    <p className="clips-intro">Short videos from the ZYVRA community. Videos pause when you scroll away or switch tabs.</p>
    {loading&&<div className="clips-empty"><Sparkles size={32}/><p>Loading your clips...</p></div>}
    {error&&<p className="clips-error" role="status">{error}</p>}
    {!loading&&!error&&clips.length===0&&<div className="clips-empty"><Clapperboard size={40}/><h3>Be the first creator.</h3><p>Upload an MP4 or WebM video through the Home composer, and it will appear here.</p></div>}
    {clips.map(c=><VideoCard key={c.id} clip={c} onLike={like}/>)}
  </section>;
}
