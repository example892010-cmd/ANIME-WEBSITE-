import { NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { toPublicAnime } from "@/lib/admin-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL;
  if (!url) return NextResponse.json({ items: [], configured: false });
  try {
    const pb = new PocketBase(url);
    pb.autoCancellation(false);
    const slug = new URL(request.url).searchParams.get("slug");
    if (slug) {
      const all = await pb.collection("site_anime").getFullList({ sort: "-created" });
      const record = all.find((item: any) => item.slug === slug);
      return record ? NextResponse.json({ item: toPublicAnime(record), configured: true }) : NextResponse.json({ error: "Anime not found." }, { status: 404 });
    }
    const records = await pb.collection("site_anime").getFullList({ sort: "-created" });
    return NextResponse.json({ items: records.map(toPublicAnime), configured: true }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch (error: any) {
    if (error?.status === 404) return NextResponse.json({ items: [], configured: true });
    console.error("Public anime list failed:", error);
    return NextResponse.json({ error: "Anime catalogue is temporarily unavailable.", items: [] }, { status: 503 });
  }
}
