"use client";

import React, { useEffect, useState } from "react";
import HomeSectionRenderer from "@/components/HomeBuilder/HomeSectionRenderer";

// Fallback static layout (shown when no custom layout is saved)
import Slider            from "@/components/Slider/Slider";
import SliderCollection  from "@/components/Colleaction/SliderCollection";
import ProductGrid       from "@/components/Product/ProductGrid";
import HomeCollectionSections from "@/components/Colleaction/HomeCollectionSections";
import VideoReels        from "@/components/VideoReels";
import SupportBenefits   from "@/components/SupportBenefits";
import HomeFeedbackSection from "@/components/HomeFeedbackSection";

function DefaultHome({ topOfferBanner }) {
  return (
    <div className="pb-10 space-y-10 md:space-y-16">
      {topOfferBanner?.image && (
        <a href={topOfferBanner.url || "#"} className="block">
          <img className="w-full md:h-[80px]" src={topOfferBanner.image} alt={topOfferBanner.title || "Top Offer"} />
        </a>
      )}
      <div className="px-2 sm:px-4"><Slider /></div>
      <SliderCollection />
      <div className="px-4"><ProductGrid /></div>
      <HomeCollectionSections />
      <VideoReels />
      <SupportBenefits />
      <HomeFeedbackSection />
    </div>
  );
}

export default function Home() {
  const [topOfferBanner, setTopOfferBanner] = useState(null);
  const [layout, setLayout]   = useState(undefined); // undefined=loading, null=none, array=custom

  useEffect(() => {
    // Fetch top offer banner
    fetch("/api/data?collection=top-offer-banner")
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (d.length > 0) setTopOfferBanner(d[0]); })
      .catch(() => {});

    // Fetch custom layout
    fetch("/api/setting?type=homepage_layout", { cache: "no-store" })
      .then(r => r.ok ? r.json() : {})
      .then(d => setLayout(Array.isArray(d?.sections) && d.sections.length > 0 ? d.sections : null))
      .catch(() => setLayout(null));
  }, []);

  // While fetching layout, show nothing to avoid flash
  if (layout === undefined) return <div className="min-h-screen" />;

  // Custom layout saved → use it
  if (layout !== null) return <HomeSectionRenderer />;

  // No custom layout → fallback
  return <DefaultHome topOfferBanner={topOfferBanner} />;
}
