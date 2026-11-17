import { api } from "./rss-client";

export type FeedRefreshResult = {
  skipped: boolean;
  newArticles: number;
  skipReason: "in_progress" | "cooldown" | "backoff" | "not_due" | null;
};

function pause(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

// Observe the existing job without starting another scrape. Stop on navigation,
// account changes, or after the maximum lease lifetime plus one minute.
export async function waitForFeedRefresh(
  feedId: string,
  signal?: AbortSignal,
  wait = pause,
): Promise<void> {
  const deadline = AbortSignal.timeout(11 * 60_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let interval = 1000;
  while (true) {
    await wait(interval, combined);
    combined.throwIfAborted();
    const status = await api(`/api/rss/feeds/${encodeURIComponent(feedId)}/refresh`, { signal: combined, cache: "no-store" }) as { refreshing: boolean; error: string | null };
    if (!status.refreshing) {
      if (status.error) throw new Error(status.error);
      return;
    }
    interval = Math.min(interval * 2, 10_000);
  }
}
