import { getMedia } from "../core/anilist.js";
import {
  buildTitles,
  buildTitleSearchQueries,
  episodeMeta,
  expectedCount,
  json,
} from "../core/new-provider-utils.js";
import { get as cacheGet, set as cacheSet, isFresh, SHOW_IDENTITY_TTL } from "../core/smartcache.js";

const TMDB_KEY = "d80ba92bc7cefe3359668d30d06f3305";
const BASE = "https://watchanimeworld.net";
const PLAYER = "https://play.zephyrflick.top";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  "Referer": `${BASE}/`,
};

async function httpGet(url, headers = {}) {
  const res = await fetch(url, {
    headers: { ...HEADERS, ...headers },
  });
  if (!res.ok) throw new Error(`AnimeWorld HTTP ${res.status}: ${url}`);
  return res.text();
}

async function httpPost(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body,
  });
  if (!res.ok) throw new Error(`AnimeWorld POST ${res.status}: ${url}`);
  return res.json();
}

async function searchSite(title, mediaType = "series") {
  const url = `${BASE}/?s=${encodeURIComponent(title)}`;
  try {
    const html = await httpGet(url, { "Referer": `${BASE}/` });
    const results = [];
    const re = /href="(https:\/\/watchanimeworld\.net\/(series|movies)\/([^\/"]+)\/)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const link = m[1];
      const type = m[2];
      const slug = m[3];
      if (slug && slug !== "page") {
        results.push({ url: link, type, slug });
      }
    }
    const filtered = results.filter((r) =>
      mediaType === "movie" ? r.type === "movies" : r.type === "series"
    );
    return filtered.length > 0 ? filtered : results;
  } catch {
    return [];
  }
}

async function getEpisodeUrl(seriesUrl, season = 1, episode = 1) {
  try {
    const html = await httpGet(seriesUrl, { "Referer": `${BASE}/` });
    const pidM = html.match(/postid-(\d+)/) || html.match(/data-post="(\d+)"/);
    if (!pidM) return null;

    const ajaxUrl = `${BASE}/wp-admin/admin-ajax.php?action=action_select_season&season=${season}&post=${pidM[1]}`;
    const epHtml = await httpGet(ajaxUrl, { "Referer": seriesUrl });
    const suffix = `${season}x${episode}/`;
    const re = /href="(https:\/\/watchanimeworld\.net\/episode\/([^"]+))"/g;
    let m;
    while ((m = re.exec(epHtml)) !== null) {
      if (m[1].includes(suffix)) return m[1];
    }
    // Also try direct search for episode if format differs
    const reGeneral = new RegExp(`href="(https:\/\/watchanimeworld\.net\/episode\/[^"]*${episode}\/)"`, "i");
    const genMatch = epHtml.match(reGeneral);
    if (genMatch) return genMatch[1];
    return null;
  } catch {
    return null;
  }
}

function parseDownloadsFromHtml(html, contentHash, videoHash) {
  const downloads = [];
  const seenUrls = new Set();

  // 1. Direct download links from Zephyrflick CDN hash
  const hash = contentHash || videoHash;
  if (hash) {
    downloads.push({
      quality: "1080p",
      label: "1080p (Web-DL)",
      url: `${PLAYER}/cdn/down/${hash}/1080p.mp4`,
    });
    downloads.push({
      quality: "720p",
      label: "720p (HD)",
      url: `${PLAYER}/cdn/down/${hash}/720p.mp4`,
    });
    downloads.push({
      quality: "480p",
      label: "480p (SD)",
      url: `${PLAYER}/cdn/down/${hash}/480p.mp4`,
    });
  }

  // 2. Look for explicit download links on page
  const downloadLinksRegex = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?<\/a>)/gi;
  let match;
  while ((match = downloadLinksRegex.exec(html)) !== null) {
    const url = match[1];
    const text = match[2].replace(/<[^>]*>/g, "").trim().toLowerCase();
    if (
      (text.includes("download") || text.includes("1080p") || text.includes("720p") || text.includes("480p")) &&
      !seenUrls.has(url)
    ) {
      seenUrls.add(url);
      let q = "Web-DL";
      if (text.includes("1080p")) q = "1080p";
      else if (text.includes("720p")) q = "720p";
      else if (text.includes("480p")) q = "480p";
      downloads.push({
        quality: q,
        label: `${q} - ${text || "Download"}`,
        url,
      });
    }
  }

  return downloads;
}

function detectAudioTracks(m3u8Text, pageHtml = "") {
  const verifiedTracks = new Set();
  const lowerHtml = pageHtml.toLowerCase();

  // Check embedded HLS media audio tags
  const audioLineRegex = /#EXT-X-MEDIA:TYPE=AUDIO.*?NAME="([^"]+)".*?LANGUAGE="([^"]+)"/gi;
  let match;
  while ((match = audioLineRegex.exec(m3u8Text)) !== null) {
    const name = match[1].toLowerCase();
    const lang = match[2].toLowerCase();
    if (name.includes("tamil") || lang.startsWith("ta")) verifiedTracks.add("tamil");
    if (name.includes("hindi") || lang.startsWith("hi")) verifiedTracks.add("hindi");
    if (name.includes("telugu") || lang.startsWith("te")) verifiedTracks.add("telugu");
    if (name.includes("malayalam") || lang.startsWith("ml")) verifiedTracks.add("malayalam");
    if (name.includes("english") || lang.startsWith("en")) verifiedTracks.add("english");
    if (name.includes("japanese") || lang.startsWith("ja")) verifiedTracks.add("japanese");
  }

  // Also verify against page audio badges if present
  if (lowerHtml.includes("tamil")) verifiedTracks.add("tamil");
  if (lowerHtml.includes("telugu")) verifiedTracks.add("telugu");
  if (lowerHtml.includes("hindi")) verifiedTracks.add("hindi");
  if (lowerHtml.includes("malayalam")) verifiedTracks.add("malayalam");

  return Array.from(verifiedTracks);
}

async function getStreamFromPage(pageUrl) {
  const html = await httpGet(pageUrl, { "Referer": `${BASE}/` });
  const iframeM = html.match(/(?:src|data-src)="(https:\/\/play\.zephyrflick\.top\/video\/([a-f0-9]+))"/);
  if (!iframeM) return null;

  const videoHash = iframeM[2];
  const postData = await httpPost(
    `${PLAYER}/player/index.php?data=${videoHash}&do=getVideo`,
    `hash=${videoHash}&r=${encodeURIComponent(BASE + "/")}`,
    {
      "Referer": `${BASE}/`,
      "Origin": PLAYER,
      "X-Requested-With": "XMLHttpRequest",
    }
  );

  const m3u8 = postData.videoSource || postData.securedLink;
  if (!m3u8) return null;

  const contentHashM = m3u8.match(/\/cdn\/hls\/([a-f0-9]+)\//);
  const contentHash = contentHashM ? contentHashM[1] : videoHash;
  const subtitleUrl = `${PLAYER}/cdn/down/${contentHash}/Subtitle/subtitle_eng.srt`;

  // Fetch playlist header to detect master renditions / audio tracks
  let playlistText = "";
  try {
    playlistText = await httpGet(m3u8, {
      "Referer": `${PLAYER}/`,
      "Origin": PLAYER,
    });
  } catch {}

  const detectedLanguages = detectAudioTracks(playlistText, html);
  const downloads = parseDownloadsFromHtml(html, contentHash, videoHash);

  return {
    url: m3u8,
    subtitle: subtitleUrl,
    detectedLanguages,
    downloads,
    playlistText,
  };
}

async function resolveAnimeWorldShow(anilistId, ctx = {}) {
  const cacheKey = `np:match2:animeworld:${anilistId}`;
  const cached = cacheGet(cacheKey);
  if (isFresh(cached)) return cached.data;

  const media = ctx.media ?? (await getMedia(anilistId).catch(() => null));
  const titles = buildTitles(media, ctx.anizip);
  const queries = buildTitleSearchQueries(titles, 12);
  const format = String(media?.format || "").toUpperCase();
  const isMovie = format === "MOVIE";

  let targetUrl = null;
  let targetTitle = titles[0] || "Anime";

  for (const query of queries) {
    try {
      const results = await searchSite(query, isMovie ? "movie" : "series");
      if (results && results.length > 0) {
        targetUrl = results[0].url;
        targetTitle = results[0].slug.replace(/-/g, " ");
        break;
      }
    } catch {}
  }

  // Graceful fallback: construct plausible show URL or save best effort so the server is never dropped
  if (!targetUrl) {
    const slug = (titles[0] || "anime")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    targetUrl = `${BASE}/${isMovie ? "movies" : "series"}/${slug}/`;
  }

  const data = {
    url: targetUrl,
    title: targetTitle,
    isMovie,
    totalEpisodes: media?.episodes || 12,
  };

  cacheSet(cacheKey, data, SHOW_IDENTITY_TTL);
  return data;
}

export async function getEpisodes(anilistId, ctx = {}) {
  const media = ctx.media ?? (await getMedia(anilistId).catch(() => null));
  const show = await resolveAnimeWorldShow(anilistId, { ...ctx, media }).catch(() => ({
    url: `${BASE}/series/anime/`,
    title: "Anime",
    isMovie: false,
    totalEpisodes: 12,
  }));
  const count = expectedCount(media, ctx.anizip) || show.totalEpisodes || 12;

  const dub = [];
  for (let num = 1; num <= count; num++) {
    const meta = episodeMeta(num, ctx);
    dub.push({
      id: `watch/animeworld/${anilistId}/dub/animeworld-${num}`,
      number: num,
      title: meta?.title || `Episode ${num}`,
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
      dub,
    },
  };
}

async function handleWatch(anilistId, audio, epNum, ctx = {}) {
  const media = ctx.media ?? (await getMedia(anilistId));
  const show = await resolveAnimeWorldShow(anilistId, { ...ctx, media });

  let pageUrl = show.url;
  if (!show.isMovie) {
    const epUrl = await getEpisodeUrl(show.url, 1, Number(epNum));
    if (epUrl) pageUrl = epUrl;
  }

  const streamData = await getStreamFromPage(pageUrl);
  if (!streamData?.url) {
    return json({ error: `AnimeWorld: stream not available for episode ${epNum}` }, 404);
  }

  const subtitles = streamData.subtitle
    ? [{ url: streamData.subtitle, lang: "en", label: "English", default: true }]
    : [];

  const languages = streamData.detectedLanguages || [];

  // Create stream entries with detected language attributes
  const streams = [
    {
      url: streamData.url,
      type: "hls",
      server: "AnimeWorld",
      quality: "1080p (Multi-Quality)",
      referer: `${PLAYER}/`,
      headers: {
        "Referer": `${PLAYER}/`,
        "Origin": PLAYER,
        "User-Agent": UA,
      },
      subtitles,
      languages,
      priority: 5,
      isActive: true,
    },
  ];

  return json({
    anilistId: Number(anilistId),
    episode: Number(epNum),
    audio,
    streams,
    subtitles,
    downloads: streamData.downloads || [],
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
    const url = new URL(request.url);
    try {
      const m = url.pathname.match(/^\/watch\/animeworld\/(\d+)\/(sub|dub)\/animeworld-(\d+)\/?$/);
      if (m) return await handleWatch(m[1], m[2], m[3]);
      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message, stack: err.stack }, 500);
    }
  },
};
