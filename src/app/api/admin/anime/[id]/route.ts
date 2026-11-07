import { NextResponse } from "next/server";
import { getAdminPocketBase, normalizeAnimePayload, requestHasAdminSession, toPublicAnime } from "@/lib/admin-server";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  if (!requestHasAdminSession(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const { id } = await context.params;
    const pb = await getAdminPocketBase();
    const collection = pb.collection("site_anime");
    const existing = await collection.getOne(id);
    const contentType = request.headers.get("content-type") || "";
    let raw: Record<string, any> = {};
    let poster: File | null = null;
    let removePoster = false;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      for (const [key, value] of form.entries()) raw[key] = value;
      const uploaded = form.get("poster");
      if (uploaded instanceof File && uploaded.size > 0) poster = uploaded;
      removePoster = form.get("removePoster") === "true";
    } else {
      raw = await request.json();
    }
    const merged = {
      title: existing.title,
      slug: existing.slug,
      description: existing.description || "",
      posterUrl: existing.posterUrl || "",
      bannerUrl: existing.bannerUrl || "",
      status: existing.status || "ONGOING",
      genres: existing.genres || [],
      audioLanguages: existing.audioLanguages || ["Tamil"],
      qualities: existing.qualities || ["480p", "720p", "1080p"],
      seasons: existing.seasons || [],
      featured: Boolean(existing.featured),
      ...raw,
    };
    const payload: Record<string, any> = normalizeAnimePayload(merged);
    if (poster) { payload.poster = poster; payload.posterUrl = ""; }
    if (removePoster || (typeof raw.posterUrl === "string" && raw.posterUrl.trim())) payload["poster-"] = true;
    const updated = await collection.update(id, payload);
    return NextResponse.json({ item: toPublicAnime(updated) });
  } catch (error: any) {
    console.error("Anime update failed:", error);
    const message = error?.data?.data?.slug?.message || error?.message || "Could not update anime.";
    return NextResponse.json({ error: message }, { status: error?.status === 400 ? 400 : error?.status === 404 ? 404 : 500 });
  }
}

export async function DELETE(request: Request, context: Context) {
  if (!requestHasAdminSession(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const { id } = await context.params;
    const pb = await getAdminPocketBase();
    await pb.collection("site_anime").delete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Anime delete failed:", error);
    return NextResponse.json({ error: error?.message || "Could not delete anime." }, { status: error?.status === 404 ? 404 : 500 });
  }
}
