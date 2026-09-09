export async function api(path: string, init?: RequestInit) {
  // `init.headers` is `HeadersInit` (plain object, `Headers` instance, or
  // tuple array). Object spread only works for the plain-object form — a
  // `Headers` instance spreads to `{}` (entries dropped) and tuples spread to
  // numeric keys (garbled). Normalize through `Headers` so every form merges.
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(path, {
    ...init,
    headers,
  });
  if (!res.ok)
    throw new Error(
      ((await res.json().catch(() => ({}))) as { error?: string }).error ??
        res.statusText,
    );
  return res.json();
}

export function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
