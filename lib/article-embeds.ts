export type VideoEmbed = {
  src: string;
  title: string;
};

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

export function getVideoEmbed(urlValue: string): VideoEmbed | undefined {
  let url: URL;
  try {
    url = new URL(urlValue.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

  const youtube = youtubeEmbed(url);
  if (youtube) return { src: youtube, title: "YouTube video" };

  if (isAllowedHost(url.hostname, ["vimeo.com"])) {
    const id = url.pathname.match(/\/(\d+)(?:$|\/)/u)?.[1];
    if (id) return { src: `https://player.vimeo.com/video/${id}`, title: "Vimeo video" };
  }

  if (isAllowedHost(url.hostname, ["dailymotion.com", "dai.ly"])) {
    const id = url.hostname.toLowerCase() === "dai.ly"
      ? url.pathname.split("/")[1]
      : url.pathname.match(/\/video\/([a-zA-Z0-9]+)/u)?.[1];
    if (id) return { src: `https://www.dailymotion.com/embed/video/${id}`, title: "Dailymotion video" };
  }

  if (isAllowedHost(url.hostname, ["loom.com"])) {
    const id = url.pathname.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/u)?.[1];
    if (id) return { src: `https://www.loom.com/embed/${id}`, title: "Loom video" };
  }

  if (isAllowedHost(url.hostname, ["twitch.tv"])) {
    const id = url.pathname.match(/\/videos\/(\d+)/u)?.[1] ?? url.searchParams.get("video") ?? undefined;
    if (id) return { src: `https://player.twitch.tv/?video=${id}&parent=${encodeURIComponent(typeof window === "undefined" ? "localhost" : window.location.hostname)}`, title: "Twitch video" };
  }

  return undefined;
}
