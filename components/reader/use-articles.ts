"use client";

import { useCallback, useEffect, useMemo } from "react";
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
    articlesError,
    setArticlesError,
    fetchedTickRef,
    inFlightRef,
    revalidateTick,
    revalidateCurrent,
    markSeen,
    sessionUserId,
    setFeedsError,
  } = useRssStore();

  const key = articlesKey(feedId, filter, query);
  const articles: Article[] = useMemo(
    () => articlesCache[key] ?? [],
    [articlesCache, key],
  );
  const error = articlesError[key] ?? "";
  // A rejected initial request leaves the cache entry undefined, so without
  // the settled-error check this would stay true (indefinite skeleton)
  // alongside the error banner.
  const loading = !!sessionUserId && articlesCache[key] === undefined && !error;

  // Retry path for a failed initial load: drop the settled error so the
  // skeleton returns, then bump the tick so the effect below refetches.
  const retry = useCallback(() => {
    setArticlesError((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    revalidateCurrent();
  }, [key, revalidateCurrent, setArticlesError]);

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
    // `fetchedTickRef` means "data for this tick landed": mark it only on
    // success. Pre-marking here let a failed revalidation look fetched, so
    // the guard above skipped every later run and stale data stuck around
    // with no error. In-flight dedup across StrictMode remounts is already
    // handled by `inFlightRef` below.
    // The banner message this run may need to clear on success, if it is
    // still showing our own earlier per-key failure.
    const failedMessage = articlesError[key];
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
        fetchedTickRef.current[key] = revalidateTick;
        setArticlesError((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        // Drop the global banner only when it is still showing our own
        // failure — never a newer, unrelated error (e.g. feeds load).
        if (failedMessage) {
          setFeedsError((prev) => (prev === failedMessage ? "" : prev));
        }
      },
      (e) => {
        if (cancelled) return;
        // Surface revalidation failures too: with a populated cache the old
        // code swallowed the error (no banner) while the pre-marked tick
        // made the guard treat the failed fetch as done, pinning stale data
        // with no retry. The tick stays unmarked so the next revalidate (or
        // any dep change/remount) refetches, and the per-key error lets the
        // next success clear the banner via `failedMessage`.
        const message = e instanceof Error ? e.message : "Failed to load articles";
        setArticlesError((prev) => (prev[key] === message ? prev : { ...prev, [key]: message }));
        setFeedsError(message);
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

  return { articles, loading, error, cacheKey: key, retry };
}
