import Link from "next/link";
import { Send, ArrowUpRight } from "lucide-react";

const TELEGRAM_URL = "https://t.me/+98iAagsDsjI5NDk1";

export default function TelegramBanner() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="relative flex flex-col items-start justify-between gap-4 overflow-hidden rounded-2xl border border-emerald-400/35 bg-gradient-to-r from-emerald-950 via-[#063d39] to-sky-950 p-5 shadow-[0_12px_40px_rgba(16,185,129,.14)] sm:flex-row sm:items-center sm:px-7">
        <div className="pointer-events-none absolute -right-10 -top-20 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sky-500 text-white shadow-lg"><Send className="h-6 w-6" /></span>
          <div><h2 className="text-lg font-black text-white sm:text-xl">Join Our Telegram Channel</h2><p className="text-sm text-emerald-100/80">Anime updates, new releases and ANIFLIX announcements.</p></div>
        </div>
        <Link href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="relative inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-emerald-300">Join Telegram <ArrowUpRight className="h-4 w-4" /></Link>
      </div>
    </div>
  );
}
