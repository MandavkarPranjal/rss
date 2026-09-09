"use client";

import { useEffect, useMemo } from "react";
import { parseAsString, useQueryState } from "nuqs";
import { api } from "@/lib/rss-client";
import type { Article, RssFilter } from "@/lib/rss-types";
import { useRssStore } from "./rss-store";

/** nuqs-backed search query (?q=), debounced at the caller. */
export function useSearchQuery() {
  return useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({ history: "replace", throttleMs: 350 }),
  );
}

/** nuqs-backed selected article (?article=). Cleared on filter/feed change by caller. */
export function useSelectedArticleId() {
  return useQueryState(
    "article",
    parseAsString.withOptions({ history: "replace" }),
  );
}

export function articlesKey(feedId: string | null, filter: RssFilter, query: string) {
  return `${feedId ?? "all"}|${filter}|${query}`;
}

export function useArticles(feedId: string | null, filter: RssFilter, query: string) {
  const {
    articlesCache,
    setArticlesCache,
    fetchedTickRef,
    inFlightRef,
    revalidateTick,
    markSeen,
    sessionUserId,
    setFeedsError,
  } = useRssStore();

  const key = articlesKey(feedId, filter, query);
  const articles: Article[] = useMemo(
    () => articlesCache[key] ?? [],
    [articlesCache, key],
  );
  const loading = !!sessionUserId && articlesCache[key] === undefined;

  useEffect(() => {
    if (!sessionUserId) return;
    if (
      articlesCache[key] !== undefined &&
      fetchedTickRef.current[key] === revalidateTick
    ) {
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ filter, limit: "100" });
    if (feedId) params.set("feedId", feedId);
    if (query) params.set("q", query);
    fetchedTickRef.current[key] = revalidateTick;
    // Share one promise per key across effect runs: React StrictMode mounts,
    // runs cleanup, and re-runs effects, so a boolean in-flight guard would
    // cancel the first run's write while the second run skips fetching
    // entirely (infinite skeleton). Every run subscribes with its own
    // `cancelled` flag; the surviving run lands the data.
    let flight = inFlightRef.current.get(key);
    if (!flight) {
      flight = api(`/api/rss/articles?${params}`);
      inFlightRef.current.set(key, flight);
    }
    flight.then(
      (data) => {
        if (cancelled) return;
        const rows = data as Article[];
        markSeen(rows);
        setArticlesCache((prev) => ({ ...prev, [key]: rows }));
      },
      (e) => {
        if (cancelled) return;
        if (articlesCache[key] === undefined) {
          setFeedsError(e instanceof Error ? e.message : "Failed to load articles");
        }
      },
    ).finally(() => {
      // Settle-based cleanup only: the StrictMode remount cleanup must not
      // remove the shared promise before the second run subscribes.
      if (inFlightRef.current.get(key) === flight) inFlightRef.current.delete(key);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed fetch, refs are stable
  }, [sessionUserId, feedId, filter, query, revalidateTick]);

  return { articles, loading, cacheKey: key };
}
