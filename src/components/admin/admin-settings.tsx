"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, LogOut, Plus, Pencil, Trash2, Upload, ShieldCheck, RefreshCw } from "lucide-react";

type Anime = { id: string; slug: string; title: string; description: string; poster: string; banner: string; status: string; genres: string[]; audioLanguages: string[]; qualities: string[]; seasons: any[]; featured: boolean };
const emptyForm = { title: "", slug: "", description: "", posterUrl: "", bannerUrl: "", status: "ONGOING", genres: "Action, Adventure, Fantasy", audioLanguages: "Tamil", qualities: "480p, 720p, 1080p", seasons: '[\n  { "number": 1, "title": "Season 1", "episodes": [] }\n]', featured: false };

async function responseJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function AdminSettings() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [items, setItems] = useState<Anime[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [poster, setPoster] = useState<File | null>(null);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"login" | "manage" | "change" | "recover">("login");
  const [oldPassword, setOldPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const loadItems = useCallback(async () => {
    const data = await responseJson(await fetch("/api/admin/anime", { cache: "no-store" }));
    setItems(data.items || []);
  }, []);

  useEffect(() => {
    fetch("/api/admin/anime", { cache: "no-store" }).then(async (response) => {
      if (response.ok) { setAuthenticated(true); const data = await response.json(); setItems(data.items || []); setMode("manage"); }
    }).catch(() => undefined).finally(() => setChecking(false));
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setSaving(true);
    try { await responseJson(await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) })); setAuthenticated(true); setPassword(""); setMode("manage"); await loadItems(); setNotice("Admin access verified."); }
    catch (e) { setError(e instanceof Error ? e.message : "Login failed."); }
    finally { setSaving(false); }
  };

  const submitAnime = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setNotice(""); setSaving(true);
    try {
      JSON.parse(form.seasons || "[]");
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, String(value)));
      if (poster) payload.append("poster", poster);
      const endpoint = editingId ? `/api/admin/anime/${editingId}` : "/api/admin/anime";
      const response = await fetch(endpoint, { method: editingId ? "PATCH" : "POST", body: payload });
      await responseJson(response);
      setForm(emptyForm); setPoster(null); setEditingId(""); await loadItems(); setNotice(editingId ? "Anime updated and saved." : "Anime added to the live website.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save anime. Check the seasons JSON."); }
    finally { setSaving(false); }
  };

  const editAnime = (item: Anime) => {
    setEditingId(item.id); setError(""); setNotice("");
    setForm({ title: item.title, slug: item.slug, description: item.description || "", posterUrl: item.posterUrl || "", bannerUrl: item.banner || "", status: item.status || "ONGOING", genres: (item.genres || []).join(", "), audioLanguages: (item.audioLanguages || []).join(", "), qualities: (item.qualities || []).join(", "), seasons: JSON.stringify(item.seasons || [], null, 2), featured: item.featured });
    setPoster(null); document.getElementById("admin-anime-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const deleteAnime = async (item: Anime) => {
    if (!window.confirm(`Delete ${item.title} from the website?`)) return;
    setError(""); setNotice("");
    try { await responseJson(await fetch(`/api/admin/anime/${item.id}`, { method: "DELETE" })); await loadItems(); setNotice(`${item.title} was deleted.`); }
    catch (e) { setError(e instanceof Error ? e.message : "Delete failed."); }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setNotice(""); setSaving(true);
    try {
      const payload = mode === "recover" ? { action: "recover", recoveryCode, newPassword, confirmPassword } : { action: "change", oldPassword, newPassword, confirmPassword };
      await responseJson(await fetch("/api/admin/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      setNotice("Password updated successfully. Please sign in again with the new password.");
      await fetch("/api/admin/logout", { method: "POST" }); setAuthenticated(false); setMode("login"); setPassword(""); setOldPassword(""); setRecoveryCode(""); setNewPassword(""); setConfirmPassword("");
    } catch (e) { setError(e instanceof Error ? e.message : "Password update failed."); }
    finally { setSaving(false); }
  };

  const logout = async () => { await fetch("/api/admin/logout", { method: "POST" }); setAuthenticated(false); setMode("login"); setItems([]); setNotice("Admin session ended."); };

  if (checking) return <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-8 text-sm text-slate-400">Checking admin session…</div>;

  return (
    <section className="rounded-3xl border border-white/10 bg-[#081b1b]/95 p-4 shadow-2xl sm:p-7">
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}
      {!authenticated ? (
        <div className="mx-auto max-w-md py-5">
          <div className="mb-5 text-center"><span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10"><KeyRound className="h-7 w-7 text-emerald-300" /></span><h2 className="text-2xl font-black">Admin Settings</h2><p className="mt-1 text-sm text-slate-400">Enter your admin password to manage the website.</p></div>
          {mode === "recover" ? (
            <form onSubmit={savePassword} className="space-y-3">
              <label className="block text-sm text-slate-300">Private recovery code<input value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} required type="password" autoComplete="off" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-400" /></label>
              <label className="block text-sm text-slate-300">New password<input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} type="password" autoComplete="new-password" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-400" /></label>
              <label className="block text-sm text-slate-300">Confirm new password<input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} type="password" autoComplete="new-password" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-400" /></label>
              <button disabled={saving} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-black text-slate-950 disabled:opacity-50">{saving ? "Verifying…" : "Verify & Reset Password"}</button>
              <button type="button" onClick={() => setMode("login")} className="w-full py-2 text-sm text-slate-400">Back to admin login</button>
            </form>
          ) : (
            <form onSubmit={login} className="space-y-3">
              <label className="block text-sm text-slate-300">Admin password<input value={password} onChange={(e) => setPassword(e.target.value)} required type="password" autoComplete="current-password" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-400" placeholder="Enter admin password" /></label>
              <button disabled={saving} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-black text-slate-950 disabled:opacity-50">{saving ? "Verifying…" : "Unlock Admin Settings"}</button>
              <button type="button" onClick={() => setMode("recover")} className="w-full py-2 text-sm text-slate-400 hover:text-emerald-300">Forgot password?</button>
            </form>
          )}
        </div>
      ) : mode === "change" ? (
        <form onSubmit={savePassword} className="mx-auto max-w-md space-y-3 py-4">
          <h2 className="text-xl font-black">Change Admin Password</h2>
          <input value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} type="password" required placeholder="Current password" className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3" />
          <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" minLength={8} required placeholder="New password (8+ characters)" className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3" />
          <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" minLength={8} required placeholder="Confirm new password" className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3" />
          <div className="flex gap-2"><button disabled={saving} className="flex-1 rounded-xl bg-emerald-400 p-3 font-bold text-slate-950">Update password</button><button type="button" onClick={() => setMode("manage")} className="rounded-xl border border-white/10 px-4">Cancel</button></div>
        </form>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-emerald-300"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-widest">Verified admin</span></div><h2 className="mt-1 text-2xl font-black">Website Control Panel</h2><p className="text-sm text-slate-400">Add and edit anime that will appear on the public website.</p></div><div className="flex flex-wrap gap-2"><button onClick={loadItems} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button><button onClick={() => setMode("change")} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm"><KeyRound className="h-4 w-4" /> Password</button><button onClick={logout} className="inline-flex items-center gap-2 rounded-xl border border-red-400/20 px-3 py-2 text-sm text-red-200"><LogOut className="h-4 w-4" /> Logout</button></div></div>
          <form id="admin-anime-form" onSubmit={submitAnime} className="mb-8 rounded-2xl border border-white/10 bg-slate-950/60 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between"><h3 className="flex items-center gap-2 font-black"><Plus className="h-5 w-5 text-emerald-300" />{editingId ? "Edit Anime" : "Add New Anime"}</h3>{editingId && <button type="button" onClick={() => { setEditingId(""); setForm(emptyForm); setPoster(null); }} className="text-xs text-slate-400">Cancel edit</button>}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-300">Anime title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value, slug: editingId ? form.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} required className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white" /></label>
              <label className="text-sm text-slate-300">URL slug (optional)<input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Auto-generated when blank" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white" /></label>
              <label className="text-sm text-slate-300 sm:col-span-2">Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white" /></label>
              <label className="text-sm text-slate-300">Poster image URL (optional)<input value={form.posterUrl} onChange={(e) => setForm({ ...form, posterUrl: e.target.value })} type="url" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white" placeholder="https://…" /></label>
              <label className="text-sm text-slate-300">Banner image URL (optional)<input value={form.bannerUrl} onChange={(e) => setForm({ ...form, bannerUrl: e.target.value })} type="url" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white" placeholder="https://…" /></label>
              <label className="text-sm text-slate-300">Upload poster (max 5 MB)<span className="mt-1 flex items-center gap-2 rounded-xl border border-dashed border-emerald-400/30 bg-slate-900 px-3 py-2.5"><Upload className="h-4 w-4 text-emerald-300" /><input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(e) => setPoster(e.target.files?.[0] || null)} className="min-w-0 text-xs" /></span></label>
              <label className="text-sm text-slate-300">Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white"><option>ONGOING</option><option>COMPLETED</option><option>UPCOMING</option><option>HIATUS</option></select></label>
              <label className="text-sm text-slate-300">Genres (comma separated)<input value={form.genres} onChange={(e) => setForm({ ...form, genres: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white" /></label>
              <label className="text-sm text-slate-300">Audio languages<input value={form.audioLanguages} onChange={(e) => setForm({ ...form, audioLanguages: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white" /></label>
              <label className="text-sm text-slate-300">Available qualities<input value={form.qualities} onChange={(e) => setForm({ ...form, qualities: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white" /></label>
              <label className="flex items-center gap-2 self-end pb-3 text-sm text-slate-300"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} className="h-4 w-4 accent-emerald-400" /> Feature on homepage</label>
              <label className="text-sm text-slate-300 sm:col-span-2">Seasons and episodes (JSON)<textarea value={form.seasons} onChange={(e) => setForm({ ...form, seasons: e.target.value })} rows={8} spellCheck={false} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 font-mono text-xs text-emerald-100" /></label>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Episode format: <code>{'{ "number": 1, "title": "Episode 1", "url": "https://your-video-link" }'}</code>. Keep seasons as a valid JSON array. The website stores the supplied details and links; it does not host or copy video files.</p>
            </div>
            <button disabled={saving} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 font-black text-slate-950 disabled:opacity-50 sm:w-auto">{saving ? "Saving…" : editingId ? "Save Anime Changes" : "Add Anime to Website"}</button>
          </form>
          <div><div className="mb-3 flex items-center justify-between"><h3 className="font-black">Anime on website</h3><span className="text-xs text-slate-400">{items.length} entries</span></div>
            {items.length ? <div className="space-y-2">{items.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-3"><div className="h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-800">{item.poster && <img src={item.poster} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="truncate font-bold">{item.title}</p><p className="text-xs text-slate-400">/{item.slug} · {item.status} · {(item.seasons || []).length} seasons</p></div><button onClick={() => editAnime(item)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</button><button onClick={() => deleteAnime(item)} className="inline-flex items-center gap-1 rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-200"><Trash2 className="h-3.5 w-3.5" /> Delete</button></div>)}</div> : <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">No custom anime added yet.</div>}
          </div>
        </>
      )}
    </section>
  );
}
