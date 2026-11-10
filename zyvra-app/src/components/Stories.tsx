"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Plus, Sparkles, Trash2, X } from "lucide-react";

type Story = {
  id: string; author_id: string; handle: string; display_name: string;
  body: string; created_at: string; expires_at: string;
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
    if (!draft.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await request("/api/stories", "POST", { body: draft });
      setCreating(false); setDraft("");
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
      {stories.map((story,i) => <button key={story.id} type="button" className={"story-chip story-color-"+(i%4)} onClick={() => setSelected(i)}><span className="story-chip-avatar">{story.display_name.slice(0,1).toUpperCase()}</span><span className="story-chip-preview">{story.body}</span><strong>{story.author_id === currentUserId ? "Your moment" : story.display_name}</strong><small>@{story.handle}</small></button>)}
      {stories.length === 0 && <p className="stories-empty">No moments yet. Start a new story for everyone to see.</p>}
    </div>
    {error && <p className="stories-error" role="alert">{error}</p>}
    {creating && <div className="stories-overlay" role="presentation" onMouseDown={e => { if(e.currentTarget===e.target)setCreating(false); }}><form className="stories-dialog" role="dialog" aria-modal="true" aria-label="Create a story" onSubmit={publish}><div className="stories-dialog-top"><span>MAKE A MOMENT ✦</span><button type="button" aria-label="Close" onClick={()=>setCreating(false)}><X size={20}/></button></div><div className="stories-dialog-icon"><Sparkles size={30}/></div><h3>Share what's on your mind.</h3><p>Text stories disappear from the feed after 24 hours. Avoid sharing private information.</p><textarea autoFocus aria-label="Story text" placeholder="Today I'm feeling..." maxLength={280} value={draft} onChange={e=>setDraft(e.target.value)} rows={5}/><div className="stories-dialog-footer"><span>{draft.length}/280</span><button type="submit" disabled={!draft.trim()||busy}> {busy?"Sharing...":"Share moment"} <ArrowRight size={17}/></button></div></form></div>}
    {shown && <div className="stories-overlay" role="presentation" onMouseDown={e => { if(e.target===e.currentTarget)setSelected(null); }}><div className="stories-viewer" role="dialog" aria-modal="true" aria-label={"Story from "+shown.display_name}><div className="stories-timeline"><span/></div><div className="stories-viewer-top"><span className="story-viewer-avatar">{shown.display_name.slice(0,1).toUpperCase()}</span><div><strong>{shown.display_name}</strong><small>@{shown.handle} · {timeLeft}h left</small></div><button type="button" aria-label="Close story" onClick={()=>setSelected(null)}><X size={21}/></button></div><div className="stories-viewer-body">{shown.body}</div><div className="stories-viewer-bottom"><button type="button" aria-label="Previous story" disabled={selected===0} onClick={()=>setSelected(i=>i===null?null:Math.max(0,i-1))}><ArrowLeft size={19}/> Previous</button>{shown.author_id===currentUserId&&<button type="button" className="story-delete" disabled={busy} onClick={()=>void remove(shown.id)}><Trash2 size={18}/> Delete</button>}<button type="button" aria-label="Next story" disabled={selected===stories.length-1} onClick={()=>setSelected(i=>i===null?null:Math.min(stories.length-1,i+1))}>Next <ArrowRight size={19}/></button></div></div></div>}
  </section>;
}
