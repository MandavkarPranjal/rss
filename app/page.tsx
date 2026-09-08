"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowSquareOut,
  Checks,
  Keyhole,
  MagnifyingGlass,
  Newspaper,
  Plus,
  SignOut,
  Star,
  Trash,
} from "@phosphor-icons/react";
import { authClient, useSession } from "@/lib/auth-client";

type Feed = {
  id: string;
  url: string;
  title: string;
  siteUrl?: string | null;
  unreadCount: number;
};

type Article = {
  id: string;
  feedId: string;
  title: string;
  link?: string | null;
  snippet?: string | null;
  content?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  isRead: boolean;
  isStarred: boolean;
  feedTitle?: string | null;
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
}

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedFeed, setSelectedFeed] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "starred">("unread");
  const [search, setSearch] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mobileView, setMobileView] = useState<"feeds" | "list" | "reader">("list");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/sign-in");
  }, [isPending, session, router]);

  // Gentle staggered entry for article rows — IntersectionObserver only
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const els = root.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("is-visible")),
      { threshold: 0.05 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [articles]);

  // Cmd+K focuses search, no scroll listeners
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadFeeds = async () => {
    try {
      setFeeds(await api("/api/rss/feeds"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load feeds");
    }
  };

  const loadArticles = async () => {
    try {
      const params = new URLSearchParams({ filter, limit: "100" });
      if (selectedFeed) params.set("feedId", selectedFeed);
      if (search.trim()) params.set("q", search.trim());
      setArticles(await api(`/api/rss/articles?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load articles");
    }
  };

  useEffect(() => {
    if (session) {
      loadFeeds();
      loadArticles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, selectedFeed, filter]);

  if (isPending || !session) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#FBFBFA] p-10 dark:bg-[#191918]">
        <p className="text-sm text-[#787774]">Loading…</p>
      </div>
    );
  }

  const totalUnread = feeds.reduce((n, f) => n + (f.unreadCount ?? 0), 0);
  const activeFeed = feeds.find((f) => f.id === selectedFeed) ?? null;

  const addFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    setLoading(true);
    setError("");
    try {
      await api("/api/rss/feeds", { method: "POST", body: JSON.stringify({ url: newUrl }) });
      setNewUrl("");
      await loadFeeds();
      await loadArticles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add feed");
    } finally {
      setLoading(false);
    }
  };

  const openArticle = async (a: Article) => {
    setSelectedArticle(a);
    setMobileView("reader");
    if (!a.isRead) {
      setArticles((prev) => prev.map((x) => (x.id === a.id ? { ...x, isRead: true } : x)));
      try {
        await api(`/api/rss/articles/${a.id}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) });
        loadFeeds();
      } catch { /* ignore */ }
    }
  };

  const toggleStar = async (a: Article) => {
    const next = !a.isStarred;
    setArticles((prev) => prev.map((x) => (x.id === a.id ? { ...x, isStarred: next } : x)));
    if (selectedArticle?.id === a.id) setSelectedArticle({ ...a, isStarred: next });
    await api(`/api/rss/articles/${a.id}`, { method: "PATCH", body: JSON.stringify({ isStarred: next }) });
  };

  const markAllRead = async () => {
    await api("/api/rss/articles/mark-all-read", {
      method: "POST",
      body: JSON.stringify(selectedFeed ? { feedId: selectedFeed } : {}),
    });
    loadArticles();
    loadFeeds();
  };

  const refreshFeed = async () => {
    if (!selectedFeed) return;
    setLoading(true);
    try {
      await api(`/api/rss/feeds/${selectedFeed}/refresh`, { method: "POST" });
      await loadArticles();
      await loadFeeds();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  };

  const removeFeed = async () => {
    if (!selectedFeed || !confirm("Remove this feed and its articles?")) return;
    await api(`/api/rss/feeds/${selectedFeed}`, { method: "DELETE" });
    setSelectedFeed(null);
    loadFeeds();
    loadArticles();
  };

  const addPasskey = async () => {
    const { error } = await authClient.passkey.addPasskey();
    if (error) setError(error.message ?? "Could not add passkey");
    else alert("Passkey added — you can now sign in with it.");
  };

  return (
    <div className="flex h-screen flex-col bg-[#FBFBFA] text-[#111111] dark:bg-[#191918] dark:text-[#ECECEA]">
      {/* Top bar — 64px, single line, blurred paper */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#EAEAEA] bg-white/85 px-4 backdrop-blur dark:border-white/10 dark:bg-[#201F1E]/85 sm:px-5">
        <button
          className="rounded-md border border-[#EAEAEA] px-2 py-1 text-xs lg:hidden dark:border-white/10"
          onClick={() => setMobileView(mobileView === "feeds" ? "list" : "feeds")}
        >
          Feeds
        </button>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#111111] text-white dark:bg-[#ECECEA] dark:text-[#191918]">
            <Newspaper size={16} weight="bold" />
          </span>
          <span className="font-editorial text-[19px] font-medium tracking-tight">Ledger</span>
          <span className="hidden rounded-full bg-[#FBF3DB] px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.05em] text-[#956400] sm:inline-block dark:bg-[#956400]/25 dark:text-[#E8C26A]">
            {totalUnread} unread
          </span>
        </div>

        <div className="relative mx-auto hidden w-full max-w-md md:block">
          <MagnifyingGlass size={15} weight="bold" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#787774]" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadArticles()}
            placeholder="Search articles"
            aria-label="Search articles"
            className="w-full rounded-[6px] border border-[#EAEAEA] bg-[#F7F6F3] py-2 pr-14 pl-9 text-sm outline-none placeholder:text-[#787774] focus:border-[#111111] focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-transparent"
          />
          <span className="absolute top-1/2 right-2.5 -translate-y-1/2">
            <kbd>⌘K</kbd>
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 text-sm md:ml-0">
          <span className="hidden max-w-40 truncate text-[13px] text-[#787774] xl:inline">{session.user.email}</span>
          <button
            onClick={addPasskey}
            title="Add a passkey to this account"
            className="hidden items-center gap-1.5 rounded-[6px] border border-[#EAEAEA] px-2.5 py-1.5 text-[13px] transition hover:bg-[#F7F6F3] active:scale-[0.98] sm:inline-flex dark:border-white/10 dark:hover:bg-white/5"
          >
            <Keyhole size={14} weight="bold" /> Passkey
          </button>
          <button
            onClick={async () => { await authClient.signOut(); router.replace("/sign-in"); }}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#EAEAEA] px-2.5 py-1.5 text-[13px] transition hover:bg-[#F7F6F3] active:scale-[0.98] dark:border-white/10 dark:hover:bg-white/5"
          >
            <SignOut size={14} weight="bold" /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Mobile search */}
      <div className="border-b border-[#EAEAEA] bg-white px-4 py-2 md:hidden dark:border-white/10 dark:bg-[#201F1E]">
        <div className="relative">
          <MagnifyingGlass size={15} weight="bold" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#787774]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadArticles()}
            placeholder="Search articles"
            aria-label="Search articles"
            className="w-full rounded-[6px] border border-[#EAEAEA] bg-[#F7F6F3] py-2 pr-3 pl-9 text-sm dark:border-white/10 dark:bg-white/5"
          />
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-[#EAEAEA] bg-[#FDEBEC] px-5 py-2 text-[13px] text-[#9F2F2D] dark:border-white/10 dark:bg-[#9F2F2D]/20 dark:text-[#F3B8B6]">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Sidebar — library */}
        <aside
          className={`${mobileView === "feeds" ? "flex" : "hidden"} w-72 shrink-0 flex-col border-r border-[#EAEAEA] bg-[#F7F6F3] lg:flex dark:border-white/10 dark:bg-[#232220]`}
        >
          <div className="p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#787774]">Library</p>
            <form onSubmit={addFeed} className="mt-3">
              <label htmlFor="feed-url" className="mb-1.5 block text-[13px] font-medium">
                Follow a new feed
              </label>
              <div className="flex gap-2">
                <input
                  id="feed-url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com/feed.xml"
                  className="min-w-0 flex-1 rounded-[6px] border border-[#EAEAEA] bg-white px-2.5 py-2 text-[13px] outline-none placeholder:text-[#787774] focus:border-[#111111] dark:border-white/10 dark:bg-[#201F1E]"
                />
                <button
                  disabled={loading}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-[#111111] px-3 py-2 text-[13px] font-medium text-white transition hover:bg-[#333333] active:scale-[0.98] disabled:opacity-50 dark:bg-[#ECECEA] dark:text-[#191918]"
                >
                  <Plus size={13} weight="bold" /> Add
                </button>
              </div>
              <p className="mt-1.5 text-xs text-[#787774]">Paste any RSS or Atom URL.</p>
            </form>

            <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Article filter">
              {(["all", "unread", "starred"] as const).map((f) => (
                <button
                  key={f}
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => { setFilter(f); setMobileView("list"); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] transition active:scale-[0.98] ${
                    filter === f
                      ? "bg-[#111111] text-white dark:bg-[#ECECEA] dark:text-[#191918]"
                      : "border border-[#EAEAEA] bg-white text-[#787774] hover:text-[#111111] dark:border-white/10 dark:bg-transparent dark:hover:text-white"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            <button
              onClick={() => { setSelectedFeed(null); setMobileView("list"); }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedFeed === null
                  ? "border border-[#EAEAEA] bg-white font-medium dark:border-white/10 dark:bg-[#201F1E]"
                  : "border border-transparent hover:bg-white/70 dark:hover:bg-white/5"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">All feeds</span>
              {totalUnread > 0 && (
                <span className="rounded-full bg-[#FBF3DB] px-2 py-0.5 font-mono text-[11px] text-[#956400] dark:bg-[#956400]/25 dark:text-[#E8C26A]">
                  {totalUnread}
                </span>
              )}
            </button>
            {feeds.map((f) => {
              const active = selectedFeed === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => { setSelectedFeed(f.id); setMobileView("list"); }}
                  className={`mt-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    active
                      ? "border border-[#EAEAEA] bg-white font-medium dark:border-white/10 dark:bg-[#201F1E]"
                      : "border border-transparent hover:bg-white/70 dark:hover:bg-white/5"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${f.unreadCount > 0 ? "bg-[#1F6C9F]" : "bg-[#EAEAEA] dark:bg-white/15"}`} />
                  <span className="min-w-0 flex-1 truncate">{f.title}</span>
                  {f.unreadCount > 0 && (
                    <span className="shrink-0 rounded-full bg-[#FBF3DB] px-2 py-0.5 font-mono text-[11px] text-[#956400] dark:bg-[#956400]/25 dark:text-[#E8C26A]">
                      {f.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
            {feeds.length === 0 && (
              <div className="rounded-lg border border-[#EAEAEA] bg-white p-4 text-[13px] text-[#787774] dark:border-white/10 dark:bg-[#201F1E]">
                No feeds yet. Add your first feed above to start a quiet reading list.
              </div>
            )}
          </div>

          {selectedFeed && activeFeed && (
            <div className="border-t border-[#EAEAEA] p-3 dark:border-white/10">
              <p className="mb-2 truncate px-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[#787774]">
                {activeFeed.title}
              </p>
              <div className="flex gap-1.5">
                <button onClick={refreshFeed} className="flex-1 rounded-[6px] border border-[#EAEAEA] bg-white px-2 py-1.5 text-xs transition hover:bg-[#FBFBFA] active:scale-[0.98] dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5">
                  Refresh
                </button>
                <button onClick={markAllRead} title="Mark all read" className="flex flex-1 items-center justify-center gap-1 rounded-[6px] border border-[#EAEAEA] bg-white px-2 py-1.5 text-xs transition hover:bg-[#FBFBFA] active:scale-[0.98] dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5">
                  <Checks size={13} weight="bold" /> Read
                </button>
                <button onClick={removeFeed} title="Remove feed" className="inline-flex items-center gap-1 rounded-[6px] border border-[#FDEBEC] bg-[#FDEBEC] px-2 py-1.5 text-xs text-[#9F2F2D] transition hover:brightness-95 active:scale-[0.98] dark:border-transparent dark:bg-[#9F2F2D]/20 dark:text-[#F3B8B6]">
                  <Trash size={13} weight="bold" />
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Article list — border-separated rows, no cards */}
        <section
          className={`${mobileView === "list" ? "flex" : "hidden"} w-full min-w-0 flex-col border-r border-[#EAEAEA] bg-white sm:w-[380px] sm:shrink-0 md:flex dark:border-white/10 dark:bg-[#201F1E]`}
        >
          <div className="flex shrink-0 items-baseline justify-between border-b border-[#EAEAEA] px-5 pt-5 pb-3 dark:border-white/10">
            <div>
              <h2 className="font-editorial text-[22px] leading-none font-medium tracking-tight">
                {filter === "starred" ? "Starred" : filter === "all" ? "Everything" : "Unread"}
              </h2>
              <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#787774]">
                {articles.length} {articles.length === 1 ? "story" : "stories"}
                {activeFeed ? ` · ${activeFeed.title}` : ""}
              </p>
            </div>
            <button onClick={markAllRead} className="inline-flex shrink-0 items-center gap-1 text-xs text-[#787774] underline decoration-[#EAEAEA] underline-offset-4 hover:text-[#111111] dark:hover:text-white">
              <Checks size={13} weight="bold" /> Mark read
            </button>
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {articles.map((a, i) => {
              const selected = selectedArticle?.id === a.id;
              return (
                <div
                  key={a.id}
                  onClick={() => openArticle(a)}
                  style={{ "--index": Math.min(i, 8) } as React.CSSProperties}
                  className={`reveal row-lift cursor-pointer border-b border-[#EAEAEA] px-5 py-4 dark:border-white/10 ${selected ? "bg-[#F7F6F3] dark:bg-white/5" : "hover:bg-[#FBFBFA] dark:hover:bg-white/[0.03]"} ${a.isRead ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    {!a.isRead && <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1F6C9F]" aria-label="Unread" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-[#787774]">
                        {a.feedTitle ?? "Feed"} · {timeAgo(a.publishedAt)}
                      </p>
                      <p className={`mt-1 text-[14px] leading-snug ${a.isRead ? "font-normal" : "font-semibold tracking-[-0.01em]"}`}>
                        {a.title}
                      </p>
                      {a.snippet && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[#787774]">{a.snippet}</p>}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleStar(a); }}
                      title={a.isStarred ? "Unstar" : "Star"}
                      aria-label={a.isStarred ? "Unstar article" : "Star article"}
                      className="shrink-0 rounded-md p-1 transition hover:bg-[#F7F6F3] active:scale-[0.95] dark:hover:bg-white/10"
                    >
                      <Star
                        size={16}
                        weight={a.isStarred ? "fill" : "bold"}
                        className={a.isStarred ? "text-[#956400]" : "text-[#E0DED9] dark:text-white/20"}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
            {articles.length === 0 && (
              <div className="px-5 py-12 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#EAEAEA] bg-[#F7F6F3] dark:border-white/10 dark:bg-white/5">
                  <Checks size={20} weight="bold" className="text-[#346538]" />
                </span>
                <p className="font-editorial mt-4 text-lg">All caught up</p>
                <p className="mx-auto mt-1 max-w-55 text-[13px] leading-relaxed text-[#787774]">
                  Nothing {filter === "starred" ? "starred yet" : "left to read"}. New stories will land here quietly.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Reader pane */}
        <main className={`${mobileView === "reader" ? "flex" : "hidden"} min-w-0 flex-1 flex-col overflow-hidden bg-[#FBFBFA] md:flex dark:bg-[#191918]`}>
          {selectedArticle ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl px-6 py-10 sm:px-10 sm:py-12">
                <button
                  onClick={() => setMobileView("list")}
                  className="mb-6 text-[13px] text-[#787774] underline decoration-[#EAEAEA] underline-offset-4 md:hidden"
                >
                  ← Back to stories
                </button>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#787774]">
                  {selectedArticle.feedTitle}
                </p>
                <h1 className="font-editorial mt-2 text-[32px] leading-[1.12] font-medium tracking-[-0.02em] text-balance sm:text-[38px]">
                  {selectedArticle.title}
                </h1>
                <p className="mt-3 font-mono text-xs text-[#787774]">
                  {selectedArticle.author ? `${selectedArticle.author} · ` : ""}
                  {selectedArticle.publishedAt ? new Date(selectedArticle.publishedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-2 border-y border-[#EAEAEA] py-3 dark:border-white/10">
                  {selectedArticle.link && (
                    <a
                      href={selectedArticle.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#111111] px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-[#333333] active:scale-[0.98] dark:bg-[#ECECEA] dark:text-[#191918]"
                    >
                      Open original <ArrowSquareOut size={13} weight="bold" />
                    </a>
                  )}
                  <button
                    onClick={() => toggleStar(selectedArticle)}
                    className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-[13px] transition hover:bg-[#F7F6F3] active:scale-[0.98] dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5"
                  >
                    <Star size={13} weight={selectedArticle.isStarred ? "fill" : "bold"} className={selectedArticle.isStarred ? "text-[#956400]" : ""} />
                    {selectedArticle.isStarred ? "Starred" : "Star"}
                  </button>
                  {selectedArticle.isStarred && (
                    <span className="rounded-full bg-[#FBF3DB] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.05em] text-[#956400] dark:bg-[#956400]/25 dark:text-[#E8C26A]">
                      Saved
                    </span>
                  )}
                </div>
                <div
                  className="reader-body mt-6"
                  dangerouslySetInnerHTML={{ __html: selectedArticle.content ?? selectedArticle.snippet ?? "" }}
                />
              </div>
            </div>
          ) : (
            <div className="ambient-wash flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
              <div className="max-w-sm text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-[#EAEAEA] bg-white dark:border-white/10 dark:bg-[#201F1E]">
                  <Newspaper size={24} weight="bold" className="text-[#111111] dark:text-[#ECECEA]" />
                </span>
                <h2 className="font-editorial mt-5 text-[28px] leading-tight font-medium tracking-tight">
                  Pick something<br />worth reading.
                </h2>
                <p className="mx-auto mt-2 max-w-70 text-sm leading-relaxed text-[#787774]">
                  Your stories collect here. Skim the list, open one, stay a while.
                </p>
                <p className="mt-5 flex items-center justify-center gap-2 font-mono text-[11px] text-[#787774]">
                  <kbd>⌘K</kbd> to search
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
