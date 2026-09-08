import Parser from "rss-parser";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "RSS-Reader/1.0" },
});

export type ParsedFeed = {
  title: string;
  siteUrl?: string;
  description?: string;
  items: ParsedItem[];
};

export type ParsedItem = {
  guid: string;
  title: string;
  link?: string;
  snippet?: string;
  content?: string;
  author?: string;
  imageUrl?: string;
  publishedAt?: Date;
};

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export async function fetchFeed(rawUrl: string): Promise<ParsedFeed> {
  const url = normalizeUrl(rawUrl);
  const parsed = await parser.parseURL(url);
  const items: ParsedItem[] = (parsed.items ?? []).map((item, i) => ({
    guid: item.guid ?? item.id ?? item.link ?? `${url}#${i}`,
    title: item.title ?? "(untitled)",
    link: item.link,
    snippet: item.contentSnippet?.slice(0, 500),
    content: item.content ?? item["content:encoded"] ?? item.summary,
    author: item.creator ?? item.author,
    imageUrl: item.enclosure?.url,
    publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : undefined,
  }));
  return {
    title: parsed.title ?? new URL(url).hostname,
    siteUrl: parsed.link,
    description: parsed.description,
    items,
  };
}
