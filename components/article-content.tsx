"use client";

import { useMemo } from "react";
import { getSafeIframeSrc, getSameOriginIframeUrl, getVideoEmbed } from "@/lib/article-embeds";

function buildEmbedFallback(document: Document, url: string, title: string | null) {
  const box = document.createElement("div");
  box.className = "article-embed";
  const label = document.createElement("p");
  label.className = "article-embed-title";
  label.textContent = title?.trim() || "Interactive content";
  const link = document.createElement("a");
  link.className = "article-embed-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Open interactive content";
  box.append(label, link);
  return box;
}

function enhanceArticleHtml(html: string, baseUrl?: string) {
  if (typeof DOMParser === "undefined") return html;
  const document = new DOMParser().parseFromString(html, "text/html");

  document.querySelectorAll("script, style, noscript, object, embed, form").forEach((element) => element.remove());
  document.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith("on")) element.removeAttribute(attribute.name);
    });
  });

  document.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    const embed = getVideoEmbed(href);
    const parent = anchor.parentElement;
    if (!embed || !parent || parent.children.length !== 1 || parent.textContent?.trim() !== href) return;

    const frame = document.createElement("iframe");
    frame.src = embed.src;
    frame.title = embed.title;
    frame.loading = "lazy";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    parent.replaceWith(frame);
  });

  document.querySelectorAll("iframe[src]").forEach((frame) => {
    const src = frame.getAttribute("src") ?? "";
    const embed = getSafeIframeSrc(src, baseUrl);
    if (embed) {
      frame.setAttribute("src", embed.src);
      frame.setAttribute("title", frame.getAttribute("title") || embed.title);
      frame.setAttribute("loading", "lazy");
      frame.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
      frame.setAttribute("allowfullscreen", "true");
      return;
    }
    // Site-owned demos (e.g. PlanetScale) block framing via
    // X-Frame-Options: SAMEORIGIN — link out instead of a broken frame.
    // This also upgrades articles stored while iframes were kept as-is.
    const demoUrl = getSameOriginIframeUrl(src, baseUrl);
    if (demoUrl) {
      frame.replaceWith(buildEmbedFallback(document, demoUrl, frame.getAttribute("title")));
      return;
    }
    frame.remove();
  });

  return document.body.innerHTML;
}

export default function ArticleContent({ html, baseUrl }: { html: string; baseUrl?: string }) {
  const enhancedHtml = useMemo(() => enhanceArticleHtml(html, baseUrl), [html, baseUrl]);
  return <div className="reader-body mt-6" dangerouslySetInnerHTML={{ __html: enhancedHtml }} />;
}
