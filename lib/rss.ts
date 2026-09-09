import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import Parser from "rss-parser";
import { getVideoEmbed } from "./article-embeds";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "RSS-Reader/1.0" },
});

const ARTICLE_FETCH_TIMEOUT_MS = 10000;
const ARTICLE_FETCH_MAX_BYTES = 5 * 1024 * 1024;
const ARTICLE_FETCH_BATCH_SIZE = 4;
const ARTICLE_FETCH_LIMIT = 20;

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

function textLength(html: string | undefined): number {
  if (!html) return 0;
  return new JSDOM(`<body>${html}</body>`).window.document.body.textContent?.trim().length ?? 0;
}

function makeAbsoluteUrls(html: string, baseUrl: string): string {
  const dom = new JSDOM(`<body>${html}</body>`, { url: baseUrl });
  const document = dom.window.document;

  for (const element of document.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on")) {
        element.removeAttribute(attribute.name);
      }
    }

    for (const attributeName of ["href", "src"]) {
      const value = element.getAttribute(attributeName);
      if (!value || value.startsWith("#") || value.startsWith("data:")) continue;
      try {
        const absolute = new URL(value, baseUrl);
        if (absolute.protocol === "http:" || absolute.protocol === "https:") {
          element.setAttribute(attributeName, absolute.href);
        } else {
          element.removeAttribute(attributeName);
        }
      } catch {
        element.removeAttribute(attributeName);
      }
    }
  }

  return document.body.innerHTML;
}

function sanitizeArticleHtml(html: string, baseUrl: string): string {
  const dom = new JSDOM(`<body>${html}</body>`, { url: baseUrl });
  const document = dom.window.document;
  for (const element of document.querySelectorAll("script, style, noscript, object, embed, form")) {
    element.remove();
  }

  for (const iframe of Array.from(document.querySelectorAll("iframe"))) {
    const embed = getVideoEmbed(iframe.getAttribute("src") ?? "");
    if (!embed) {
      iframe.remove();
      continue;
    }
    iframe.setAttribute("src", embed.src);
    iframe.setAttribute("title", iframe.getAttribute("title") || embed.title);
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    iframe.setAttribute("allowfullscreen", "true");
  }

  for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href") ?? "";
    const embed = getVideoEmbed(href);
    const parent = anchor.parentElement;
    if (!embed || !parent || parent.children.length !== 1 || parent.textContent?.trim() !== href) continue;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("src", embed.src);
    iframe.setAttribute("title", embed.title);
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    iframe.setAttribute("allowfullscreen", "true");
    parent.replaceWith(iframe);
  }
  return makeAbsoluteUrls(document.body.innerHTML, baseUrl).trim();
}

type FetchedArticle = {
  content?: string;
  imageUrl?: string;
};

function extractMetadataImage(document: Document, baseUrl: string): string | undefined {
  const candidates = [
    document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
    document.querySelector('meta[name="twitter:image"]')?.getAttribute("content"),
    document.querySelector('meta[itemprop="image"]')?.getAttribute("content"),
    document.querySelector('link[rel="image_src"]')?.getAttribute("href"),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const imageUrl = new URL(candidate, baseUrl);
      if (imageUrl.protocol === "http:" || imageUrl.protocol === "https:") return imageUrl.href;
    } catch {
      // Try the next metadata source.
    }
  }
  return undefined;
}

async function fetchFullArticle(link: string): Promise<FetchedArticle | undefined> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "RSS-Reader/1.0 (+full-article-fetch)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(ARTICLE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return undefined;
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > ARTICLE_FETCH_MAX_BYTES) return undefined;

    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > ARTICLE_FETCH_MAX_BYTES) return undefined;

    const finalUrl = response.url || url.href;
    const dom = new JSDOM(html, { url: finalUrl });
    const imageUrl = extractMetadataImage(dom.window.document, finalUrl);
    const result = new Readability(dom.window.document).parse();
    if (!result?.content || (result.textContent ?? "").trim().length < 200) {
      return imageUrl ? { imageUrl } : undefined;
    }

    const content = sanitizeArticleHtml(result.content, finalUrl);
    return content || imageUrl ? { content: content || undefined, imageUrl } : undefined;
  } catch {
    // Full-text retrieval is best-effort. The RSS item remains usable.
    return undefined;
  }
}

async function enrichWithFullArticles(items: ParsedItem[]): Promise<ParsedItem[]> {
  const candidates = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.link && textLength(item.content) < 1200)
    .slice(0, ARTICLE_FETCH_LIMIT);

  for (let start = 0; start < candidates.length; start += ARTICLE_FETCH_BATCH_SIZE) {
    const batch = candidates.slice(start, start + ARTICLE_FETCH_BATCH_SIZE);
    const results = await Promise.all(batch.map(({ item }) => fetchFullArticle(item.link!)));
    results.forEach((result, index) => {
      if (result?.content) items[batch[index].index].content = result.content;
      if (result?.imageUrl && !items[batch[index].index].imageUrl) {
        items[batch[index].index].imageUrl = result.imageUrl;
      }
    });
  }
  return items;
}

export async function fetchFeed(rawUrl: string): Promise<ParsedFeed> {
  const url = normalizeUrl(rawUrl);
  const parsed = await parser.parseURL(url);
  const items: ParsedItem[] = (parsed.items ?? []).map((item, i) => ({
    guid: item.guid ?? item.id ?? item.link ?? `${url}#${i}`,
    title: item.title ?? "(untitled)",
    link: item.link,
    // Prefer RSS content:encoded over content/description. rss-parser exposes
    // RSS <description> as `content`, so checking it first silently discards
    // the full article when a feed publishes both fields.
    snippet: (item.contentSnippet ?? item["content:encodedSnippet"] ?? item.summary)?.slice(0, 500),
    content: (() => {
      const raw = item["content:encoded"] ?? item.content ?? item.summary;
      return raw ? sanitizeArticleHtml(raw, item.link ?? url) : undefined;
    })(),
    author: item.creator ?? item.author,
    imageUrl: item.enclosure?.url,
    publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : undefined,
  }));
  await enrichWithFullArticles(items);
  return {
    title: parsed.title ?? new URL(url).hostname,
    siteUrl: parsed.link,
    description: parsed.description,
    items,
  };
}
