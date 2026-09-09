"use client";

import { useEffect, useRef } from "react";
import { Checks, Star } from "@phosphor-icons/react";
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
  } = useRssStore();
  const [query] = useSearchQuery();
  const [, setArticleId] = useSelectedArticleId();
  const [selectedId] = useSelectedArticleId();
  const { articles, loading } = useArticles(feedId, filter, query.trim());
  const listRef = useRef<HTMLDivElement>(null);

  const activeFeed = feeds.find((f) => f.id === feedId) ?? null;

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
    await setArticleId(a.id);
    if (!a.content) {
      api(`/api/rss/articles/${a.id}`)
        .then((full) => patchCachedArticle(a.id, full))
        .catch(() => {});
    }
    if (!a.isRead) {
      patchCachedArticle(a.id, { isRead: true });
      setFeeds((prev) =>
        prev.map((f) =>
          f.id === a.feedId ? { ...f, unreadCount: Math.max(0, (f.unreadCount ?? 1) - 1) } : f,
        ),
      );
      try {
        await api(`/api/rss/articles/${a.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isRead: true }),
        });
      } catch {}
    }
  };

  const toggleStar = async (a: Article) => {
    const next = !a.isStarred;
    patchCachedArticle(a.id, { isStarred: next });
    try {
      await api(`/api/rss/articles/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isStarred: next }),
      });
    } catch {}
  };

  const markAllRead = async () => {
    const scopeFeed = feedId;
    setFeeds((prev) =>
      prev.map((f) => (!scopeFeed || f.id === scopeFeed ? { ...f, unreadCount: 0 } : f)),
    );
    patchScopeRead(scopeFeed);
    try {
      await api("/api/rss/articles/mark-all-read", {
        method: "POST",
        body: JSON.stringify(scopeFeed ? { feedId: scopeFeed } : {}),
      });
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Failed to mark all read");
    }
    revalidateCurrent();
    loadFeeds();
  };

  const { setArticlesCache } = useRssStore();
  const patchScopeRead = (scopeFeed: string | null) => {
    setArticlesCache((prev) => {
      const next: Record<string, Article[]> = {};
      for (const [k, list] of Object.entries(prev)) {
        next[k] = list.map((x) =>
          !scopeFeed || x.feedId === scopeFeed ? { ...x, isRead: true } : x,
        );
      }
      return next;
    });
  };

  return (
    <section className="flex w-full min-w-0 flex-col border-r border-[#EAEAEA] bg-white sm:w-[380px] sm:shrink-0 dark:border-white/10 dark:bg-[#201F1E]">
      <div className="flex shrink-0 items-baseline justify-between border-b border-[#EAEAEA] px-5 pt-5 pb-3 dark:border-white/10">
        <div>
          <h2 className="font-editorial text-[22px] leading-none font-medium tracking-tight">
            {heading}
          </h2>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#787774]">
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
          className="inline-flex shrink-0 items-center gap-1 text-xs text-[#787774] underline decoration-[#EAEAEA] underline-offset-4 hover:text-[#111111] dark:hover:text-white"
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
              onClick={() => openArticle(a)}
              style={{ "--index": Math.min(i, 3) } as React.CSSProperties}
              className={`${fresh ? "reveal" : ""} row-lift cursor-pointer border-b border-[#EAEAEA] px-5 py-4 dark:border-white/10 ${selected ? "bg-[#F7F6F3] dark:bg-white/5" : "hover:bg-[#FBFBFA] dark:hover:bg-white/[0.03]"} ${a.isRead ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                {!a.isRead && (
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1F6C9F]" aria-label="Unread" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-[#787774]">
                    {a.feedTitle ?? "Feed"} · {timeAgo(a.publishedAt)}
                  </p>
                  <p
                    className={`mt-1 text-[14px] leading-snug ${a.isRead ? "font-normal" : "font-semibold tracking-[-0.01em]"}`}
                  >
                    {a.title}
                  </p>
                  {a.snippet && (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[#787774]">{a.snippet}</p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStar(a);
                  }}
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
        {articles.length === 0 && !loading && (
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
      </div>
    </section>
  );
}
