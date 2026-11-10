"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import parse from "html-react-parser";
import {
  Play,
  BookOpen,
  LayoutGrid,
  Clock,
  Calendar,
  Mic,
  BookmarkCheck,
  TvMinimalPlay,
  CheckCheck,
  Hand,
  Ban,
  Heart,
} from "lucide-react";

import Container from "@/components/container";
import AnimeCard from "@/components/anime-card";
import AnimeCarousel from "@/components/anime-carousel";
import CharacterCard from "@/components/common/character-card";
import Select, { ISelectOptions } from "@/components/common/select";
import Loading from "@/app/loading";
import { ROUTES } from "@/constants/routes";
import { useGetAnimeDetails } from "@/query/get-anime-details";
import { useGetAllEpisodes } from "@/query/get-all-episodes";
import useBookMarks from "@/hooks/use-get-bookmark";
import { useHasAnimeWatched } from "@/hooks/use-is-anime-watched";
import { useGetLastEpisodeWatched } from "@/hooks/use-get-last-episode-watched";
import { toast } from "sonner";
import { IAnime } from "@/types/anime";

const SelectOptions: ISelectOptions[] = [
  { value: "plan to watch", label: "Plan to Watch", icon: BookmarkCheck },
  { value: "watching", label: "Watching", icon: TvMinimalPlay },
  { value: "completed", label: "Completed", icon: CheckCheck },
  { value: "on hold", label: "On Hold", icon: Hand },
  { value: "dropped", label: "Dropped", icon: Ban },
];

export default function AnimeDetailsPage() {
  const { slug } = useParams();
  const router = useRouter();
  const animeId = slug as string;

  const { data: anime, isLoading } = useGetAnimeDetails(animeId);
  const { data: allEpisodesData, isLoading: isLoadingEpisodes } =
    useGetAllEpisodes(animeId);

  const { bookmarks, createOrUpdateBookMark } = useBookMarks({
    animeID: animeId,
    page: 1,
    per_page: 1,
  });

  const { hasWatchedAnime } = useHasAnimeWatched(animeId);
  const latestEpisodeWatched = useGetLastEpisodeWatched(animeId);

  const normalizeStatus = (s?: string) =>
    s ? s.toLowerCase().replace(/_/g, " ").trim() : "";

  const [selectedListStatus, setSelectedListStatus] = useState(
    bookmarks?.[0]?.status ? normalizeStatus(bookmarks[0].status) : ""
  );
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);

  useEffect(() => {
    const currentStatus = bookmarks?.[0]?.status;
    if (currentStatus) {
      const normalized = normalizeStatus(currentStatus);
      if (normalized !== selectedListStatus) {
        setSelectedListStatus(normalized);
      }
    }
  }, [bookmarks, selectedListStatus]);

  const handleListChange = async (value: string) => {
    const previous = selectedListStatus;
    setSelectedListStatus(value);
    try {
      await createOrUpdateBookMark(
        animeId,
        anime?.anime.info.name || "Anime",
        anime?.anime.info.poster || "",
        value
      );
      toast.success("List status updated!");
    } catch {
      setSelectedListStatus(previous);
      toast.error("Could not update list", { style: { background: "red" } });
    }
  };

  // Seasons and episode batches mapping
  const episodesList = useMemo(
    () => allEpisodesData?.episodes || [],
    [allEpisodesData?.episodes]
  );
  const totalEpisodesCount =
    episodesList.length ||
    anime?.anime.info.stats.episodes.sub ||
    anime?.anime.info.stats.episodes.dub ||
    1;

  // Build Season groups (chunking 24 episodes per season tab if series has many episodes)
  const seasonTabs = useMemo(() => {
    if (anime?.seasons && anime.seasons.length > 1) {
      return anime.seasons.map((s, idx) => ({
        id: s.id,
        label: `Season ${idx + 1}`,
        subLabel: `${s.name || s.title}`,
        episodes: episodesList,
        isExternal: !s.isCurrent,
      }));
    }

    const batchSize = totalEpisodesCount > 36 ? 24 : totalEpisodesCount;
    const tabs = [];
    let start = 1;
    let seasonNumber = 1;

    while (start <= totalEpisodesCount) {
      const end = Math.min(start + batchSize - 1, totalEpisodesCount);
      const count = end - start + 1;
      tabs.push({
        id: String(seasonNumber),
        label: `Season ${seasonNumber} • ${start}-${end} (${count})`,
        subLabel: `${start}-${end}`,
        episodes: episodesList.slice(start - 1, end),
        isExternal: false,
      });
      start += batchSize;
      seasonNumber++;
    }
    return tabs.length > 0
      ? tabs
      : [
          {
            id: "1",
            label: `Season 1 • 1-${totalEpisodesCount} (${totalEpisodesCount})`,
            subLabel: `1-${totalEpisodesCount}`,
            episodes: episodesList,
            isExternal: false,
          },
        ];
  }, [anime?.seasons, episodesList, totalEpisodesCount]);

  const activeSeasonEpisodes = useMemo(() => {
    if (!seasonTabs[selectedSeasonIdx]) return episodesList;
    return seasonTabs[selectedSeasonIdx].episodes.length > 0
      ? seasonTabs[selectedSeasonIdx].episodes
      : episodesList;
  }, [seasonTabs, selectedSeasonIdx, episodesList]);

  // Clean raw description
  const cleanDescription = useMemo(() => {
    const raw = anime?.anime.info.description || "";
    return raw.replace(/<[^>]*>/g, " ").trim();
  }, [anime?.anime.info.description]);

  // Watch URL resolution
  const watchUrl = useMemo(() => {
    if (hasWatchedAnime && latestEpisodeWatched) {
      return `${ROUTES.WATCH}?anime=${animeId}&ep=${latestEpisodeWatched}`;
    }
    return `${ROUTES.WATCH}?anime=${animeId}&ep=1`;
  }, [animeId, hasWatchedAnime, latestEpisodeWatched]);

  if (isLoading || !anime) return <Loading />;

  const info = anime.anime.info;
  const more = anime.anime.moreInfo;
  const bgImage = info.bannerImage || info.poster;
  const year = more.aired ? more.aired.split("-")[0].trim() : "2020";

  return (
    <div className="relative min-h-screen w-full bg-[#070913] text-white pb-28 pt-16">
      {/* Background Glow & Backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10 h-[580px] w-full overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-25 blur-md scale-110"
          style={{ backgroundImage: `url(${bgImage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070913]/30 via-[#070913]/85 to-[#070913]" />
      </div>

      <Container className="max-w-4xl px-4 sm:px-6">
        {/* Poster & Center Header Section */}
        <div className="flex flex-col items-center text-center pt-8 pb-4">
          <div className="relative aspect-[2/3] w-[185px] sm:w-[220px] overflow-hidden rounded-2xl border border-white/10 shadow-[0_16px_50px_rgba(0,0,0,0.85)]">
            <Image
              src={info.poster}
              alt={info.name}
              fill
              priority
              unoptimized
              className="object-cover"
            />
          </div>

          <h1 className="mt-5 text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-white px-2">
            {info.name}
          </h1>

          {/* Large Watch Now Button */}
          <div className="w-full max-w-md mt-6 flex flex-col gap-3">
            <Link
              href={watchUrl}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#8b2cf5] via-[#a855f7] to-[#7c3aed] py-4 text-base sm:text-lg font-black tracking-wide text-white shadow-[0_8px_32px_rgba(168,85,247,0.45)] transition duration-200 hover:brightness-110 active:scale-[0.98]"
            >
              <Play className="h-5 w-5 fill-current" />
              {hasWatchedAnime ? "Continue Watching" : "Watch Now"}
            </Link>

            <div className="flex justify-center">
              <Select
                placeholder="Add to list"
                value={selectedListStatus || normalizeStatus(bookmarks?.[0]?.status)}
                options={SelectOptions}
                onChange={handleListChange}
                placeholderIcon={Heart}
                className="w-48 bg-slate-900/60 border-slate-700/60 rounded-xl"
              />
            </div>
          </div>

          {/* Quick Meta Pills Row */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm font-semibold text-slate-300">
            <span className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5">
              <BookOpen className="h-3.5 w-3.5 text-purple-400" />
              {seasonTabs.length} Seasons
            </span>
            <span className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5">
              <LayoutGrid className="h-3.5 w-3.5 text-purple-400" />
              {totalEpisodesCount} Episodes
            </span>
            <span className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5">
              <Clock className="h-3.5 w-3.5 text-purple-400" />
              {info.stats.duration || "24 min"}
            </span>
            <span className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5">
              <Calendar className="h-3.5 w-3.5 text-purple-400" />
              {year}
            </span>
          </div>
        </div>

        {/* Overview Box */}
        <div className="mt-6 rounded-2xl border border-purple-500/20 bg-[#0d111d]/90 p-5 sm:p-6 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2.5 mb-3 text-purple-300 font-bold text-base sm:text-lg">
            <Mic className="h-5 w-5 text-purple-400" />
            <span>Overview</span>
          </div>

          <p
            className={`text-sm leading-relaxed text-slate-300 transition-all ${
              !isOverviewExpanded ? "line-clamp-3" : ""
            }`}
          >
            {cleanDescription || "No synopsis available."}
          </p>

          {cleanDescription.length > 180 && (
            <button
              onClick={() => setIsOverviewExpanded((prev) => !prev)}
              className="mt-2 text-xs font-bold text-purple-400 hover:text-purple-300 transition"
            >
              {isOverviewExpanded ? "Read Less" : "Read More"}
            </button>
          )}

          {/* Genres */}
          {more.genres && more.genres.length > 0 && (
            <div className="mt-5 border-t border-white/5 pt-4">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Genres
              </span>
              <div className="flex flex-wrap gap-2">
                {more.genres.map((g) => (
                  <Link
                    key={g}
                    href={`/search?genres=${encodeURIComponent(g.toLowerCase())}`}
                    className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-200 transition hover:bg-purple-500/25"
                  >
                    {g}
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Season Selector Tabs */}
        <div className="mt-8">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {seasonTabs.map((tab, idx) => {
              const isSelected = selectedSeasonIdx === idx;
              return (
                <button
                  key={tab.id || idx}
                  onClick={() => {
                    if (tab.isExternal) {
                      router.push(`${ROUTES.ANIME_DETAILS}/${tab.id}`);
                    } else {
                      setSelectedSeasonIdx(idx);
                    }
                  }}
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition-all border ${
                    isSelected
                      ? "border-purple-400/80 bg-purple-600/30 text-white shadow-[0_0_20px_rgba(168,85,247,0.35)]"
                      : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Episode List Section */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Episodes</h2>
            <span className="text-xs text-slate-400">
              {activeSeasonEpisodes.length} available
            </span>
          </div>

          {isLoadingEpisodes ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-14 rounded-xl border border-white/5 bg-slate-900/60 animate-pulse"
                />
              ))}
            </div>
          ) : activeSeasonEpisodes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {activeSeasonEpisodes.map((ep) => {
                const epNum = ep.number;
                const cleanEpTitle =
                  ep.title && ep.title !== `Episode ${epNum}`
                    ? ep.title
                    : `Episode ${epNum}`;

                return (
                  <Link
                    key={`${ep.episodeId}-${epNum}`}
                    href={`${ROUTES.WATCH}?anime=${animeId}&ep=${epNum}`}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#0e1322] px-4 py-3.5 transition hover:border-purple-500/50 hover:bg-[#131a30]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/20 text-xs font-black text-purple-300">
                        {epNum}
                      </span>
                      <span className="truncate text-xs sm:text-sm font-medium text-slate-200 group-hover:text-purple-300 transition">
                        {cleanEpTitle}
                      </span>
                    </div>
                    <Play className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-purple-400 transition" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
              Episodes are being prepared for streaming.
            </div>
          )}
        </div>

        {/* Characters Section */}
        {info.charactersVoiceActors && info.charactersVoiceActors.length > 0 && (
          <div className="mt-14">
            <h2 className="text-xl font-bold mb-4">Characters</h2>
            <div className="flex w-full gap-4 overflow-x-auto pb-4 scrollbar-thin">
              {info.charactersVoiceActors.slice(0, 10).map((char, idx) => (
                <CharacterCard
                  key={char.character.id || idx}
                  character={char}
                  className="w-[125px] shrink-0 sm:w-[145px]"
                />
              ))}
            </div>
          </div>
        )}

        {/* Recommended Anime Section */}
        {anime.recommendedAnimes && anime.recommendedAnimes.length > 0 && (
          <div className="mt-14">
            <AnimeCarousel
              anime={anime.recommendedAnimes as IAnime[]}
              title="Recommended Anime"
            />
          </div>
        )}
      </Container>
    </div>
  );
}
