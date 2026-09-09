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
  setFeedsError: React.Dispatch<React.SetStateAction<string>>;
  articlesCache: Record<string, Article[]>;
  setArticlesCache: React.Dispatch<React.SetStateAction<Record<string, Article[]>>>;
  articlesError: Record<string, string>;
  setArticlesError: React.Dispatch<React.SetStateAction<Record<string, string>>>;
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
const EMPTY_FEEDS: Feed[] = [];
const EMPTY_ARTICLES_CACHE: Record<string, Article[]> = {};
const EMPTY_ARTICLES_ERROR: Record<string, string> = {};
const EMPTY_SEEN_IDS = new Set<string>();

export function RssStoreProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const sessionUserId = session?.user?.id ?? null;

  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [feedsError, setFeedsError] = useState("");
  const [articlesCache, setArticlesCache] = useState<Record<string, Article[]>>({});
  const [articlesError, setArticlesError] = useState<Record<string, string>>({});
  const [revalidateTick, setRevalidateTick] = useState(0);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const fetchedTickRef = useRef<Record<string, number>>({});
  const inFlightRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  // Current account id for stale-response guards. Updated in the
  // sessionUserId effect below so fetch callbacks can tell whether the
  // account changed while a request was in flight.
  const userIdRef = useRef<string | null>(null);

  const loadFeeds = useCallback(() => {
    const userId = userIdRef.current;
    api("/api/rss/feeds")
      .then((data) => {
        // The account may have changed while the request was in flight;
        // never let the previous account's response overwrite the new list.
        if (userIdRef.current !== userId) return;
        setFeeds(data);
        setFeedsError("");
      })
      .catch((e) => {
        if (userIdRef.current !== userId) return;
        setFeedsError(e instanceof Error ? e.message : "Failed to load feeds");
      });
  }, []);

  useEffect(() => {
    if (userIdRef.current === sessionUserId) return;
    userIdRef.current = sessionUserId;
    setActiveUserId(sessionUserId);
    // The account changed (including sign-out) while the provider stayed
    // mounted: drop all user-scoped state so the next account never sees the
    // previous account's feeds or articles. Bumping revalidateTick forces the
    // article views to refetch under the new session after the cache wipe
    // instead of sticking on a loading skeleton.
    setFeeds([]);
    setFeedsError("");
    setArticlesCache({});
    setArticlesError({});
    setSeenIds(new Set());
    fetchedTickRef.current = {};
    inFlightRef.current.clear();
    setRevalidateTick((t) => t + 1);
    if (sessionUserId) loadFeeds();
  }, [sessionUserId, loadFeeds]);

  // The session can change during a render, before the reset effect above has
  // run. Do not expose the previous account's user-scoped data during that
  // transition.
  const storeReady = activeUserId === sessionUserId;
  const visibleFeeds = storeReady ? feeds : EMPTY_FEEDS;
  const visibleFeedsError = storeReady ? feedsError : "";
  const visibleArticlesCache = storeReady ? articlesCache : EMPTY_ARTICLES_CACHE;
  const visibleArticlesError = storeReady ? articlesError : EMPTY_ARTICLES_ERROR;
  const visibleSeenIds = storeReady ? seenIds : EMPTY_SEEN_IDS;

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
    setArticlesError({});
    fetchedTickRef.current = {};
    inFlightRef.current.clear();
    // The `useArticles` fetch effect doesn't depend on the cache contents, so
    // wiping it alone would leave the current view stuck on its loading
    // skeleton (articlesCache[key] === undefined) with nothing re-triggering
    // the fetch. Bumping the tick forces a refetch; the effect cleanup also
    // cancels the orphaned run so a stale flight can't repopulate the cache.
    setRevalidateTick((t) => t + 1);
  }, []);

  const revalidateCurrent = useCallback(() => setRevalidateTick((t) => t + 1), []);

  const totalUnread = useMemo(
    () => visibleFeeds.reduce((n, f) => n + (f.unreadCount ?? 0), 0),
    [visibleFeeds],
  );

  const value = useMemo<RssStore>(
    () => ({
      feeds: visibleFeeds,
      setFeeds,
      totalUnread,
      loadFeeds,
      feedsError: visibleFeedsError,
      setFeedsError,
      articlesCache: visibleArticlesCache,
      setArticlesCache,
      patchCachedArticle,
      articlesError: visibleArticlesError,
      setArticlesError,
      invalidateArticlesCache,
      revalidateTick,
      revalidateCurrent,
      fetchedTickRef,
      inFlightRef,
      seenIds: visibleSeenIds,
      markSeen,
      sessionUserId,
      authPending: isPending,
    }),
    [
      visibleFeeds,
      totalUnread,
      loadFeeds,
      visibleFeedsError,
      visibleArticlesCache,
      patchCachedArticle,
      visibleArticlesError,
      invalidateArticlesCache,
      revalidateTick,
      revalidateCurrent,
      visibleSeenIds,
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
