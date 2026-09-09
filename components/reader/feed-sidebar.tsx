"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { Checks, Plus, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/rss-client";
import type { RssFilter } from "@/lib/rss-types";
import { useRssStore } from "./rss-store";
import { useSearchQuery } from "./use-articles";

const FILTERS: RssFilter[] = ["all", "unread", "starred"];

function filterHref(f: RssFilter, query: string) {
  return query ? `/${f}?q=${encodeURIComponent(query)}` : `/${f}`;
}

export default function FeedSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const {
    feeds,
    totalUnread,
    loadFeeds,
    invalidateArticlesCache,
    revalidateCurrent,
    setFeeds,
    setFeedsError,
  } = useRssStore();
  const [query] = useSearchQuery();
  const [newUrl, setNewUrl] = useState("");
  const [loading, setLoading] = useState(false);

  // Active scope derived from the route: /feed/[id] or /<filter>.
  const feedMatch = pathname.match(/^\/feed\/([^/]+)/);
  const activeFeedId = feedMatch?.[1] ?? null;
  const activeTopFilter: RssFilter | null = pathname.startsWith("/starred")
    ? "starred"
    : pathname.startsWith("/all")
      ? "all"
      : pathname.startsWith("/unread")
        ? "unread"
        : null;

  // Feed pages keep their filter in ?filter= (nuqs); top-level pages use the route.
  const [feedFilter, setFeedFilter] = useQueryState(
    "filter",
    parseAsStringEnum<RssFilter>(FILTERS).withDefault("unread"),
  );
  const effectiveFilter: RssFilter = activeFeedId ? feedFilter : (activeTopFilter ?? "unread");

  const addFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    setLoading(true);
    setFeedsError("");
    try {
      await api("/api/rss/feeds", { method: "POST", body: JSON.stringify({ url: newUrl }) });
      setNewUrl("");
      invalidateArticlesCache();
      loadFeeds();
      revalidateCurrent();
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Failed to add feed");
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async (feedId: string | null) => {
    setFeeds((prev) =>
      prev.map((f) => (!feedId || f.id === feedId ? { ...f, unreadCount: 0 } : f)),
    );
    try {
      await api("/api/rss/articles/mark-all-read", {
        method: "POST",
        body: JSON.stringify(feedId ? { feedId } : {}),
      });
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Failed to mark all read");
    }
    revalidateCurrent();
    loadFeeds();
  };

  const refreshFeed = async (feedId: string) => {
    setLoading(true);
    try {
      await api(`/api/rss/feeds/${feedId}/refresh`, { method: "POST" });
      invalidateArticlesCache();
      revalidateCurrent();
      loadFeeds();
    } catch (e) {
      setFeedsError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  };

  const removeFeed = async (feedId: string) => {
    if (!confirm("Remove this feed and its articles?")) return;
    await api(`/api/rss/feeds/${feedId}`, { method: "DELETE" });
    invalidateArticlesCache();
    loadFeeds();
  };

  const activeFeed = feeds.find((f) => f.id === activeFeedId) ?? null;

  return (
    <div className="flex h-full flex-col">
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
          {FILTERS.map((f) =>
            activeFeedId ? (
              <button
                key={f}
                role="tab"
                aria-selected={effectiveFilter === f}
                onClick={() => setFeedFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] transition active:scale-[0.98] ${
                  effectiveFilter === f
                    ? "bg-[#111111] text-white dark:bg-[#ECECEA] dark:text-[#191918]"
                    : "border border-[#EAEAEA] bg-white text-[#787774] hover:text-[#111111] dark:border-white/10 dark:bg-transparent dark:hover:text-white"
                }`}
              >
                {f}
              </button>
            ) : (
              <Link
                key={f}
                href={filterHref(f, query)}
                role="tab"
                aria-selected={effectiveFilter === f}
                onClick={onNavigate}
                className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] transition active:scale-[0.98] ${
                  effectiveFilter === f
                    ? "bg-[#111111] text-white dark:bg-[#ECECEA] dark:text-[#191918]"
                    : "border border-[#EAEAEA] bg-white text-[#787774] hover:text-[#111111] dark:border-white/10 dark:bg-transparent dark:hover:text-white"
                }`}
              >
                {f}
              </Link>
            ),
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <Link
          href={filterHref(effectiveFilter, query)}
          onClick={onNavigate}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
            activeFeedId === null
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
        </Link>
        {feeds.map((f) => {
          const active = activeFeedId === f.id;
          const href = query
            ? `/feed/${f.id}?filter=${effectiveFilter}&q=${encodeURIComponent(query)}`
            : `/feed/${f.id}?filter=${effectiveFilter}`;
          return (
            <Link
              key={f.id}
              href={href}
              onClick={onNavigate}
              className={`mt-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                active
                  ? "border border-[#EAEAEA] bg-white font-medium dark:border-white/10 dark:bg-[#201F1E]"
                  : "border border-transparent hover:bg-white/70 dark:hover:bg-white/5"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${f.unreadCount > 0 ? "bg-[#1F6C9F]" : "bg-[#EAEAEA] dark:bg-white/15"}`}
              />
              <span className="min-w-0 flex-1 truncate">{f.title}</span>
              {f.unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-[#FBF3DB] px-2 py-0.5 font-mono text-[11px] text-[#956400] dark:bg-[#956400]/25 dark:text-[#E8C26A]">
                  {f.unreadCount}
                </span>
              )}
            </Link>
          );
        })}
        {feeds.length === 0 && (
          <div className="rounded-lg border border-[#EAEAEA] bg-white p-4 text-[13px] text-[#787774] dark:border-white/10 dark:bg-[#201F1E]">
            No feeds yet. Add your first feed above to start a quiet reading list.
          </div>
        )}
      </div>

      {activeFeedId && activeFeed && (
        <div className="border-t border-[#EAEAEA] p-3 dark:border-white/10">
          <p className="mb-2 truncate px-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[#787774]">
            {activeFeed.title}
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => refreshFeed(activeFeedId)}
              className="flex-1 rounded-[6px] border border-[#EAEAEA] bg-white px-2 py-1.5 text-xs transition hover:bg-[#FBFBFA] active:scale-[0.98] dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5"
            >
              Refresh
            </button>
            <button
              onClick={() => markAllRead(activeFeedId)}
              title="Mark all read"
              className="flex flex-1 items-center justify-center gap-1 rounded-[6px] border border-[#EAEAEA] bg-white px-2 py-1.5 text-xs transition hover:bg-[#FBFBFA] active:scale-[0.98] dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5"
            >
              <Checks size={13} weight="bold" /> Read
            </button>
            <button
              onClick={() => removeFeed(activeFeedId)}
              title="Remove feed"
              className="inline-flex items-center gap-1 rounded-[6px] border border-[#FDEBEC] bg-[#FDEBEC] px-2 py-1.5 text-xs text-[#9F2F2D] transition hover:brightness-95 active:scale-[0.98] dark:border-transparent dark:bg-[#9F2F2D]/20 dark:text-[#F3B8B6]"
            >
              <Trash size={13} weight="bold" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
