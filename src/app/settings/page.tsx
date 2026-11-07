import AdminSettings from "@/components/admin/admin-settings";
import AnimeBackdrop from "@/components/anime-backdrop";
import Container from "@/components/container";
import { Settings2, ShieldCheck } from "lucide-react";

export const metadata = { title: "Settings | ANIFLIX NETWORK TAMIL" };

export default function SettingsPage() {
  return (
    <main className="relative isolate min-h-screen bg-[#061312] pb-20 pt-28 text-white">
      <AnimeBackdrop />
      <Container className="max-w-5xl">
        <div className="mb-8 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10"><Settings2 className="h-6 w-6 text-emerald-300" /></span><div><h1 className="text-3xl font-black">Settings</h1><p className="text-sm text-slate-400">Public website settings and protected admin tools</p></div></div>
        <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5"><div className="flex items-center gap-2 font-bold text-emerald-200"><ShieldCheck className="h-5 w-5" /> Free public access</div><p className="mt-2 text-sm leading-6 text-slate-300">ANIFLIX is free to browse. Visitors do not need an account, login or subscription. Only website administration requires an admin password.</p></div>
        <AdminSettings />
      </Container>
    </main>
  );
}
