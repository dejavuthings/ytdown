"use client";

import { FORMAT_OPTIONS, Quality } from "@/lib/formats";

interface QualitySelectorProps {
  selected: Quality;
  onChange: (quality: Quality) => void;
}

const icons: Record<Quality, React.ReactNode> = {
  highest: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  medium: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <polyline points="10 9 10 13" />
      <polyline points="14 8 14 13" />
    </svg>
  ),
  low: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <polyline points="12 10 12 13" />
    </svg>
  ),
  mp3: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
};

export default function QualitySelector({ selected, onChange }: QualitySelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
      {FORMAT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`quality-card ${selected === opt.value ? "selected" : ""}`}
        >
          <div
            className="mb-1.5 sm:mb-2"
            style={{ color: selected === opt.value ? "var(--accent)" : "var(--muted)" }}
          >
            {icons[opt.value]}
          </div>
          <div
            className="text-[14px] sm:text-[15px] font-semibold"
            style={{
              color: selected === opt.value ? "var(--accent)" : "var(--foreground)",
              letterSpacing: "-0.01em",
            }}
          >
            {opt.label}
          </div>
          <div className="text-[11px] sm:text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>
            {opt.description}
          </div>
        </button>
      ))}
    </div>
  );
}
