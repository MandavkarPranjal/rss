"use client";

import { useMemo } from "react";
import { configureEmbedIframe, getVideoEmbed, sanitizeIframe } from "@/lib/article-embeds";

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
    configureEmbedIframe(frame, embed);
    parent.replaceWith(frame);
  });

  document.querySelectorAll<HTMLIFrameElement>("iframe[src]").forEach((frame) => {
    sanitizeIframe(frame, document, baseUrl);
  });

  return document.body.innerHTML;
}

export default function ArticleContent({ html, baseUrl }: { html: string; baseUrl?: string }) {
  const enhancedHtml = useMemo(() => enhanceArticleHtml(html, baseUrl), [html, baseUrl]);
  return <div className="reader-body mt-6" dangerouslySetInnerHTML={{ __html: enhancedHtml }} />;
}
