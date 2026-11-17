import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// Keep the real feed parser and SQL predicates; replace only database transport.
const selects: unknown[][] = [];
const updates: unknown[][] = [];
const writes: { values: Record<string, unknown>; where?: SQL }[] = [];
let insertCount = 0;
let insertedRows: { id: string }[] = [];
function selectQuery() {
  const run = () => Promise.resolve(selects.shift() ?? []);
  return {
    from() { return this; }, where() { return this; },
    limit: run,
    then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) { return run().then(resolve, reject); },
  };
}
mock.module("./db", () => ({ db: {
  select: selectQuery,
  update() {
    const write: (typeof writes)[number] = { values: {} };
    const run = () => Promise.resolve(updates.shift() ?? []);
    return {
      set(values: Record<string, unknown>) { write.values = values; writes.push(write); return this; },
      where(where: SQL) { write.where = where; return this; },
      returning: run,
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) { return run().then(resolve, reject); },
    };
  },
  insert() {
    insertCount++;
    return {
      values() { return this; }, onConflictDoNothing() { return this; },
      returning() { return Promise.resolve(insertedRows); },
    };
  },
} }));
const { refreshFeed } = await import("./feed-refresh");
const savedFeed = {
  id: "feed-1", userId: "user-1", url: "https://8.8.8.8/feed", title: "Saved title",
  etag: '"v1"', lastModified: "Wed, 11 Nov 2026 12:00:00 GMT",
  nextFetchAt: null, lastFetchedAt: null, lastFetchError: null, refreshLockedUntil: null, fetchFailureCount: 0,
};
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
beforeEach(() => {
  selects.length = 0; updates.length = 0; writes.length = 0; insertCount = 0; insertedRows = [];
  selects.push([savedFeed]);
});
afterEach(() => fetchSpy?.mockRestore());

test("a losing refresh lease never downloads or ingests", async () => {
  updates.push([]);
  selects.push([{ ...savedFeed, refreshLockedUntil: new Date(Date.now() + 60_000) }]);
  fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Must not fetch"));
  expect((await refreshFeed(savedFeed.id))?.skipReason).toBe("in_progress");
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(insertCount).toBe(0);
  const sql = new PgDialect().sqlToQuery(writes[0].where!).sql;
  expect(sql).toContain('"refresh_locked_until"');
  expect(sql).toContain('"next_fetch_at"');
});

test("304 refresh keeps validators and metadata, advances schedule, and releases lease", async () => {
  updates.push([savedFeed], []);
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 304 }));
  expect((await refreshFeed(savedFeed.id))?.newArticles).toBe(0);
  const completed = writes[1].values;
  expect(completed.etag).toBe(savedFeed.etag);
  expect(completed.lastModified).toBe(savedFeed.lastModified);
  expect(completed).not.toHaveProperty("title");
  expect(completed.refreshLockedUntil).toBeNull();
  expect((completed.nextFetchAt as Date).getTime()).toBeGreaterThan(Date.now());
  expect(insertCount).toBe(0);
});

test("fresh 200 clears obsolete validators and skips existing entries", async () => {
  updates.push([savedFeed], []);
  selects.push([{ guid: "old" }]);
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response('<rss version="2.0"><channel><title>Updated</title><item><guid>old</guid><link>https://8.8.8.8/old</link></item></channel></rss>', { headers: { "content-type": "application/rss+xml" } }));
  await refreshFeed(savedFeed.id);
  expect(writes[1].values.etag).toBeNull();
  expect(writes[1].values.lastModified).toBeNull();
  expect(writes[1].values.title).toBe("Updated");
  expect(insertCount).toBe(0);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("failed refresh releases lease and backs off without overwriting validators", async () => {
  updates.push([savedFeed], []);
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
  await expect(refreshFeed(savedFeed.id)).rejects.toThrow("503");
  expect(writes[1].values.refreshLockedUntil).toBeNull();
  expect(writes[1].values.fetchFailureCount).toBe(1);
  expect(writes[1].values).not.toHaveProperty("etag");
});

test("a successful forced refresh prevents another forced fetch during cooldown", async () => {
  updates.push([savedFeed], []);
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 304 }));
  expect((await refreshFeed(savedFeed.id, { force: true }))?.skipped).toBe(false);
  const completed = writes[1].values;
  selects.push([{ ...savedFeed, ...completed }]);
  const second = await refreshFeed(savedFeed.id, { force: true });
  expect(second?.skipReason).toBe("cooldown");
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(writes).toHaveLength(2);
  const sql = new PgDialect().sqlToQuery(writes[0].where!).sql;
  expect(sql).toContain('"refresh_locked_until"');
  expect(sql).toContain('"last_fetched_at"');
  expect(sql).toContain('"last_fetch_error"');
  expect(sql).toContain('"next_fetch_at"');
});

test("forced refresh preserves failure backoff", async () => {
  selects[0] = [{ ...savedFeed, lastFetchError: "HTTP 503", nextFetchAt: new Date(Date.now() + 60_000) }];
  fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Must not fetch"));
  expect((await refreshFeed(savedFeed.id, { force: true }))?.skipReason).toBe("backoff");
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
});

test("forced refresh retries a failed feed once backoff is due", async () => {
  const due = { ...savedFeed, lastFetchError: "HTTP 503", nextFetchAt: new Date(Date.now() - 1000) };
  selects[0] = [due];
  updates.push([due], []);
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 304 }));
  expect((await refreshFeed(savedFeed.id, { force: true }))?.skipped).toBe(false);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(writes[1].values.lastFetchError).toBeNull();
});

test("new-article count uses actual inserts and successful imports save validators", async () => {
  updates.push([savedFeed], []);
  selects.push([]);
  insertedRows = [{ id: "new-article" }];
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(`<rss version="2.0"><channel><title>Updated</title><item><guid>new</guid><description>${"Complete article text. ".repeat(100)}</description></item></channel></rss>`, { headers: { "content-type": "application/rss+xml", etag: '\"v2\"' } }));
  const result = await refreshFeed(savedFeed.id);
  expect(result?.newArticles).toBe(1);
  expect(result?.skipped).toBe(false);
  expect(insertCount).toBe(1);
  expect(writes[1].values.etag).toBe('\"v2\"');
});
