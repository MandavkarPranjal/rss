import { afterEach, expect, spyOn, test } from "bun:test";
import { fetchPublicText, RemoteFetchError } from "./safe-fetch";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
afterEach(() => fetchSpy?.mockRestore());
const options = { timeoutMs: 1000, maxBytes: 100 };
function erroredResponse(status: number, headers = {}) {
  const body = new ReadableStream({ start(controller) { controller.error(new Error("Stream failed")); } });
  return new Response(body, { status, headers });
}

for (const [status, headers, code] of [
  [200, { "content-length": "101" }, "TOO_LARGE"],
  [503, {}, "HTTP_ERROR"],
  [302, {}, "HTTP_ERROR"],
] as const) {
  test(`cleanup rejection preserves ${code} for HTTP ${status}`, async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(erroredResponse(status, headers));
    const error = await fetchPublicText("https://8.8.8.8/feed", options).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(RemoteFetchError);
    expect((error as RemoteFetchError).code).toBe(code);
  });
}

test("cleanup rejection does not prevent following a valid redirect", async () => {
  fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(erroredResponse(302, { location: "/new-feed" }))
    .mockResolvedValueOnce(new Response("feed"));
  const result = await fetchPublicText("https://8.8.8.8/feed", options);
  expect(result.text).toBe("feed");
  expect(result.finalUrl).toBe("https://8.8.8.8/new-feed");
});
