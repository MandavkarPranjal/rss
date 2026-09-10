import { Elysia, t } from "elysia";
import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { encodeHTML } from "entities";
import { auth } from "./auth";
import { db } from "./db";
import { article, feed } from "./db/schema";
import { decodeEntities, decodeHtmlTextNodes } from "./decode-entities";
import { fetchFeed, normalizeFeedUrl } from "./rss";
import { refreshFeed } from "./feed-refresh";

async function requireUser(request: Request) {
  // GETs use the 5-minute signed cookie cache (see auth.ts); mutations bypass
  // it so a session revoked elsewhere can't keep writing for up to 5 minutes.
  const authoritative = request.method !== "GET";
  const session = await auth.api.getSession({
    headers: request.headers,
    ...(authoritative ? { query: { disableCookieCache: true } } : {}),
  });
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return session.user;
}

/**
 * `entities` prefers terse WHATWG aliases (`&rsquor;`, `&mldr;`, ...) that
 * feeds rarely emit — feed markup overwhelmingly uses the classic names
 * (`&rsquo;`, `&hellip;`, ...). Rewrite the aliases so the named variant below
 * matches real legacy storage.
 */
const CLASSIC_ENTITY_NAMES: Record<string, string> = {
  "&rsquor;": "&rsquo;",
  "&rdquor;": "&rdquo;",
  "&ldquor;": "&bdquo;",
  "&ddagger;": "&Dagger;",
  "&bullet;": "&bull;",
  "&mldr;": "&hellip;",
};

function classicEntityNames(encoded: string): string {
  return encoded.replace(
    /&(rsquor|rdquor|ldquor|ddagger|bullet|mldr);/g,
    (match) => CLASSIC_ENTITY_NAMES[match] ?? match,
  );
}

/**
 * ASCII characters feeds commonly entity-encode (`&amp;`, `&lt;`, `&#39;`,
 * ...). The numeric variants below encode these instead of preserving them,
 * so searching displayed text also matches legacy numeric storage.
 */
const ENTITY_SENSITIVE_ASCII = new Set(["&", "<", ">", '"', "'"]);

function numericEntityVariant(value: string, radix: 10 | 16): string {
  return Array.from(value, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    if (ENTITY_SENSITIVE_ASCII.has(ch) || code < 0x20 || code > 0x7e) {
      return radix === 10 ? `&#${code};` : `&#x${code.toString(16)};`;
    }
    return ch;
  }).join("");
}

/**
 * Legacy rows ingested before entity-decoding store raw entities
 * (`It&#8217;s`) while reads display decoded text (`It's`). Searching the
 * displayed text would miss those rows, so match the query in every plausible
 * stored spelling: as typed, decoded, entity-named (both `entities` and
 * classic spellings), decimal numeric, and hex numeric — plus the
 * double-encoded (`&amp;`-escaped) form of each for rows stored with two
 * layers. Each variant encodes the whole query at once, so multi-entity
 * queries (e.g. `&` plus `’`) match too. Plain-ASCII queries dedupe to the
 * original single predicate.
 */
function encodedQueryVariants(query: string): string[] {
  const decoded = decodeEntities(query);
  const named = encodeHTML(decoded);
  const decimal = numericEntityVariant(decoded, 10);
  const hex = numericEntityVariant(decoded, 16);
  const base = [...new Set([query, decoded, named, classicEntityNames(named), decimal, hex])];
  return [...new Set([...base, ...base.map((variant) => variant.replace(/&/g, "&amp;"))])];
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
    // Single GROUP BY instead of one count query per feed (N+1).
    const counts = await db
      .select({ feedId: article.feedId, count: sql<number>`count(*)::int` })
      .from(article)
      .where(and(eq(article.userId, user.id), eq(article.isRead, false)))
      .groupBy(article.feedId);
    const byFeed = new Map(counts.map((c) => [c.feedId, c.count]));
    // Decode on read so rows ingested before entity-decoding still render
    // `'` instead of a literal `&#8217;`.
    return feeds.map((f) => ({
      ...f,
      title: decodeEntities(f.title),
      description: f.description ? decodeEntities(f.description) : f.description,
      unreadCount: byFeed.get(f.id) ?? 0,
    }));
  })

  .post(
    "/feeds",
    async ({ request, body }) => {
      const user = await requireUser(request);
      const feedUrl = normalizeFeedUrl(body.url);
      const existing = await db
        .select({ id: feed.id })
        .from(feed)
        .where(and(eq(feed.userId, user.id), eq(feed.url, feedUrl)))
        .limit(1);
      if (existing.length > 0) {
        return Response.json({ error: "You already follow this feed" }, { status: 409 });
      }
      const parsed = await fetchFeed(feedUrl);
      const feedId = `feed_${randomUUID()}`;
      await db.insert(feed).values({
        id: feedId,
        userId: user.id,
        url: feedUrl,
        title: parsed.title,
        siteUrl: parsed.siteUrl,
        description: parsed.description,
        lastFetchedAt: new Date(),
      });
      const inserted = await db.insert(article).values(parsed.items.slice(0, 100).map((item) => ({
        id: `art_${randomUUID()}`,
        feedId,
        userId: user.id,
        guid: item.guid,
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        content: item.content,
        author: item.author,
        imageUrl: item.imageUrl,
        publishedAt: item.publishedAt,
      }))).onConflictDoNothing({ target: [article.feedId, article.guid] }).returning({ id: article.id });
      return { id: feedId, title: parsed.title, articlesImported: inserted.length };
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
    const result = await refreshFeed(f.id, { force: true });
    return { refreshed: true, newArticles: result?.newArticles ?? 0 };
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
      const patterns = encodedQueryVariants(query.q).map((variant) => `%${variant}%`);
      conditions.push(
        or(...patterns.flatMap((like) => [ilike(article.title, like), ilike(article.snippet, like)]))!,
      );
    }
    const rows = await db
      .select({
        id: article.id,
        feedId: article.feedId,
        guid: article.guid,
        title: article.title,
        link: article.link,
        snippet: article.snippet,
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
    return rows.map((r) => ({
      ...r,
      title: decodeEntities(r.title),
      snippet: r.snippet ? decodeEntities(r.snippet) : r.snippet,
      author: r.author ? decodeEntities(r.author) : r.author,
      feedTitle: r.feedTitle ? decodeEntities(r.feedTitle) : r.feedTitle,
    }));
  })

  // Full body for one article — list endpoint omits `content` on purpose
  // (100x full HTML payloads made every list fetch seconds slow).
  .get("/articles/:id", async ({ request, params }) => {
    const user = await requireUser(request);
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
      .where(and(eq(article.id, params.id), eq(article.userId, user.id)))
      .limit(1);
    if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });
    const row = rows[0];
    return {
      ...row,
      title: decodeEntities(row.title),
      snippet: row.snippet ? decodeEntities(row.snippet) : row.snippet,
      // Legacy bodies ingested before text-node decoding still carry encoded
      // entities (`&#8217;`); decode them for display like new rows.
      content: row.content ? decodeHtmlTextNodes(row.content) : row.content,
      author: row.author ? decodeEntities(row.author) : row.author,
      feedTitle: row.feedTitle ? decodeEntities(row.feedTitle) : row.feedTitle,
    };
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
      if (body.articleIds && body.articleIds.length > 0)
        conditions.push(inArray(article.id, body.articleIds));
      await db.update(article).set({ isRead: true }).where(and(...conditions));
      return { ok: true };
    },
    {
      body: t.Object({
        feedId: t.Optional(t.String()),
        articleIds: t.Optional(t.Array(t.String())),
      }),
    },
  );

export type RssApi = typeof rssApi;
