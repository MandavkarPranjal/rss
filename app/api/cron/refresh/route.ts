import { env } from "@/lib/env";
import { refreshAllFeeds } from "@/lib/feed-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const expected = env.CRON_SECRET ? `Bearer ${env.CRON_SECRET}` : null;
  if (!expected || authorization !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await refreshAllFeeds());
  } catch (error) {
    console.error("[cron/refresh]", error);
    return Response.json({ error: "Refresh failed" }, { status: 500 });
  }
}
