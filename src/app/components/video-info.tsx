"use client";

import { Platform } from "@/lib/validate";

interface VideoInfoProps {
  info: {
    title: string;
    thumbnail: string;
    duration: number;
    durationFormatted: string;
    uploader: string;
    platform: Platform;
  };
}

export default function VideoInfo({ info }: VideoInfoProps) {
  const platformLabel = info.platform === "instagram" ? "Instagram" : "YouTube";
  const platformColor = info.platform === "instagram"
    ? "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)"
    : "#ff0000";

  return (
    <div className="glass-card p-4 sm:p-5 flex flex-col sm:flex-row gap-3.5 sm:gap-5 animate-fade-in">
      <div className="relative flex-shrink-0">
        <img
          src={info.thumbnail}
          alt={info.title}
          className="w-full sm:w-52 h-auto sm:h-[118px] aspect-video sm:aspect-auto object-cover rounded-[12px]"
        />
        {info.durationFormatted !== "0:00" && (
          <div
            className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-xs font-medium text-white"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          >
            {info.durationFormatted}
          </div>
        )}
      </div>
      <div className="flex flex-col justify-center min-w-0 gap-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-white"
            style={{ background: platformColor }}
          >
            {platformLabel}
          </span>
        </div>
        <h2
          className="text-[16px] sm:text-[17px] font-semibold leading-snug line-clamp-2"
          style={{ color: "var(--foreground)", letterSpacing: "-0.01em" }}
        >
          {info.title}
        </h2>
        <p
          className="text-[13px] sm:text-[14px]"
          style={{ color: "var(--muted)" }}
        >
          {info.uploader}
        </p>
      </div>
    </div>
  );
}
