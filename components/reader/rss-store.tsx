"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/rss-client";
import type { Article, Feed } from "@/lib/rss-types";

type RssStore = {
  feeds: Feed[];
  setFeeds: React.Dispatch<React.SetStateAction<Feed[]>>;
  totalUnread: number;
  loadFeeds: () => void;
  feedsError: string;
  setFeedsError: (msg: string) => void;
  articlesCache: Record<string, Article[]>;
  setArticlesCache: React.Dispatch<React.SetStateAction<Record<string, Article[]>>>;
  patchCachedArticle: (id: string, patch: Partial<Article>) => void;
  invalidateArticlesCache: () => void;
  revalidateTick: number;
  revalidateCurrent: () => void;
  fetchedTickRef: React.RefObject<Record<string, number>>;
  inFlightRef: React.RefObject<Map<string, Promise<unknown>>>;
  seenIds: Set<string>;
  markSeen: (rows: Article[]) => void;
  sessionUserId: string | null;
  authPending: boolean;
};

const RssContext = createContext<RssStore | null>(null);

export function RssStoreProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const sessionUserId = session?.user?.id ?? null;

  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [feedsError, setFeedsError] = useState("");
  const [articlesCache, setArticlesCache] = useState<Record<string, Article[]>>({});
  const [revalidateTick, setRevalidateTick] = useState(0);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const fetchedTickRef = useRef<Record<string, number>>({});
  const inFlightRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const articlesCacheRef = useRef(articlesCache);
  // Current account id for stale-response guards. Updated in the
  // sessionUserId effect below so fetch callbacks can tell whether the
  // account changed while a request was in flight.
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    articlesCacheRef.current = articlesCache;
  }, [articlesCache]);

  const loadFeeds = useCallback(() => {
    const userId = userIdRef.current;
    api("/api/rss/feeds")
      .then((data) => {
        // The account may have changed while the request was in flight;
        // never let the previous account's response overwrite the new list.
        if (userIdRef.current !== userId) return;
        setFeeds(data);
      })
      .catch((e) => {
        if (userIdRef.current !== userId) return;
        setFeedsError(e instanceof Error ? e.message : "Failed to load feeds");
      });
  }, []);

  useEffect(() => {
    if (userIdRef.current === sessionUserId) return;
    userIdRef.current = sessionUserId;
    // The account changed (including sign-out) while the provider stayed
    // mounted: drop all user-scoped state so the next account never sees the
    // previous account's feeds or articles. Bumping revalidateTick forces the
    // article views to refetch under the new session after the cache wipe
    // instead of sticking on a loading skeleton.
    setFeeds([]);
    setFeedsError("");
    setArticlesCache({});
    setSeenIds(new Set());
    fetchedTickRef.current = {};
    inFlightRef.current.clear();
    setRevalidateTick((t) => t + 1);
    if (sessionUserId) loadFeeds();
  }, [sessionUserId, loadFeeds]);

  // Keep the cache ref mirror for fetch callbacks (no cascading renders).

  const markSeen = useCallback((rows: Article[]) => {
    setSeenIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const a of rows) {
        if (!next.has(a.id)) {
          next.add(a.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const patchCachedArticle = useCallback((id: string, patch: Partial<Article>) => {
    setArticlesCache((prev) => {
      let changed = false;
      const next: Record<string, Article[]> = {};
      for (const [k, list] of Object.entries(prev)) {
        if (!list.some((x) => x.id === id)) {
          next[k] = list;
          continue;
        }
        changed = true;
        next[k] = list.map((x) => (x.id === id ? { ...x, ...patch } : x));
      }
      return changed ? next : prev;
    });
  }, []);

  const invalidateArticlesCache = useCallback(() => {
    setArticlesCache({});
    fetchedTickRef.current = {};
    inFlightRef.current.clear();
  }, []);

  const revalidateCurrent = useCallback(() => setRevalidateTick((t) => t + 1), []);

  const totalUnread = useMemo(
    () => feeds.reduce((n, f) => n + (f.unreadCount ?? 0), 0),
    [feeds],
  );

  const value = useMemo<RssStore>(
    () => ({
      feeds,
      setFeeds,
      totalUnread,
      loadFeeds,
      feedsError,
      setFeedsError,
      articlesCache,
      setArticlesCache,
      patchCachedArticle,
      invalidateArticlesCache,
      revalidateTick,
      revalidateCurrent,
      fetchedTickRef,
      inFlightRef,
      seenIds,
      markSeen,
      sessionUserId,
      authPending: isPending,
    }),
    [
      feeds,
      totalUnread,
      loadFeeds,
      feedsError,
      articlesCache,
      patchCachedArticle,
      invalidateArticlesCache,
      revalidateTick,
      revalidateCurrent,
      seenIds,
      markSeen,
      sessionUserId,
      isPending,
    ],
  );

  return <RssContext.Provider value={value}>{children}</RssContext.Provider>;
}

export function useRssStore() {
  const ctx = useContext(RssContext);
  if (!ctx) throw new Error("useRssStore must be used within RssStoreProvider");
  return ctx;
}
