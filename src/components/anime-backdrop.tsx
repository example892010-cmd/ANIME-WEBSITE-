"use client";

import { useGetSpotlightAnime } from "@/query/get-spotlight-anime";

/** Reuses the existing anime spotlight artwork as a soft background on inner pages. */
export default function AnimeBackdrop() {
  const { data } = useGetSpotlightAnime();
  const image = data?.[0]?.bannerImage || data?.[0]?.coverImage?.extraLarge || data?.[0]?.coverImage?.large;
  if (!image) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 scale-105 bg-cover bg-center opacity-25 blur-[1px]" style={{ backgroundImage: `url("${image.replace(/"/g, "\\\"")}")` }} />
      <div className="absolute inset-0 bg-gradient-to-b from-[#061312]/55 via-[#061312]/85 to-[#061312]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,.14),transparent_55%)]" />
    </div>
  );
}
