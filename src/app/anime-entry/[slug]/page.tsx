"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Container from "@/components/container";
import { BookmarkPlus, Check, PlayCircle } from "lucide-react";

type Episode = { number: number; title?: string; url?: string; quality?: string; duration?: string };
type Season = { number: number; title?: string; episodes?: Episode[] };
type Anime = { slug: string; title: string; description: string; poster: string; banner: string; status: string; genres: string[]; audioLanguages: string[]; qualities: string[]; seasons: Season[] };

export default function CustomAnimeDetails() {
  const params = useParams<{ slug: string }>();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [error, setError] = useState("");
  const [selectedSeason, setSelectedSeason] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetch(`/api/site-anime?slug=${encodeURIComponent(params.slug)}`, { cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setAnime(data.item); })
      .catch((e) => setError(e.message || "Could not load anime."));
  }, [params.slug]);
  useEffect(() => {
    if (!anime) return;
    const list = JSON.parse(localStorage.getItem("aniflix_my_list") || "[]") as string[];
    setSaved(list.includes(anime.slug));
  }, [anime]);
  const seasons = useMemo(() => anime?.seasons || [], [anime]);
  const episodes = seasons[selectedSeason]?.episodes || [];
  const toggleSaved = () => {
    if (!anime) return;
    const list = JSON.parse(localStorage.getItem("aniflix_my_list") || "[]") as string[];
    const next = list.includes(anime.slug) ? list.filter((slug) => slug !== anime.slug) : [...list, anime.slug];
    localStorage.setItem("aniflix_my_list", JSON.stringify(next)); setSaved(next.includes(anime.slug));
  };

  if (error) return <main className="min-h-screen bg-[#061312] pt-36 text-center text-slate-300">{error}<div className="mt-4"><Link href="/" className="text-emerald-300">Back to homepage</Link></div></main>;
  if (!anime) return <main className="min-h-screen bg-[#061312] pt-40 text-center text-slate-400">Loading anime…</main>;

  return (
    <main className="min-h-screen bg-[#061312] pb-20 text-white">
      <div className="relative min-h-[48vh] overflow-hidden pt-24">
        {anime.banner && <Image src={anime.banner} alt="" fill priority unoptimized className="object-cover opacity-55" />}
        <div className="absolute inset-0 bg-gradient-to-r from-[#061312] via-[#061312]/75 to-[#061312]/30" /><div className="absolute inset-0 bg-gradient-to-t from-[#061312] via-transparent to-[#061312]/30" />
        <Container className="relative z-10 flex min-h-[42vh] items-end gap-6 pb-8 sm:items-center sm:pb-0">
          {anime.poster && <div className="relative hidden h-64 w-44 shrink-0 overflow-hidden rounded-2xl border border-white/20 shadow-2xl sm:block"><Image src={anime.poster} alt={anime.title} fill unoptimized className="object-cover" /></div>}
          <div className="max-w-3xl"><span className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950">{anime.status}</span><h1 className="mt-4 text-3xl font-black sm:text-5xl">{anime.title}</h1><div className="mt-3 flex flex-wrap gap-2">{(anime.genres || []).map((genre) => <span key={genre} className="rounded-full border border-white/20 bg-black/25 px-3 py-1 text-xs">{genre}</span>)}</div><p className="mt-4 max-w-2xl text-sm leading-6 text-slate-200">{anime.description}</p><div className="mt-5 flex flex-wrap gap-2"><button onClick={toggleSaved} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">{saved ? <Check className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}{saved ? "Added to My List" : "Add to My List"}</button><Link href="/my-list" className="rounded-xl border border-white/20 px-4 py-3 text-sm font-bold">My List</Link></div></div>
        </Container>
      </div>
      <Container className="py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-black">Episodes</h2><span className="text-xs text-slate-400">Audio: {(anime.audioLanguages || ["Tamil"]).join(", ")} · Quality: {(anime.qualities || []).join(", ")}</span></div>
        {seasons.length > 0 ? <><div className="mb-5 flex flex-wrap gap-2">{seasons.map((season, index) => <button key={`${season.number}-${index}`} onClick={() => setSelectedSeason(index)} className={`rounded-xl border px-4 py-2 text-sm font-bold ${selectedSeason === index ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-white/10 bg-white/5 text-white"}`}>{season.title || `Season ${season.number}`}</button>)}</div>
          <div className="grid gap-3 sm:grid-cols-2">{episodes.map((episode, index) => <div key={`${episode.number}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b2221] p-4"><div><p className="font-bold">Episode {episode.number}: {episode.title || `Episode ${episode.number}`}</p><p className="mt-1 text-xs text-slate-400">{episode.duration || "Episode"}{episode.quality ? ` · ${episode.quality}` : ""}</p></div>{episode.url ? <Link href={episode.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-slate-950"><PlayCircle className="h-4 w-4" /> Watch</Link> : <span className="text-xs text-slate-500">Link not added</span>}</div>)}</div>
        </> : <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400">Episode information will appear here when added by the admin.</div>}
      </Container>
    </main>
  );
}
