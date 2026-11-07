import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Send, Heart } from "lucide-react";

const TELEGRAM_URL = "https://t.me/+98iAagsDsjI5NDk1";
const Footer = () => (
  <footer className="w-full border-t border-emerald-400/20 bg-[#041211] px-5 pb-24 pt-9 text-center sm:pb-10">
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between sm:text-left">
      <Link href="/" className="flex items-center gap-3"><Image src="/aniflix-logo.png" alt="ANIFLIX NETWORK TAMIL" width={66} height={66} className="h-14 w-14 rounded-full object-cover" /><span className="text-left"><b className="block text-lg font-black italic text-white">ANIFLIX</b><b className="text-xs tracking-widest text-emerald-300">NETWORK TAMIL</b></span></Link>
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-400"><Link href="/" className="hover:text-emerald-300">Home</Link><Link href="/search" className="hover:text-emerald-300">Discover</Link><Link href="/my-list" className="hover:text-emerald-300">My List</Link><Link href="/settings" className="hover:text-emerald-300">Settings</Link></nav>
      <Link href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-4 py-2.5 text-xs font-black text-white"><Send className="h-4 w-4" /> Join Telegram</Link>
    </div>
    <p className="mt-7 text-xs text-slate-500">Free to browse · No account required · Made for anime fans <Heart className="inline h-3 w-3 fill-emerald-400 text-emerald-400" /></p>
    <p className="mt-2 text-[11px] text-slate-600">© {new Date().getFullYear()} ANIFLIX NETWORK TAMIL. All rights reserved.</p>
  </footer>
);
export default Footer;
