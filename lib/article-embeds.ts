export type VideoEmbed =
  | { kind: "iframe"; src: string; title: string }
  | { kind: "mux"; title: string; playbackId?: string; src?: string; playbackToken?: string };

const EMBED_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
const JW_PLAYER_HOSTS = ["content.jwplatform.com", "cdn.jwplayer.com"];
const MUX_PLAYER_HOSTS = ["player.mux.com", "stream.mux.com"];

function isValidJwId(value: string | null): value is string {
  return Boolean(value && /^[a-zA-Z0-9_-]{6,}$/u.test(value));
}

function isValidMuxPlaybackId(value: string | null): value is string {
  return Boolean(value && /^[a-zA-Z0-9_-]{8,}$/u.test(value));
}

/** Direct media files Mux Player can play natively (HLS or progressive). */
const PLAYABLE_MEDIA_EXTENSIONS = ["m3u8", "mp4", "m4v", "webm", "ogv", "ogg"];

export type EmbedOptions = {
  /**
   * When true, direct media file URLs (.m3u8, .mp4, …) also resolve to
   * <mux-player> embeds for a consistent player experience. Provider embeds
   * (YouTube, Vimeo, …) always keep their native players — Mux Player cannot
   * play their embed pages. JW/Mux URLs always resolve to Mux Player.
   */
  muxOverrideAll?: boolean;
};

/**
 * Direct media file (.m3u8, .mp4, …) playable through Mux Player via `src`.
 * Exported so callers can preserve such iframes even when the override toggle
 * is off (instead of dropping them as unknown embeds).
 */
export function getDirectMediaEmbed(urlValue: string, baseUrl?: string): Extract<VideoEmbed, { kind: "mux" }> | undefined {
  const url = resolveUrl(urlValue, baseUrl);
  if (!url) return undefined;
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  const ext = url.pathname.split("/").pop()?.split(".").pop()?.toLowerCase();
  if (!ext || !PLAYABLE_MEDIA_EXTENSIONS.includes(ext)) return undefined;
  const fallback = decodeURIComponent(url.pathname.split("/").pop() || "").slice(0, 80) || "Video";
  return { kind: "mux", src: url.href, title: fallback };
}

/**
 * JW-hosted video, played through Mux Player instead of the JW iframe.
 * The same media ID addresses JW's public HLS manifest, which
 * <mux-player> can play via its `src` attribute.
 */
function jwPlayerEmbed(mediaId: string): VideoEmbed {
  return {
    kind: "mux",
    src: `https://cdn.jwplayer.com/manifests/${encodeURIComponent(mediaId)}.m3u8`,
    title: "JW Player video",
  };
}

/** Mux-hosted video, played through Mux Player via its playback ID. */
function muxPlayerEmbed(playbackId: string, playbackToken?: string): VideoEmbed {
  // Note: no `src` — Mux Player derives the stream URL (including signed
  // `?token=` params) from `playback-id` + `playback-token`. Setting both
  // `playback-id` and `src` is redundant and risks the raw `src` winning over
  // the signed derived URL.
  return {
    kind: "mux",
    playbackId,
    playbackToken,
    title: "Mux video",
  };
}

/**
 * User-facing watch URL for a mux-kind embed. Used as progressive-enhancement
 * fallback content inside <mux-player> so the video stays reachable when the
 * custom element is not upgraded (JS disabled / chunk load failure).
 */
export function getMuxFallbackUrl(embed: Extract<VideoEmbed, { kind: "mux" }>): string | undefined {
  if (embed.playbackId) return `https://player.mux.com/${encodeURIComponent(embed.playbackId)}`;
  return embed.src;
}

/** Build a <mux-player> element for a mux-kind embed. */
export function buildMuxPlayer(
  document: Document,
  embed: Extract<VideoEmbed, { kind: "mux" }>,
  title?: string | null,
): Element {
  const player = document.createElement("mux-player");
  player.setAttribute("stream-type", "on-demand");
  if (embed.playbackId) {
    player.setAttribute("playback-id", embed.playbackId);
    if (embed.playbackToken) player.setAttribute("playback-token", embed.playbackToken);
    // Intentionally no `src`: `playback-id` (+ `playback-token`) is the
    // documented signed-playback pattern; `src` is only for raw manifests
    // (the JW / direct-file case, which has no playback id).
  } else {
    if (embed.playbackToken) player.setAttribute("playback-token", embed.playbackToken);
    if (embed.src) player.setAttribute("src", embed.src);
  }
  const label = title?.trim() || embed.title;
  player.setAttribute("title", label);
  player.setAttribute("metadata-video-title", label);
  // Light-DOM fallback: visible while the custom element is un-upgraded,
  // hidden once Mux Player upgrades and attaches its shadow DOM.
  const fallbackUrl = getMuxFallbackUrl(embed);
  if (fallbackUrl) {
    const fallback = document.createElement("a");
    fallback.setAttribute("href", fallbackUrl);
    fallback.setAttribute("target", "_blank");
    fallback.setAttribute("rel", "noreferrer");
    fallback.setAttribute("class", "mux-player-fallback");
    fallback.textContent = "Open video";
    player.append(fallback);
  }
  return player;
}

/**
 * Repair previously stored <mux-player> elements: drop the redundant `src`
 * when `playback-id` is present and backfill the light-DOM fallback link.
 * Stored rows written before the fix keep rendering with both attributes
 * otherwise, since ingest only rebuilds anchors/iframes.
 */
export function sanitizeMuxPlayers(document: Document): void {
  document.querySelectorAll("mux-player").forEach((player) => {
    const playbackId = player.getAttribute("playback-id");
    if (playbackId) player.removeAttribute("src");
    if (player.querySelector("a[href]")) return;
    const src = player.getAttribute("src");
    const fallbackUrl = playbackId
      ? `https://player.mux.com/${encodeURIComponent(playbackId)}`
      : src;
    if (!fallbackUrl) return;
    const fallback = document.createElement("a");
    fallback.setAttribute("href", fallbackUrl);
    fallback.setAttribute("target", "_blank");
    fallback.setAttribute("rel", "noreferrer");
    fallback.setAttribute("class", "mux-player-fallback");
    fallback.textContent = "Open video";
    player.append(fallback);
  });
}

/** Apply the shared iframe policy to a known-safe video embed. */
export function configureEmbedIframe(
  frame: HTMLIFrameElement,
  embed: Extract<VideoEmbed, { kind: "iframe" }>,
  title?: string | null,
): void {
  frame.removeAttribute("srcdoc");
  frame.setAttribute("src", embed.src);
  frame.setAttribute("title", title || embed.title);
  frame.setAttribute("loading", "lazy");
  frame.setAttribute("allow", EMBED_IFRAME_ALLOW);
  frame.setAttribute("allowfullscreen", "true");
}

/** Link-out card for embeds browsers refuse to frame. */
export function buildEmbedFallback(
  document: Document,
  url: string,
  title: string | null,
): HTMLDivElement {
  const box = document.createElement("div");
  box.setAttribute("class", "article-embed");
  const label = document.createElement("p");
  label.setAttribute("class", "article-embed-title");
  label.textContent = title?.trim() || "Interactive content";
  const link = document.createElement("a");
  link.setAttribute("class", "article-embed-link");
  link.setAttribute("href", url);
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noreferrer");
  link.textContent = "Open interactive content";
  box.append(label, link);
  return box;
}

function isAllowedHost(hostname: string, hosts: string[]) {
  const host = hostname.toLowerCase();
  return hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function youtubeEmbed(url: URL): string | undefined {
  let videoId: string | undefined;
  if (isAllowedHost(url.hostname, ["youtube.com", "youtube-nocookie.com"])) {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v") ?? undefined;
    if (url.pathname.startsWith("/shorts/")) videoId = url.pathname.split("/")[2];
    if (url.pathname.startsWith("/embed/")) videoId = url.pathname.split("/")[2];
  } else if (url.hostname.toLowerCase() === "youtu.be") {
    videoId = url.pathname.split("/")[1];
  }
  return videoId && /^[a-zA-Z0-9_-]{6,}$/u.test(videoId)
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`
    : undefined;
}

export function getVideoEmbed(urlValue: string, options?: EmbedOptions): VideoEmbed | undefined {
  let url: URL;
  try {
    url = new URL(urlValue.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

  const youtube = youtubeEmbed(url);
  if (youtube) return { kind: "iframe", src: youtube, title: "YouTube video" };

  if (isAllowedHost(url.hostname, ["vimeo.com"])) {
    const id = url.pathname.match(/\/(\d+)(?:$|\/)/u)?.[1];
    if (id) return { kind: "iframe", src: `https://player.vimeo.com/video/${id}`, title: "Vimeo video" };
  }

  if (isAllowedHost(url.hostname, ["dailymotion.com", "dai.ly"])) {
    const id = url.hostname.toLowerCase() === "dai.ly"
      ? url.pathname.split("/")[1]
      : url.pathname.match(/\/video\/([a-zA-Z0-9]+)/u)?.[1];
    if (id) return { kind: "iframe", src: `https://www.dailymotion.com/embed/video/${id}`, title: "Dailymotion video" };
  }

  if (isAllowedHost(url.hostname, ["loom.com"])) {
    const id = url.pathname.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/u)?.[1];
    if (id) return { kind: "iframe", src: `https://www.loom.com/embed/${id}`, title: "Loom video" };
  }

  if (isAllowedHost(url.hostname, ["twitch.tv"])) {
    const id = url.pathname.match(/\/videos\/(\d+)/u)?.[1] ?? url.searchParams.get("video") ?? undefined;
    if (id) return { kind: "iframe", src: `https://player.twitch.tv/?video=${id}&parent=${encodeURIComponent(typeof window === "undefined" ? "localhost" : window.location.hostname)}`, title: "Twitch video" };
  }

  if (isAllowedHost(url.hostname, MUX_PLAYER_HOSTS)) {
    // player.mux.com/{playbackId} and stream.mux.com/{playbackId}[.m3u8]
    const playbackId = url.pathname.split("/").filter(Boolean)[0]?.replace(/\.m3u8$/u, "");
    const token = url.searchParams.get("token") ?? url.searchParams.get("playback-token") ?? undefined;
    if (isValidMuxPlaybackId(playbackId ?? null)) return muxPlayerEmbed(playbackId, token);
  }

  if (isAllowedHost(url.hostname, JW_PLAYER_HOSTS)) {
    const mediaMatch = url.pathname.match(/^\/v2\/media\/([a-zA-Z0-9_-]+)$/u);
    if (mediaMatch && isValidJwId(mediaMatch[1])) return jwPlayerEmbed(mediaMatch[1]);

    const playerMatch = url.pathname.match(/^\/players\/([a-zA-Z0-9_-]+?)(?:-[a-zA-Z0-9_-]+)?\.html$/u);
    if (playerMatch && isValidJwId(playerMatch[1])) return jwPlayerEmbed(playerMatch[1]);

    const manifestMatch = url.pathname.match(/^\/manifests\/([a-zA-Z0-9_-]+)\.m3u8$/u);
    if (manifestMatch && isValidJwId(manifestMatch[1])) return jwPlayerEmbed(manifestMatch[1]);
  }

  if (options?.muxOverrideAll) {
    const direct = getDirectMediaEmbed(url.href);
    if (direct) return direct;
  }

  return undefined;
}

function resolveUrl(value: string, baseUrl?: string): URL | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
  } catch {
    return undefined;
  }
}

/** Resolve to an absolute http(s) URL, or undefined for anything else. */
function getAbsoluteHttpUrl(value: string, baseUrl?: string): string | undefined {
  const resolved = resolveUrl(value, baseUrl);
  if (!resolved) return undefined;
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return undefined;
  return resolved.href;
}

function isSameOrigin(url: URL, baseUrl: string): boolean {
  try {
    return url.origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Resolve an <iframe> src against the article URL when it points at the same
 * origin (e.g. PlanetScale's relative `/blog/.../iframe#...` interactive
 * demos). Returns the absolute URL, or undefined for anything else.
 *
 * Note: same-origin does NOT mean embeddable — sites like PlanetScale send
 * `X-Frame-Options: SAMEORIGIN`, so the browser refuses to render their pages
 * inside our reader. Callers should link out to these URLs instead of
 * rendering an <iframe> for them.
 */
export function getSameOriginIframeUrl(srcValue: string, baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined;
  const resolved = resolveUrl(srcValue, baseUrl);
  if (!resolved) return undefined;
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return undefined;
  if (getVideoEmbed(resolved.href)) return undefined;
  return isSameOrigin(resolved, baseUrl) ? resolved.href : undefined;
}

/**
 * Decide whether an <iframe> src is safe to keep as an embed.
 *
 * Only known video providers (which explicitly allow framing) are kept.
 * Same-origin interactive demos are NOT embeddable in practice
 * (`X-Frame-Options: SAMEORIGIN` blocks cross-origin framing) — use
 * getSameOriginIframeUrl() to render a link-out card for those instead.
 * Cross-origin iframes from unknown hosts are dropped to avoid
 * clickjacking / tracking.
 */
export function getSafeIframeSrc(srcValue: string, baseUrl?: string, options?: EmbedOptions): VideoEmbed | undefined {
  const resolved = resolveUrl(srcValue, baseUrl);
  if (!resolved) return undefined;
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return undefined;

  const video = getVideoEmbed(resolved.href, options);
  if (video) return video;

  return undefined;
}

/** Sanitize an iframe in place, replacing unsupported demos with a link-out. */
export function sanitizeIframe(
  frame: HTMLIFrameElement,
  document: Document,
  baseUrl?: string,
  options?: EmbedOptions,
): void {
  const src = frame.getAttribute("src") ?? "";
  const embed = getSafeIframeSrc(src, baseUrl, options);
  if (embed) {
    // Mux-played videos (Mux-hosted or JW manifests) render as <mux-player>
    // instead of an <iframe> — e.g. stale JW player iframes stored before the
    // migration are upgraded in place.
    if (embed.kind === "mux") {
      frame.replaceWith(buildMuxPlayer(document, embed, frame.getAttribute("title")));
      return;
    }
    configureEmbedIframe(frame, embed, frame.getAttribute("title"));
    return;
  }

  // Direct media files are safe to frame (no interactive page inside), so
  // preserve them as plain iframes. The reader upgrades them to <mux-player>
  // client-side when the override toggle is on.
  const absoluteSrc = getAbsoluteHttpUrl(src, baseUrl);
  const direct = absoluteSrc ? getDirectMediaEmbed(absoluteSrc) : undefined;
  if (direct && absoluteSrc) {
    configureEmbedIframe(
      frame,
      { kind: "iframe", src: absoluteSrc, title: frame.getAttribute("title")?.trim() || direct.title },
      frame.getAttribute("title"),
    );
    return;
  }

  const demoUrl = getSameOriginIframeUrl(src, baseUrl);
  if (demoUrl) {
    frame.replaceWith(buildEmbedFallback(document, demoUrl, frame.getAttribute("title")));
    return;
  }

  frame.remove();
}
