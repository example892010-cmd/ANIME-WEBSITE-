"use client";

import React, {
  useEffect,
  useRef,
  useMemo,
  useState,
  HTMLAttributes,
} from "react";
import Artplayer from "artplayer";
import type { Option } from "artplayer";
import Hls from "hls.js";

// Helper functions and types
import { IEpisodeServers, IEpisodeSource, IEpisodes } from "@/types/episodes";
import loadingImage from "@/assets/genkai.gif";
import artplayerPluginHlsControl from "artplayer-plugin-hls-control";
import artplayerPluginAmbilight from "artplayer-plugin-ambilight";
import { cn } from "@/lib/utils";
import { buildStreamProxyUrl } from "@/lib/local-proxy";
import { useAuthStore } from "@/store/auth-store";
import useBookMarks from "@/hooks/use-get-bookmark";
import Image from "next/image";

const WATCH_PROGRESS_UPDATE_INTERVAL = 10000; // Update every 10 seconds
const WATCH_PROGRESS_MIN_WATCH_TIME = 10; // Min seconds watched to create record

const AUDIO_LANGUAGE_ALIASES: Record<string, string[]> = {
  tamil: ["tamil", "tam", "ta"],
  telugu: ["telugu", "tel", "te"],
  hindi: ["hindi", "hin", "hi"],
  malayalam: ["malayalam", "mal", "ml"],
  english: ["english", "eng", "en"],
};

function canonicalAudioLanguage(track: any): string | null {
  const values = [track?.lang, track?.language, track?.name, track?.label]
    .filter(Boolean)
    .map((value: string) => String(value).toLowerCase().trim());

  for (const [language, aliases] of Object.entries(AUDIO_LANGUAGE_ALIASES)) {
    if (values.some((value) => aliases.some((alias) => {
      if (alias.length <= 2) {
        return value === alias || value.startsWith(`${alias}-`) || value.startsWith(`${alias}_`);
      }
      return value === alias || value.includes(alias) || value.startsWith(`${alias}-`) || value.startsWith(`${alias}_`);
    }))) return language;
  }
  return null;
}

function findAudioTrackIndex(tracks: any[], targetLanguage: string): number {
  const target = targetLanguage.toLowerCase().trim();
  const aliases = AUDIO_LANGUAGE_ALIASES[target] || [target];
  return tracks.findIndex((track) => {
    const values = [track?.lang, track?.language, track?.name, track?.label]
      .filter(Boolean)
      .map((value: string) => String(value).toLowerCase().trim());
    return values.some((value) => aliases.some((alias) => {
      if (alias.length <= 2) {
        return value === alias || value.startsWith(`${alias}-`) || value.startsWith(`${alias}_`);
      }
      return value === alias || value.includes(alias) || value.startsWith(`${alias}-`) || value.startsWith(`${alias}_`);
    }));
  });
}

// --- Define Props for the Combined Player ---
interface ArtPlayerProps extends HTMLAttributes<HTMLDivElement> {
  episodeInfo: IEpisodeSource; // Source info including URLs, tracks, intro/outro
  animeInfo: { title: string; image: string; id: string }; // Basic anime info for poster etc.
  subOrDub: "sub" | "dub"; // Use literal type for clarity
  episodes?: IEpisodes; // Optional: If needed for playlist features later
  getInstance?: (art: Artplayer) => void; // Callback to get the instance
  autoSkip?: boolean;
  serversData: IEpisodeServers;
  onError?: () => void;
  targetAudioLanguage?: string;
  onAvailableAudioLanguages?: (languages: string[]) => void;
  onEnded?: () => void;
}

// --- Helper to generate highlights ---
interface HighlightPoint {
  time: number;
  text: string;
}
const generateHighlights = (
  start: number | undefined | null,
  end: number | undefined | null,
  label: string,
): HighlightPoint[] => {
  if (start == null || end == null || start >= end) return [];
  const highlights: HighlightPoint[] = [];
  for (let time = Math.floor(start); time <= Math.floor(end); time++) {
    highlights.push({ time, text: label });
  }
  return highlights;
};

// --- The Combined ArtPlayer Component ---
function AniflixPlayer({
  episodeInfo,
  animeInfo,
  subOrDub,
  getInstance,
  autoSkip = true,
  serversData,
  onError,
  targetAudioLanguage,
  onAvailableAudioLanguages,
  onEnded,
  ...rest
}: ArtPlayerProps): React.JSX.Element {
  const artContainerRef = useRef<HTMLDivElement>(null);
  const artInstanceRef = useRef<Artplayer | null>(null);
  const hlsInstanceRef = useRef<Hls | null>(null);
  const nativeAudioTracksRef = useRef<any>(null);
  const targetAudioLanguageRef = useRef(targetAudioLanguage || "");
  const onAvailableAudioLanguagesRef = useRef(onAvailableAudioLanguages);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    targetAudioLanguageRef.current = targetAudioLanguage || "";
    onAvailableAudioLanguagesRef.current = onAvailableAudioLanguages;
    onEndedRef.current = onEnded;

    const target = targetAudioLanguageRef.current.toLowerCase().trim();
    if (!target) return;

    const hls = hlsInstanceRef.current;
    if (hls?.audioTracks?.length) {
      const index = findAudioTrackIndex(hls.audioTracks, target);
      if (index >= 0 && hls.audioTrack !== index) hls.audioTrack = index;
      return;
    }

    const nativeTracks = Array.from(nativeAudioTracksRef.current || []) as any[];
    const nativeIndex = findAudioTrackIndex(nativeTracks, target);
    if (nativeIndex >= 0) {
      nativeTracks.forEach((track, index) => {
        track.enabled = index === nativeIndex;
      });
    }
  }, [targetAudioLanguage, onAvailableAudioLanguages, onEnded]);

  const isAutoSkipEnabledRef = useRef<boolean>(autoSkip);
  const animeInfoRef = useRef(animeInfo);
  const serversDataRef = useRef(serversData);
  animeInfoRef.current = animeInfo;
  serversDataRef.current = serversData;

  const bookmarkIdRef = useRef<string | null>(null);
  const inflightBookmarkRef = useRef<Promise<string | null> | null>(null);
  const watchHistoryIdsRef = useRef<string[]>([]);
  const watchedRecordIdRef = useRef<string | null>(null);
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const hasMetMinWatchTimeRef = useRef<boolean>(false);
  const initialSeekTimeRef = useRef<number | null>(null);

  const { auth } = useAuthStore();
  const { createOrUpdateBookMark, syncWatchProgress } = useBookMarks({
    populate: false,
  });

  useEffect(() => {
    isAutoSkipEnabledRef.current = autoSkip;
  }, [autoSkip]);

  const ensureBookmarkId = React.useCallback(async (): Promise<string | null> => {
    if (bookmarkIdRef.current) return bookmarkIdRef.current;
    if (inflightBookmarkRef.current) return inflightBookmarkRef.current;
    const info = animeInfoRef.current;
    if (!info?.id || info.id === "0") return null;

    inflightBookmarkRef.current = createOrUpdateBookMark(
      String(info.id),
      info.title || "Anime",
      info.image || "",
      "watching",
      false,
    )
      .then((id) => {
        if (id) bookmarkIdRef.current = id;
        return id;
      })
      .finally(() => {
        inflightBookmarkRef.current = null;
      });

    return inflightBookmarkRef.current;
  }, [createOrUpdateBookMark]);

  const ensureBookmarkAndSync = React.useCallback(
    async (currentTime: number, duration: number) => {
      const bId = await ensureBookmarkId();
      if (!bId) return;
      const srv = serversDataRef.current;
      const epNum = parseInt(srv.episodeNo, 10) || 1;
      const recordId = await syncWatchProgress(
        bId,
        watchedRecordIdRef.current,
        {
          episodeId: srv.episodeId,
          episodeNumber: epNum,
          current: currentTime,
          duration: duration,
        },
      );
      if (recordId) {
        watchedRecordIdRef.current = recordId;
        if (!watchHistoryIdsRef.current.includes(recordId)) {
          watchHistoryIdsRef.current.push(recordId);
        }
      }
    },
    [ensureBookmarkId, syncWatchProgress],
  );

  // --- Construct Stream URI via active HLS proxy ---
  const firstSource = episodeInfo?.sources?.[0];
  const uri = useMemo(() => {
    if (!firstSource?.url) return null;
    return buildStreamProxyUrl({
      url: firstSource.url,
      referer: firstSource.referer || episodeInfo?.headers?.Referer,
      headers: firstSource.headers,
      playlistKey: firstSource.playlist_key,
    });
  }, [firstSource, episodeInfo]);

  const skipTimesRef = useRef<{
    introStart?: number;
    introEnd?: number;
    validIntro: boolean;
    outroStart?: number;
    outroEnd?: number;
    validOutro: boolean;
  }>({ validIntro: false, validOutro: false });

  useEffect(() => {
    if (!animeInfo.id || !serversData.episodeId) {
      bookmarkIdRef.current = null;
      watchedRecordIdRef.current = null;
      watchHistoryIdsRef.current = [];
      hasMetMinWatchTimeRef.current = false;
      initialSeekTimeRef.current = null;
      return;
    }

    let isMounted = true;

    const fetchBookmarkAndWatchedId = async () => {
      const id = await ensureBookmarkId();

      if (!isMounted || !id) {
        bookmarkIdRef.current = null;
        watchedRecordIdRef.current = null;
        watchHistoryIdsRef.current = [];
        initialSeekTimeRef.current = null;
        hasMetMinWatchTimeRef.current = false;
        return;
      }

      bookmarkIdRef.current = id;
      hasMetMinWatchTimeRef.current = false;

      try {
        let history: any[] = [];
        if (id.startsWith("guest-")) {
          try {
            const stored = JSON.parse(
              localStorage.getItem("aniflix_guest_bookmarks") || "[]",
            );
            const guestBookmark = Array.isArray(stored)
              ? stored.find((item: any) => item.id === id)
              : null;
            history = guestBookmark?.expand?.watchHistory || [];
          } catch {
            history = [];
          }
        } else {
          const expandedBookmark = await (
            await import("@/lib/pocketbase")
          ).pb
            .collection("bookmarks")
            .getOne(id, {
              expand: "watchHistory",
              requestKey: null,
            });
          history = expandedBookmark.expand?.watchHistory || [];
        }

        if (!isMounted) return;
        const currentEpNo = parseInt(serversData.episodeNo, 10);
        const existingWatched = history?.find(
          (watched: any) =>
            (currentEpNo && Number(watched.episodeNumber) === currentEpNo) ||
            (watched.episodeId && watched.episodeId === serversData.episodeId),
        );

        if (existingWatched) {
          watchedRecordIdRef.current = existingWatched.id;
          initialSeekTimeRef.current =
            typeof existingWatched.current === "number"
              ? existingWatched.current
              : null;
          hasMetMinWatchTimeRef.current =
            initialSeekTimeRef.current !== null &&
            initialSeekTimeRef.current >= WATCH_PROGRESS_MIN_WATCH_TIME;
          if (
            artInstanceRef.current &&
            initialSeekTimeRef.current &&
            initialSeekTimeRef.current > 0 &&
            artInstanceRef.current.duration > 0 &&
            initialSeekTimeRef.current < artInstanceRef.current.duration - 5 &&
            artInstanceRef.current.currentTime < 5
          ) {
            artInstanceRef.current.seek = initialSeekTimeRef.current;
            initialSeekTimeRef.current = null;
          }
        } else {
          watchedRecordIdRef.current = null;
          initialSeekTimeRef.current = null;
          hasMetMinWatchTimeRef.current = false;
        }
      } catch (e) {
        console.error("Error fetching bookmark watch history:", e);
        if (!isMounted) return;
        watchedRecordIdRef.current = null;
        initialSeekTimeRef.current = null;
        hasMetMinWatchTimeRef.current = false;
      }
    };

    fetchBookmarkAndWatchedId();

    return () => {
      isMounted = false;
    };
  }, [
    auth?.id,
    animeInfo.id,
    serversData.episodeId,
    serversData.episodeNo,
    ensureBookmarkId,
  ]);

  // --- Effect for Player Initialization and Cleanup ---
  useEffect(() => {
    if (!artContainerRef.current || !uri) {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
      if (artInstanceRef.current) {
        artInstanceRef.current.destroy(true);
        artInstanceRef.current = null;
      }
      return;
    }

    const introStart = episodeInfo?.intro?.start;
    const introEnd = episodeInfo?.intro?.end;
    skipTimesRef.current.validIntro =
      typeof introStart === "number" &&
      typeof introEnd === "number" &&
      introStart < introEnd;
    skipTimesRef.current.introStart = introStart;
    skipTimesRef.current.introEnd = introEnd;

    const outroStart = episodeInfo?.outro?.start;
    const outroEnd = episodeInfo?.outro?.end;
    skipTimesRef.current.validOutro =
      typeof outroStart === "number" &&
      typeof outroEnd === "number" &&
      outroStart < outroEnd;
    skipTimesRef.current.outroStart = outroStart;
    skipTimesRef.current.outroEnd = outroEnd;

    const isEnglish = (lang?: string) => {
      const l = (lang || "").toLowerCase();
      return l === "en" || l === "eng" || l.includes("english");
    };

    const validSubtitles = (episodeInfo?.subtitles ?? []).filter(
      (track) => track.url && !track.url.includes("thumbnails"),
    );

    const defaultTrack =
      validSubtitles.find((t) => isEnglish(t.lang) && t.default)?.url ||
      validSubtitles.find((t) => isEnglish(t.lang))?.url ||
      validSubtitles.find((t) => t.default)?.url ||
      validSubtitles[0]?.url;

    const defaultTrackObj = validSubtitles.find((t) => t.url === defaultTrack);
    const defaultTrackTitle =
      defaultTrackObj?.lang || (validSubtitles.length > 0 ? "English" : "Off");

    const defaultTrackProxyUrl = defaultTrack
      ? buildStreamProxyUrl({
          url: defaultTrack,
          referer: firstSource?.referer || episodeInfo?.headers?.Referer,
          headers: firstSource?.headers,
        })
      : undefined;

    const trackOptions: any = validSubtitles.map((track) => ({
      default: track.url === defaultTrack,
      html: track.lang || "Subtitle",
      url: track.url,
    }));

    const defaultTrackExt = defaultTrack
      ? defaultTrack.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase()
      : "vtt";
    const defaultTrackType =
      defaultTrackExt === "srt" || defaultTrackExt === "ass"
        ? defaultTrackExt
        : "vtt";

    const subtitleConfig: Option["subtitle"] =
      subOrDub === "sub" && defaultTrackProxyUrl
        ? {
            url: defaultTrackProxyUrl,
            type: defaultTrackType,
            style: {
              color: "#FFFFFF",
              fontSize: "22px",
              textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
            },
            encoding: "utf-8",
            escape: false,
          }
        : {};

    const manualSkipControl = {
      name: "manual-skip",
      position: "right",
      html: `
        <div style="display: flex; align-items: center; gap: 4px; padding: 0 6px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/></svg>
          <span class="art-skip-text">Skip</span>
        </div>
      `,
      tooltip: "Skip",
      style: {
        display: "none",
        cursor: "pointer",
        borderRadius: "4px",
        marginRight: "10px",
        padding: "3px 0",
      },
      click: function (controlItem: any) {
        const art = artInstanceRef.current;
        if (!art) return;
        const { introEnd, outroStart, outroEnd, validIntro, validOutro } =
          skipTimesRef.current;
        const currentTime = art.currentTime;
        const duration = art.duration;

        let seekTarget: number | null = null;
        const resolvedOutroEnd =
          validOutro && outroEnd === 0 && duration > 0 ? duration : outroEnd;

        if (
          validIntro &&
          typeof introEnd === "number" &&
          currentTime >= skipTimesRef.current.introStart! &&
          currentTime < introEnd
        ) {
          seekTarget = introEnd;
        } else if (
          validOutro &&
          typeof outroStart === "number" &&
          typeof resolvedOutroEnd === "number" &&
          currentTime >= outroStart &&
          currentTime < resolvedOutroEnd
        ) {
          seekTarget =
            resolvedOutroEnd === duration ? duration - 0.1 : resolvedOutroEnd;
        }

        if (typeof seekTarget === "number") {
          art.seek = Math.min(seekTarget, duration);
        }

        if (controlItem.style) controlItem.style.display = "none";
      },
    };

    let currentHlsInstanceForCleanup: Hls | null = null;

    const finalOptions: Option = {
      container: artContainerRef.current,
      url: uri,
      type: firstSource?.type === "mp4" ? "mp4" : "m3u8",
      customType: {
        m3u8: (
          videoElement: HTMLMediaElement,
          url: string,
          artPlayerInstance: Artplayer,
        ) => {
          if (Hls.isSupported()) {
            if (hlsInstanceRef.current) {
              hlsInstanceRef.current.destroy();
            }
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: false,
            });
            hls.loadSource(url);
            hls.attachMedia(videoElement);

            // Read the real HLS audio-track metadata; never invent language options.
            nativeAudioTracksRef.current = null;
            const syncAudioTracks = () => {
              const tracks = hls.audioTracks || [];
              const languages = Array.from(new Set(
                tracks.map(canonicalAudioLanguage).filter((language): language is string => Boolean(language)),
              ));
              onAvailableAudioLanguagesRef.current?.(languages);

              const target = targetAudioLanguageRef.current.toLowerCase().trim();
              if (!target || !tracks.length) return;
              const trackIdx = findAudioTrackIndex(tracks, target);
              if (trackIdx >= 0 && hls.audioTrack !== trackIdx) hls.audioTrack = trackIdx;
            };

            hls.on(Hls.Events.MANIFEST_PARSED, syncAudioTracks);
            hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncAudioTracks);
            hls.on(Hls.Events.LEVEL_LOADED, syncAudioTracks);

            hls.on(Hls.Events.ERROR, (event, data) => {
              if (data.fatal) {
                console.error("Fatal HLS error encountered:", data);
                if (onError) onError();
              }
            });
            hlsInstanceRef.current = hls;
            currentHlsInstanceForCleanup = hls;

            artPlayerInstance.on("destroy", () => {
              if (hlsInstanceRef.current === hls) {
                hls.destroy();
                hlsInstanceRef.current = null;
                currentHlsInstanceForCleanup = null;
              }
            });
          } else if (
            videoElement.canPlayType("application/vnd.apple.mpegurl")
          ) {
            videoElement.src = url;
            // Safari/iOS may use native HLS instead of hls.js. Read its real AudioTrackList.
            const syncNativeAudioTracks = () => {
              const nativeTracks = (videoElement as any).audioTracks;
              nativeAudioTracksRef.current = nativeTracks || null;
              nativeTracks?.addEventListener?.("addtrack", syncNativeAudioTracks);
              const tracks = Array.from(nativeTracks || []) as any[];
              const languages = Array.from(new Set(
                tracks.map(canonicalAudioLanguage).filter((language): language is string => Boolean(language)),
              ));
              onAvailableAudioLanguagesRef.current?.(languages);
              const target = targetAudioLanguageRef.current.toLowerCase().trim();
              if (!target || !tracks.length) return;
              const trackIndex = findAudioTrackIndex(tracks, target);
              if (trackIndex >= 0) {
                tracks.forEach((track, index) => {
                  track.enabled = index === trackIndex;
                });
              }
            };
            videoElement.addEventListener("loadedmetadata", syncNativeAudioTracks);
            videoElement.addEventListener("loadeddata", syncNativeAudioTracks);
            syncNativeAudioTracks();
            artPlayerInstance.on("destroy", () => {
              const nativeTracks = (videoElement as any).audioTracks;
              videoElement.removeEventListener("loadedmetadata", syncNativeAudioTracks);
              videoElement.removeEventListener("loadeddata", syncNativeAudioTracks);
              nativeTracks?.removeEventListener?.("addtrack", syncNativeAudioTracks);
              nativeAudioTracksRef.current = null;
            });
          } else {
            artPlayerInstance.notice.show =
              "HLS playback is not supported on your browser.";
          }
        },
      },
      plugins: [
        artplayerPluginHlsControl({
          quality: {
            control: true,
            setting: true,
            getName: (level: { height?: number; bitrate?: number }) =>
              level.height ? `${level.height}P` : "Auto",
            title: "Quality",
            auto: "Auto",
          },
          audio: {
            control: true,
            setting: true,
            getName: (track: { name?: string; lang?: string }) =>
              track.name ?? track.lang ?? "Unknown",
            title: "Audio",
            auto: "Auto",
          },
        }),
        artplayerPluginAmbilight({
          blur: "30",
          opacity: 0.8,
          frequency: 10,
          duration: 0.3,
          zIndex: -1,
        }),
      ],
      settings: [
        {
          width: 250,
          html: "Subtitle",
          tooltip: defaultTrackTitle,
          selector: [
            {
              html: "Display",
              tooltip: subOrDub === "sub" ? "Hide" : "Show",
              switch: subOrDub === "sub",
              onSwitch: function (item) {
                const showSubtitle = !item.switch;
                art.subtitle.show = showSubtitle;
                item.tooltip = showSubtitle ? "Hide" : "Show";
                return showSubtitle;
              },
            },
            ...trackOptions,
          ],
          onSelect: async function (item: any) {
            if (item.url && typeof item.url === "string") {
              const proxiedUrl = buildStreamProxyUrl({
                url: item.url,
                referer: firstSource?.referer || episodeInfo?.headers?.Referer,
                headers: firstSource?.headers,
              });
              const cleanUrl = item.url.split("?")[0].split("#")[0];
              const ext = cleanUrl.split(".").pop()?.toLowerCase();
              const subType = ext === "srt" || ext === "ass" ? ext : "vtt";

              art.subtitle.show = true;
              await art.subtitle.switch(proxiedUrl, {
                name: item.html,
                type: subType,
                escape: false,
                encoding: "utf-8",
              });
              return item.html ?? "Subtitle";
            }
            return item.html ?? "Subtitle";
          },
        },
      ],
      controls: [manualSkipControl],
      highlight: [
        ...generateHighlights(
          episodeInfo?.intro?.start,
          episodeInfo?.intro?.end,
          "Intro",
        ),
        ...generateHighlights(
          episodeInfo?.outro?.start,
          episodeInfo?.outro?.end,
          "Outro",
        ),
      ],
      poster: animeInfo.image,
      volume: 0.8,
      isLive: false,
      muted: false,
      autoplay: false,
      autoOrientation: true,
      pip: true,
      autoSize: false,
      autoMini: false,
      screenshot: true,
      setting: true,
      loop: false,
      flip: false,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      subtitleOffset: true,
      miniProgressBar: false,
      mutex: true,
      backdrop: true,
      playsInline: true,
      autoPlayback: true,
      airplay: true,
      theme: "#F5316F",
      moreVideoAttr: { crossOrigin: "anonymous" },
      subtitle: subtitleConfig,
      icons: {
        loading: `<img width="60" height="60" src="${loadingImage.src}">`,
      },
    };

    const art = new Artplayer(finalOptions);
    artInstanceRef.current = art;

    const handleTimeUpdate = () => {
      const art = artInstanceRef.current;
      if (!art || art.loading.show) return;

      if (art.subtitle?.show) {
        (art.subtitle as any).update();
      }

      const currentTime = art.currentTime;
      const duration = art.duration;
      const {
        introStart,
        introEnd,
        validIntro,
        outroStart,
        outroEnd,
        validOutro,
      } = skipTimesRef.current;

      const resolvedOutroEnd =
        validOutro && outroEnd === 0 && duration > 0 ? duration : outroEnd;
      const inIntro =
        validIntro &&
        typeof introStart === "number" &&
        typeof introEnd === "number" &&
        currentTime >= introStart &&
        currentTime < introEnd;
      const inOutro =
        validOutro &&
        typeof outroStart === "number" &&
        typeof resolvedOutroEnd === "number" &&
        currentTime >= outroStart &&
        currentTime < resolvedOutroEnd;

      const manualSkip = art.controls["manual-skip"];

      if (isAutoSkipEnabledRef.current) {
        if (manualSkip?.style?.display !== "none") {
          if (manualSkip?.style) manualSkip.style.display = "none";
        }
        if (inIntro && typeof introEnd === "number") {
          art.seek = introEnd;
        } else if (inOutro && typeof resolvedOutroEnd === "number") {
          const seekTarget =
            resolvedOutroEnd === duration ? duration - 0.1 : resolvedOutroEnd;
          art.seek = Math.min(seekTarget, duration);
        }
      } else {
        if (!manualSkip) return;

        if (inIntro || inOutro) {
          if (manualSkip.style?.display === "none") {
            if (manualSkip.style) manualSkip.style.display = "inline-flex";
          }
          const skipText = inIntro ? "Intro" : "Outro";
          const textElement = manualSkip.querySelector(".art-skip-text");
          if (textElement && textElement.textContent !== `Skip ${skipText}`) {
            textElement.textContent = `Skip ${skipText}`;
          }
        } else {
          if (manualSkip.style?.display !== "none") {
            if (manualSkip.style) manualSkip.style.display = "none";
          }
        }
      }

      if (
        !hasMetMinWatchTimeRef.current &&
        currentTime >= WATCH_PROGRESS_MIN_WATCH_TIME &&
        duration > 0
      ) {
        hasMetMinWatchTimeRef.current = true;
        if (!watchedRecordIdRef.current) {
          lastUpdateTimeRef.current = Date.now();
          void ensureBookmarkAndSync(currentTime, duration);
        }
      }

      if (
        duration > 0 &&
        (hasMetMinWatchTimeRef.current || watchedRecordIdRef.current) &&
        Date.now() - lastUpdateTimeRef.current > WATCH_PROGRESS_UPDATE_INTERVAL
      ) {
        lastUpdateTimeRef.current = Date.now();
        void ensureBookmarkAndSync(currentTime, duration);
      }
    };

    art.on("ready", () => {
      try {
        Object.defineProperty(art.subtitle, "textTrack", {
          configurable: true,
          get: () =>
            art.template.$track?.track ||
            art.template.$video?.textTracks?.[0],
        });
      } catch (e) {
        void e;
      }

      if (subOrDub === "sub" && defaultTrackProxyUrl) {
        art.subtitle.show = true;
      }

      art.subtitle.style({
        fontSize: Math.max(14, Math.min(32, art.height * 0.04)) + "px",
      });

      const seekTime = initialSeekTimeRef.current;
      if (
        seekTime !== null &&
        seekTime > 0 &&
        art.duration > 0 &&
        seekTime < art.duration - 5
      ) {
        setTimeout(() => {
          if (artInstanceRef.current) {
            artInstanceRef.current.seek = seekTime;
          }
        }, 100);
        initialSeekTimeRef.current = null;
      } else {
        initialSeekTimeRef.current = null;
      }
    });

    art.on("resize", () => {
      if (!artInstanceRef.current) return;
      const newSize = Math.max(
        14,
        Math.min(32, artInstanceRef.current.height * 0.04),
      );
      artInstanceRef.current.subtitle.style({ fontSize: `${newSize}px` });
    });

    art.on("error", (error, reconnectTime) => {
      console.error(
        "ArtPlayer Error:",
        error,
        "Reconnect attempt:",
        reconnectTime,
      );
      if (onError) onError();
    });

    art.on("video:timeupdate", handleTimeUpdate);

    const handleInteractionUpdate = () => {
      const art = artInstanceRef.current;
      if (!art || !art.duration || art.duration <= 0) return;
      if (
        hasMetMinWatchTimeRef.current ||
        watchedRecordIdRef.current ||
        art.currentTime >= WATCH_PROGRESS_MIN_WATCH_TIME
      ) {
        hasMetMinWatchTimeRef.current = true;
        if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
        lastUpdateTimeRef.current = Date.now();
        void ensureBookmarkAndSync(art.currentTime, art.duration);
      }
    };
    const handleVideoEnded = () => {
      handleInteractionUpdate();
      onEndedRef.current?.();
    };
    art.on("video:pause", handleInteractionUpdate);
    art.on("video:seeked", handleInteractionUpdate);
    art.on("video:ended", handleVideoEnded);

    if (getInstance && typeof getInstance === "function") {
      getInstance(art);
    }

    return () => {
      const art = artInstanceRef.current;
      const hls = hlsInstanceRef.current;

      if (hls) {
        if (hls.media) {
          hls.detachMedia();
        }
        hls.destroy();
        hlsInstanceRef.current = null;
      }

      if (
        art &&
        art.duration > 0 &&
        (hasMetMinWatchTimeRef.current || watchedRecordIdRef.current)
      ) {
        void ensureBookmarkAndSync(art.currentTime, art.duration);
      }

      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }

      if (art) {
        art.off("video:pause", handleInteractionUpdate);
        art.off("video:seeked", handleInteractionUpdate);
        art.off("video:ended", handleVideoEnded);
        art.off("video:timeupdate", handleTimeUpdate);

        art.pause();

        if (art.video) {
          art.video.removeAttribute("src");
          art.video.load();
        }

        if (currentHlsInstanceForCleanup) {
          currentHlsInstanceForCleanup.destroy();
          if (hlsInstanceRef.current === currentHlsInstanceForCleanup) {
            hlsInstanceRef.current = null;
          }
          currentHlsInstanceForCleanup = null;
        } else if (hlsInstanceRef.current) {
          hlsInstanceRef.current.destroy();
          hlsInstanceRef.current = null;
        }

        art.destroy(true);
        if (artInstanceRef.current === art) {
          artInstanceRef.current = null;
        }
      }
    };
  }, [uri, subOrDub]);

  return (
    <div
      className={cn(
        "relative w-full h-auto aspect-video min-h-[20vh] sm:min-h-[30vh] md:min-h-[40vh] lg:min-h-[60vh] max-h-[500px] lg:max-h-[calc(100vh-150px)] bg-black overflow-hidden",
        rest.className ?? "",
      )}
    >
      <div ref={artContainerRef} className="w-full h-full">
        {!uri && (
          <div
            className="w-full h-full flex items-center justify-center bg-cover bg-center"
            style={{ backgroundImage: `url(${animeInfo.image})` }}
          >
            <Image
              width="60"
              height="60"
              src={loadingImage.src}
              alt="Loading..."
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default AniflixPlayer;
