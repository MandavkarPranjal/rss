import { eq, sql } from "drizzle-orm";
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
    id: `art_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
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

export async function refreshFeed(feedId: string) {
  const [currentFeed] = await db.select().from(feed).where(eq(feed.id, feedId)).limit(1);
  if (!currentFeed) return null;

  const parsed = await fetchFeed(currentFeed.url);
  const newArticles = await ingestItems(currentFeed.userId, currentFeed.id, parsed.items, true);
  await db
    .update(feed)
    .set({ lastFetchedAt: new Date(), title: parsed.title })
    .where(eq(feed.id, currentFeed.id));

  return { newArticles, title: parsed.title };
}

export async function refreshAllFeeds() {
  const feeds = await db.select({ id: feed.id }).from(feed);
  const results = await Promise.allSettled(feeds.map((currentFeed) => refreshFeed(currentFeed.id)));
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
