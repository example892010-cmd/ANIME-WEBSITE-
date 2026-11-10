
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { redisGet, redisSet } from "@/lib/redis";

export const CORS_PNA_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Accept-Ranges",
  "Access-Control-Allow-Private-Network": "true",
};

const PROXY_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_REDIS_CACHE_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 4;
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;

interface CachedProxyPayload {
  contentType: string;
  cacheControl: string;
  bodyBase64: string;
}

interface ProxyResult {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

const proxyInflight = new Map<string, Promise<ProxyResult>>();

const FLIX_IMAGE_SEGMENT_XOR_KEY = Uint8Array.from([
  157, 42, 241, 71, 179, 142, 92, 112,
  166, 25, 228, 59, 216, 98, 15, 197,
]);

const DEFAULT_ALLOWED_HOSTS = [
  "watchanimeworld.net",
  "www.watchanimeworld.net",
  "play.zephyrflick.top",
];

const ALLOWED_HOSTS = new Set([
  ...DEFAULT_ALLOWED_HOSTS,
  ...(process.env.HLS_PROXY_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
]);

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal" ||
    host === "metadata"
  ) {
    return true;
  }

  const ipVersion = isIP(host);

  if (ipVersion === 4) {
    const parts = host.split(".").map(Number);
    const [a, b] = parts;

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (ipVersion === 6) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:") ||
      host.startsWith("::ffff:")
    );
  }

  return false;
}

function validateTarget(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid upstream URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS upstream URLs are allowed");
  }

  if (url.username || url.password) {
    throw new Error("URL credentials are not allowed");
  }

  const hostname = url.hostname.toLowerCase();

  if (isBlockedHostname(hostname)) {
    throw new Error("Private or local upstream host rejected");
  }

  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(`Upstream host is not allowlisted: ${hostname}`);
  }

  return url;
}

function validateReferer(value: string, fallback: string): string {
  if (!value) return fallback;

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      isBlockedHostname(url.hostname)
    ) {
      return fallback;
    }

    return url.toString();
  } catch {
    return fallback;
  }
}

function sanitizeCustomHeaders(value: string): Record<string, string> {
  if (!value || value.length > 8192) return {};

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const allowed = new Set([
      "user-agent",
      "accept",
      "accept-language",
      "referer",
      "origin",
    ]);

    const result: Record<string, string> = {};

    for (const [key, rawValue] of Object.entries(parsed)) {
      const normalized = key.toLowerCase();

      if (!allowed.has(normalized)) continue;
      if (typeof rawValue !== "string") continue;
      if (/[\r\n]/.test(rawValue)) continue;

      result[normalized] = rawValue.slice(0, 2048);
    }

    return result;
  } catch {
    return {};
  }
}

export function decryptFlixManifest(
  bodyBuffer: Buffer,
  playlistKey?: string
): string {
  const trimmed = bodyBuffer.toString("utf8").trim();

  if (trimmed.startsWith("#EXTM3U") || !playlistKey) {
    return trimmed;
  }

  try {
    const key = Buffer.from(playlistKey, "base64");
    const payload = Buffer.from(trimmed, "base64");

    if (!key.length || !payload.length) return trimmed;

    const out = Buffer.alloc(payload.length);

    for (let i = 0; i < payload.length; i++) {
      out[i] = payload[i] ^ key[i % key.length];
    }

    const text = out.toString("utf8").trim();

    if (text.startsWith("#EXTM3U")) return text;
  } catch {
    // Keep the original response if decoding fails.
  }

  return trimmed;
}

export function unwrapFlixImageSegment(
  bodyBuffer: Buffer
): { body: Buffer; unwrapped: boolean } {
  let offset = 0;
  let needsXor = false;

  const isWebp =
    bodyBuffer.length > 12 &&
    bodyBuffer[0] === 0x52 &&
    bodyBuffer[1] === 0x49 &&
    bodyBuffer[2] === 0x46 &&
    bodyBuffer[3] === 0x46 &&
    bodyBuffer[8] === 0x57 &&
    bodyBuffer[9] === 0x45 &&
    bodyBuffer[10] === 0x42 &&
    bodyBuffer[11] === 0x50;

  const isPng =
    bodyBuffer.length > 8 &&
    bodyBuffer[0] === 0x89 &&
    bodyBuffer[1] === 0x50 &&
    bodyBuffer[2] === 0x4e &&
    bodyBuffer[3] === 0x47 &&
    bodyBuffer[4] === 0x0d &&
    bodyBuffer[5] === 0x0a &&
    bodyBuffer[6] === 0x1a &&
    bodyBuffer[7] === 0x0a;

  if (isWebp) {
    offset = 12;
    needsXor = bodyBuffer[offset] !== 0x47;
  } else if (isPng) {
    offset = 8;
    needsXor = bodyBuffer[offset] !== 0x47;
  }

  if (!offset) {
    return { body: bodyBuffer, unwrapped: false };
  }

  const out = Buffer.from(bodyBuffer.subarray(offset));

  if (needsXor) {
    for (let i = 0; i < out.length; i++) {
      out[i] ^=
        FLIX_IMAGE_SEGMENT_XOR_KEY[
          i % FLIX_IMAGE_SEGMENT_XOR_KEY.length
        ];
    }
  }

  return { body: out, unwrapped: true };
}

async function fetchUpstream(
  initialUrl: URL,
  headers: Record<string, string>
): Promise<Response> {
  let currentUrl = validateTarget(initialUrl.toString());

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    let response: Response;

    try {
      response = await fetch(currentUrl.toString(), {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (
      response.status < 300 ||
      response.status >= 400
    ) {
      return response;
    }

    const location = response.headers.get("location");

    if (!location) {
      throw new Error("Upstream redirect has no location");
    }

    if (redirect === MAX_REDIRECTS) {
      throw new Error("Too many upstream redirects");
    }

    const nextUrl = new URL(location, currentUrl);

    // Every redirect must pass the same allowlist.
    currentUrl = validateTarget(nextUrl.toString());
  }

  throw new Error("Upstream request failed");
}

function makeProxyUrl(
  target: string,
  proxyPathPrefix: string,
  referer: string,
  headersParam: string,
  playlistKey: string
): string {
  const params = new URLSearchParams();

  params.set("url", target);

  if (referer) params.set("referer", referer);
  if (headersParam) params.set("headers", headersParam);
  if (playlistKey) params.set("playlist_key", playlistKey);

  return `${proxyPathPrefix}?${params.toString()}`;
}

function rewriteManifest(
  manifestText: string,
  finalUrl: string,
  proxyPathPrefix: string,
  referer: string,
  headersParam: string,
  playlistKey: string
): string {
  const baseUrl = new URL(finalUrl);

  const isMaster = manifestText.includes(
    "#EXT-X-STREAM-INF:"
  );

  let nextLineIsVariant = false;

  return manifestText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();

      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        if (trimmed.startsWith("#EXT-X-STREAM-INF:")) {
          nextLineIsVariant = true;
        }

        // Rewrite URI attributes on all HLS tags that contain them,
        // including AUDIO, SUBTITLES, I-FRAME, KEY and MAP.
        if (/\bURI="/i.test(trimmed)) {
          return trimmed.replace(
            /\bURI="([^"]+)"/gi,
            (_match, rawUri: string) => {
              try {
                const absoluteUrl = new URL(
                  rawUri,
                  baseUrl
                ).toString();

                const isPlaylist =
                  /\.m3u8(?:$|[?#])/i.test(absoluteUrl);

                const proxied = makeProxyUrl(
                  absoluteUrl,
                  proxyPathPrefix,
                  referer,
                  headersParam,
                  isPlaylist ? playlistKey : ""
                );

                return `URI="${proxied}"`;
              } catch {
                return `URI="${rawUri}"`;
              }
            }
          );
        }

        return line;
      }

      try {
        const absoluteUrl = new URL(
          trimmed,
          baseUrl
        ).toString();

        const isPlaylist =
          nextLineIsVariant ||
          /\.m3u8(?:$|[?#])/i.test(absoluteUrl);

        nextLineIsVariant = false;

        return makeProxyUrl(
          absoluteUrl,
          proxyPathPrefix,
          referer,
          headersParam,
          isPlaylist ? playlistKey : ""
        );
      } catch {
        nextLineIsVariant = false;
        return line;
      }
    })
    .join("\n");
}

function responseHeaders(
  contentType: string,
  cacheControl: string
): Record<string, string> {
  return {
    ...CORS_PNA_HEADERS,
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  };
}

async function readLimitedBody(
  response: Response
): Promise<Buffer> {
  const declaredLength = Number(
    response.headers.get("content-length") || 0
  );

  if (
    declaredLength > MAX_RESPONSE_BYTES
  ) {
    throw new Error("Upstream response exceeds size limit");
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("Upstream response exceeds size limit");
  }

  return buffer;
}

export async function handleHlsProxyRequest(
  requestUrl: string,
  proxyPathPrefix: string = "/api/proxy"
): Promise<Response> {
  let parsedRequest: URL;

  try {
    parsedRequest = new URL(
      requestUrl,
      "http://localhost"
    );
  } catch {
    return new Response("Invalid proxy request", {
      status: 400,
      headers: CORS_PNA_HEADERS,
    });
  }

  const searchParams = parsedRequest.searchParams;

  const targetUrl = searchParams.get("url") || "";
  const refererParam = searchParams.get("referer") || "";
  const headersParam = searchParams.get("headers") || "";
  const playlistKey = searchParams.get("playlist_key") || "";

  if (!targetUrl) {
    return new Response("Missing url parameter", {
      status: 400,
      headers: CORS_PNA_HEADERS,
    });
  }

  let targetUri: URL;

  try {
    targetUri = validateTarget(targetUrl);
  } catch (error) {
    return new Response(
      error instanceof Error
        ? error.message
        : "Invalid upstream URL",
      {
        status: 403,
        headers: CORS_PNA_HEADERS,
      }
    );
  }

  if (
    !proxyPathPrefix.startsWith("/") ||
    proxyPathPrefix.includes("?") ||
    proxyPathPrefix.includes("#")
  ) {
    return new Response("Invalid proxy path", {
      status: 400,
      headers: CORS_PNA_HEADERS,
    });
  }

  const customHeaders =
    sanitizeCustomHeaders(headersParam);

  const referer = validateReferer(
    refererParam ||
      customHeaders.referer ||
      "",
    `${targetUri.origin}/`
  );

  const origin =
    customHeaders.origin ||
    new URL(referer).origin;

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      customHeaders["user-agent"] || USER_AGENT,
    Accept: customHeaders.accept || "*/*",
    "Accept-Language":
      customHeaders["accept-language"] ||
      "en-US,en;q=0.9",
    Referer: referer,
    Origin: origin,
  };

  const cacheKey = `proxy:v2:${createHash("sha256")
    .update(
      [
        proxyPathPrefix,
        targetUri.toString(),
        referer,
        JSON.stringify(upstreamHeaders),
        playlistKey,
      ].join("|")
    )
    .digest("hex")}`;

  // Cache failures should not break playback.
  try {
    const cachedRaw = await redisGet(cacheKey);

    if (cachedRaw) {
      const cached = JSON.parse(
        cachedRaw
      ) as CachedProxyPayload;

      if (
        cached.bodyBase64 &&
        cached.contentType
      ) {
        return new Response(
          new Uint8Array(
            Buffer.from(cached.bodyBase64, "base64")
          ),
          {
            status: 200,
            headers: responseHeaders(
              cached.contentType,
              cached.cacheControl ||
                "public, max-age=1800"
            ),
          }
        );
      }
    }
  } catch {
    // Continue with upstream request.
  }

  const existing = proxyInflight.get(cacheKey);

  if (existing) {
    try {
      const shared = await existing;

      return new Response(
        new Uint8Array(shared.body),
        {
          status: shared.status,
          headers: shared.headers,
        }
      );
    } catch {
      // Continue with a fresh request.
    }
  }

  const workPromise = (async (): Promise<ProxyResult> => {
    const response = await fetchUpstream(
      targetUri,
      upstreamHeaders
    );

    if (!response.ok) {
      return {
        status: response.status,
        headers: CORS_PNA_HEADERS,
        body: new TextEncoder().encode(
          `Upstream returned HTTP ${response.status}`
        ),
      };
    }

    const contentType = (
      response.headers.get("content-type") || ""
    ).toLowerCase();

    const finalUrl =
      response.url || targetUri.toString();

    const finalUri = validateTarget(finalUrl);

    const rawBuffer = await readLimitedBody(response);

    const isM3u8Candidate =
      Boolean(playlistKey) ||
      /\.m3u8(?:$|[?#])/i.test(finalUri.toString()) ||
      contentType.includes("mpegurl") ||
      contentType.includes("x-mpegurl") ||
      contentType.includes("vnd.apple.mpegurl");

    if (isM3u8Candidate) {
      const manifestText = decryptFlixManifest(
        rawBuffer,
        playlistKey || undefined
      );

      if (manifestText.startsWith("#EXTM3U")) {
        const rewrittenManifest = rewriteManifest(
          manifestText,
          finalUri.toString(),
          proxyPathPrefix,
          referer,
          headersParam,
          playlistKey
        );

        const manifestBuffer = Buffer.from(
          rewrittenManifest,
          "utf8"
        );

        const headers = responseHeaders(
          "application/vnd.apple.mpegurl",
          "no-cache"
        );

        if (
          manifestBuffer.byteLength <=
          MAX_REDIS_CACHE_BYTES
        ) {
          const payload: CachedProxyPayload = {
            contentType:
              "application/vnd.apple.mpegurl",
            cacheControl: "no-cache",
            bodyBase64:
              manifestBuffer.toString("base64"),
          };

          void redisSet(
            cacheKey,
            JSON.stringify(payload),
            PROXY_CACHE_TTL_MS
          ).catch(() => {});
        }

        return {
          status: 200,
          headers,
          body: new Uint8Array(manifestBuffer),
        };
      }
    }

    const {
      body: finalBody,
      unwrapped,
    } = unwrapFlixImageSegment(rawBuffer);

    const path = finalUri.pathname.toLowerCase();

    let finalContentType = unwrapped
      ? "video/mp2t"
      : contentType;

    if (path.endsWith(".vtt") || contentType.includes("vtt")) {
      finalContentType = "text/vtt; charset=utf-8";
    } else if (path.endsWith(".srt")) {
      finalContentType = "text/plain; charset=utf-8";
    } else if (path.endsWith(".ass")) {
      finalContentType = "text/x-ssa; charset=utf-8";
    } else if (!finalContentType) {
      finalContentType = "application/octet-stream";
    }

    const isVideo =
      finalContentType.includes("video/") ||
      finalContentType.includes("octet-stream") ||
      finalContentType.includes("mpeg");

    const shouldCache =
      !unwrapped &&
      !isVideo &&
      finalBody.byteLength <= MAX_REDIS_CACHE_BYTES;

    if (shouldCache) {
      const payload: CachedProxyPayload = {
        contentType: finalContentType,
        cacheControl: "public, max-age=1800",
        bodyBase64: finalBody.toString("base64"),
      };

      void redisSet(
        cacheKey,
        JSON.stringify(payload),
        PROXY_CACHE_TTL_MS
      ).catch(() => {});
    }

    return {
      status: 200,
      headers: responseHeaders(
        finalContentType,
        shouldCache
          ? "public, max-age=1800"
          : "no-store"
      ),
      body: new Uint8Array(finalBody),
    };
  })();

  proxyInflight.set(cacheKey, workPromise);

  try {
    const result = await workPromise;

    return new Response(
      new Uint8Array(result.body),
      {
        status: result.status,
        headers: result.headers,
      }
    );
  } catch (error) {
    console.error(
      "[HLS Proxy] Request failed:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    return new Response(
      "HLS proxy request failed",
      {
        status: 502,
        headers: CORS_PNA_HEADERS,
      }
    );
  } finally {
    proxyInflight.delete(cacheKey);
  }
}
