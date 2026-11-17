import { afterEach, expect, spyOn, test } from "bun:test";
import { waitForFeedRefresh } from "./feed-refresh-client";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
afterEach(() => fetchSpy?.mockRestore());

test("waits for the competing job to finish using status GETs without starting another refresh", async () => {
  fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ refreshing: true, error: null }))
    .mockResolvedValueOnce(Response.json({ refreshing: false, error: null }));
  const delays: number[] = [];
  await waitForFeedRefresh("feed-1", undefined, async (ms) => { delays.push(ms); });
  expect(delays).toEqual([1000, 2000]);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  for (const [path, init] of fetchSpy.mock.calls) {
    expect(path).toBe("/api/rss/feeds/feed-1/refresh");
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.cache).toBe("no-store");
  }
});

test("reports a competing refresh failure", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ refreshing: false, error: "Feed is unavailable" }));
  await expect(waitForFeedRefresh("feed-1", undefined, async () => {})).rejects.toThrow("Feed is unavailable");
});

test("cancelling the observer prevents further status requests", async () => {
  const controller = new AbortController();
  fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Must not fetch"));
  await expect(waitForFeedRefresh("feed-1", controller.signal, async () => { controller.abort(); })).rejects.toThrow();
  expect(fetchSpy).not.toHaveBeenCalled();
});
