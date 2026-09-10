import { eq, isNull, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { article, feed } from "./db/schema";
import { fetchFeed } from "./rss";

async function ingestItems(
  userId: string,
  feedId: string,
  items: Awaited<ReturnType<typeof fetchFeed>>["items"],
  updateExistingContent = false,
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

  const query = db.insert(article).values(values);
  const result = updateExistingContent
    ? await query
        .onConflictDoUpdate({
          target: [article.feedId, article.guid],
          set: {
            content: sql`CASE
              WHEN length(coalesce(excluded.content, '')) > length(coalesce(${article.content}, ''))
                OR (
                  strpos(coalesce(excluded.content, ''), '<pre') > 0
                  AND (
                    strpos(coalesce(${article.content}, ''), '<pre') = 0
                    OR strpos(excluded.content, '<pre') < strpos(${article.content}, '<pre')
                  )
                )
                OR (
                  strpos(coalesce(${article.content}, ''), 'Loading the player') > 0
                  AND strpos(coalesce(excluded.content, ''), 'content.jwplatform.com/players/') > 0
                )
              THEN excluded.content
              ELSE ${article.content}
            END`,
            imageUrl: sql`coalesce(excluded.image_url, ${article.imageUrl})`,
          },
        })
        .returning({ id: article.id })
    : await query
        .onConflictDoNothing({ target: [article.feedId, article.guid] })
        .returning({ id: article.id });
  return result.length;
}

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1000;

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Feed refresh failed";
  return message.slice(0, 500);
}

export async function refreshFeed(feedId: string, options: { force?: boolean } = {}) {
  const [currentFeed] = await db.select().from(feed).where(eq(feed.id, feedId)).limit(1);
  if (!currentFeed) return null;

  if (!options.force && currentFeed.nextFetchAt && currentFeed.nextFetchAt > new Date()) {
    return { newArticles: 0, title: currentFeed.title, skipped: true };
  }

  try {
    const parsed = await fetchFeed(currentFeed.url);
    const newArticles = await ingestItems(currentFeed.userId, currentFeed.id, parsed.items, true);
    await db
      .update(feed)
      .set({
        lastFetchedAt: new Date(),
        lastFetchError: null,
        fetchFailureCount: 0,
        nextFetchAt: new Date(Date.now() + REFRESH_INTERVAL_MS),
        title: parsed.title,
        siteUrl: parsed.siteUrl,
        description: parsed.description,
      })
      .where(eq(feed.id, currentFeed.id));

    return { newArticles, title: parsed.title, skipped: false };
  } catch (error) {
    const failureCount = currentFeed.fetchFailureCount + 1;
    const backoff = Math.min(
      REFRESH_INTERVAL_MS * 2 ** Math.min(failureCount - 1, 5),
      MAX_FAILURE_BACKOFF_MS,
    );
    await db
      .update(feed)
      .set({
        lastFetchError: errorMessage(error),
        fetchFailureCount: failureCount,
        nextFetchAt: new Date(Date.now() + backoff),
      })
      .where(eq(feed.id, currentFeed.id));
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
    refreshed: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
    newArticles: results.reduce(
      (total, result) => total + (result.status === "fulfilled" ? result.value?.newArticles ?? 0 : 0),
      0,
    ),
  };
}
