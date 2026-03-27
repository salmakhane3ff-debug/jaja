import React from "react";

const collections = [
  {
    title: "Women Collections",
    url: "/collections",
    image: "/image/BannerCollection_1.webp",
  },
  {
    title: "Women Collections",
    url: "/collections",
    image: "/image/BannerCollection_2.webp",
  },
  {
    title: "Women Collections",
    url: "/collections",
    image: "/image/BannerCollection_3.webp",
  },
];

export default function CollectionBanner() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-4 md:px-20 container mx-auto">
      {collections.map((item, idx) => (
        <div key={idx}>
          <a href={item.url}>
            <img src={item.image} alt={item.title} className="w-full md:h-[220px] h-[170px] rounded-lg object-fill object-center" />
          </a>
        </div>
      ))}
    </div>
  );
}
