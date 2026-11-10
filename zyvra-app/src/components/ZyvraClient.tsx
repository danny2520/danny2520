"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft, ArrowRight, Bell, Bookmark, Check, ChevronRight, Clapperboard,
  Compass, Heart, Home, LockKeyhole, LogOut, Menu, MessageCircle, MoreHorizontal,
  Plus, Search, Send, ShieldCheck, Sparkles, UserRound, Users, X, Zap
} from "lucide-react";
import Stories from "./Stories";

type User = { id: string; handle: string; display_name: string; bio: string; created_at?: string; following?: boolean };
type Post = { id: string; author_id: string; body: string; created_at: string; handle: string; display_name: string; like_count: number; comment_count: number; liked: boolean; bookmarked: boolean };
type Comment = { id: string; body: string; created_at: string; handle: string; display_name: string };
type Conversation = { id: string; peer_id: string; handle: string; display_name: string; last_message: string | null; last_at: string | null };
type Message = { id: string; sender_id: string; body: string; created_at: string };
type Tab = "home" | "explore" | "messages" | "saved" | "profile";

async function api<T>(path: string, method = "GET", data?: object): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined
  });
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = result && typeof result === "object" && "error" in result ? String(result.error) : "Request failed";
    throw new Error(detail);
  }
  return result as T;
}
function friendlyTime(value?: string | null): string {
  if (!value) return "now";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "now";
  const elapsed = Date.now() - d.getTime();
  if (elapsed < 60000) return "now";
  if (elapsed < 3600000) return Math.floor(elapsed / 60000) + "m";
  if (elapsed < 86400000) return Math.floor(elapsed / 3600000) + "h";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function Avatar({ name, size = "normal" }: { name: string; size?: "small" | "normal" | "large" }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(s => s[0] ?? "").join("").toUpperCase();
  const colors = ["aqua", "purple", "yellow", "pink"];
  const color = colors[Array.from(name).reduce((sum, c) => sum + c.charCodeAt(0), 0) % colors.length];
  return <span className={"avatar avatar-" + size + " avatar-" + color} aria-label={name}>{initials || "Z"}</span>;
}
function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="logo-icon"><Zap size={23} fill="currentColor" strokeWidth={2.4} /></span>{!compact && <span className="brand-text">zyvra<span>.</span></span>}</div>;
}

export default function ZyvraClient() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authName, setAuthName] = useState("");
  const [authHandle, setAuthHandle] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [posts, setPosts] = useState<Post[]>([]);
  const [postDraft, setPostDraft] = useState("");
  const [postBusy, setPostBusy] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageBusy, setMessageBusy] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [people, setPeople] = useState<User[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [feedScope, setFeedScope] = useState<"all" | "following">("all");

  const refreshPosts = useCallback(async (scope: "all" | "following" | "saved" = "all") => {
    const result = await api<{ posts: Post[] }>("/api/posts?scope=" + scope);
    setPosts(result.posts);
  }, []);
  const refreshConversations = useCallback(async () => {
    const result = await api<{ conversations: Conversation[] }>("/api/conversations");
    setConversations(result.conversations);
  }, []);
  const refreshMessages = useCallback(async (id: string) => {
    const result = await api<{ messages: Message[] }>("/api/conversations/" + id + "/messages");
    setMessages(result.messages);
  }, []);
  const notice = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(value => value === message ? "" : value), 4000);
  }, []);

  useEffect(() => {
    let alive = true;
    api<{ user: User | null }>("/api/me")
      .then(result => { if (alive) setUser(result.user); })
      .catch(() => { if (alive) notice("Database is not connected yet. See the setup guide."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [notice]);
  useEffect(() => {
    if (!user) return;
    void refreshConversations().catch(() => {});
  }, [user, refreshConversations]);
  useEffect(() => {
    if (!user || (tab !== "home" && tab !== "saved" && tab !== "profile")) return;
    const scope = tab === "saved" ? "saved" : tab === "home" ? feedScope : "all";
    void refreshPosts(scope).catch(err => notice(String(err.message)));
  }, [user, tab, feedScope, refreshPosts, notice]);
  useEffect(() => {
    if (!user || !conversationId || tab !== "messages") return;
    void refreshMessages(conversationId).catch(err => notice(String(err.message)));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshMessages(conversationId).catch(() => {});
    }, 8000);
    return () => window.clearInterval(timer);
  }, [user, conversationId, tab, refreshMessages, notice]);

  const currentConversation = conversations.find(c => c.id === conversationId);
  const myPosts = useMemo(() => posts.filter(p => p.author_id === user?.id), [posts, user]);
  const showPosts = tab === "profile" ? myPosts : posts;
  const nav = [
    { id: "home", text: "Home", icon: Home },
    { id: "explore", text: "Explore", icon: Compass },
    { id: "messages", text: "Messages", icon: MessageCircle },
    { id: "saved", text: "Saved", icon: Bookmark },
    { id: "profile", text: "Profile", icon: UserRound }
  ] as const;

  async function submitAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (authBusy) return;
    setAuthBusy(true);
    try {
      const result = await api<{ user: User }>(
        "/api/auth/" + (authMode === "register" ? "register" : "login"),
        "POST",
        authMode === "register" ?
          { displayName: authName, handle: authHandle, password: authPassword } :
          { handle: authHandle, password: authPassword }
      );
      setUser(result.user);
      setAuthPassword("");
      setTab("home");
      notice("Welcome to ZYVRA ✦");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setAuthBusy(false);
    }
  }
  async function logout() {
    try {
      await api("/api/auth/logout", "POST");
      setUser(null); setPosts([]); setMessages([]); setConversations([]); setConversationId(null);
      setAuthMode("login"); notice("Signed out safely");
    } catch (error) { notice(error instanceof Error ? error.message : "Could not sign out"); }
  }
  async function createPost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!postDraft.trim() || postBusy) return;
    setPostBusy(true);
    try {
      await api("/api/posts", "POST", { body: postDraft });
      setPostDraft(""); setTab("home");
      await refreshPosts(); notice("Your post is live ✦");
    } catch (error) { notice(error instanceof Error ? error.message : "Could not post"); }
    finally { setPostBusy(false); }
  }
  async function toggleLike(post: Post) {
    setPosts(old => old.map(p => p.id === post.id ? { ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1) } : p));
    try {
      await api("/api/posts/" + post.id + "/like", post.liked ? "DELETE" : "POST");
    } catch {
      setPosts(old => old.map(p => p.id === post.id ? { ...p, liked: post.liked, like_count: post.like_count } : p));
      notice("Could not update like");
    }
  }
  async function toggleBookmark(post: Post) {
    setPosts(old => old.map(p => p.id === post.id ? { ...p, bookmarked: !p.bookmarked } : p));
    try {
      await api("/api/posts/" + post.id + "/bookmark", post.bookmarked ? "DELETE" : "POST");
      if (tab === "saved") await refreshPosts("saved");
    } catch {
      setPosts(old => old.map(p => p.id === post.id ? { ...p, bookmarked: post.bookmarked } : p));
      notice("Could not save this post");
    }
  }
  async function toggleFollow(person: User) {
    setPeople(old => old.map(p => p.id === person.id ? { ...p, following: !p.following } : p));
    try {
      await api("/api/users/" + person.id + "/follow", person.following ? "DELETE" : "POST");
      notice(person.following ? "Unfollowed" : "You're now following @" + person.handle);
    } catch {
      setPeople(old => old.map(p => p.id === person.id ? { ...p, following: person.following } : p));
      notice("Could not update follow status");
    }
  }
  async function expandComments(id: string) {
    if (id === expandedPostId) { setExpandedPostId(null); return; }
    setExpandedPostId(id); setComments([]); setCommentDraft("");
    try { const result = await api<{ comments: Comment[] }>("/api/posts/" + id + "/comments"); setComments(result.comments); }
    catch (error) { notice(error instanceof Error ? error.message : "Could not load comments"); }
  }
  async function sendComment(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    if (!commentDraft.trim()) return;
    try {
      await api("/api/posts/" + id + "/comments", "POST", { body: commentDraft });
      setCommentDraft("");
      const result = await api<{ comments: Comment[] }>("/api/posts/" + id + "/comments");
      setComments(result.comments); await refreshPosts(tab === "saved" ? "saved" : feedScope);
    } catch (error) { notice(error instanceof Error ? error.message : "Could not comment"); }
  }
  async function searchUsers(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (peopleQuery.trim().length < 2) { setPeople([]); return; }
    setSearchBusy(true);
    try {
      const result = await api<{ users: User[] }>("/api/users?q=" + encodeURIComponent(peopleQuery.trim()));
      setPeople(result.users);
    } catch (error) { notice(error instanceof Error ? error.message : "Could not search"); }
    finally { setSearchBusy(false); }
  }
  async function openConversation(recipientId: string) {
    if (working) return;
    setWorking(true);
    try {
      const result = await api<{ id: string }>("/api/conversations", "POST", { recipientId });
      await refreshConversations();
      setConversationId(result.id); setTab("messages");
    } catch (error) { notice(error instanceof Error ? error.message : "Could not open conversation"); }
    finally { setWorking(false); }
  }
  async function submitMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!conversationId || !messageDraft.trim() || messageBusy) return;
    setMessageBusy(true);
    try {
      await api("/api/conversations/" + conversationId + "/messages", "POST", { body: messageDraft });
      setMessageDraft("");
      await refreshMessages(conversationId);
      await refreshConversations();
    } catch (error) { notice(error instanceof Error ? error.message : "Message failed"); }
    finally { setMessageBusy(false); }
  }
  function go(next: Tab) { setTab(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }

  if (loading) return <div className="boot"><Logo /><div className="boot-spinner" /><span>Finding your pulse...</span></div>;

  if (!user) {
    return <main className="landing">
      <div className="landing-glow landing-glow-one" /><div className="landing-glow landing-glow-two" />
      <header className="landing-head"><Logo /><a className="demo-link" href="/preview/index.html">Explore the visual demo <ArrowRight size={15} /></a></header>
      <section className="landing-body">
        <div className="landing-story">
          <div className="eyebrow"><span className="live-dot" /> A NEW KIND OF SOCIAL</div>
          <h1>Your world.<br />Your voice.<br /><em>Your pulse.</em></h1>
          <p>One home for bold thoughts, beautiful moments and conversations that actually matter.</p>
          <div className="feature-row"><span><MessageCircle size={18} /> Real conversations</span><span><Zap size={18} /> Creative energy</span></div>
          <div className="landing-people"><div className="avatar-stack"><Avatar name="Nia Parker" /><Avatar name="Leo Tan" /><Avatar name="Sara Williams" /></div><div><strong>Find your people.</strong><small>Make your next connection count.</small></div></div>
        </div>
        <div className="auth-card">
          <div className="auth-top"><span className="auth-flash"><Sparkles size={23}/></span><div className="auth-switch"><button type="button" className={authMode === "register" ? "picked" : ""} onClick={() => setAuthMode("register")}>Sign up</button><button type="button" className={authMode === "login" ? "picked" : ""} onClick={() => setAuthMode("login")}>Log in</button></div></div>
          <h2>{authMode === "register" ? "Create your space." : "Welcome back."}</h2>
          <p>{authMode === "register" ? "Join a world built around expression." : "Your community is right where you left it."}</p>
          <form onSubmit={submitAuth} className="auth-form">
            {authMode === "register" && <label>Display name<input autoComplete="name" value={authName} onChange={e => setAuthName(e.target.value)} minLength={2} maxLength={80} placeholder="Your name" required /></label>}
            <label>Username<span className="input-handle"><span>@</span><input autoComplete="username" value={authHandle} onChange={e => setAuthHandle(e.target.value.toLowerCase())} minLength={3} maxLength={24} pattern="[a-z0-9_]+" placeholder="yourhandle" required /></span></label>
            <label>Password<input autoComplete={authMode === "register" ? "new-password" : "current-password"} type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} minLength={authMode === "register" ? 12 : 1} maxLength={72} placeholder="Your secure password" required /></label>
            <button className="primary-btn auth-submit" type="submit" disabled={authBusy}>{authBusy ? "Just a moment..." : authMode === "register" ? "Join ZYVRA" : "Sign in"}<ArrowRight size={18} /></button>
          </form>
          <div className="auth-footer"><ShieldCheck size={16} /> Your privacy matters. Private chats stay private.</div>
          <p className="auth-disclaimer">Early access · Text posts and direct messages now. Stories and clips are being built.</p>
        </div>
      </section>
      <footer className="landing-foot"><span>© ZYVRA 2026</span><span>YOUR PEOPLE. YOUR PULSE.</span></footer>
    </main>;
  }

  return <div className="app">
    <aside className={"sidebar " + (menuOpen ? "sidebar-open" : "")}>
      <div className="sidebar-brand"><Logo /><button className="mobile-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={20}/></button></div>
      <p className="side-caption">YOUR SPACE</p>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {nav.map(({ id, text, icon: Icon }) => <button key={id} type="button" onClick={() => go(id)} className={"nav-item " + (tab === id ? "active" : "")}><Icon size={21} /><span>{text}</span>{id === "messages" && conversations.length > 0 && <i>{conversations.length}</i>}</button>)}
        <a className="nav-item" href="/preview/index.html" title="Design preview; stories and clips are demonstration-only"><Clapperboard size={21} /><span>Clips & Stories</span><ChevronRight size={16}/></a>
      </nav>
      <button type="button" className="primary-btn nav-compose" onClick={() => { go("home"); document.getElementById("post-textarea")?.focus(); }}><Plus size={20} />Create a post</button>
      <div className="sidebar-bottom"><div className="signed-in"><Avatar name={user.display_name} /><div className="signed-in-text"><strong>{user.display_name}</strong><span>@{user.handle}</span></div></div><button type="button" onClick={logout} className="icon-btn" aria-label="Sign out" title="Sign out"><LogOut size={19}/></button></div>
    </aside>
    {menuOpen && <button type="button" aria-label="Close navigation" className="menu-backdrop" onClick={() => setMenuOpen(false)} />}
    <main className="content">
      <header className="content-header"><button type="button" className="mobile-menu icon-btn" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={22}/></button><div><span className="header-kicker">WELCOME TO ZYVRA</span><h2>{tab === "home" ? "Your feed" : tab === "explore" ? "Find your people" : tab === "messages" ? "Messages" : tab === "saved" ? "Saved posts" : "Your profile"}<span className="heading-dot">.</span></h2></div><span className="header-status"><span className="live-dot" /> Early access</span></header>
      {tab === "home" && <>
        <div className="feed-heading"><div><span className="section-eyebrow">THE LATEST</span><h3>What's happening<span className="heading-dot">?</span></h3></div><span className="subtle-tag"><Sparkles size={15} /> For you</span></div>
        <form className="compose-card" onSubmit={createPost}><div className="compose-row"><Avatar name={user.display_name} /><textarea id="post-textarea" value={postDraft} onChange={e => setPostDraft(e.target.value)} maxLength={500} rows={3} placeholder="What's happening in your world?" aria-label="Write a post" /></div><div className="compose-footer"><span>Say it your way <span className="counter">{postDraft.length}/500</span></span><button type="submit" className="primary-btn small-btn" disabled={postBusy || !postDraft.trim()}>{postBusy ? "Posting..." : "Post"}<ArrowRight size={16}/></button></div></form>
        <Stories currentUserId={user.id} />
        <div className="stream-heading"><span><Zap size={18}/> Fresh on your feed</span><div className="feed-filters"><button type="button" className={feedScope === "all" ? "feed-scope-active" : ""} onClick={() => setFeedScope("all")}>Everyone</button><button type="button" className={feedScope === "following" ? "feed-scope-active" : ""} onClick={() => setFeedScope("following")}>Following</button><button type="button" aria-label="Refresh feed" onClick={() => void refreshPosts(feedScope).catch(() => notice("Could not refresh"))}>↻</button></div></div>
      </>}
      {tab === "profile" && <div className="profile-hero"><div className="profile-banner"><Zap size={55} fill="currentColor"/></div><div className="profile-detail"><Avatar name={user.display_name} size="large" /><span className="profile-label">FOUNDING MEMBER</span><h3>{user.display_name}</h3><span className="handle">@{user.handle}</span><p>{user.bio || "Express yourself. This is your space."}</p><div className="profile-stats"><strong>{myPosts.length}<span> Posts</span></strong><strong>✦<span> Early creator</span></strong></div></div><div className="posts-intro">Your posts</div></div>}
      {tab === "saved" && <div className="saved-header"><Bookmark size={23} /><div><span className="section-eyebrow">JUST FOR YOU</span><h3>Worth keeping.</h3><p>Only you can see your saved posts.</p></div></div>}
      {(tab === "home" || tab === "profile" || tab === "saved") && <div className="post-stream">
        {showPosts.length === 0 && <div className="empty"><Sparkles size={28}/><h3>Every story starts somewhere.</h3><p>Share the first thought on your feed.</p></div>}
        {showPosts.map(post => <article key={post.id} className="post"><div className="post-top"><Avatar name={post.display_name}/><div className="post-ident"><strong>{post.display_name}</strong><div><span>@{post.handle}</span><span>·</span><span>{friendlyTime(post.created_at)}</span></div></div><MoreHorizontal size={19} className="post-more"/></div><p className="post-copy">{post.body}</p><div className="post-actions"><button type="button" aria-label="Like post" aria-pressed={post.liked} className={post.liked ? "is-liked" : ""} onClick={() => void toggleLike(post)}><Heart size={19} fill={post.liked ? "currentColor" : "none"}/><span>{post.like_count}</span></button><button type="button" onClick={() => void expandComments(post.id)} aria-expanded={expandedPostId === post.id}><MessageCircle size={19}/><span>{post.comment_count}</span></button><button type="button" onClick={() => void toggleBookmark(post)} className={post.bookmarked ? "is-saved" : ""} aria-pressed={post.bookmarked} aria-label={post.bookmarked ? "Unsave post" : "Save post"}><Bookmark size={19} fill={post.bookmarked ? "currentColor" : "none"}/></button><span className="post-spacer"/><span className="post-type">TEXT POST</span></div>
          {expandedPostId === post.id && <div className="comment-panel">{comments.map(comment => <div className="comment-item" key={comment.id}><Avatar name={comment.display_name} size="small"/><div><strong>{comment.display_name} <span>@{comment.handle}</span></strong><p>{comment.body}</p></div></div>)}{comments.length === 0 && <p className="no-comments">No replies yet. Start the conversation.</p>}<form className="comment-compose" onSubmit={e => void sendComment(e, post.id)}><input aria-label="Write a reply" placeholder="Reply to this post..." value={commentDraft} maxLength={300} onChange={e => setCommentDraft(e.target.value)}/><button type="submit" disabled={!commentDraft.trim()} aria-label="Send reply"><Send size={17}/></button></form></div>}
        </article>)}
      </div>}
      {tab === "explore" && <section className="explore-page"><div className="explore-card"><span className="section-eyebrow">COMMUNITY</span><h3>Good people. Great conversations.</h3><p>Search for another member and start a one-to-one conversation. Your messages are only visible to members of that chat.</p><form className="people-search" onSubmit={searchUsers}><Search size={20}/><input aria-label="Search users" autoComplete="off" placeholder="Search by name or @username" value={peopleQuery} onChange={e => setPeopleQuery(e.target.value)} maxLength={50}/><button type="submit" className="primary-btn small-btn" disabled={searchBusy || peopleQuery.trim().length < 2}>{searchBusy ? "Searching" : "Find"}</button></form>{people.map(person => <div className="person-result" key={person.id}><Avatar name={person.display_name}/><div><strong>{person.display_name}</strong><span>@{person.handle}</span></div><button type="button" className={person.following ? "person-following" : "person-follow"} onClick={() => void toggleFollow(person)}>{person.following ? <Check size={16}/> : <Plus size={16}/>} {person.following ? "Following" : "Follow"}</button><button type="button" disabled={working} onClick={() => void openConversation(person.id)}><MessageCircle size={17}/> Message</button></div>)}{people.length === 0 && <div className="search-hint"><Users size={24}/> Find your first connection</div>}</div><div className="coming-soon"><span className="section-eyebrow">COMING NEXT</span><h3>Discover even more.</h3><p>Trending topics, creators, and communities are on our roadmap.</p><a href="/preview/index.html">Experience the visual concept <ArrowRight size={16}/></a></div></section>}
      {tab === "messages" && <section className="message-page"><div className={"chat-list " + (conversationId ? "chat-list-mobile-hidden" : "")}><div className="chat-list-head"><h3>Inbox <span>{conversations.length}</span></h3><button type="button" aria-label="Find someone to message" title="New message" onClick={() => go("explore")}><Plus size={19}/></button></div>{conversations.length === 0 && <div className="chat-empty"><MessageCircle size={29}/><strong>Your inbox is ready.</strong><p>Find someone on Explore to send the first message.</p><button type="button" onClick={() => go("explore")}>Find people <ArrowRight size={15}/></button></div>}{conversations.map(c => <button key={c.id} type="button" className={"chat-item " + (conversationId === c.id ? "chat-selected" : "")} onClick={() => setConversationId(c.id)}><Avatar name={c.display_name}/><div><strong>{c.display_name}</strong><span>{c.last_message || "Start the conversation"}</span></div><small>{friendlyTime(c.last_at)}</small></button>)}</div><div className={"chat-panel " + (!conversationId ? "chat-panel-mobile-hidden" : "")}>{currentConversation && conversationId ? <><div className="chat-header"><button type="button" className="chat-back" aria-label="Return to chats" onClick={() => setConversationId(null)}><ArrowLeft size={20}/></button><Avatar name={currentConversation.display_name}/><div><strong>{currentConversation.display_name}</strong><span>@{currentConversation.handle} · Private conversation</span></div><LockKeyhole size={18} className="chat-lock"/></div><div className="chat-messages" aria-live="polite">{messages.length === 0 && <div className="first-message"><Sparkles size={28}/><h4>Say hello.</h4><p>A great connection starts with one message.</p></div>}{messages.map(message => <div key={message.id} className={"bubble-line " + (message.sender_id === user.id ? "mine" : "")}><div className="bubble"><p>{message.body}</p><small>{friendlyTime(message.created_at)} {message.sender_id === user.id && <Check size={12}/>}</small></div></div>)}</div><form className="chat-compose" onSubmit={submitMessage}><input aria-label="Write a message" placeholder="Write a message..." value={messageDraft} onChange={e => setMessageDraft(e.target.value)} maxLength={2000}/><button type="submit" disabled={messageBusy || !messageDraft.trim()} aria-label="Send message"><Send size={19}/></button></form></> : <div className="chat-placeholder"><span><MessageCircle size={35}/></span><h3>Your conversations start here.</h3><p>Select a chat or find someone to connect with.</p><button className="primary-btn small-btn" type="button" onClick={() => go("explore")}>Find people <ArrowRight size={16}/></button></div>}</div></section>}
    </main>
    <aside className="right-sidebar"><div className="right-card right-welcome"><div className="right-topline"><span className="live-dot"/> YOUR SOCIAL UNIVERSE</div><div className="right-icon"><Sparkles size={25}/></div><h3>Better together.</h3><p>New thoughts, new friends and a thousand reasons to connect.</p><button type="button" onClick={() => go("explore")}>Explore the community <ArrowRight size={16}/></button></div><div className="right-card"><div className="right-label"><span>INSIDE ZYVRA</span><span>✦</span></div><div className="feature-info"><Heart size={18}/><span>Connect through posts</span><Check size={15}/></div><div className="feature-info"><MessageCircle size={18}/><span>Chat privately</span><Check size={15}/></div><div className="feature-info"><Sparkles size={18}/><span>24-hour text stories</span><Check size={15}/></div><div className="feature-info"><Clapperboard size={18}/><span>Video clips</span><span className="soon">SOON</span></div><div className="feature-info"><Bell size={18}/><span>Notifications</span><span className="soon">SOON</span></div></div><div className="right-footer">ZYVRA © 2026 <span>·</span> Built for connection.</div></aside>
    <nav className="mobile-bottom" aria-label="Mobile navigation">{nav.map(({id,icon:Icon,text}) => <button type="button" key={id} onClick={() => go(id)} className={tab === id ? "active" : ""} aria-label={text}><Icon size={22}/><span>{text}</span></button>)}</nav>
    {toast && <div className="toast" role="status">{toast}<button type="button" aria-label="Dismiss notification" onClick={() => setToast("")}><X size={15}/></button></div>}
  </div>;
}
