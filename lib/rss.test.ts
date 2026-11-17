import { afterEach, expect, spyOn, test } from "bun:test";
import { fetchFeed, sanitizeArticleHtml } from "./rss";
import { fetchPublicText } from "./safe-fetch";

const url = "https://8.8.8.8/feed";
const wrap = (items: string) => `<rss version="2.0"><channel><title>Example</title><link>https://8.8.8.8/</link><description>Test</description>${items}</channel></rss>`;
const item = (id: string) => `<item><guid>${id}</guid><title>Article ${id}</title><link>https://8.8.8.8/${id}</link><description><![CDATA[<p>Short article</p>]]></description></item>`;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
afterEach(() => fetchSpy?.mockRestore());

function respond(body: string, headers = {}) {
  return new Response(body, { headers: { "content-type": "application/rss+xml", ...headers } });
}

test("stored articles are skipped before full-article requests", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(respond(wrap(item("old"))));
  const feed = await fetchFeed(url, { existingGuids: async (guids) => new Set(guids) });
  expect(feed.notModified).toBe(false);
  if (feed.notModified) throw new Error("Expected a modified feed");
  expect(feed.items).toEqual([]);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("new entries still receive full text and duplicate GUIDs are processed once", async () => {
  fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(respond(wrap(item("new") + item("new"))))
    .mockResolvedValueOnce(new Response(`<html><head><title>Full article</title></head><body><article><p>${"Useful article text. ".repeat(100)}</p></article></body></html>`, { headers: { "content-type": "text/html" } }));
  const feed = await fetchFeed(url);
  expect(feed.items).toHaveLength(1);
  expect(feed.items[0].content).toContain("Useful article text.");
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test("conditional requests return 304 without parsing XML or looking up GUIDs", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 304 }));
  let lookedUp = false;
  const feed = await fetchFeed(url, {
    etag: '"revision-1"',
    lastModified: "Wed, 11 Nov 2026 12:00:00 GMT",
    existingGuids: async () => { lookedUp = true; return new Set(); },
  });
  expect(feed.notModified).toBe(true);
  expect(lookedUp).toBe(false);
  const headers = new Headers(fetchSpy.mock.calls[0][1]?.headers);
  expect(headers.get("if-none-match")).toBe('"revision-1"');
  expect(headers.get("if-modified-since")).toBe("Wed, 11 Nov 2026 12:00:00 GMT");
});

test("200 responses expose updated validators", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(respond(wrap(""), { etag: '"revision-2"', "last-modified": "Wed, 11 Nov 2026 13:00:00 GMT" }));
  const feed = await fetchFeed(url, { etag: '"revision-1"' });
  expect(feed.etag).toBe('"revision-2"');
  expect(feed.lastModified).toBe("Wed, 11 Nov 2026 13:00:00 GMT");
});

test("entry limit applies before HTML processing and GUID lookup", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(respond(wrap(Array.from({ length: 150 }, (_, i) => item(String(i))).join(""))));
  let count = 0;
  await fetchFeed(url, { existingGuids: async (guids) => { count = guids.length; return new Set(guids); } });
  expect(count).toBe(100);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("redirects share one timeout and keep conditional headers", async () => {
  fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/new-feed" } }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }));
  const result = await fetchPublicText(url, { timeoutMs: 1000, maxBytes: 100, allowNotModified: true, headers: { "If-None-Match": '"v1"' } });
  expect(result.response.status).toBe(304);
  expect(result.finalUrl).toBe("https://8.8.8.8/new-feed");
  expect(fetchSpy.mock.calls[0][1]?.signal).toBe(fetchSpy.mock.calls[1][1]?.signal);
});

test("single-document sanitization still removes unsafe HTML and resolves relative URLs", () => {
  const html = sanitizeArticleHtml('<script>alert(1)</script><p onclick="bad()">It&amp;#8217;s safe</p><a href="/post">Post</a><img src="javascript:bad()">', url);
  expect(html).not.toContain("<script");
  expect(html).not.toContain("onclick");
  expect(html).not.toContain("javascript:");
  expect(html).toContain("It’s safe");
  expect(html).toContain('href="https://8.8.8.8/post"');
});
