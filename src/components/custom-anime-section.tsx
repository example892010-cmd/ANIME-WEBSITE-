"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Container from "@/components/container";
import { Sparkles } from "lucide-react";

type CustomAnime = { id: string; slug: string; title: string; poster: string; status: string; genres: string[]; featured: boolean };

export default function CustomAnimeSection({ showAll = false, searchQuery = "" }: { showAll?: boolean; searchQuery?: string }) {
  const [items, setItems] = useState<CustomAnime[]>([]);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  useEffect(() => {
    let active = true;
    fetch("/api/site-anime", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((data) => { if (active && Array.isArray(data.items)) setItems(data.items); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!items.length) return null;
  const visibleItems = normalizedSearch
    ? items.filter((item) => item.title.toLowerCase().includes(normalizedSearch) || item.genres?.some((genre) => genre.toLowerCase().includes(normalizedSearch)))
    : items;
  const featured = visibleItems.filter((item) => item.featured);
  const list = showAll || searchQuery ? visibleItems : featured.length ? featured : visibleItems;
  if (!list.length) return null;

  return (
    <Container className="py-8 md:py-12">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-emerald-400" /><h2 className="text-xl md:text-2xl font-black">{normalizedSearch ? "ANIFLIX Search Results" : showAll ? "ANIFLIX Anime Collection" : "ANIFLIX Picks"}</h2></div>
        <span className="text-xs text-emerald-300">{list.length} titles</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {list.map((anime) => (
          <Link href={`/anime-entry/${anime.slug}`} key={anime.id} className="group overflow-hidden rounded-xl border border-white/10 bg-[#081b1b] transition hover:-translate-y-1 hover:border-emerald-400/60 hover:shadow-[0_12px_35px_rgba(16,185,129,.18)]">
            <div className="relative aspect-[2/3] overflow-hidden bg-slate-900">
              {anime.poster ? <Image src={anime.poster} alt={anime.title} fill unoptimized className="object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-slate-500">ANIFLIX</div>}
              <span className="absolute left-2 top-2 rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-bold text-black">{anime.status}</span>
            </div>
            <div className="p-3"><p className="line-clamp-1 text-sm font-bold text-white">{anime.title}</p><p className="mt-1 line-clamp-1 text-[11px] text-slate-400">{anime.genres?.slice(0, 2).join(" • ") || "Tamil Anime"}</p></div>
          </Link>
        ))}
      </div>
    </Container>
  );
}
