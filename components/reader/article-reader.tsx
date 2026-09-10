"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowSquareOut, Newspaper, Star } from "@phosphor-icons/react";
import { toast } from "sonner";
import ArticleContent from "@/components/article-content";
import { api } from "@/lib/rss-client";
import type { Article } from "@/lib/rss-types";
import { useRssStore } from "./rss-store";

export function useCachedArticle(id: string | null): Article | null {
  const { articlesCache } = useRssStore();
  return useMemo(() => {
    if (!id) return null;
    for (const list of Object.values(articlesCache)) {
      const found = list.find((a) => a.id === id);
      if (found) return found;
    }
    return null;
  }, [articlesCache, id]);
}

export default function ArticleReader({
  articleId,
  onBack,
  showBack,
}: {
  articleId: string | null;
  onBack?: () => void;
  showBack?: boolean;
}) {
  const cached = useCachedArticle(articleId);
  const { patchCachedArticle, setFeeds } = useRssStore();
  // Keyed by article id so a stale fetch for a previous article can never
  // render under a new id — no reset effect needed.
  const [direct, setDirect] = useState<{ id: string; article: Article } | null>(null);

  // Direct-link / refresh case: article isn't in any cached list yet.
  useEffect(() => {
    if (!articleId || cached) return;
    let cancelled = false;
    api(`/api/rss/articles/${articleId}`)
      .then((full) => {
        if (!cancelled) setDirect({ id: articleId, article: full });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [articleId, cached]);

  const article = cached ?? (direct && direct.id === articleId ? direct.article : null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fetchedFullRef = useRef<Set<string>>(new Set());
  // Keyed by article + URL so a failure hides only the current banner: when
  // the article (or its image) changes the key mismatches and the new figure
  // renders without any reset effect.
  const [brokenBannerKey, setBrokenBannerKey] = useState<string | null>(null);
  const bannerKey = article ? `${article.id}|${article.imageUrl ?? ""}` : null;
  const bannerBroken = bannerKey !== null && brokenBannerKey === bannerKey;

  // Lazily fetch the full body for rows that only carry a snippet.
  // The list endpoint omits `content` (=> undefined) on purpose; the detail
  // endpoint returns `null`/`""` when the article genuinely has no body.
  // Only `undefined` means "not yet fetched" — otherwise an empty body would
  // stay falsy after the patch and re-trigger this effect forever. The ref
  // guards against a second fetch while one is already in flight (any cache
  // patch creates a new `article` object and would re-run the effect).
  useEffect(() => {
    if (!article || article.content !== undefined) return;
    const fetchedIds = fetchedFullRef.current;
    if (fetchedIds.has(article.id)) return;
    const fetchedId = article.id;
    fetchedIds.add(fetchedId);
    let cancelled = false;
    api(`/api/rss/articles/${article.id}`)
      .then((full) => {
        if (cancelled) return;
        if (cached) patchCachedArticle(article.id, full);
        else
          setDirect((prev) =>
            prev && prev.id === article.id
              ? { id: prev.id, article: { ...prev.article, ...full } }
              : prev,
          );
      })
      .catch(() => {
        fetchedIds.delete(fetchedId);
      });
    return () => {
      cancelled = true;
      fetchedIds.delete(fetchedId);
    };
  }, [article, cached, patchCachedArticle]);

  const toggleStar = async () => {
    if (!article) return;
    const next = !article.isStarred;
    if (cached) patchCachedArticle(article.id, { isStarred: next });
    else
      setDirect((prev) =>
        prev && prev.id === article.id
          ? { id: prev.id, article: { ...prev.article, isStarred: next } }
          : prev,
      );
    const request = api(`/api/rss/articles/${article.id}`, {
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
      if (cached) patchCachedArticle(article.id, { isStarred: article.isStarred });
      else
        setDirect((prev) =>
          prev && prev.id === article.id
            ? { id: prev.id, article: { ...prev.article, isStarred: article.isStarred } }
            : prev,
        );
    }
  };

  // Mark read when the reader opens an unread cached row (list already did
  // this optimistically, this is a no-op safety net for direct links).
  useEffect(() => {
    if (!article || article.isRead) return;
    if (cached) patchCachedArticle(article.id, { isRead: true });
    setFeeds((prev) =>
      prev.map((f) =>
        f.id === article.feedId ? { ...f, unreadCount: Math.max(0, (f.unreadCount ?? 1) - 1) } : f,
      ),
    );
    api(`/api/rss/articles/${article.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isRead: true }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per article open
  }, [article?.id]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const contentElement = contentRef.current;

    let frame = 0;
    const updateProgress = () => {
      frame = 0;
      const remaining = scrollElement.scrollHeight - scrollElement.clientHeight;
      const progress = remaining <= 0 ? 1 : scrollElement.scrollTop / remaining;
      scrollElement.style.setProperty("--reading-progress", String(Math.min(1, Math.max(0, progress))));
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    scrollElement.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const resizeObserver = new ResizeObserver(onScroll);
    resizeObserver.observe(contentElement ?? scrollElement);

    return () => {
      scrollElement.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      resizeObserver.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [article?.id]);

  if (!article) {
    return (
      <div className="ambient-wash flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
        <div className="max-w-sm text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-[#0a0a0a]">
            <Newspaper size={24} weight="bold" className="text-white" />
          </span>
          <h2 className="font-editorial mt-5 text-[34px] leading-[.95] tracking-tight">
            Pick something
            <br />
            worth reading.
          </h2>
          <p className="mx-auto mt-2 max-w-70 text-sm leading-relaxed text-[#787774]">
            Your stories collect here. Skim the list, open one, stay a while.
          </p>
          <p className="mt-5 flex items-center justify-center gap-2 font-mono text-[11px] text-[#787774]">
            <kbd>⌘K</kbd> to search
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="article-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
      <div aria-hidden="true" className="reading-progress-track">
        <div className="reading-progress-fill" />
      </div>
      <div ref={contentRef} className="reading-surface w-full min-w-0 px-6 py-14 sm:px-12 sm:py-20">
        {showBack && onBack && (
          <button
            onClick={onBack}
            className="mb-6 text-[13px] text-[#787774] underline decoration-[#EAEAEA] underline-offset-4 md:hidden"
          >
            ← Back to stories
          </button>
        )}
        {article.imageUrl && !bannerBroken && (
          <figure className="article-banner mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element -- feed-supplied remote image */}
            <img
              src={article.imageUrl}
              alt={article.title}
              className="h-full w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => {
                if (bannerKey) setBrokenBannerKey(bannerKey);
              }}
            />
          </figure>
        )}
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#817c73]">
          {article.feedTitle}
        </p>
        <h1 className="font-editorial mt-3 max-w-5xl text-[clamp(2.5rem,5vw,4.8rem)] leading-[.95] tracking-[-0.045em] text-balance">
          {article.title}
        </h1>
        <p className="mt-5 font-mono text-xs text-[#817c73]">
          {article.author ? `${article.author} · ` : ""}
          {article.publishedAt
            ? new Date(article.publishedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : ""}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-2 border-y border-[#ddd8ce] py-4">
          {article.link && (
            <a
              href={article.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[3px] bg-[#fafafa] px-3.5 py-2 text-[13px] font-medium text-black transition hover:bg-[#e5e5e5] active:scale-[0.98]"
            >
              Open original <ArrowSquareOut size={13} weight="bold" />
            </a>
          )}
          <button
            onClick={toggleStar}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-white/15 bg-transparent px-3.5 py-2 text-[13px] transition hover:bg-white/10 active:scale-[0.98]"
          >
            <Star
              size={13}
              weight={article.isStarred ? "fill" : "bold"}
              className={article.isStarred ? "text-white" : ""}
            />
            {article.isStarred ? "Starred" : "Star"}
          </button>
          {article.isStarred && (
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.05em] text-[#e5e5e5]">
              Saved
            </span>
          )}
          <Link
            href={`/article/${article.id}`}
            className="ml-auto text-xs text-[#787774] underline decoration-[#EAEAEA] underline-offset-4 hover:text-white"
          >
            Permalink
          </Link>
        </div>
        <ArticleContent html={article.content ?? article.snippet ?? ""} baseUrl={article.link ?? undefined} />
      </div>
    </div>
  );
}
