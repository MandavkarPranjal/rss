import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 5;

export class RemoteFetchError extends Error {
  constructor(message: string, public readonly code: "INVALID_URL" | "PRIVATE_HOST" | "TOO_LARGE" | "HTTP_ERROR" | "TIMEOUT" | "NETWORK") {
    super(message);
    this.name = "RemoteFetchError";
  }
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && b >= 18 && b <= 19) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:192.168.") ||
      normalized.startsWith("::ffff:172.")
    );
  }

  return true;
}

async function assertPublicUrl(input: URL): Promise<void> {
  if (input.protocol !== "http:" && input.protocol !== "https:") {
    throw new RemoteFetchError("Only HTTP and HTTPS URLs are supported", "INVALID_URL");
  }
  if (input.username || input.password || !input.hostname) {
    throw new RemoteFetchError("Invalid remote URL", "INVALID_URL");
  }

  const addresses = isIP(input.hostname)
    ? [{ address: input.hostname }]
    : await lookup(input.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new RemoteFetchError("Remote host is not publicly reachable", "PRIVATE_HOST");
  }
}

async function readBody(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    throw new RemoteFetchError("Remote response is too large", "TOO_LARGE");
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RemoteFetchError("Remote response is too large", "TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function fetchPublicText(
  rawUrl: string,
  options: {
    timeoutMs: number;
    maxBytes: number;
    headers?: HeadersInit;
    maxRedirects?: number;
  },
): Promise<{ text: string; response: Response; finalUrl: string }> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new RemoteFetchError("Invalid remote URL", "INVALID_URL");
  }

  const redirects = options.maxRedirects ?? MAX_REDIRECTS;
  for (let redirect = 0; redirect <= redirects; redirect += 1) {
    await assertPublicUrl(current);
    let response: Response;
    try {
      response = await fetch(current, {
        headers: options.headers,
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      if (error instanceof RemoteFetchError) throw error;
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new RemoteFetchError("Remote request timed out", "TIMEOUT");
      }
      throw new RemoteFetchError("Remote request failed", "NETWORK");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === redirects) {
        throw new RemoteFetchError("Too many remote redirects", "HTTP_ERROR");
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new RemoteFetchError(`Remote request returned HTTP ${response.status}`, "HTTP_ERROR");
    }

    return { text: await readBody(response, options.maxBytes), response, finalUrl: current.href };
  }

  throw new RemoteFetchError("Too many remote redirects", "HTTP_ERROR");
}
