import Container from "@/components/container";
import React from "react";
import SearchResults from "./search-results";
import AnimeBackdrop from "@/components/anime-backdrop";
import SearchCustomAnimeSection from "@/components/search-custom-anime-section";

const page = () => {
  return (
    <div className="aniflix-surface relative isolate min-h-screen pb-10">
      <AnimeBackdrop />
      <Container>
        <SearchResults />
      </Container>
      <SearchCustomAnimeSection />
    </div>
  );
};

export default page;

