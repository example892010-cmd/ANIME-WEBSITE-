
import { getMedia } from "../core/anilist.js";
import {
  buildTitles,
  buildTitleSearchQueries,
  episodeMeta,
  expectedCount,
  json,
} from "../core/new-provider-utils.js";
import {
  get as cacheGet,
  set as cacheSet,
  isFresh,
  SHOW_IDENTITY_TTL,
} from "../core/smartcache.js";

const BASE = "https://watchanimeworld.net";
const PLAYER = "https://play.zephyrflick.top";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BASE_HOSTS = new Set([
  "watchanimeworld.net",
  "www.watchanimeworld.net",
]);

const PLAYER_HOSTS = new Set([
  "play.zephyrflick.top",
]);

const HEADERS = {
  "User-Agent": UA,
  Referer: `${BASE}/`,
};

const LANGUAGE_MAP = {
  ta: "tamil",
  tam: "tamil",
  tamil: "tamil",
  hi: "hindi",
  hin: "hindi",
  hindi: "hindi",
  te: "telugu",
  tel: "telugu",
  telugu: "telugu",
  ml: "malayalam",
  mal: "malayalam",
  malayalam: "malayalam",
  en: "english",
  eng: "english",
  english: "english",
  ja: "japanese",
  jpn: "japanese",
  japanese: "japanese",
};

function safeUrl(value, allowedHosts = null) {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;

    const hostname = url.hostname.toLowerCase();

    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      !hostname.includes(".")
    ) {
      return null;
    }

    // Reject IP-address URLs.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null;
    if (hostname.includes(":")) return null;

    if (allowedHosts && !allowedHosts.has(hostname)) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

async function request(url, options = {}, allowedHosts = null) {
  let current = safeUrl(url, allowedHosts);

  if (!current) {
    throw new Error("AnimeWorld: invalid or unsupported URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(current.toString(), {
        ...options,
        signal: controller.signal,
        redirect: "manual",
      });

      if (
        response.status >= 300 &&
        response.status < 400
      ) {
        const location = response.headers.get("location");

        if (!location) {
          throw new Error("AnimeWorld: redirect without location");
        }

        const nextUrl = new URL(location, current);
        const validated = safeUrl(nextUrl.toString(), allowedHosts);

        if (!validated) {
          throw new Error("AnimeWorld: unsafe redirect rejected");
        }

        current = validated;
        continue;
      }

      if (!response.ok) {
        throw new Error(`AnimeWorld HTTP ${response.status}`);
      }

      return response;
    }

    throw new Error("AnimeWorld: too many redirects");
  } finally {
    clearTimeout(timeout);
  }
}

async function httpGet(url, headers = {}) {
  const response = await request(
    url,
    {
      method: "GET",
      headers: {
        ...HEADERS,
        ...headers,
      },
    },
    BASE_HOSTS
  );

  return response.text();
}

async function playerGet(url, headers = {}) {
  const response = await request(
    url,
    {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Referer: `${PLAYER}/`,
        ...headers,
      },
    },
    PLAYER_HOSTS
  );

  return response.text();
}

async function httpPost(url, body, headers = {}) {
  const response = await request(
    url,
    {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${BASE}/`,
        Origin: PLAYER,
        "X-Requested-With": "XMLHttpRequest",
        ...headers,
      },
      body,
    },
    PLAYER_HOSTS
  );

  return response.json();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "-")
    .trim();
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractSiteResults(html, mediaType) {
  const results = [];
  const seen = new Set();

  const regex =
    /href\s*=\s*["']([^"']+)["']/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const rawUrl = decodeHtml(match[1]);

    let parsed;

    try {
      parsed = new URL(rawUrl, BASE);
    } catch {
      continue;
    }

    if (!BASE_HOSTS.has(parsed.hostname.toLowerCase())) {
      continue;
    }

    const pathMatch = parsed.pathname.match(
      /^\/(series|movies)\/([^/]+)\/?$/i
    );

    if (!pathMatch) continue;

    const type = pathMatch[1].toLowerCase();
    const slug = pathMatch[2];

    if (type !== mediaType) continue;

    const canonicalUrl =
      `${BASE}/${type}/${slug}/`;

    if (seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);

    results.push({
      url: canonicalUrl,
      type,
      slug,
      title: slug.replace(/-/g, " "),
    });
  }

  return results;
}

async function searchSite(title, mediaType = "series") {
  const url =
    `${BASE}/?s=${encodeURIComponent(title)}`;

  try {
    const html = await httpGet(url);

    return extractSiteResults(
      html,
      mediaType === "movie" ? "movies" : "series"
    );
  } catch (error) {
    console.warn(
      "[AnimeWorld] Search failed:",
      error.message
    );

    return [];
  }
}

function chooseBestResult(results, titles) {
  if (!results.length) return null;

  const normalizedTitles = titles
    .map(normalizeTitle)
    .filter(Boolean);

  // Prefer exact title matches.
  for (const result of results) {
    const resultTitle = normalizeTitle(result.title);

    if (normalizedTitles.includes(resultTitle)) {
      return result;
    }
  }

  // Otherwise use a conservative token similarity check.
  for (const result of results) {
    const resultWords = new Set(
      normalizeTitle(result.title).split(" ")
    );

    for (const title of normalizedTitles) {
      const titleWords = title.split(" ");
      const matching = titleWords.filter(
        (word) => resultWords.has(word)
      );

      if (
        titleWords.length > 0 &&
        matching.length / titleWords.length >= 0.75
      ) {
        return result;
      }
    }
  }

  return null;
}

async function resolveAnimeWorldShow(anilistId, ctx = {}) {
  const cacheKey =
    `np:match2:animeworld:${anilistId}`;

  const cached = cacheGet(cacheKey);

  if (isFresh(cached)) {
    return cached.data;
  }

  const media =
    ctx.media ??
    (await getMedia(anilistId).catch(() => null));

  if (!media) return null;

  const titles = buildTitles(media, ctx.anizip)
    .filter(Boolean);

  if (!titles.length) return null;

  const queries = buildTitleSearchQueries(titles, 12);

  const format = String(media.format || "").toUpperCase();
  const isMovie = format === "MOVIE";

  const mediaType = isMovie ? "movie" : "series";

  let selected = null;

  for (const query of queries) {
    const results = await searchSite(query, mediaType);

    selected = chooseBestResult(results, titles);

    if (selected) break;
  }

  // Never construct a fake show URL.
  if (!selected) return null;

  const data = {
    url: selected.url,
    title: selected.title,
    isMovie,
    totalEpisodes: Number(media.episodes) || 0,
  };

  cacheSet(cacheKey, data, SHOW_IDENTITY_TTL);

  return data;
}

async function getEpisodeUrl(seriesUrl, season = 1, episode = 1) {
  const validSeriesUrl = safeUrl(
    seriesUrl,
    BASE_HOSTS
  );

  if (!validSeriesUrl) return null;

  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);

  if (
    !Number.isInteger(seasonNumber) ||
    !Number.isInteger(episodeNumber) ||
    seasonNumber < 1 ||
    episodeNumber < 1
  ) {
    return null;
  }

  try {
    const html = await httpGet(validSeriesUrl.toString());

    const pidMatch =
      html.match(/postid-(\d+)/) ||
      html.match(/data-post=["'](\d+)["']/);

    if (!pidMatch) return null;

    const ajaxUrl = new URL(
      "/wp-admin/admin-ajax.php",
      BASE
    );

    ajaxUrl.searchParams.set(
      "action",
      "action_select_season"
    );

    ajaxUrl.searchParams.set(
      "season",
      String(seasonNumber)
    );

    ajaxUrl.searchParams.set(
      "post",
      pidMatch[1]
    );

    const episodeHtml = await httpGet(
      ajaxUrl.toString(),
      {
        Referer: validSeriesUrl.toString(),
      }
    );

    const regex =
      /href\s*=\s*["']([^"']+)["']/gi;

    let match;

    while ((match = regex.exec(episodeHtml)) !== null) {
      const rawUrl = decodeHtml(match[1]);

      let parsed;

      try {
        parsed = new URL(rawUrl, BASE);
      } catch {
        continue;
      }

      if (!BASE_HOSTS.has(parsed.hostname.toLowerCase())) {
        continue;
      }

      if (!parsed.pathname.startsWith("/episode/")) {
        continue;
      }

      const path = parsed.pathname.toLowerCase();

      const exactPattern = new RegExp(
        `(?:^|/)${seasonNumber}x${episodeNumber}(?:/|$)`
      );

      if (exactPattern.test(path)) {
        return parsed.toString();
      }
    }

    return null;
  } catch (error) {
    console.warn(
      "[AnimeWorld] Episode lookup failed:",
      error.message
    );

    return null;
  }
}

function getLanguage(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();

  if (!normalized) return null;

  if (LANGUAGE_MAP[normalized]) {
    return LANGUAGE_MAP[normalized];
  }

  for (const [code, language] of Object.entries(LANGUAGE_MAP)) {
    if (
      normalized === code ||
      normalized.startsWith(`${code}-`) ||
      normalized.startsWith(`${code}_`)
    ) {
      return language;
    }
  }

  return null;
}

function parseAttributeList(value) {
  const attributes = {};

  const regex =
    /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;

  let match;

  while ((match = regex.exec(value)) !== null) {
    attributes[match[1].toUpperCase()] =
      match[2].replace(/^"|"$/g, "").trim();
  }

  return attributes;
}

function detectAudioTracks(m3u8Text = "") {
  const languages = new Set();

  const lines = String(m3u8Text).split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      !trimmed.startsWith("#EXT-X-MEDIA:")
    ) {
      continue;
    }

    const attributes = parseAttributeList(
      trimmed.substring("#EXT-X-MEDIA:".length)
    );

    if (attributes.TYPE !== "AUDIO") continue;

    const language =
      getLanguage(attributes.LANGUAGE) ||
      getLanguage(attributes.NAME);

    if (language) {
      languages.add(language);
    }
  }

  return Array.from(languages);
}

function extractDownloads(html) {
  const downloads = [];
  const seen = new Set();

  const regex =
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const attributes = match[1];
    const linkText = match[2]
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const hrefMatch = attributes.match(
      /\bhref\s*=\s*["']([^"']+)["']/i
    );

    if (!hrefMatch) continue;

    const rawUrl = decodeHtml(hrefMatch[1]);

    let parsed;

    try {
      parsed = new URL(rawUrl, BASE);
    } catch {
      continue;
    }

    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      continue;
    }

    const combinedText =
      `${linkText} ${attributes}`.toLowerCase();

    if (!combinedText.includes("download")) continue;

    const url = parsed.toString();

    if (seen.has(url)) continue;
    seen.add(url);

    let quality = "Unknown";

    const qualityMatch = combinedText.match(
      /\b(2160|1080|720|480|360)p\b/
    );

    if (qualityMatch) {
      quality = `${qualityMatch[1]}p`;
    }

    downloads.push({
      quality,
      label: linkText || `Download ${quality}`,
      url,
    });
  }

  return downloads;
}

function extractSubtitles(html) {
  const subtitles = [];
  const seen = new Set();

  const regex =
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const attributes = match[1];

    const hrefMatch = attributes.match(
      /\bhref\s*=\s*["']([^"']+)["']/i
    );

    if (!hrefMatch) continue;

    const rawUrl = decodeHtml(hrefMatch[1]);

    if (!/\.(srt|vtt)(?:[?#]|$)/i.test(rawUrl)) {
      continue;
    }

    let parsed;

    try {
      parsed = new URL(rawUrl, BASE);
    } catch {
      continue;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      continue;
    }

    if (seen.has(parsed.toString())) continue;
    seen.add(parsed.toString());

    const text = match[2]
      .replace(/<[^>]*>/g, " ")
      .trim();

    const language =
      getLanguage(text) ||
      getLanguage(parsed.pathname);

    subtitles.push({
      url: parsed.toString(),
      lang: language || "unknown",
      label: text || "Subtitle",
      default: false,
    });
  }

  return subtitles;
}

async function getStreamFromPage(pageUrl) {
  const validPageUrl = safeUrl(
    pageUrl,
    BASE_HOSTS
  );

  if (!validPageUrl) return null;

  const html = await httpGet(
    validPageUrl.toString()
  );

  const iframeRegex =
    /(?:src|data-src)\s*=\s*["']([^"']+)["']/gi;

  let iframeUrl = null;
  let match;

  while ((match = iframeRegex.exec(html)) !== null) {
    const rawUrl = decodeHtml(match[1]);

    const candidate = safeUrl(
      rawUrl,
      PLAYER_HOSTS
    );

    if (
      candidate &&
      candidate.pathname.startsWith("/video/")
    ) {
      iframeUrl = candidate;
      break;
    }
  }

  if (!iframeUrl) return null;

  const videoHash = iframeUrl.pathname
    .split("/")
    .filter(Boolean)
    .pop();

  if (!/^[a-f0-9]+$/i.test(videoHash || "")) {
    return null;
  }

  const apiUrl = new URL(
    "/player/index.php",
    PLAYER
  );

  apiUrl.searchParams.set("data", videoHash);
  apiUrl.searchParams.set("do", "getVideo");

  const postData = await httpPost(
    apiUrl.toString(),
    new URLSearchParams({
      hash: videoHash,
      r: `${BASE}/`,
    }).toString(),
    {
      Referer: `${BASE}/`,
      Origin: PLAYER,
    }
  );

  const streamUrl =
    postData?.videoSource ||
    postData?.securedLink;

  if (!streamUrl) return null;

  // Do not accept insecure or malformed playlist URLs.
  const validStreamUrl = safeUrl(streamUrl);

  if (!validStreamUrl) return null;

  let playlistText = "";

  try {
    playlistText = await playerGet(
      validStreamUrl.toString(),
      {
        Referer: `${PLAYER}/`,
        Origin: PLAYER,
      }
    );
  } catch (error) {
    console.warn(
      "[AnimeWorld] Playlist metadata unavailable:",
      error.message
    );
  }

  const detectedLanguages =
    detectAudioTracks(playlistText);

  const downloads = extractDownloads(html);
  const subtitles = extractSubtitles(html);

  return {
    url: validStreamUrl.toString(),
    detectedLanguages,
    downloads,
    subtitles,
    playlistText,
  };
}

export async function getEpisodes(anilistId, ctx = {}) {
  const media =
    ctx.media ??
    (await getMedia(anilistId).catch(() => null));

  if (!media) {
    return {
      meta: {
        id: `animeworld-${anilistId}`,
        title: "AnimeWorld",
        source: "animeworld",
      },
      episodes: {
        sub: [],
        dub: [],
      },
    };
  }

  const show = await resolveAnimeWorldShow(
    anilistId,
    { ...ctx, media }
  ).catch(() => null);

  if (!show) {
    return {
      meta: {
        id: `animeworld-${anilistId}`,
        title: "AnimeWorld",
        source: "animeworld",
      },
      episodes: {
        sub: [],
        dub: [],
      },
    };
  }

  const count = show.isMovie
    ? 1
    : Math.min(
        500,
        Math.max(
          0,
          Number(
            expectedCount(media, ctx.anizip) ||
            show.totalEpisodes
          ) || 0
        )
      );

  const episodes = [];

  for (let number = 1; number <= count; number++) {
    const meta = episodeMeta(number, ctx);

    episodes.push({
      id: `watch/animeworld/${anilistId}/dub/animeworld-${number}`,
      number,
      title: meta?.title || `Episode ${number}`,
      duration: meta?.duration || null,
      audio: "dub",
      filler: meta?.filler || false,
      uncensored: false,
      description: meta?.description || null,
      image: meta?.image || null,
      airDate: meta?.airDate || null,
    });
  }

  return {
    meta: {
      id: show.url,
      title: show.title,
      source: "animeworld",
    },
    episodes: {
      sub: [],
      dub: episodes,
    },
  };
}

async function handleWatch(
  anilistId,
  audio,
  epNum,
  ctx = {}
) {
  const media =
    ctx.media ??
    (await getMedia(anilistId).catch(() => null));

  if (!media) {
    return json(
      { error: "AnimeWorld: anime information unavailable" },
      404
    );
  }

  const show = await resolveAnimeWorldShow(
    anilistId,
    { ...ctx, media }
  );

  if (!show) {
    return json(
      { error: "AnimeWorld: matching show not found" },
      404
    );
  }

  const episodeNumber = Number(epNum);

  if (
    !Number.isInteger(episodeNumber) ||
    episodeNumber < 1
  ) {
    return json(
      { error: "AnimeWorld: invalid episode number" },
      400
    );
  }

  let pageUrl = show.url;

  if (!show.isMovie) {
    const episodeUrl = await getEpisodeUrl(
      show.url,
      1,
      episodeNumber
    );

    if (!episodeUrl) {
      return json(
        {
          error: `AnimeWorld: episode ${episodeNumber} was not found`,
        },
        404
      );
    }

    pageUrl = episodeUrl;
  }

  const streamData = await getStreamFromPage(pageUrl);

  if (!streamData?.url) {
    return json(
      {
        error: "AnimeWorld: verified stream unavailable",
      },
      404
    );
  }

  const languages =
    streamData.detectedLanguages || [];

  const streams = [
    {
      url: streamData.url,
      type: "hls",
      server: "AnimeWorld",
      quality: "Multi-Quality",
      referer: `${PLAYER}/`,
      headers: {
        Referer: `${PLAYER}/`,
        Origin: PLAYER,
        "User-Agent": UA,
      },
      subtitles: streamData.subtitles,
      languages,
      priority: 5,
      isActive: true,
    },
  ];

  return json({
    anilistId: Number(anilistId),
    episode: episodeNumber,
    audio,
    streams,
    subtitles: streamData.subtitles,
    downloads: streamData.downloads,
    languages,
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    if (request.method !== "GET") {
      return json(
        { error: "Method not allowed" },
        405
      );
    }

    const url = new URL(request.url);

    try {
      const match = url.pathname.match(
        /^\/watch\/animeworld\/(\d+)\/(sub|dub)\/animeworld-(\d+)\/?$/
      );

      if (!match) {
        return json(
          { error: "Not found" },
          404
        );
      }

      return await handleWatch(
        match[1],
        match[2],
        match[3]
      );
    } catch (error) {
      console.error(
        "[AnimeWorld] Provider error:",
        error.message
      );

      return json(
        {
          error: "AnimeWorld provider request failed",
        },
        500
      );
    }
  },
};
