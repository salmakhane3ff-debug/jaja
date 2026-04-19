"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import Link from "next/link";
import { useUIControl } from "@/hooks/useUIControl";

export default function RatingBadge() {
  const ui = useUIControl();
  const primaryColor = ui?.primaryColor || "#111827";
  const [avg, setAvg]     = useState(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch("/api/feedback")
      .then((r) => r.ok ? r.json() : [])
      .then((list) => {
        if (!Array.isArray(list) || list.length === 0) return;
        const total = list.reduce((s, f) => s + (f.rating || 0), 0);
        setAvg((total / list.length).toFixed(1));
        setCount(list.length);
      })
      .catch(() => {});
  }, []);

  if (!avg) return null;

  const stars = parseFloat(avg);

  return (
    <div className="flex justify-center">
      <Link href="/feedback">
        <div className="inline-flex items-center gap-2.5 text-white rounded-full px-5 py-2.5 shadow-lg transition-opacity hover:opacity-90 cursor-pointer"
          style={{ backgroundColor: primaryColor }}>
          {/* Score */}
          <span className="text-xl font-black tabular-nums leading-none">{avg}</span>

          {/* Stars */}
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                size={16}
                className={
                  stars >= s
                    ? "fill-yellow-400 text-yellow-400"
                    : stars >= s - 0.5
                    ? "fill-yellow-400/50 text-yellow-400"
                    : "fill-white/20 text-white/20"
                }
              />
            ))}
          </div>

          {/* Count */}
          <span className="text-sm font-medium opacity-90">{count} Avis</span>
        </div>
      </Link>
    </div>
  );
}
