import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { act, useEffect } from "react";
import { JSDOM } from "jsdom";
import type { Root } from "react-dom/client";

mock.module("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { id: "user-1" } }, isPending: false }),
}));
const { RssStoreProvider, useRssStore } = await import("./rss-store");
let store: ReturnType<typeof useRssStore>;
function Probe() {
  const value = useRssStore();
  useEffect(() => { store = value; }, [value]);
  return null;
}
let dom: JSDOM;
let root: Root;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const globals = ["window", "document", "navigator", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();

beforeEach(async () => {
  dom = new JSDOM("<div id='root'></div>", { url: "http://localhost", pretendToBeVisual: true });
  const values = [dom.window, dom.window.document, dom.window.navigator, dom.window.HTMLElement, true];
  globals.forEach((key, index) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: values[index], configurable: true, writable: true });
  });
  const { createRoot } = await import("react-dom/client");
  root = createRoot(document.getElementById("root")!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  fetchSpy?.mockRestore();
  dom.window.close();
  for (const key of globals) {
    const original = originals.get(key);
    if (original) Object.defineProperty(globalThis, key, original);
    else Reflect.deleteProperty(globalThis, key);
  }
});
const mount = () => act(async () => { root.render(<RssStoreProvider><Probe /></RssStoreProvider>); });
const focus = () => act(async () => { window.dispatchEvent(new dom.window.Event("focus")); });

// Bun's fetch type also exposes preconnect; keep the mock compatible with it.
function implementation(fn: () => Promise<Response>): typeof fetch {
  return Object.assign(fn, { preconnect() {} });
}

for (const failure of ["both", "folders"] as const) {
  test(`a failed ${failure} load can retry immediately on focus`, async () => {
    fetchSpy = spyOn(globalThis, "fetch")
      .mockImplementationOnce(implementation(async () => { if (failure === "both") throw new Error("Unavailable"); return Response.json([]); }))
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockImplementation(implementation(async () => Response.json([])));
    await mount();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(store.feedsError).toContain("Unavailable");
    await focus();
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(store.feedsError).toBe("");
    // Successful loads do start the cooldown.
    await focus();
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });
}

test("focus events coalesce while a load is in flight", async () => {
  const pending: ((response: Response) => void)[] = [];
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(implementation(() => new Promise<Response>((resolve) => pending.push(resolve))));
  await mount();
  await focus();
  await focus();
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  await act(async () => { pending.forEach((resolve) => resolve(Response.json([]))); });
  await focus();
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test("a failed mutation-triggered load clears a previous successful cooldown", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(implementation(async () => Response.json([])));
  await mount();
  fetchSpy.mockRejectedValueOnce(new Error("Unavailable")).mockRejectedValueOnce(new Error("Unavailable"));
  await act(async () => { store.loadFeeds(); });
  expect(fetchSpy).toHaveBeenCalledTimes(4);
  await focus();
  expect(fetchSpy).toHaveBeenCalledTimes(6);
});
