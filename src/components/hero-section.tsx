"use client";

import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
} from "./ui/carousel";

import Container from "./container";
import { Button } from "./ui/button";

import React from "react";
import { ArrowLeft, ArrowRight, Play, Send } from "lucide-react";
import Link from "next/link";

import { ROUTES } from "@/constants/routes";
import { ButtonLink } from "./common/button-link";
import { MediaList } from "@/types/miruro-api";
import { Badge } from "./ui/badge";

type IHeroSectionProps = {
  spotlightAnime: MediaList[];
  isDataLoading: boolean;
};

const HeroSection = (props: IHeroSectionProps) => {
  const [api, setApi] = React.useState<CarouselApi>();

  if (props.isDataLoading || !props.spotlightAnime?.length)
    return <LoadingSkeleton />;

  return (
    <div className="relative h-[72vh] min-h-[520px] w-full pt-16 sm:h-[76vh] sm:min-h-[580px]">
      <Carousel className="w-full" setApi={setApi} opts={{ loop: true }}>
        <CarouselContent>
          {props.spotlightAnime.map((anime, index) => (
            <CarouselItem key={anime.id || index}>
              <HeroCarouselItem anime={anime} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="absolute hidden md:flex items-center gap-5 right-10 3xl:bottom-10 bottom-24 z-50 isolate">
        <Button
          onClick={() => {
            api?.scrollPrev();
          }}
          className="rounded-full bg-transparent border border-white h-10 w-10 hover:bg-slate-500"
        >
          <ArrowLeft className="text-white shrink-0" />
        </Button>
        <Button
          onClick={() => api?.scrollNext()}
          className="rounded-full bg-transparent border border-white h-10 w-10 hover:bg-slate-500"
        >
          <ArrowRight className="text-white shrink-0" />
        </Button>
      </div>
    </div>
  );
};

const HeroCarouselItem = ({ anime }: { anime: MediaList }) => {
  const bgImage =
    anime.bannerImage ||
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    "";
  const title =
    anime.title?.english || anime.title?.romaji || anime.title?.native || "Untitled";

  return (
    <div
      className="relative h-[72vh] min-h-[520px] w-full bg-cover bg-center bg-no-repeat sm:h-[76vh] sm:min-h-[580px]"
      style={{ backgroundImage: `url(${bgImage})` }}
    >
      {/* Gradient Overlay */}
      <div className="absolute h-full w-full inset-0 m-auto bg-gradient-to-r from-slate-950/40 via-slate-950/15 to-transparent z-10"></div>
      <div className="absolute h-full w-full inset-0 m-auto bg-gradient-to-t from-slate-950/25 via-slate-950/5 to-transparent z-10"></div>

      {/* Content Section */}
      <div className="w-full h-[calc(100%-5.25rem)] relative z-20">
        <Container className="w-full h-full flex flex-col justify-end md:justify-center pb-10">
          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/25 p-4 backdrop-blur-[2px] sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0 lg:w-[45vw]">
            <h1 className="text-3xl font-black text-white drop-shadow-lg line-clamp-2 sm:text-5xl">
              {title}
            </h1>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {anime.format && (
                <Badge className="bg-[#e9376b] text-white font-bold">
                  {anime.format}
                </Badge>
              )}
              {anime.seasonYear && (
                <Badge variant="outline" className="text-gray-300 border-gray-600">
                  {anime.season ? `${anime.season} ` : ""}{anime.seasonYear}
                </Badge>
              )}
              {!!anime.averageScore && (
                <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                  ⭐ {anime.averageScore}% Score
                </Badge>
              )}
              {anime.genres?.slice(0, 3).map((g) => (
                <span key={g} className="text-gray-400 text-xs">
                  • {g}
                </span>
              ))}
            </div>

            {anime.description && <p className="line-clamp-3 max-w-xl text-sm leading-6 text-slate-200 drop-shadow">{anime.description}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ButtonLink href={`${ROUTES.ANIME_DETAILS}/${anime.id}`} className="h-11 rounded-full bg-emerald-400 px-5 text-sm font-black text-slate-950 hover:bg-emerald-300"><Play className="mr-2 h-4 w-4 fill-current" /> Explore Anime</ButtonLink>
              <Link href="https://t.me/+98iAagsDsjI5NDk1" target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/30 bg-slate-950/35 px-5 text-sm font-bold text-white backdrop-blur hover:border-emerald-300"><Send className="h-4 w-4" /> Join Telegram</Link>
            </div>
            <p className="text-xs font-semibold text-emerald-200">Tamil audio updates · Free to browse · No login required</p>
          </div>
        </Container>
      </div>
    </div>
  );
};

const LoadingSkeleton = () => {
  return (
    <div className="relative h-[72vh] min-h-[520px] w-full pt-16 sm:h-[76vh] sm:min-h-[580px]">
      <div className="w-full h-[calc(100%-5.25rem)] mt-[5.25rem] relative z-20">
        <Container className="w-full h-full flex flex-col justify-end md:justify-center pb-10">
          <div className="space-y-2 lg:w-[40vw]">
            <div className="h-16 animate-pulse bg-slate-700 w-[75%]"></div>
            <div className="h-40 animate-pulse w-full bg-slate-700"></div>
            <div className="flex items-center gap-5">
              <span className="h-10 w-[7.5rem] animate-pulse bg-slate-700"></span>
              <span className="h-10 w-[7.5rem] animate-pulse bg-slate-700"></span>
            </div>
          </div>
        </Container>
      </div>
      <div className="absolute hidden md:flex items-center gap-5 right-10 bottom-32 z-50 isolate">
        <span className="h-10 w-10 rounded-full animate-pulse bg-slate-700"></span>
        <span className="h-10 w-10 rounded-full animate-pulse bg-slate-700"></span>
      </div>
    </div>
  );
};
export default HeroSection;
