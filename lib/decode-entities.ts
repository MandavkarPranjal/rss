import { decodeHTML } from "entities";
import { JSDOM } from "jsdom";

/**
 * Decode HTML entities in feed-supplied plain text (`&#8217;`, `&rsquo;`,
 * `&amp;#8217;`, ...).
 *
 * Feeds frequently double-encode titles/snippets (XML-escaped *and*
 * HTML-entity-encoded, or entities inside CDATA), so a single pass leaves
 * literals like `&#8217;` behind. Loop until stable (bounded) so both
 * single- and double-encoded values decode. React renders strings verbatim,
 * so anything left encoded shows up literally in the UI.
 */
export function decodeEntities(value: string): string;
export function decodeEntities(value: null | undefined): null | undefined;
export function decodeEntities(value: string | null | undefined): string | null | undefined;
export function decodeEntities(value: string | null | undefined): string | null | undefined {
  if (!value || !value.includes("&")) return value;
  let current: string = value;
  for (let i = 0; i < 5; i++) {
    const next = decodeHTML(current);
    if (next === current) return next;
    current = next;
    if (!current.includes("&")) return current;
  }
  return current;
}

/**
 * Decode entities in the text nodes of an HTML fragment while preserving
 * markup and attributes (`<p>It&amp;#8217;s</p>` → `<p>It’s</p>`).
 *
 * Feed bodies are frequently double-encoded (XML-escaped *and*
 * HTML-entity-encoded), but a JSDOM round-trip only peels one layer, so the
 * stored HTML renders literals like `&#8217;` in the reader. Only text node
 * data is rewritten — elements, attributes, and structure are untouched, and
 * the serializer re-escapes the decoded text, so no new markup can appear.
 * Non-rendered `script`/`style` content is left alone. Returns the input
 * unchanged when no text node needs decoding.
 */
export function decodeHtmlTextNodes(html: string): string {
  if (!html || !html.includes("&")) return html;
  const dom = new JSDOM(`<body>${html}</body>`);
  const document = dom.window.document;
  const walker = document.createTreeWalker(document.body, dom.window.NodeFilter.SHOW_TEXT);
  let changed = false;
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const parent = text.parentElement?.tagName.toLowerCase();
    if (parent !== "script" && parent !== "style") {
      const decoded = decodeEntities(text.data);
      if (decoded !== text.data) {
        text.data = decoded;
        changed = true;
      }
    }
    node = walker.nextNode();
  }
  return changed ? document.body.innerHTML : html;
}
