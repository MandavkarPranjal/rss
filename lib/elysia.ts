import { Elysia, t } from "elysia";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { article, feed } from "./db/schema";
import { fetchFeed } from "./rss";

async function requireUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return session.user;
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function ingestItems(
  userId: string,
  feedId: string,
  items: Awaited<ReturnType<typeof fetchFeed>>["items"],
) {
  let inserted = 0;
  for (const item of items.slice(0, 100)) {
    // Skip if guid already exists for this feed
    const existing = await db
      .select({ id: article.id })
      .from(article)
      .where(and(eq(article.feedId, feedId), eq(article.guid, item.guid)))
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(article).values({
      id: newId("art"),
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
    });
    inserted++;
  }
  return inserted;
}

export const rssApi = new Elysia({ prefix: "/api/rss" })
  .onError(({ error }) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[rssApi]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  })

  // ---- Feeds ----
  .get("/feeds", async ({ request }) => {
    const user = await requireUser(request);
    const feeds = await db
      .select()
      .from(feed)
      .where(eq(feed.userId, user.id))
      .orderBy(desc(feed.createdAt));
    const withCounts = await Promise.all(
      feeds.map(async (f) => {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(article)
          .where(and(eq(article.feedId, f.id), eq(article.isRead, false)));
        return { ...f, unreadCount: count };
      }),
    );
    return withCounts;
  })

  .post(
    "/feeds",
    async ({ request, body }) => {
      const user = await requireUser(request);
      const parsed = await fetchFeed(body.url);
      const feedId = newId("feed");
      await db.insert(feed).values({
        id: feedId,
        userId: user.id,
        url: body.url.trim(),
        title: parsed.title,
        siteUrl: parsed.siteUrl,
        description: parsed.description,
        lastFetchedAt: new Date(),
      });
      const inserted = await ingestItems(user.id, feedId, parsed.items);
      return { id: feedId, title: parsed.title, articlesImported: inserted };
    },
    { body: t.Object({ url: t.String({ minLength: 4, maxLength: 2000 }) }) },
  )

  .delete("/feeds/:id", async ({ request, params }) => {
    const user = await requireUser(request);
    await db.delete(article).where(and(eq(article.feedId, params.id), eq(article.userId, user.id)));
    const deleted = await db
      .delete(feed)
      .where(and(eq(feed.id, params.id), eq(feed.userId, user.id)))
      .returning({ id: feed.id });
    return { deleted: deleted.length > 0 };
  })

  .post("/feeds/:id/refresh", async ({ request, params }) => {
    const user = await requireUser(request);
    const [f] = await db
      .select()
      .from(feed)
      .where(and(eq(feed.id, params.id), eq(feed.userId, user.id)))
      .limit(1);
    if (!f) return Response.json({ error: "Feed not found" }, { status: 404 });
    const parsed = await fetchFeed(f.url);
    const inserted = await ingestItems(user.id, f.id, parsed.items);
    await db
      .update(feed)
      .set({ lastFetchedAt: new Date(), title: parsed.title })
      .where(eq(feed.id, f.id));
    return { refreshed: true, newArticles: inserted };
  })

  // ---- Articles ----
  .get("/articles", async ({ request, query }) => {
    const user = await requireUser(request);
    const limit = Math.min(Number(query.limit ?? 50), 100);
    const offset = Number(query.offset ?? 0);
    const conditions = [eq(article.userId, user.id)];
    if (query.feedId) conditions.push(eq(article.feedId, query.feedId));
    if (query.filter === "unread") conditions.push(eq(article.isRead, false));
    if (query.filter === "starred") conditions.push(eq(article.isStarred, true));
    if (query.q) {
      const like = `%${query.q}%`;
      conditions.push(or(ilike(article.title, like), ilike(article.snippet, like))!);
    }
    const rows = await db
      .select({
        id: article.id,
        feedId: article.feedId,
        guid: article.guid,
        title: article.title,
        link: article.link,
        snippet: article.snippet,
        content: article.content,
        author: article.author,
        imageUrl: article.imageUrl,
        publishedAt: article.publishedAt,
        isRead: article.isRead,
        isStarred: article.isStarred,
        createdAt: article.createdAt,
        feedTitle: feed.title,
      })
      .from(article)
      .leftJoin(feed, eq(article.feedId, feed.id))
      .where(and(...conditions))
      .orderBy(desc(article.publishedAt), desc(article.createdAt))
      .limit(limit)
      .offset(offset);
    return rows;
  })

  .patch(
    "/articles/:id",
    async ({ request, params, body }) => {
      const user = await requireUser(request);
      const [updated] = await db
        .update(article)
        .set({ ...(body.isRead !== undefined ? { isRead: body.isRead } : {}), ...(body.isStarred !== undefined ? { isStarred: body.isStarred } : {}) })
        .where(and(eq(article.id, params.id), eq(article.userId, user.id)))
        .returning({ id: article.id, isRead: article.isRead, isStarred: article.isStarred });
      if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
      return updated;
    },
    {
      body: t.Object({
        isRead: t.Optional(t.Boolean()),
        isStarred: t.Optional(t.Boolean()),
      }),
    },
  )

  .post(
    "/articles/mark-all-read",
    async ({ request, body }) => {
      const user = await requireUser(request);
      const conditions = [eq(article.userId, user.id), eq(article.isRead, false)];
      if (body.feedId) conditions.push(eq(article.feedId, body.feedId));
      await db.update(article).set({ isRead: true }).where(and(...conditions));
      return { ok: true };
    },
    { body: t.Object({ feedId: t.Optional(t.String()) }) },
  );

export type RssApi = typeof rssApi;
