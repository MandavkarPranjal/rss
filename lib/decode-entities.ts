import { decodeHTML } from "entities";

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
  if (!value || !value.includes("&") || !value.includes(";")) return value;
  let current: string = value;
  for (let i = 0; i < 5; i++) {
    const next = decodeHTML(current);
    if (next === current) return next;
    current = next;
    if (!current.includes("&") || !current.includes(";")) return current;
  }
  return current;
}
