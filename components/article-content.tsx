"use client";

import { useMemo } from "react";
import { getVideoEmbed } from "@/lib/article-embeds";

function enhanceArticleHtml(html: string) {
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
    const embed = getVideoEmbed(src);
    if (!embed) {
      frame.remove();
      return;
    }
    frame.setAttribute("src", embed.src);
    frame.setAttribute("title", frame.getAttribute("title") || embed.title);
    frame.setAttribute("loading", "lazy");
    frame.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    frame.setAttribute("allowfullscreen", "true");
  });

  return document.body.innerHTML;
}

export default function ArticleContent({ html }: { html: string }) {
  const enhancedHtml = useMemo(() => enhanceArticleHtml(html), [html]);
  return <div className="reader-body mt-6" dangerouslySetInnerHTML={{ __html: enhancedHtml }} />;
}
