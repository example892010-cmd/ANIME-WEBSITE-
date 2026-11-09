import { NextResponse } from "next/server";
import { getAdminPocketBase, normalizeAnimePayload, requestHasAdminSession, toPublicAnime } from "@/lib/admin-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!requestHasAdminSession(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const pb = await getAdminPocketBase();
    const records = await pb.collection("site_anime").getFullList({ sort: "-created" });
    return NextResponse.json({ items: records.map(toPublicAnime) });
  } catch (error) {
    console.error("Admin anime list failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load anime." }, { status: 503 });
  }
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const raw: Record<string, any> = {};
    for (const [key, value] of form.entries()) raw[key] = value;
    const payload = normalizeAnimePayload(raw);
    const recordData: Record<string, any> = { ...payload };
    const poster = form.get("poster");
    if (poster instanceof File && poster.size > 0) recordData.poster = poster;
    return recordData;
  }
  return normalizeAnimePayload(await request.json());
}

export async function POST(request: Request) {
  if (!requestHasAdminSession(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const pb = await getAdminPocketBase();
    const payload: Record<string, any> = await readPayload(request);
    if (payload.poster instanceof File) payload.posterUrl = "";
    const created = await pb.collection("site_anime").create(payload);
    return NextResponse.json({ item: toPublicAnime(created) }, { status: 201 });
  } catch (error: any) {
    console.error("Anime create failed:", error);
    const message = error?.data?.data?.slug?.message || error?.message || "Could not add anime.";
    return NextResponse.json({ error: message }, { status: error?.status === 400 ? 400 : 500 });
  }
}
