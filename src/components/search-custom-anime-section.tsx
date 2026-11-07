"use client";

import { useSearchParams } from "next/navigation";
import CustomAnimeSection from "@/components/custom-anime-section";

export default function SearchCustomAnimeSection() {
  const searchParams = useSearchParams();
  return <CustomAnimeSection showAll searchQuery={searchParams.get("q") || ""} />;
}
