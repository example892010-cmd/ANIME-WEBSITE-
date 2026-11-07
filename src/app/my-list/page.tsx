"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Container from "@/components/container";
import { Bookmark, Trash2 } from "lucide-react";
import AnimeBackdrop from "@/components/anime-backdrop";

type SavedItem = { key: string; title: string; poster: string; status: string; href: string; storage: "guest" | "custom" };
type GuestBookmark = { id: string; animeId: string; animeTitle: string; thumbnail: string; status: string };
type CustomAnime = { id: string; slug: string; title: string; poster: string; status: string };

function safeArray<T>(value: string | null): T[] {
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

export default function MyListPage() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const guest = safeArray<GuestBookmark>(localStorage.getItem("aniflix_guest_bookmarks"));
    const customSlugs = safeArray<string>(localStorage.getItem("aniflix_my_list"));
    const guestItems: SavedItem[] = guest.map((item) => ({
      key: `guest:${item.animeId}`,
      title: item.animeTitle || "Anime",
      poster: item.thumbnail || "",
      status: item.status || "saved",
      href: `/anime/${encodeURIComponent(item.animeId)}`,
      storage: "guest",
    }));
    try {
      const response = await fetch("/api/site-anime", { cache: "no-store" });
      const data = await response.json();
      const customItems: SavedItem[] = (data.items || [])
        .filter((item: CustomAnime) => customSlugs.includes(item.slug))
        .map((item: CustomAnime) => ({
          key: `custom:${item.slug}`,
          title: item.title,
          poster: item.poster || "",
          status: item.status || "saved",
          href: `/anime-entry/${item.slug}`,
          storage: "custom",
        }));
      setItems([...guestItems, ...customItems]);
    } catch {
      setItems(guestItems);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const remove = (item: SavedItem) => {
    if (item.storage === "guest") {
      const records = safeArray<GuestBookmark>(localStorage.getItem("aniflix_guest_bookmarks"));
      localStorage.setItem("aniflix_guest_bookmarks", JSON.stringify(records.filter((record) => record.animeId !== item.key.slice(6))));
    } else {
      const slugs = safeArray<string>(localStorage.getItem("aniflix_my_list"));
      localStorage.setItem("aniflix_my_list", JSON.stringify(slugs.filter((slug) => `custom:${slug}` !== item.key)));
    }
    setItems((current) => current.filter((entry) => entry.key !== item.key));
  };

  return (
    <main className="relative isolate min-h-screen bg-[#061312] pb-24 pt-32 text-white">
      <AnimeBackdrop />
      <Container>
        <div className="mb-7 flex items-center gap-3"><Bookmark className="h-7 w-7 text-emerald-300" /><div><h1 className="text-3xl font-black">My List</h1><p className="text-sm text-slate-400">Saved on this device — no account or login needed.</p></div></div>
        {loading ? <div className="rounded-2xl border border-white/10 p-12 text-center text-slate-400">Loading your list…</div> : items.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {items.map((item) => (
              <div key={item.key} className="overflow-hidden rounded-xl border border-white/10 bg-[#0b2221]">
                <Link href={item.href} className="relative block aspect-[2/3] bg-slate-900">
                  {item.poster ? <Image src={item.poster} alt={item.title} fill unoptimized className="object-cover" /> : <div className="grid h-full place-items-center text-slate-500">ANIFLIX</div>}
                  <span className="absolute left-2 top-2 rounded-full bg-emerald-400 px-2 py-1 text-[10px] font-black uppercase text-slate-950">{item.status}</span>
                </Link>
                <div className="flex items-center justify-between gap-2 p-3"><Link href={item.href} className="min-w-0 truncate text-sm font-bold">{item.title}</Link><button onClick={() => remove(item)} aria-label={`Remove ${item.title}`} className="shrink-0 text-slate-400 hover:text-red-300"><Trash2 className="h-4 w-4" /></button></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center"><p className="text-lg font-bold">Your list is empty</p><p className="mt-1 text-sm text-slate-400">Save anime from its details page. Your list stays on this device.</p><Link href="/" className="mt-5 inline-block rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950">Explore anime</Link></div>
        )}
      </Container>
    </main>
  );
}
