import { rssApi } from "@/lib/elysia";

async function handler(request: Request) {
  return rssApi.handle(request);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
