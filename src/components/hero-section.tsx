"use client";

import React from "react";
import Container from "./container";
import { Button } from "./ui/button";
import { ArrowLeft, ArrowRight, Play, Plus } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/constants/routes";
import { ButtonLink } from "./common/button-link";
import { MediaList } from "@/types/miruro-api";
import { Badge } from "./ui/badge";
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
} from "./ui/carousel";

type IHeroSectionProps = {
  spotlightAnime: MediaList[];
  isDataLoading: boolean;
};

const HeroSection = ({ spotlightAnime, isDataLoading }: IHeroSectionProps) => {
  const [api, setApi] = React.useState<CarouselApi>();

  if (isDataLoading || !spotlightAnime?.length) return <LoadingSkeleton />;

  return (
    <section className="relative isolate w-full overflow-hidden bg-[#070b17]">
      <Carousel className="w-full" setApi={setApi} opts={{ loop: true }}>
        <CarouselContent>
          {spotlightAnime.map((anime, index) => (
            <CarouselItem key={anime.id || index}>
              <HeroCarouselItem anime={anime} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="absolute bottom-28 right-6 z-30 hidden items-center gap-3 md:flex lg:right-10">
        <Button aria-label="Previous featured anime" onClick={() => api?.scrollPrev()} className="h-10 w-10 rounded-full border border-white/35 bg-black/30 p-0 text-white hover:bg-red-600"><ArrowLeft className="h-4 w-4" /></Button>
        <Button aria-label="Next featured anime" onClick={() => api?.scrollNext()} className="h-10 w-10 rounded-full border border-white/35 bg-black/30 p-0 text-white hover:bg-red-600"><ArrowRight className="h-4 w-4" /></Button>
      </div>
    </section>
  );
};

const HeroCarouselItem = ({ anime }: { anime: MediaList }) => {
  const bgImage = anime.bannerImage || anime.coverImage?.extraLarge || anime.coverImage?.large || "";
  const title = anime.title?.english || anime.title?.romaji || anime.title?.native || "Featured Anime";
  const description = (anime as MediaList & { description?: string }).description;

  return (
    <div
      className="relative min-h-[620px] h-[78vh] max-h-[850px] w-full bg-cover bg-[center_25%] bg-no-repeat sm:min-h-[680px]"
      style={{ backgroundImage: bgImage ? `url(${bgImage})` : undefined }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-[#070b17]/95 via-[#070b17]/55 to-[#070b17]/5" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#070b17] via-[#070b17]/10 to-[#070b17]/20" />
      <Container className="relative z-10 flex h-full w-full items-end pb-28 pt-28 md:items-center md:pb-12">
        <div className="max-w-[610px] space-y-4">
          <Badge className="rounded-full border-0 bg-red-600 px-4 py-1 text-xs font-bold text-white shadow-lg shadow-red-950/40">● Featured</Badge>
          <h1 className="max-w-[620px] text-5xl font-black italic leading-[.98] tracking-tight text-white drop-shadow-[0_5px_20px_rgba(0,0,0,.65)] sm:text-7xl lg:text-[92px]">{title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-200 sm:text-sm">
            {anime.format && <span>{anime.format}</span>}
            {anime.seasonYear && <><span className="text-white/50">•</span><span>{anime.season ? `${anime.season} ` : ""}{anime.seasonYear}</span></>}
            {!!anime.averageScore && <><span className="text-white/50">•</span><span>★ {anime.averageScore}%</span></>}
            {anime.genres?.slice(0, 2).map((genre) => <span key={genre} className="text-slate-300">• {genre}</span>)}
          </div>
          {description && <p className="line-clamp-3 max-w-[500px] text-sm leading-6 text-slate-100 drop-shadow sm:text-base">{description.replace(/<[^>]*>/g, " ")}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <ButtonLink href={`${ROUTES.ANIME_DETAILS}/${anime.id}`} className="h-12 rounded-lg bg-red-600 px-6 text-sm font-extrabold text-white shadow-lg shadow-red-950/40 hover:bg-red-500"><Play className="mr-2 h-4 w-4 fill-current" /> Watch Now</ButtonLink>
            <Link href="/my-list" className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/75 bg-black/25 px-5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/15"><Plus className="h-5 w-5" /> My List</Link>
          </div>
        </div>
      </Container>
    </div>
  );
};

const LoadingSkeleton = () => (
  <div className="relative h-[78vh] min-h-[620px] w-full animate-pulse bg-gradient-to-br from-[#111a35] via-[#17152e] to-[#070b17]">
    <Container className="flex h-full flex-col justify-end pb-32 pt-28 md:justify-center md:pb-10">
      <div className="h-7 w-28 rounded-full bg-white/10" />
      <div className="mt-5 h-20 w-3/5 rounded-lg bg-white/10" />
      <div className="mt-4 h-5 w-2/5 rounded bg-white/10" />
      <div className="mt-7 flex gap-3"><div className="h-12 w-36 rounded-lg bg-white/10" /><div className="h-12 w-32 rounded-lg bg-white/10" /></div>
    </Container>
  </div>
);

export default HeroSection;
