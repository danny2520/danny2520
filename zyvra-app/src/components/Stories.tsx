"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Plus, Sparkles, Trash2, X, Image as ImageIcon } from "lucide-react";
import { sendMedia } from "@/lib/media-client";

type Story = {
  id: string; author_id: string; handle: string; display_name: string;
  body: string; created_at: string; expires_at: string; media_url: string | null; media_kind: "image" | null;
};
type Props = { currentUserId: string };
async function request<T>(url: string, method = "GET", data?: object): Promise<T> {
  const r = await fetch(url, { method, cache: "no-store", credentials: "same-origin",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined
  });
  const json = await r.json() as T & { error?: string };
  if (!r.ok) throw new Error(json.error ?? "Unable to process request");
  return json;
}
export default function Stories({ currentUserId }: Props) {
  const [stories, setStories] = useState<Story[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [pendingMediaId, setPendingMediaId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const result = await request<{ stories: Story[] }>("/api/stories");
    setStories(result.stories);
  }, []);
  useEffect(() => { void refresh().catch(() => setError("Stories are temporarily unavailable")); }, [refresh]);
  // The page is the only place stories are fetched: no idle/background polling.
  useEffect(() => {
    if (selected === null && !creating) return;
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === "Escape") { setSelected(null); setCreating(false); }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected, creating]);

  async function publish(e: FormEvent) {
    e.preventDefault();
    if ((!draft.trim() && !storyFile) || busy) return;
    setBusy(true); setError("");
    try {
      let mediaId = pendingMediaId;
      if (storyFile && !mediaId) {
        const uploaded = await sendMedia(storyFile,currentUserId,"stories");
        mediaId = uploaded.id;
        setPendingMediaId(uploaded.id);
      }
      await request("/api/stories","POST",{body:draft.trim() || "Today's moment ✦",...(mediaId?{mediaId}:{})});
      setCreating(false); setDraft("");setStoryFile(null);setPendingMediaId(null);
      await refresh();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not share story"); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await request("/api/stories/" + id, "DELETE");
      setSelected(null);
      await refresh();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not delete story"); }
    finally { setBusy(false); }
  }
  const shown = selected === null ? null : stories[selected];
  const timeLeft = shown ? Math.max(0, Math.ceil((new Date(shown.expires_at).getTime() - Date.now())/3600000)) : 0;
  return <section className="stories-section" aria-label="Stories">
    <div className="stories-head"><div><span className="stories-kicker">IN THE MOMENT</span><h3>Today's stories<span className="heading-dot">.</span></h3></div><span className="stories-expiry">24h moments ✦</span></div>
    <div className="stories-track">
      <button type="button" className="story-add" onClick={() => { setError(""); setCreating(true); }}><span className="story-add-icon"><Plus size={24}/></span><strong>Your story</strong><small>Share a moment</small></button>
      {stories.map((story,i) => <button key={story.id} type="button" className={"story-chip story-color-"+(i%4)} style={story.media_url?{backgroundImage:'linear-gradient(to top,#101d14f5 3%,#111a1655 75%),url("'+story.media_url+'")',backgroundSize:"cover",backgroundPosition:"center"}:undefined} onClick={() => setSelected(i)}><span className="story-chip-avatar">{story.display_name.slice(0,1).toUpperCase()}</span><span className="story-chip-preview">{story.body}</span><strong>{story.author_id === currentUserId ? "Your moment" : story.display_name}</strong><small>@{story.handle}</small></button>)}
      {stories.length === 0 && <p className="stories-empty">No moments yet. Start a new story for everyone to see.</p>}
    </div>
    {error && <p className="stories-error" role="alert">{error}</p>}
    {creating && <div className="stories-overlay" role="presentation" onMouseDown={e => { if(e.currentTarget===e.target)setCreating(false); }}><form className="stories-dialog" role="dialog" aria-modal="true" aria-label="Create a story" onSubmit={publish}><div className="stories-dialog-top"><span>MAKE A MOMENT ✦</span><button type="button" aria-label="Close" onClick={()=>setCreating(false)}><X size={20}/></button></div><div className="stories-dialog-icon"><Sparkles size={30}/></div><h3>Share what's on your mind.</h3><p>Stories leave the feed after 24 hours. Attached photos may remain accessible via their public URL; don't upload sensitive images.</p><textarea autoFocus aria-label="Story text" placeholder="Today I'm feeling..." maxLength={280} value={draft} onChange={e=>setDraft(e.target.value)} rows={4}/><label className="stories-photo-upload"><ImageIcon size={18}/> {storyFile?"Photo: "+storyFile.name:"Attach a photo (up to 5 MB)"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} aria-label="Choose story photo" onChange={e=>{setStoryFile(e.target.files?.[0]??null);setPendingMediaId(null);e.target.value="";}} /></label>{storyFile&&<button className="stories-photo-remove" type="button" disabled={busy} onClick={()=>{setStoryFile(null);setPendingMediaId(null);}}>Remove photo</button>}<div className="stories-dialog-footer"><span>{draft.length}/280</span><button type="submit" disabled={(!draft.trim()&&!storyFile)||busy}>{busy?"Sharing...":"Share moment"} <ArrowRight size={17}/></button></div></form></div>}
    {shown && <div className="stories-overlay" role="presentation" onMouseDown={e => { if(e.target===e.currentTarget)setSelected(null); }}><div className="stories-viewer" role="dialog" aria-modal="true" aria-label={"Story from "+shown.display_name}><div className="stories-timeline"><span/></div><div className="stories-viewer-top"><span className="story-viewer-avatar">{shown.display_name.slice(0,1).toUpperCase()}</span><div><strong>{shown.display_name}</strong><small>@{shown.handle} · {timeLeft}h left</small></div><button type="button" aria-label="Close story" onClick={()=>setSelected(null)}><X size={21}/></button></div><div className="stories-viewer-body">{shown.media_url&&<img className="stories-viewer-photo" src={shown.media_url} alt={"Photo from "+shown.display_name}/>}<span>{shown.body}</span></div><div className="stories-viewer-bottom"><button type="button" aria-label="Previous story" disabled={selected===0} onClick={()=>setSelected(i=>i===null?null:Math.max(0,i-1))}><ArrowLeft size={19}/> Previous</button>{shown.author_id===currentUserId&&<button type="button" className="story-delete" disabled={busy} onClick={()=>void remove(shown.id)}><Trash2 size={18}/> Delete</button>}<button type="button" aria-label="Next story" disabled={selected===stories.length-1} onClick={()=>setSelected(i=>i===null?null:Math.min(stories.length-1,i+1))}>Next <ArrowRight size={19}/></button></div></div></div>}
  </section>;
}
