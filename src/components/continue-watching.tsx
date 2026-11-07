"use client";

import React, { useEffect, useState } from "react";
import Container from "./container";
import AnimeCard from "./anime-card";
import { ROUTES } from "@/constants/routes";
import BlurFade from "./ui/blur-fade";
import { IAnime } from "@/types/anime";
import { History } from "lucide-react";
import useBookMarks, { WatchHistory } from "@/hooks/use-get-bookmark";

type Props = {
  loading: boolean;
};

interface WatchedAnime extends IAnime {
  episode: WatchHistory | string;
}

const ContinueWatching = (props: Props) => {
  const [anime, setAnime] = useState<WatchedAnime[] | null>(null);

  const { bookmarks } = useBookMarks({
    page: 1,
    per_page: 14,
    status: "watching",
  });

  useEffect(() => {
    if (bookmarks && bookmarks.length > 0) {
      const animes = bookmarks
        .map((item) => ({
          id: item.animeId,
          name: item.animeTitle,
          poster: item.thumbnail,
          episode: item.expand?.watchHistory
            ? [...item.expand.watchHistory].sort((a, b) => b.episodeNumber - a.episodeNumber)[0]
            : null,
        }))
        .filter((item) => !!item.episode);
      setAnime(animes.length > 0 ? (animes as WatchedAnime[]) : null);
    } else {
      setAnime(null);
    }
  }, [bookmarks]);

  if (props.loading) return <LoadingSkeleton />;

  if ((!anime || !anime.length) && !props.loading) return <></>;

  return (
    <Container className="flex flex-col gap-5 py-10 items-center lg:items-start">
      <div className="flex items-center gap-2">
        <History />
        <h5 className="text-2xl font-bold">Continue Watching</h5>
      </div>
      <div className="grid lg:grid-cols-5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7 w-full gap-5 content-center">
        {anime?.map(
          (ani, idx) =>
            ani.episode && (
              <BlurFade key={idx} delay={idx * 0.05} inView>
                <AnimeCard
                  title={ani.name}
                  poster={ani.poster}
                  className="self-center justify-self-center"
                  href={`${ROUTES.WATCH}?anime=${ani.id}&ep=${typeof ani.episode !== "string" ? ani.episode.episodeNumber : 1}`}
                  watchDetail={
                    typeof ani.episode !== "string" ? ani.episode : null
                  }
                />
              </BlurFade>
            ),
        )}
      </div>
    </Container>
  );
};

const LoadingSkeleton = () => {
  return (
    <Container className="flex flex-col gap-5 py-10 items-center lg:items-start lg:mt-[10.125rem] z-20 ">
      <div className="h-10 w-[15.625rem] animate-pulse bg-slate-700"></div>
      <div className="grid lg:grid-cols-5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7 w-full gap-5 content-center">
        {[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].map((_, idx) => {
          return (
            <div
              key={idx}
              className="rounded-xl h-[15.625rem] min-w-[10.625rem] max-w-[12.625rem] md:h-[18.75rem] md:max-w-[12.5rem] animate-pulse bg-slate-700"
            ></div>
          );
        })}
      </div>
    </Container>
  );
};

export default ContinueWatching;
