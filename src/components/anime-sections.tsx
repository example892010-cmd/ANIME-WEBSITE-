"use client";

import React from "react";
import Container from "./container";
import AnimeCard from "./anime-card";

import BlurFade from "./ui/blur-fade";
import { MediaList } from "@/types/miruro-api";
import { ROUTES } from "@/constants/routes";

import Button from "./common/custom-button";
import { ArrowLeft, ArrowRight } from "lucide-react";

type Props = {
  animeList: MediaList[];
  loading: boolean;
  title: string;
  page?: number;
  hasNextPage?: boolean;
  onPageChange?: (newPage: number) => void;
};

const AnimeSections = ({
  animeList,
  loading,
  title: sectionTitle,
  page = 1,
  hasNextPage = false,
  onPageChange,
}: Props) => {
  if (loading || !animeList?.length) return <LoadingSkeleton />;
  return (
    <Container className="flex w-full flex-col items-start gap-5 py-7">
      <div className="flex w-full items-center justify-between">
        <h5 className="border-l-4 border-red-600 pl-3 text-xl font-extrabold text-white sm:text-2xl">{sectionTitle}</h5>
        <span className="text-xs font-semibold text-slate-300 sm:text-sm">View All <span aria-hidden="true">→</span></span>
      </div>
      <div className="flex w-full snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:thin] [scrollbar-color:#475569_transparent]">
        {animeList.map((anime, idx) => {
          const title =
            anime.title?.english || anime.title?.romaji || anime.title?.native || "Untitled";
          const poster =
            anime.coverImage?.extraLarge || anime.coverImage?.large || "";

          return (
            <BlurFade key={`${anime.id}-${idx}`} delay={idx * 0.03} inView>
              <div className="w-[170px] shrink-0 snap-start sm:w-[185px] lg:w-[205px]">
              <AnimeCard
                title={title}
                format={anime.format}
                score={anime.averageScore}
                poster={poster}
                className="!h-[250px] !w-full !max-w-none !min-w-0"
                variant="lg"
                href={`${ROUTES.ANIME_DETAILS}/${anime.id}`}
              />
              </div>
            </BlurFade>
          );
        })}
      </div>
      {onPageChange && (
        <div className="flex items-center justify-end w-full gap-3 mt-4">
          <Button
            onClick={() => onPageChange(Math.max(page - 1, 1))}
            disabled={page <= 1}
            className="rounded-full bg-slate-800 border border-slate-700 h-9 w-9 p-0 hover:bg-slate-700 disabled:opacity-40"
          >
            <ArrowLeft className="text-white h-4 w-4" />
          </Button>
          <Button
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNextPage}
            className="rounded-full bg-slate-800 border border-slate-700 h-9 w-9 p-0 hover:bg-slate-700 disabled:opacity-40"
          >
            <ArrowRight className="text-white h-4 w-4" />
          </Button>
        </div>
      )}
    </Container>
  );
};

const LoadingSkeleton = () => {
  return (
    <Container className="flex w-full flex-col items-start gap-5 py-7">
      <div className="h-8 w-52 animate-pulse rounded bg-slate-700"></div>
      <div className="flex w-full gap-4 overflow-hidden">
        {[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].map((_, idx) => {
          return (
            <div
              key={idx}
              className="h-[15.625rem] w-[145px] shrink-0 animate-pulse rounded-xl bg-slate-700 sm:w-[180px] md:h-[18.75rem]"
            ></div>
          );
        })}
      </div>
    </Container>
  );
};

export default AnimeSections;
