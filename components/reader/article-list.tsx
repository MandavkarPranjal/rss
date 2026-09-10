"use client";

import { useEffect, useRef } from "react";
import { Checks, Star } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, timeAgo } from "@/lib/rss-client";
import type { Article, RssFilter } from "@/lib/rss-types";
import { useRssStore } from "./rss-store";
import { useArticles, useSearchQuery, useSelectedArticleId } from "./use-articles";

type Props = {
  feedId: string | null;
  filter: RssFilter;
  heading: string;
};

export default function ArticleList({ feedId, filter, heading }: Props) {
  const {
    feeds,
    setFeeds,
    patchCachedArticle,
    revalidateCurrent,
    loadFeeds,
    seenIds,
    setFeedsError,
    setArticlesCache,
  } = useRssStore();
  const [query] = useSearchQuery();
  const [, setArticleId] = useSelectedArticleId();
  const [selectedId] = useSelectedArticleId();
  const { articles, loading, error, retry } = useArticles(feedId, filter, query.trim());
  const listRef = useRef<HTMLDivElement>(null);

  const activeFeed = feeds.find((f) => f.id === feedId) ?? null;

  // Do not replace the article list while a story is open. A refresh can add
  // rows at the top and change the cached article object, which is disruptive
  // while the reader is part-way through an article. Polling resumes as soon
  // as the user returns to the list.
  useEffect(() => {
    if (selectedId) return;

    const refreshArticles = () => {
      if (document.visibilityState === "hidden") return;
      revalidateCurrent();
    };

    refreshArticles();
    const interval = window.setInterval(refreshArticles, 60_000);
    window.addEventListener("focus", refreshArticles);
    document.addEventListener("visibilitychange", refreshArticles);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshArticles);
      document.removeEventListener("visibilitychange", refreshArticles);
    };
  }, [selectedId, revalidateCurrent]);

  // Gentle staggered entry for new rows only.
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const els = root.querySelectorAll(".reveal:not(.is-visible)");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("is-visible")),
      { threshold: 0.05 },
    );
    els.forEach((el) => io.observe(el));
    const raf = requestAnimationFrame(() => {
      els.forEach((el) => {
        if ((el as HTMLElement).getBoundingClientRect().top < window.innerHeight) {
          el.classList.add("is-visible");
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [articles]);

  const openArticle = async (a: Article) => {
    // Update the cache before selecting: ArticleReader also marks unread
    // rows read on open, so selecting first lets it win the race and this
    // handler then decrements + PATCHes a second time.
    if (!a.isRead) {
      patchCachedArticle(a.id, { isRead: true });
      setFeeds((prev) =>
        prev.map((f) =>
          f.id === a.feedId ? { ...f, unreadCount: Math.max(0, (f.unreadCount ?? 1) - 1) } : f,
        ),
      );
      api(`/api/rss/articles/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isRead: true }),
      }).catch(() => {});
    }
    await setArticleId(a.id);
  };

  const toggleStar = async (a: Article) => {
    const next = !a.isStarred;
    patchCachedArticle(a.id, { isStarred: next });
    const request = api(`/api/rss/articles/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isStarred: next }),
      });
    toast.promise(request, {
      loading: next ? "Saving star…" : "Removing star…",
      success: next ? "Article starred" : "Article unstarred",
      error: "Could not update star",
    });
    try {
      await request;
    } catch {
      patchCachedArticle(a.id, { isStarred: a.isStarred });
    }
  };

  const markAllRead = async () => {
    // Scope to the current view (feed + filter + search): the endpoint
    // used to mark every unread article in scope, so a starred/searched
    // list wiped unshown stories. Mark only the displayed unread IDs.
    const unreadShown = articles.filter((a) => !a.isRead);
    if (unreadShown.length === 0) return;
    const ids = new Set(unreadShown.map((a) => a.id));
    const perFeed = new Map<string, number>();
    for (const a of unreadShown) perFeed.set(a.feedId, (perFeed.get(a.feedId) ?? 0) + 1);
    setFeeds((prev) =>
      prev.map((f) => {
        const n = perFeed.get(f.id);
        return n ? { ...f, unreadCount: Math.max(0, (f.unreadCount ?? n) - n) } : f;
      }),
    );
    setArticlesCache((prev) => {
      const next: Record<string, Article[]> = {};
      for (const [k, list] of Object.entries(prev)) {
        next[k] = list.map((x) => (ids.has(x.id) ? { ...x, isRead: true } : x));
      }
      return next;
    });
    const request = api("/api/rss/articles/mark-all-read", {
        method: "POST",
        body: JSON.stringify(
          feedId ? { feedId, articleIds: [...ids] } : { articleIds: [...ids] },
        ),
      });
    toast.promise(request, {
      loading: "Marking stories as read…",
      success: "Stories marked read",
      error: (error) => (error instanceof Error ? error.message : "Failed to mark all read"),
    });
    try {
      await request;
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Failed to mark all read");
    }
    revalidateCurrent();
    loadFeeds();
  };

  return (
    <section className="paper-grain flex w-full min-w-0 flex-col border-r border-[#ddd8ce] bg-[#fbfaf7] sm:w-[410px] sm:shrink-0">
      <div className="flex shrink-0 items-baseline justify-between border-b border-[#ddd8ce] px-6 pt-7 pb-5">
        <div>
          <h2 className="font-editorial text-[27px] leading-none tracking-tight">
            {heading}
          </h2>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#817c73]">
            {loading && articles.length > 0 ? (
              "Updating…"
            ) : (
              <>
                {articles.length} {articles.length === 1 ? "story" : "stories"}
              </>
            )}
            {activeFeed ? ` · ${activeFeed.title}` : ""}
          </p>
        </div>
        <button
          onClick={markAllRead}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-[#817c73] underline decoration-[#c8c1b5] underline-offset-4 hover:text-white"
        >
          <Checks size={13} weight="bold" /> Mark read
        </button>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {loading && articles.length === 0 && (
          <div aria-label="Loading stories" className="animate-pulse px-5 py-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="border-b border-[#EAEAEA] py-4 dark:border-white/10">
                <div className="h-3 w-2/5 rounded bg-[#EAEAEA] dark:bg-white/10" />
                <div className="mt-2 h-4 w-11/12 rounded bg-[#EAEAEA] dark:bg-white/10" />
                <div className="mt-2 h-3 w-3/5 rounded bg-[#EAEAEA] dark:bg-white/10" />
              </div>
            ))}
          </div>
        )}
        {articles.map((a, i) => {
          const selected = selectedId === a.id;
          const fresh = !seenIds.has(a.id);
          return (
            <div
              key={a.id}
              style={{ "--index": Math.min(i, 3) } as React.CSSProperties}
              className={`${fresh ? "reveal" : ""} row-lift border-b border-[#e5e0d7] px-6 py-5 ${selected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"} ${a.isRead ? "opacity-55" : ""}`}
            >
              <div className="flex items-start gap-3">
                {!a.isRead && (
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-label="Unread" />
                )}
                <button
                  onClick={() => openArticle(a)}
                  aria-current={selected ? true : undefined}
                  className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-[#817c73]">
                    {a.feedTitle ?? "Feed"} · {timeAgo(a.publishedAt)}
                  </p>
                  <p
                    className={`mt-1.5 text-[15px] leading-[1.25] ${a.isRead ? "font-normal" : "font-semibold tracking-[-0.015em]"}`}
                  >
                    {a.title}
                  </p>
                  {a.snippet && (
                    <p className="mt-2 line-clamp-2 max-w-[34ch] text-[13px] leading-[1.45] text-[#817c73]">{a.snippet}</p>
                  )}
                </button>
                <button
                  onClick={() => toggleStar(a)}
                  title={a.isStarred ? "Unstar" : "Star"}
                  aria-label={a.isStarred ? "Unstar article" : "Star article"}
                  className="shrink-0 rounded-md p-1 transition hover:bg-white/10 active:scale-[0.95]"
                >
                  <Star
                    size={16}
                    weight={a.isStarred ? "fill" : "bold"}
                    className={a.isStarred ? "text-white" : "text-white/20"}
                  />
                </button>
              </div>
            </div>
          );
        })}
        {articles.length === 0 && !loading && !error && (
          <div className="px-5 py-12 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#EAEAEA] bg-[#F7F6F3] dark:border-white/10 dark:bg-white/5">
              <Checks size={20} weight="bold" className="text-[#346538]" />
            </span>
            <p className="font-editorial mt-4 text-lg">All caught up</p>
            <p className="mx-auto mt-1 max-w-55 text-[13px] leading-relaxed text-[#787774]">
              Nothing {filter === "starred" ? "starred yet" : "left to read"}. New stories will land here
              quietly.
            </p>
          </div>
        )}
        {articles.length === 0 && !loading && error && (
          <div className="px-5 py-12 text-center">
            <p className="font-editorial mt-4 text-lg">Couldn&apos;t load stories</p>
            <p className="mx-auto mt-1 max-w-55 text-[13px] leading-relaxed text-[#787774]">{error}</p>
            <button
              onClick={retry}
              className="mt-4 inline-flex items-center gap-1 rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-[13px] transition hover:bg-[#F7F6F3] active:scale-[0.98] dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
