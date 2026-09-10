"use client";

import { useMemo } from "react";
import { useEffect, useRef } from "react";
import { buildMuxPlayer, configureEmbedIframe, getVideoEmbed, sanitizeIframe, sanitizeMuxPlayers } from "@/lib/article-embeds";
import { useMuxOverrideAll } from "@/lib/playback-prefs";

const SHIKI_LANGUAGES = [
  "bash",
  "css",
  "go",
  "html",
  "javascript",
  "json",
  "jsx",
  "markdown",
  "python",
  "sql",
  "tsx",
  "typescript",
  "xml",
  "yaml",
] as const;

const LANGUAGE_ALIASES: Record<string, (typeof SHIKI_LANGUAGES)[number]> = {
  deno: "typescript",
  js: "javascript",
  md: "markdown",
  py: "python",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  yml: "yaml",
};

let highlighterPromise: Promise<Awaited<ReturnType<typeof import("shiki/bundle/web")["createHighlighter"]>>> | null = null;

let muxPlayerPromise: Promise<unknown> | null = null;

/** Register the <mux-player> custom element (side-effectful, client only). */
function ensureMuxPlayer() {
  muxPlayerPromise ??= import("@mux/mux-player").catch(() => {
    // The light-DOM "Open video" fallback inside each <mux-player> stays
    // visible when the custom element never upgrades, so content remains
    // reachable even if this chunk fails to load.
    muxPlayerPromise = null;
  });
  return muxPlayerPromise;
}

function getHighlighter() {
  highlighterPromise ??= import("shiki/bundle/web").then(({ createHighlighter }) =>
    createHighlighter({
      langs: [...SHIKI_LANGUAGES],
      themes: ["min-light", "min-dark"],
    }),
  );
  return highlighterPromise;
}

function getLanguage(block: HTMLElement): string {
  const code = block.querySelector("code");
  const className = code?.className || block.className;
  const match = className.match(/(?:language|lang)-([\w#+-]+)/i);
  const declared = (
    code?.getAttribute("data-language") ||
    code?.getAttribute("data-lang") ||
    block.getAttribute("data-language") ||
    block.getAttribute("data-lang") ||
    match?.[1] ||
    "text"
  ).toLowerCase();
  return LANGUAGE_ALIASES[declared] ?? (SHIKI_LANGUAGES.includes(declared as (typeof SHIKI_LANGUAGES)[number]) ? declared : "text");
}

function languageLabel(language: string) {
  if (language === "text") return "Code";
  return language === "javascript" ? "JavaScript" : language[0].toUpperCase() + language.slice(1);
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function addCopyControls(root: HTMLDivElement) {
  return Array.from(root.querySelectorAll<HTMLPreElement>("pre")).map((block) => {
    if (block.closest(".reader-code-block")) return undefined;

    const source = block.textContent ?? "";
    const language = getLanguage(block);
    const wrapper = document.createElement("div");
    wrapper.className = "reader-code-block";
    const toolbar = document.createElement("div");
    toolbar.className = "reader-code-toolbar";

    const label = document.createElement("span");
    label.className = "reader-code-language";
    label.textContent = languageLabel(language);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "reader-code-copy";
    button.textContent = "Copy";
    button.setAttribute("aria-label", `Copy ${languageLabel(language).toLowerCase()} snippet`);
    const onClick = () => {
      copyText(source).then(() => {
        button.textContent = "Copied";
        window.setTimeout(() => {
          button.textContent = "Copy";
        }, 1600);
      }).catch(() => {
        button.textContent = "Couldn’t copy";
        window.setTimeout(() => {
          button.textContent = "Copy";
        }, 1600);
      });
    };
    button.addEventListener("click", onClick);
    toolbar.append(label, button);
    wrapper.append(toolbar, block.cloneNode(true));
    block.replaceWith(wrapper);
    return () => button.removeEventListener("click", onClick);
  }).filter((cleanup): cleanup is () => void => Boolean(cleanup));
}

async function highlightCodeBlocks(root: HTMLDivElement, isCancelled: () => boolean) {
  const highlighter = await getHighlighter();
  if (isCancelled()) return;
  root.querySelectorAll<HTMLElement>(".reader-code-block pre").forEach((block) => {
    if (isCancelled()) return;
    const code = block.querySelector("code");
    if (!code) return;
    const language = getLanguage(block);
    if (language === "text") return;
    const highlighted = highlighter.codeToHtml(code.textContent ?? "", {
      lang: language,
      themes: { light: "min-light", dark: "min-dark" },
    });
    const rendered = document.createElement("div");
    rendered.innerHTML = highlighted;
    const highlightedPre = rendered.firstElementChild;
    if (highlightedPre) block.replaceWith(highlightedPre);
  });
}

function enhanceArticleHtml(html: string, baseUrl?: string, muxOverrideAll = false) {
  if (typeof DOMParser === "undefined") return html;
  const document = new DOMParser().parseFromString(html, "text/html");

  document.querySelectorAll("script, style, noscript, object, embed, form").forEach((element) => element.remove());
  document.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith("on")) element.removeAttribute(attribute.name);
    });

    // Defense in depth: strip non-http(s) link/resource targets. Server-side
    // sanitization already does this, but stale rows or future callers could
    // pass unsanitized HTML (e.g. a snippet fallback) here — a
    // `javascript:` href would otherwise stay executable.
    for (const attributeName of ["href", "src", "xlink:href"]) {
      const value = element.getAttribute(attributeName);
      if (!value) continue;
      const trimmed = value.trim();
      if (trimmed.startsWith("#")) continue;
      const lower = trimmed.toLowerCase();
      if (
        lower.startsWith("javascript:") ||
        lower.startsWith("vbscript:") ||
        lower.startsWith("file:") ||
        lower.startsWith("data:text/html")
      ) {
        element.removeAttribute(attributeName);
        continue;
      }
      if (baseUrl && (attributeName === "href" || attributeName === "src")) {
        try {
          const absolute = new URL(trimmed, baseUrl);
          if (absolute.protocol !== "http:" && absolute.protocol !== "https:") {
            // Keep data:image/audio/video (parity with server sanitizer).
            if (!(attributeName === "src" && absolute.protocol === "data:")) {
              element.removeAttribute(attributeName);
            }
          }
        } catch {
          element.removeAttribute(attributeName);
        }
      }
    }
  });

  document.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    const embed = getVideoEmbed(href, { muxOverrideAll });
    const parent = anchor.parentElement;
    if (!embed || !parent || parent.children.length !== 1 || parent.textContent?.trim() !== href) return;

    if (embed.kind === "mux") {
      parent.replaceWith(buildMuxPlayer(document, embed));
      return;
    }
    const frame = document.createElement("iframe");
    configureEmbedIframe(frame, embed);
    parent.replaceWith(frame);
  });

  document.querySelectorAll<HTMLIFrameElement>("iframe[src]").forEach((frame) => {
    sanitizeIframe(frame, document, baseUrl, { muxOverrideAll });
  });

  // Repair stored <mux-player> elements written before the src/playback-id
  // split fix and backfill the light-DOM fallback link.
  sanitizeMuxPlayers(document);

  return document.body.innerHTML;
}

export default function ArticleContent({ html, baseUrl }: { html: string; baseUrl?: string }) {
  const muxOverrideAll = useMuxOverrideAll();
  const enhancedHtml = useMemo(
    () => enhanceArticleHtml(html, baseUrl, muxOverrideAll),
    [html, baseUrl, muxOverrideAll],
  );
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    if (root.querySelector("mux-player")) void ensureMuxPlayer();
    const cleanups = addCopyControls(root);
    let cancelled = false;
    highlightCodeBlocks(root, () => cancelled).catch(() => {
      // Code remains readable and copyable if a language grammar cannot load.
    });
    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [enhancedHtml]);

  return <div ref={contentRef} className="reader-body mt-6" dangerouslySetInnerHTML={{ __html: enhancedHtml }} />;
}
