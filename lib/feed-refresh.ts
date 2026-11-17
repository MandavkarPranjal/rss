import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { article, feed } from "./db/schema";
import { fetchFeed, type ParsedItem } from "./rss";

async function ingestItems(
  userId: string,
  feedId: string,
  items: ParsedItem[],
) {
  const values = items.slice(0, 100).map((item) => ({
    id: `art_${randomUUID()}`,
    feedId,
    userId,
    guid: item.guid,
    title: item.title,
    link: item.link,
    snippet: item.snippet,
    content: item.content,
    author: item.author,
    imageUrl: item.imageUrl,
    publishedAt: item.publishedAt,
  }));
  if (values.length === 0) return 0;

  const result = await db.insert(article).values(values)
    .onConflictDoNothing({ target: [article.feedId, article.guid] })
    .returning({ id: article.id });
  return result.length;
}

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REFRESH_LEASE_MS = 10 * 60 * 1000;
const MANUAL_REFRESH_COOLDOWN_MS = 60 * 1000;
const MAX_FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1000;

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Feed refresh failed";
  return message.slice(0, 500);
}

type RefreshSkipReason = "in_progress" | "cooldown" | "backoff" | "not_due";

function skipReason(current: typeof feed.$inferSelect, force: boolean, now: Date): RefreshSkipReason | null {
  if (current.refreshLockedUntil && current.refreshLockedUntil > now) return "in_progress";
  const notDue = current.nextFetchAt && current.nextFetchAt > now;
  if (current.lastFetchError != null && notDue) return "backoff";
  if (!force && notDue) return "not_due";
  if (force && current.lastFetchedAt && now.getTime() - current.lastFetchedAt.getTime() < MANUAL_REFRESH_COOLDOWN_MS) return "cooldown";
  return null;
}

export async function refreshFeed(feedId: string, options: { force?: boolean } = {}) {
  const [currentFeed] = await db.select().from(feed).where(eq(feed.id, feedId)).limit(1);
  if (!currentFeed) return null;

  const reason = skipReason(currentFeed, !!options.force, new Date());
  if (reason) return { newArticles: 0, title: currentFeed.title, skipped: true, skipReason: reason };

  // An atomic database lease coordinates cron and manual calls across instances.
  // A killed function leaves a lease that expires instead of a permanent lock.
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + REFRESH_LEASE_MS);
  const [claimed] = await db.update(feed)
    .set({ refreshLockedUntil: lockedUntil })
    .where(and(
      eq(feed.id, feedId),
      or(isNull(feed.refreshLockedUntil), lte(feed.refreshLockedUntil, now)),
      options.force
        ? and(
            or(isNull(feed.lastFetchedAt), lte(feed.lastFetchedAt, new Date(now.getTime() - MANUAL_REFRESH_COOLDOWN_MS))),
            or(isNull(feed.lastFetchError), isNull(feed.nextFetchAt), lte(feed.nextFetchAt, now)),
          )
        : or(isNull(feed.nextFetchAt), lte(feed.nextFetchAt, now)),
    ))
    .returning();
  if (!claimed) {
    // The winner may already have completed; classify the current database state.
    const [latest] = await db.select().from(feed).where(eq(feed.id, feedId)).limit(1);
    if (!latest) return null;
    return { newArticles: 0, title: latest.title, skipped: true, skipReason: skipReason(latest, !!options.force, new Date()) ?? "cooldown" };
  }
  const ownsLease = and(eq(feed.id, feedId), eq(feed.refreshLockedUntil, lockedUntil));

  try {
    const parsed = await fetchFeed(claimed.url, {
      etag: claimed.etag,
      lastModified: claimed.lastModified,
      existingGuids: async (guids) => {
        if (guids.length === 0) return new Set<string>();
        const rows = await db.select({ guid: article.guid }).from(article)
          .where(and(eq(article.feedId, feedId), inArray(article.guid, guids)));
        return new Set(rows.map(({ guid }) => guid));
      },
    });
    const newArticles = parsed.notModified ? 0 : await ingestItems(claimed.userId, feedId, parsed.items);
    await db
      .update(feed)
      .set({
        lastFetchedAt: new Date(),
        lastFetchError: null,
        fetchFailureCount: 0,
        nextFetchAt: new Date(Date.now() + REFRESH_INTERVAL_MS),
        refreshLockedUntil: null,
        // A 304 may omit validators; a fresh 200 replaces (or clears) them.
        etag: parsed.notModified ? parsed.etag ?? claimed.etag : parsed.etag,
        lastModified: parsed.notModified ? parsed.lastModified ?? claimed.lastModified : parsed.lastModified,
        ...(!parsed.notModified ? {
          title: parsed.title,
          siteUrl: parsed.siteUrl,
          description: parsed.description,
        } : {}),
      })
      .where(ownsLease);

    return { newArticles, title: parsed.notModified ? claimed.title : parsed.title, skipped: false };
  } catch (error) {
    const failureCount = claimed.fetchFailureCount + 1;
    const backoff = Math.min(
      REFRESH_INTERVAL_MS * 2 ** Math.min(failureCount - 1, 5),
      MAX_FAILURE_BACKOFF_MS,
    );
    await db
      .update(feed)
      .set({
        refreshLockedUntil: null,
        lastFetchError: errorMessage(error),
        fetchFailureCount: failureCount,
        nextFetchAt: new Date(Date.now() + backoff),
      })
      .where(ownsLease);
    throw error;
  }
}

export async function refreshAllFeeds() {
  const now = new Date();
  const feeds = await db
    .select({ id: feed.id })
    .from(feed)
    .where(or(isNull(feed.nextFetchAt), lte(feed.nextFetchAt, now)));
  const results: PromiseSettledResult<Awaited<ReturnType<typeof refreshFeed>>>[] = [];
  const concurrency = 4;
  for (let start = 0; start < feeds.length; start += concurrency) {
    const batch = feeds.slice(start, start + concurrency);
    results.push(...(await Promise.allSettled(batch.map(({ id }) => refreshFeed(id)))));
  }
  return {
    feeds: feeds.length,
    refreshed: results.filter((result) => result.status === "fulfilled" && result.value && !result.value.skipped).length,
    skipped: results.filter((result) => result.status === "fulfilled" && result.value?.skipped).length,
    failed: results.filter((result) => result.status === "rejected").length,
    newArticles: results.reduce(
      (total, result) => total + (result.status === "fulfilled" ? result.value?.newArticles ?? 0 : 0),
      0,
    ),
  };
}
