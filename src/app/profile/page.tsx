"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Container from "@/components/container";
import { UserRound, Bookmark, Clock3, Settings2 } from "lucide-react";
import AnimeBackdrop from "@/components/anime-backdrop";

export default function GuestProfilePage() {
  const [savedCount, setSavedCount] = useState(0);
  const [watchedCount, setWatchedCount] = useState(0);
  useEffect(() => {
    try {
      const customSaved = JSON.parse(localStorage.getItem("aniflix_my_list") || "[]");
      const guestBookmarks = JSON.parse(localStorage.getItem("aniflix_guest_bookmarks") || "[]");
      const saved = Array.isArray(customSaved) ? customSaved.length : 0;
      const guest = Array.isArray(guestBookmarks) ? guestBookmarks : [];
      setSavedCount(saved + guest.length);
      setWatchedCount(guest.reduce((total: number, item: any) => total + (Array.isArray(item?.expand?.watchHistory) ? item.expand.watchHistory.length : 0), 0));
    } catch {
      setSavedCount(0);
      setWatchedCount(0);
    }
  }, []);
  return <main className="aniflix-surface relative isolate min-h-screen pb-24 pt-32 text-white">
    <AnimeBackdrop /><Container className="max-w-4xl"><div className="mb-8 flex items-center gap-4"><span className="grid h-16 w-16 place-items-center rounded-full border border-emerald-300/40 bg-emerald-400/10"><UserRound className="h-8 w-8 text-emerald-300" /></span><div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-300">ANIFLIX NETWORK TAMIL</p><h1 className="text-3xl font-black">Guest Profile</h1><p className="text-sm text-slate-400">Your anime activity stays on this device. No account needed.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-[#0a211f] p-6"><Bookmark className="h-6 w-6 text-emerald-300" /><p className="mt-4 text-3xl font-black">{savedCount}</p><p className="text-sm text-slate-400">Saved anime in My List</p><Link href="/my-list" className="mt-4 inline-block text-sm font-bold text-emerald-300">Open My List →</Link></div><div className="rounded-2xl border border-white/10 bg-[#0a211f] p-6"><Clock3 className="h-6 w-6 text-sky-300" /><p className="mt-4 text-3xl font-black">{watchedCount}</p><p className="text-sm text-slate-400">Recent watch entries on this device</p><Link href="/" className="mt-4 inline-block text-sm font-bold text-emerald-300">Continue exploring →</Link></div></div><Link href="/settings" className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm font-bold text-slate-200"><Settings2 className="h-5 w-5 text-emerald-300" /> Website Settings <span className="ml-auto text-slate-500">→</span></Link></Container></main>;
}
