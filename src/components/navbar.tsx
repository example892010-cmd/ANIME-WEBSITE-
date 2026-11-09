"use client";

import Link from "next/link";
import Image from "next/image";
import SearchBar from "./search-bar";
import { Menu, Send, Settings, X, Home, Compass, Bookmark, Film } from "lucide-react";
import { useState } from "react";

const TELEGRAM_URL = "https://t.me/+98iAagsDsjI5NDk1";
const links = [
  { label: "Home", href: "/", icon: Home },
  { label: "Discover", href: "/search", icon: Compass },
  { label: "Anime", href: "/search", icon: Film },
  { label: "My List", href: "/my-list", icon: Bookmark },
  { label: "Profile", href: "/profile", icon: Home },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[100] border-b border-white/10 bg-[#080b17]/85 shadow-[0_8px_30px_rgba(0,0,0,.35)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <Image src="/aniflix-logo.png" alt="ANIFLIX NETWORK TAMIL" width={58} height={58} priority className="h-11 w-11 rounded-full border border-red-500/40 object-cover sm:h-12 sm:w-12" />
            <span className="leading-none"><span className="block text-lg font-black italic tracking-wide text-white sm:text-xl">ANIFLIX</span><span className="mt-1 block text-[10px] font-black tracking-[.16em] text-red-400 sm:text-xs">NETWORK TAMIL</span></span>
          </Link>
          <nav className="hidden items-center gap-5 xl:flex">{links.map((link) => <Link key={link.label} href={link.href} className="text-sm font-semibold text-slate-300 transition hover:text-red-400">{link.label}</Link>)}</nav>
          <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 lg:flex"><div className="w-full max-w-sm"><SearchBar /></div><Link href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-sky-500 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-400"><Send className="h-4 w-4" /> Join Telegram</Link><Link href="/settings" aria-label="Settings" className="rounded-full border border-white/10 p-2.5 text-slate-200 hover:border-red-400/40 hover:text-red-400"><Settings className="h-4 w-4" /></Link></div>
          <div className="flex items-center gap-2 lg:hidden"><Link href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Join Telegram" className="grid h-10 w-10 place-items-center rounded-full bg-sky-500 text-white"><Send className="h-4 w-4" /></Link><button onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? "Close menu" : "Open menu"} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white">{mobileOpen ? <X /> : <Menu />}</button></div>
        </div>
        {mobileOpen && <div className="border-t border-white/10 bg-[#090d1b] px-4 pb-5 pt-4 lg:hidden"><div className="mb-4"><SearchBar onAnimeClick={() => setMobileOpen(false)} /></div><div className="grid grid-cols-2 gap-2">{links.map(({ label, href, icon: Icon }) => <Link key={label} href={href} onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-3 text-sm font-semibold text-slate-200"><Icon className="h-4 w-4 text-red-400" />{label}</Link>)}</div><Link href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-black"><Send className="h-4 w-4" /> Join Telegram Channel</Link></div>}
      </header>
      <div className="pointer-events-none fixed bottom-4 right-4 z-[90] hidden sm:block"><Link href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Join ANIFLIX Telegram" className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-sky-500 text-white shadow-[0_8px_24px_rgba(14,165,233,.35)] transition hover:scale-105"><Send className="h-5 w-5" /></Link></div>
      <nav className="fixed inset-x-0 bottom-0 z-[100] grid grid-cols-4 border-t border-white/10 bg-[#080b17]/95 py-2 backdrop-blur-xl md:hidden">{[{label:"Home",href:"/",icon:Home},{label:"Discover",href:"/search",icon:Compass},{label:"My List",href:"/my-list",icon:Bookmark},{label:"Profile",href:"/profile",icon:Home}].map(({label,href,icon:Icon}) => <Link key={label} href={href} className="flex flex-col items-center gap-1 text-[10px] font-bold text-slate-300"><Icon className="h-5 w-5 text-red-400" />{label}</Link>)}</nav>
    </>
  );
}
