import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import Parser from "rss-parser";
import { buildMuxPlayer, configureEmbedIframe, getVideoEmbed, sanitizeIframe } from "./article-embeds";
import { decodeEntities, decodeHtmlTextNodes } from "./decode-entities";
import { fetchPublicText } from "./safe-fetch";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "RSS-Reader/1.0" },
  customFields: {
    item: [
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:group", "mediaGroup"],
      ["media:description", "mediaDescription"],
      ["enclosure", "allEnclosures", { keepArray: true }],
      ["itunes:image", "itunesImage"],
      ["image", "itemImage"],
      ["link", "rawLinks", { keepArray: true }],
    ],
  },
});

const ARTICLE_FETCH_TIMEOUT_MS = 10000;
const ARTICLE_FETCH_MAX_BYTES = 5 * 1024 * 1024;
const ARTICLE_FETCH_BATCH_SIZE = 4;
const ARTICLE_FETCH_LIMIT = 20;
const FEED_FETCH_TIMEOUT_MS = 15000;
const FEED_FETCH_MAX_BYTES = 2 * 1024 * 1024;

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
  /** The feed itself exposed an image candidate (even if a body image won). */
  hasFeedImage: boolean;
  /** The current imageUrl was derived from body HTML — fallback only. */
  imageFromBody: boolean;
  publishedAt?: Date;
};

export function normalizeFeedUrl(url: string): string {
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

function sanitizeArticleHtml(html: string, baseUrl: string): string {  // Feeds frequently double-encode body text (`&amp;#8217;`), which a
  // DOM round-trip preserves verbatim — decode text nodes first so new rows
  // store (and render) the intended characters. Markup is untouched.
  html = decodeHtmlTextNodes(html);
  const dom = new JSDOM(`<body>${html}</body>`, { url: baseUrl });
  const document = dom.window.document;

  document.querySelectorAll<HTMLMetaElement>('meta[itemprop="contentUrl"]').forEach((metadata) => {
    const embed = getVideoEmbed(metadata.getAttribute("content") ?? "");
    const player = metadata.parentElement;
    if (!embed || !player) return;
    if (embed.kind === "mux") {
      player.replaceWith(
        buildMuxPlayer(
          document,
          embed,
          player.querySelector('meta[itemprop="name"]')?.getAttribute("content"),
        ),
      );
      return;
    }
    const iframe = document.createElement("iframe");
    configureEmbedIframe(iframe, embed, player.querySelector('meta[itemprop="name"]')?.getAttribute("content"));
    player.replaceWith(iframe);
  });

  for (const element of document.querySelectorAll("script, style, noscript, object, embed, form")) {
    element.remove();
  }

  for (const iframe of Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe"))) {
    sanitizeIframe(iframe, document, baseUrl);
  }

  for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href") ?? "";
    const embed = getVideoEmbed(href);
    const parent = anchor.parentElement;
    if (!embed || !parent || parent.children.length !== 1 || parent.textContent?.trim() !== href) continue;
    if (embed.kind === "mux") {
      parent.replaceWith(buildMuxPlayer(document, embed));
      continue;
    }
    const iframe = document.createElement("iframe");
    configureEmbedIframe(iframe, embed);
    parent.replaceWith(iframe);
  }
  return makeAbsoluteUrls(document.body.innerHTML, baseUrl).trim();
}

type FetchedArticle = {
  content?: string;
  imageUrl?: string;
};

type SourceCodeBlock = {
  language?: string;
  text: string;
  beforeText?: string;
  afterText?: string;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractSourceCodeBlocks(document: Document): SourceCodeBlock[] {
  return Array.from(document.querySelectorAll("pre"))
    .map((pre) => {
      const code = pre.querySelector("code");
      const className = `${pre.className} ${code?.className ?? ""}`;
      const language = className.match(/(?:language|lang)-([\w#+-]+)/i)?.[1];
      const container = pre.parentElement;
      return {
        language,
        text: pre.textContent ?? "",
        beforeText: container?.previousElementSibling?.textContent ?? undefined,
        afterText: container?.nextElementSibling?.textContent ?? undefined,
      };
    })
    .filter(({ text }) => text.trim().length > 0);
}

function restoreMissingCodeBlocks(content: string, blocks: SourceCodeBlock[], baseUrl: string): string {
  if (!blocks.length) return content;
  const restored = new JSDOM(`<body>${content}</body>`, { url: baseUrl });
  const body = restored.window.document.body;
  const existing = new Set(
    Array.from(body.querySelectorAll("pre")).map((pre) => pre.textContent?.trim() ?? ""),
  );

  for (const block of blocks) {
    if (existing.has(block.text.trim())) continue;
    const pre = restored.window.document.createElement("pre");
    const code = restored.window.document.createElement("code");
    if (block.language) code.className = `language-${block.language}`;
    code.textContent = block.text;
    pre.append(code);

    const before = normalizeText(block.beforeText ?? "");
    const after = normalizeText(block.afterText ?? "");
    const candidates = Array.from(body.querySelectorAll("p, h1, h2, h3, h4, li"));
    const previous = before
      ? candidates.find((element) => normalizeText(element.textContent ?? "") === before)
      : undefined;
    const next = after
      ? candidates.find((element) => normalizeText(element.textContent ?? "") === after)
      : undefined;

    if (previous?.parentNode) previous.parentNode.insertBefore(pre, previous.nextSibling);
    else if (next?.parentNode) next.parentNode.insertBefore(pre, next);
    else body.append(pre);
    existing.add(block.text.trim());
  }
  return body.innerHTML;
}

// ---- Thumbnails (mirrors spacecowboy/Feeder: GoFeedExtensions + HtmlUtils) ----

type FeedImageCandidate = {
  url: string;
  width?: number;
  height?: number;
  /** Enclosure byte length, 0 when unknown. */
  length: number;
  enclosure: boolean;
};

type ResolvedThumbnail = {
  url?: string;
  /** True when the URL came from item body HTML — fallback only. */
  fromBody: boolean;
  /** True when the feed itself exposed an image candidate. */
  hasFeedImage: boolean;
};

function toAbsoluteHttpUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) return undefined;
  try {
    const absolute = new URL(trimmed, baseUrl);
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") return undefined;
    return absolute.href;
  } catch {
    return undefined;
  }
}

function intOrUndefined(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Feeder `pointsToImage`: URL path ends in a known image extension. */
function pointsToImage(absoluteUrl: string): boolean {
  try {
    return /[.](avif|gif|jpe?g|png|webp)$/i.test(new URL(absoluteUrl).pathname);
  } catch {
    return false;
  }
}

function localName(key: string): string {
  const separator = key.lastIndexOf(":");
  return (separator >= 0 ? key.slice(separator + 1) : key).toLowerCase();
}

function attrText(node: unknown): string | undefined {
  if (typeof node === "string") return node;
  if (node && typeof node === "object") {
    const inner = (node as { _?: unknown })._;
    if (typeof inner === "string") return inner;
  }
  return undefined;
}

function attrMap(node: unknown): Record<string, unknown> {
  if (node && typeof node === "object") {
    const attrs = (node as { $?: unknown }).$;
    if (attrs && typeof attrs === "object") return attrs as Record<string, unknown>;
    // rss-parser flattens enclosure-style elements to plain objects.
    return node as Record<string, unknown>;
  }
  return {};
}

function strAttr(attrs: Record<string, unknown>, key: string): string | undefined {
  const value = attrs[key];
  return typeof value === "string" ? value : undefined;
}

function attrUrl(node: unknown): string | undefined {
  if (typeof node === "string") return node;
  if (node && typeof node === "object") {
    const attrs = (node as { $?: Record<string, unknown> }).$;
    if (attrs) {
      for (const key of ["url", "href", "src"]) {
        const value = attrs[key];
        if (typeof value === "string" && value) return value;
      }
    }
    // rss-parser sometimes flattens to { _: url } or plain object
    const inner = (node as { _?: unknown })._;
    if (typeof inner === "string") return inner;
  }
  return undefined;
}

/**
 * Walk a namespaced extension subtree (media:content, media:group, ...) like
 * Feeder's `recursiveExtensionThumbnailCandidates`: any `url`/`href`/`src`
 * attribute pointing at an image becomes a candidate (with dimensions when
 * present), as does the text of any `<thumbnail>` element. Recurses into
 * children regardless of namespace prefix.
 */
function walkExtension(
  node: unknown,
  key: string,
  baseUrl: string,
  out: FeedImageCandidate[],
): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const child of node) walkExtension(child, key, baseUrl, out);
    return;
  }
  const thumbnailKey = key === "mediaThumbnail" || localName(key) === "thumbnail";
  if (typeof node === "string") {
    if (thumbnailKey) {
      const absolute = toAbsoluteHttpUrl(node, baseUrl);
      if (absolute && pointsToImage(absolute)) {
        out.push({ url: absolute, length: 0, enclosure: false });
      }
    }
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const attrs = attrMap(node);
  const urlAttr = strAttr(attrs, "url") ?? strAttr(attrs, "href") ?? strAttr(attrs, "src");
  if (urlAttr) {
    const absolute = toAbsoluteHttpUrl(urlAttr, baseUrl);
    if (absolute && pointsToImage(absolute)) {
      out.push({
        url: absolute,
        width: intOrUndefined(attrs["width"]),
        height: intOrUndefined(attrs["height"]),
        length: 0,
        enclosure: false,
      });
    }
  }
  if (thumbnailKey) {
    const absolute = toAbsoluteHttpUrl(attrText(node), baseUrl);
    if (absolute && pointsToImage(absolute)) {
      out.push({ url: absolute, length: 0, enclosure: false });
    }
  }
  for (const [childKey, child] of Object.entries(record)) {
    if (childKey === "$" || childKey === "_") continue;
    walkExtension(child, childKey, baseUrl, out);
  }
}

/** Feed-level image candidates in Feeder's order: item image, extensions, enclosures. */
function collectFeedImageCandidates(
  rawItem: Record<string, unknown>,
  feedBaseUrl: string,
): FeedImageCandidate[] {
  const candidates: FeedImageCandidate[] = [];

  // Item-level image (iTunes / RSS <image>), like gofeed's item image.
  const itemImages = [
    rawItem["itunesImage"],
    (rawItem["itunes"] as Record<string, unknown> | undefined)?.["image"],
    rawItem["itemImage"],
  ];
  for (const node of itemImages) {
    if (!node) continue;
    const absolute = toAbsoluteHttpUrl(
      attrUrl(node) ??
        (typeof node === "object" ? attrUrl((node as Record<string, unknown>)["url"]) : undefined) ??
        attrText(node),
      feedBaseUrl,
    );
    if (absolute) candidates.push({ url: absolute, length: 0, enclosure: false });
  }

  for (const key of ["mediaThumbnail", "mediaContent", "mediaGroup"]) {
    walkExtension(rawItem[key], key, feedBaseUrl, candidates);
  }

  // Enclosures only count when the MIME type is an image, like Feeder.
  const enclosureNodes: unknown[] = [];
  const all = rawItem["allEnclosures"];
  if (Array.isArray(all)) enclosureNodes.push(...all);
  else if (all) enclosureNodes.push(all);
  const single = rawItem["enclosure"];
  if (enclosureNodes.length === 0 && single && typeof single === "object") {
    enclosureNodes.push(single);
  }
  for (const node of enclosureNodes) {
    const attrs = attrMap(node);
    if (!(strAttr(attrs, "type") ?? "").toLowerCase().startsWith("image/")) continue;
    const absolute = toAbsoluteHttpUrl(strAttr(attrs, "url"), feedBaseUrl);
    if (!absolute) continue;
    const length = Number(attrs["length"] ?? attrs["fileSize"] ?? 0);
    candidates.push({
      url: absolute,
      length: Number.isFinite(length) ? length : 0,
      enclosure: true,
    });
  }

  // Atom `<link rel="enclosure" type="image/...">`.
  const rawLinks = rawItem["rawLinks"];
  const links = Array.isArray(rawLinks) ? rawLinks : rawLinks ? [rawLinks] : [];
  for (const link of links) {
    const attrs = attrMap(link);
    if (strAttr(attrs, "rel") !== "enclosure") continue;
    if (!(strAttr(attrs, "type") ?? "").toLowerCase().startsWith("image/")) continue;
    const absolute = toAbsoluteHttpUrl(strAttr(attrs, "href"), feedBaseUrl);
    if (!absolute) continue;
    const length = Number(attrs["length"] ?? 0);
    candidates.push({
      url: absolute,
      length: Number.isFinite(length) ? length : 0,
      enclosure: true,
    });
  }

  return candidates;
}

/** Feeder `findFirstImageInHtml`: skips 1px trackers and social icons. */
function findFirstBodyImage(html: string | undefined, baseUrl: string): string | undefined {
  if (!html || !html.includes("<img")) return undefined;
  try {
    const document = new JSDOM(`<body>${html}</body>`, { url: baseUrl }).window.document;
    for (const img of Array.from(document.querySelectorAll("img"))) {
      if (img.getAttribute("width") === "1" || img.getAttribute("height") === "1") continue;
      const absolute = toAbsoluteHttpUrl(
        img.getAttribute("src") ?? img.getAttribute("data-src") ?? undefined,
        baseUrl,
      );
      if (!absolute) continue;
      if (/twitter_icon|facebook_icon/i.test(absolute)) continue;
      return absolute;
    }
  } catch {
    // Best-effort: fall through to no thumbnail.
  }
  return undefined;
}

/**
 * Feeder `thumbnail` selection: gather feed candidates and keep the widest.
 * Enclosures carry no dimensions, so byte length decides (unknown or >50KB
 * wins outright). A feed image narrower than 640px loses to the first body
 * image; the feed image remains as fallback.
 */
const ENCLOSURE_IMAGE_MIN_BYTES = 50_000;

function resolveItemThumbnail(
  rawItem: Record<string, unknown>,
  htmlContent: string | undefined,
  feedBaseUrl: string,
  articleBaseUrl: string,
): ResolvedThumbnail {
  let feed: FeedImageCandidate | undefined;
  let bestWidth = -2;
  for (const candidate of collectFeedImageCandidates(rawItem, feedBaseUrl)) {
    const score = candidate.width ?? -1;
    // Enclosures never carry dimensions, so without this every dimensionless
    // candidate ties at -1 and the first one wins regardless of byte size.
    // Unknown length (0) remains preferred, while known enclosures compete by
    // length so a larger usable image is not discarded.
    const longerEnclosure =
      candidate.enclosure &&
      feed?.enclosure &&
      (candidate.length === 0 || candidate.length > feed.length);
    if (score > bestWidth || (score === bestWidth && longerEnclosure)) {
      bestWidth = score;
      feed = candidate;
    }
  }
  const hasFeedImage = feed != null;

  if (feed?.enclosure && (feed.length === 0 || feed.length > ENCLOSURE_IMAGE_MIN_BYTES)) {
    return { url: feed.url, fromBody: false, hasFeedImage };
  }
  if (feed && (feed.width ?? 0) >= 640) {
    return { url: feed.url, fromBody: false, hasFeedImage };
  }

  const body = findFirstBodyImage(htmlContent, articleBaseUrl);
  if (body) return { url: body, fromBody: true, hasFeedImage };
  if (feed) return { url: feed.url, fromBody: false, hasFeedImage };
  return { fromBody: false, hasFeedImage: false };
}

/** Feeder `extractOgImage`: og:image first, twitter:image as fallback. */
function extractMetadataImage(document: Document, baseUrl: string): string | undefined {
  for (const property of ["og:image", "twitter:image"]) {
    for (const attr of ["property", "name"]) {
      const content = document
        .querySelector(`meta[${attr}="${property}"]`)
        ?.getAttribute("content")
        ?.trim();
      if (!content) continue;
      try {
        const imageUrl = new URL(content, baseUrl);
        if (imageUrl.protocol === "http:" || imageUrl.protocol === "https:") return imageUrl.href;
      } catch {
        // Try the next metadata source.
      }
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
    const { text: html, response, finalUrl } = await fetchPublicText(url.href, {
      timeoutMs: ARTICLE_FETCH_TIMEOUT_MS,
      maxBytes: ARTICLE_FETCH_MAX_BYTES,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "RSS-Reader/1.0 (+full-article-fetch)",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return undefined;

    const dom = new JSDOM(html, { url: finalUrl });
    const sourceCodeBlocks = extractSourceCodeBlocks(dom.window.document);
    const imageUrl = extractMetadataImage(dom.window.document, finalUrl);
    const result = new Readability(dom.window.document).parse();
    if (!result?.content || (result.textContent ?? "").trim().length < 200) {
      return imageUrl ? { imageUrl } : undefined;
    }

    const contentWithCode = restoreMissingCodeBlocks(result.content, sourceCodeBlocks, finalUrl);
    const content = sanitizeArticleHtml(contentWithCode, finalUrl);
    return content || imageUrl ? { content: content || undefined, imageUrl } : undefined;
  } catch {
    // Full-text retrieval is best-effort. The RSS item remains usable.
    return undefined;
  }
}

async function enrichWithFullArticles(items: ParsedItem[]): Promise<ParsedItem[]> {
  const candidates = items
    .map((item, index) => ({ item, index, short: textLength(item.content) < 1200 }))
    // Short items get full text; imageless items without a feed image get og:image.
    .filter(
      ({ item, short }) =>
        item.link && (short || (!item.hasFeedImage && (!item.imageUrl || item.imageFromBody))),
    )
    .slice(0, ARTICLE_FETCH_LIMIT);

  for (let start = 0; start < candidates.length; start += ARTICLE_FETCH_BATCH_SIZE) {
    const batch = candidates.slice(start, start + ARTICLE_FETCH_BATCH_SIZE);
    const results = await Promise.all(batch.map(({ item }) => fetchFullArticle(item.link!)));
    results.forEach((result, index) => {
      const target = items[batch[index].index];
      if (batch[index].short && result?.content) target.content = result.content;
      // Feeder policy: og:image only upgrades missing/body-derived thumbnails
      // when the feed itself exposed no image candidate.
      if (result?.imageUrl && !target.hasFeedImage && (!target.imageUrl || target.imageFromBody)) {
        target.imageUrl = result.imageUrl;
        target.imageFromBody = false;
      }
    });
  }
  return items;
}

/**
 * Snippets are rendered as plain text (article list) and as a text fallback
 * in the reader when an article has no body. They must never contain markup:
 * rss-parser's `contentSnippet` decodes `&lt;a href="javascript:..."&gt;` into
 * a real tag, and the `summary` fallback is raw HTML. Strip actual tags first
 * via textContent, then decode the extracted text (feeds double-encode), so
 * encoded literals such as `&lt;div&gt;` remain visible instead of becoming
 * elements that get dropped. The result is inert even if passed to
 * `dangerouslySetInnerHTML` by a stale caller.
 */
function toPlainTextSnippet(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  let text: string;
  try {
    // Keep word boundaries between block elements (`</p><p>` would otherwise
    // concatenate to "helloworld" via textContent).
    const spaced = value.replace(
      /<\/?(?:h[1-6]|p|br|ul|ol|li|blockquote|section|table|tr|div)[^>]*>/gi,
      " ",
    );
    text = new JSDOM(`<body>${spaced}</body>`).window.document.body.textContent ?? "";
  } catch {
    text = value.replace(/<(?:.|\n)*?>/gm, "");
  }
  text = decodeEntities(text).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 500) : undefined;
}

export async function fetchFeed(rawUrl: string): Promise<ParsedFeed> {
  const url = normalizeFeedUrl(rawUrl);
  const { text, response, finalUrl } = await fetchPublicText(url, {
    timeoutMs: FEED_FETCH_TIMEOUT_MS,
    maxBytes: FEED_FETCH_MAX_BYTES,
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain;q=0.8",
      "User-Agent": "RSS-Reader/1.0",
    },
  });
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (contentType && !/rss|atom|xml|text\/plain/i.test(contentType)) {
    throw new Error("The URL did not return an RSS or Atom feed");
  }
  const parsed = await parser.parseString(text);
  const items: ParsedItem[] = (parsed.items ?? []).map((raw: unknown, i: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rss-parser customFields shape is dynamic
    const item = raw as Record<string, any>;
    const link = item.link;
    const mediaDescription: string | undefined = Array.isArray(item.mediaDescription)
      ? item.mediaDescription[0]
      : item.mediaDescription;
    // Prefer RSS content:encoded over content/description. rss-parser exposes
    // RSS <description> as `content`, so checking it first silently discards
    // the full article when a feed publishes both fields. media:description
    // is the last resort, like Feeder's content fallback chain.
    const rawHtml: string | undefined =
      item["content:encoded"] ?? item.content ?? item.summary ?? mediaDescription;
    const content = rawHtml ? sanitizeArticleHtml(rawHtml, link ?? finalUrl) : undefined;
    // Body fallback resolves against the article link, feed candidates
    // against the feed URL — same split as Feeder's feedBaseUrl/linkToHtml.
    const thumbnail = resolveItemThumbnail(item, rawHtml, finalUrl, link ?? finalUrl);
    // rss-parser leaves entities encoded when feeds wrap titles in CDATA or
    // double-encode them (`&amp;#8217;`). React renders strings verbatim, so
    // decode here or `&#8217;` shows up literally in the UI.
    const rawSnippet =
      item.contentSnippet ?? item["content:encodedSnippet"] ?? item.summary;
    return {
      guid: item.guid ?? item.id ?? link ?? `${finalUrl}#${i}`,
      title: decodeEntities(item.title ?? "(untitled)"),
      link,
      snippet: toPlainTextSnippet(typeof rawSnippet === "string" ? rawSnippet : undefined),
      content,
      author: decodeEntities(item.creator ?? item.author ?? undefined) ?? undefined,
      imageUrl: thumbnail.url,
      hasFeedImage: thumbnail.hasFeedImage,
      imageFromBody: thumbnail.fromBody,
      publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : undefined,
    };
  });
  await enrichWithFullArticles(items);
  return {
    title: decodeEntities(parsed.title ?? new URL(finalUrl).hostname),
    siteUrl: parsed.link,
    description: decodeEntities(parsed.description ?? undefined) ?? undefined,
    items,
  };
}
