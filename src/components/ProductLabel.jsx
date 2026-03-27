import React from "react";
import { Flame, Star, Tag, Gift, BadgeDollarSign, Sparkles, TrendingUp } from "lucide-react";

const labelStyles = {
  Trending: {
    class: "bg-gradient-to-r from-yellow-400 to-orange-400 text-black shadow-md",
    icon: <TrendingUp size={12} className="mr-1" />,
  },
  New: {
    class: "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md",
    icon: <Sparkles size={12} className="mr-1" />,
  },
  Hot: {
    class: "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-md",
    icon: <Flame size={12} className="mr-1" />,
  },
  "Best Seller": {
    class: "bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md",
    icon: <Star size={12} className="mr-1" />,
  },
  "Limited Edition": {
    class: "bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-md",
    icon: <Gift size={12} className="mr-1" />,
  },
  Sale: {
    class: "bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-md",
    icon: <BadgeDollarSign size={12} className="mr-1" />,
  },
  Exclusive: {
    class: "bg-gradient-to-r from-gray-700 to-gray-800 text-white shadow-md",
    icon: <Tag size={12} className="mr-1" />,
  },
};

export default function ProductLabel({ label }) {
  if (!label || !labelStyles[label]) return null;

  const { class: bgClass, icon } = labelStyles[label];

  return (
    <span
      className={`
        absolute top-1 sm:top-2 left-1 sm:left-2
        px-1.5 sm:px-2 py-0.5 sm:py-1
        text-xs font-medium rounded-lg
        flex items-center gap-0.5 sm:gap-1
        backdrop-blur-sm
        transition-all duration-200 hover:scale-105
        ${bgClass}
      `}
    >
      {icon}
      <span className="truncate text-xs">{label}</span>
    </span>
  );
}
